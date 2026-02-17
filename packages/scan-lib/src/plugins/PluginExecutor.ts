/**
 * Plugin Executor for scan-lib
 *
 * Orchestrates plugin execution pipelines for:
 * - Image processing
 * - OCR extraction
 * - Quality validation
 * - Post-processing
 */

import type {
  ScannedDocument,
  ExtractionResult,
  QualityMetrics,
  FieldExtraction,
} from '../types';
import type {
  OCRAdapterPlugin,
  ImageProcessorPlugin,
  QualityValidatorPlugin,
  PostProcessorPlugin,
  FieldTransformerPlugin,
  OCRAdapterOptions,
  QualityValidationResult,
} from './types';
import { PluginRegistry, getPluginRegistry } from './PluginRegistry';

// ============================================================================
// Plugin Executor
// ============================================================================

export class PluginExecutor {
  constructor(private registry: PluginRegistry = getPluginRegistry()) {}

  // --------------------------------------------------------------------------
  // Image Processing Pipeline
  // --------------------------------------------------------------------------

  /**
   * Run post-capture image processors
   */
  async runPostCaptureProcessors(
    imageUri: string,
    document: ScannedDocument
  ): Promise<string> {
    return this.runImageProcessors('post-capture', imageUri, document);
  }

  /**
   * Run pre-OCR image processors
   */
  async runPreOCRProcessors(
    imageUri: string,
    document: ScannedDocument
  ): Promise<string> {
    return this.runImageProcessors('pre-ocr', imageUri, document);
  }

  private async runImageProcessors(
    stage: 'pre-ocr' | 'post-capture',
    imageUri: string,
    document: ScannedDocument
  ): Promise<string> {
    const processors = this.registry.getImageProcessors(stage);
    let currentUri = imageUri;

    for (const processor of processors) {
      // Check if processor should run
      if (processor.shouldProcess && !processor.shouldProcess(document)) {
        continue;
      }

      try {
        currentUri = await processor.process(currentUri, document);
      } catch (error) {
        console.error(
          `Image processor "${processor.metadata.id}" failed:`,
          error
        );
        // Continue with current URI on failure
      }
    }

    return currentUri;
  }

  // --------------------------------------------------------------------------
  // OCR Pipeline
  // --------------------------------------------------------------------------

  /**
   * Extract data using the best available OCR adapter
   */
  async extract(
    imageUri: string,
    document: ScannedDocument,
    options?: OCRAdapterOptions
  ): Promise<ExtractionResult> {
    // Run pre-OCR processors
    const processedUri = await this.runPreOCRProcessors(imageUri, document);

    // Find suitable OCR adapter
    const adapter = await this.selectOCRAdapter(document, options?.documentType);

    if (!adapter) {
      return {
        success: false,
        fields: [],
        rawText: '',
        confidence: 0,
        error: 'No OCR adapter available',
      };
    }

    try {
      // Run OCR extraction
      let result = await adapter.extract(processedUri, options);

      // Run post-processors
      result = await this.runPostProcessors(result, document, options);

      // Run field transformers
      result = await this.runFieldTransformers(result);

      return result;
    } catch (error) {
      return {
        success: false,
        fields: [],
        rawText: '',
        confidence: 0,
        error: error instanceof Error ? error.message : 'OCR extraction failed',
      };
    }
  }

  /**
   * Select the best OCR adapter for the document
   */
  private async selectOCRAdapter(
    document: ScannedDocument,
    documentType?: string
  ): Promise<OCRAdapterPlugin | null> {
    const adapters = this.registry.getOCRAdapters();

    for (const adapter of adapters) {
      // Check availability
      if (adapter.isAvailable) {
        const available = await adapter.isAvailable();
        if (!available) continue;
      }

      // Check if adapter can handle this document
      if (adapter.canHandle) {
        if (!adapter.canHandle(document, documentType)) continue;
      }

      // Check supported document types
      if (documentType && adapter.supportedDocumentTypes) {
        if (!adapter.supportedDocumentTypes.includes(documentType)) continue;
      }

      return adapter;
    }

    // Fallback to first available adapter
    return adapters[0] ?? null;
  }

