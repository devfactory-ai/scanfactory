/**
 * Plugin System Types for scan-lib
 *
 * Enables extensibility through:
 * - OCR adapters (custom OCR providers)
 * - Image processors (custom processing pipelines)
 * - Quality validators (custom quality checks)
 * - Post-processors (custom extraction post-processing)
 */

import type {
  ScannedDocument,
  ExtractionResult,
  QualityMetrics,
  FieldExtraction,
} from '../types';

// ============================================================================
// Plugin Base Types
// ============================================================================

export interface PluginMetadata {
  /** Unique plugin identifier */
  id: string;

  /** Human-readable name */
  name: string;

  /** Plugin version */
  version: string;

  /** Plugin description */
  description?: string;

  /** Plugin author */
  author?: string;
}

export interface PluginContext {
  /** Global configuration */
  config: Record<string, unknown>;

  /** Logger instance */
  logger: PluginLogger;

  /** Access to other registered plugins */
  getPlugin: <T extends Plugin>(id: string) => T | undefined;
}

export interface PluginLogger {
  debug: (message: string, data?: unknown) => void;
  info: (message: string, data?: unknown) => void;
  warn: (message: string, data?: unknown) => void;
  error: (message: string, error?: unknown) => void;
}

export interface Plugin {
  /** Plugin metadata */
  readonly metadata: PluginMetadata;

  /** Initialize plugin with context */
  initialize?: (context: PluginContext) => Promise<void>;

  /** Cleanup when plugin is unloaded */
  dispose?: () => Promise<void>;
}

// ============================================================================
// OCR Adapter Plugin
// ============================================================================

export interface OCRAdapterPlugin extends Plugin {
  readonly type: 'ocr-adapter';

  /** Supported document types (e.g., 'invoice', 'receipt', 'id_card') */
  readonly supportedDocumentTypes?: string[];

  /** Priority for auto-selection (higher = preferred) */
  readonly priority?: number;

  /**
   * Check if this adapter can handle the document
   */
  canHandle?: (document: ScannedDocument, documentType?: string) => boolean;

  /**
   * Extract data from document image
   */
  extract: (
    imageUri: string,
    options?: OCRAdapterOptions
  ) => Promise<ExtractionResult>;

  /**
   * Check adapter availability (e.g., API reachable)
   */
  isAvailable?: () => Promise<boolean>;
}

export interface OCRAdapterOptions {
  /** Document type hint */
  documentType?: string;

  /** Fields to extract (optional) */
  fields?: string[];

  /** Language hint (ISO 639-1) */
  language?: string;

  /** Custom adapter options */
  [key: string]: unknown;
}

// ============================================================================
// Image Processor Plugin
// ============================================================================

export interface ImageProcessorPlugin extends Plugin {
  readonly type: 'image-processor';

  /** Processing stage: 'pre' (before OCR) or 'post' (after capture) */
  readonly stage: 'pre-ocr' | 'post-capture';

  /** Execution order within stage (lower = earlier) */
  readonly order?: number;

  /**
   * Process the image
   * Returns new image URI if modified, or same URI if unchanged
   */
  process: (
    imageUri: string,
    document: ScannedDocument,
    options?: ImageProcessorOptions
  ) => Promise<string>;

  /**
   * Check if this processor should run for the document
   */
  shouldProcess?: (document: ScannedDocument) => boolean;
}

export interface ImageProcessorOptions {
  /** Skip this processor */
  skip?: boolean;

  /** Custom processor options */
  [key: string]: unknown;
}

// ============================================================================
// Quality Validator Plugin
// ============================================================================

export interface QualityValidatorPlugin extends Plugin {
  readonly type: 'quality-validator';

  /** Execution order (lower = earlier) */
  readonly order?: number;

  /**
   * Validate document quality
   * Returns additional issues to merge with base quality metrics
   */
  validate: (
    document: ScannedDocument,
    currentMetrics: QualityMetrics
  ) => Promise<QualityValidationResult>;
}

export interface QualityValidationResult {
  /** Is document acceptable */
  isValid: boolean;

  /** Additional issues found */
  issues: PluginQualityIssue[];

  /** Score adjustment (-1 to 1) */
  scoreAdjustment?: number;

  /** Metadata from validation */
  metadata?: Record<string, unknown>;
}

export interface PluginQualityIssue {
  type: string;
  severity: 'low' | 'medium' | 'high';
  message: string;
}

// ============================================================================
// Post-Processor Plugin
// ============================================================================

export interface PostProcessorPlugin extends Plugin {
  readonly type: 'post-processor';

  /** Execution order (lower = earlier) */
  readonly order?: number;

  /**
   * Post-process extraction results
   * Can modify, validate, or enrich extracted data
   */
  process: (
    result: ExtractionResult,
    document: ScannedDocument,
    options?: PostProcessorOptions
  ) => Promise<ExtractionResult>;
}

export interface PostProcessorOptions {
  /** Document type hint */
  documentType?: string;

  /** Custom options */
  [key: string]: unknown;
}

// ============================================================================
// Field Transformer Plugin
// ============================================================================

export interface FieldTransformerPlugin extends Plugin {
  readonly type: 'field-transformer';

  /** Fields this transformer handles */
  readonly targetFields: string[];

  /**
   * Transform field value
   */
  transform: (
    field: FieldExtraction,
    allFields: FieldExtraction[],
    options?: FieldTransformerOptions
  ) => Promise<FieldExtraction>;
}

export interface FieldTransformerOptions {
  /** Locale for formatting */
  locale?: string;

  /** Custom options */
  [key: string]: unknown;
}

// ============================================================================
// Plugin Union Type
// ============================================================================

export type ScanLibPlugin =
  | OCRAdapterPlugin
  | ImageProcessorPlugin
  | QualityValidatorPlugin
  | PostProcessorPlugin
  | FieldTransformerPlugin;

export type PluginType = ScanLibPlugin['type'];