  // --------------------------------------------------------------------------
  // Quality Validation Pipeline
  // --------------------------------------------------------------------------

  /**
   * Validate document quality using all registered validators
   */
  async validateQuality(
    document: ScannedDocument,
    baseMetrics: QualityMetrics
  ): Promise<QualityMetrics> {
    const validators = this.registry.getQualityValidators();
    let metrics = { ...baseMetrics };

    for (const validator of validators) {
      try {
        const result = await validator.validate(document, metrics);

        // Merge results
        metrics = this.mergeQualityResults(metrics, result);
      } catch (error) {
        console.error(
          `Quality validator "${validator.metadata.id}" failed:`,
          error
        );
        // Continue with current metrics on failure
      }
    }

    return metrics;
  }

  private mergeQualityResults(
    metrics: QualityMetrics,
    result: QualityValidationResult
  ): QualityMetrics {
    // Map plugin issues to core QualityIssue type
    // Only include issues with known types
    const validTypes = ['blur', 'low_light', 'glare', 'motion', 'occlusion'] as const;
    const mappedIssues = result.issues
      .filter((issue) => validTypes.includes(issue.type as typeof validTypes[number]))
      .map((issue) => ({
        type: issue.type as 'blur' | 'low_light' | 'glare' | 'motion' | 'occlusion',
        severity: issue.severity,
        message: issue.message,
      }));

    const issues = [...metrics.issues, ...mappedIssues];

    // Apply score adjustment
    let overall = metrics.overall;
    if (result.scoreAdjustment) {
      overall = Math.max(0, Math.min(1, overall + result.scoreAdjustment));
    }

    // Update isFramed based on validation
    const isFramed = result.isValid ? metrics.isFramed : false;

    return {
      ...metrics,
      overall,
      isFramed,
      issues,
    };
  }

  // --------------------------------------------------------------------------
  // Post-Processing Pipeline
  // --------------------------------------------------------------------------

  /**
   * Run post-processors on extraction result
   */
  private async runPostProcessors(
    result: ExtractionResult,
    document: ScannedDocument,
    options?: OCRAdapterOptions
  ): Promise<ExtractionResult> {
    const processors = this.registry.getPostProcessors();
    let currentResult = result;

    for (const processor of processors) {
      try {
        currentResult = await processor.process(currentResult, document, {
          documentType: options?.documentType,
        });
      } catch (error) {
        console.error(
          `Post-processor "${processor.metadata.id}" failed:`,
          error
        );
        // Continue with current result on failure
      }
    }

    return currentResult;
  }

  // --------------------------------------------------------------------------
  // Field Transformation Pipeline
  // --------------------------------------------------------------------------

  /**
   * Run field transformers on extraction result
   */
  private async runFieldTransformers(
    result: ExtractionResult
  ): Promise<ExtractionResult> {
    const fields = [...result.fields];

    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];
      const transformers = this.registry.getFieldTransformers(field.name);

      for (const transformer of transformers) {
        try {
          fields[i] = await transformer.transform(field, fields);
        } catch (error) {
          console.error(
            `Field transformer "${transformer.metadata.id}" failed for field "${field.name}":`,
            error
          );
          // Keep original field on failure
        }
      }
    }

    return { ...result, fields };
  }
}

// ============================================================================
// Factory
// ============================================================================

let defaultExecutor: PluginExecutor | null = null;

/**
 * Get or create the default plugin executor
 */
export function getPluginExecutor(): PluginExecutor {
  if (!defaultExecutor) {
    defaultExecutor = new PluginExecutor();
  }
  return defaultExecutor;
}

/**
 * Create a new plugin executor with a custom registry
 */
export function createPluginExecutor(registry: PluginRegistry): PluginExecutor {
  return new PluginExecutor(registry);
}
