/* eslint-disable @typescript-eslint/no-require-imports */
import type { ExtractionResult, FieldExtraction } from '../../types';
import type { OCRAdapter } from '../OCRManager';

// Declare require for dynamic imports (used for optional dependencies)
declare const require: (module: string) => unknown;

// Type definitions for tesseract.js
interface TesseractWorker {
  loadLanguage(lang: string): Promise<void>;
  initialize(lang: string): Promise<void>;
  recognize(image: string | HTMLImageElement | Blob): Promise<TesseractResult>;
  terminate(): Promise<void>;
  setParameters(params: Record<string, string | number>): Promise<void>;
}

interface TesseractResult {
  data: {
    text: string;
    confidence: number;
    words: Array<{
      text: string;
      confidence: number;
      bbox: { x0: number; y0: number; x1: number; y1: number };
    }>;
    lines: Array<{
      text: string;
      confidence: number;
      bbox: { x0: number; y0: number; x1: number; y1: number };
    }>;
  };
}

interface OCREngineConfig {
  languages: string[];
  oem?: number; // OCR Engine Mode
  psm?: number; // Page Segmentation Mode
}

// Page Segmentation Modes
const PSM = {
  AUTO: 3, // Fully automatic page segmentation
  SINGLE_COLUMN: 4, // Single column of text
  SINGLE_BLOCK: 6, // Single uniform block of text
  SINGLE_LINE: 7, // Single text line
  SPARSE_TEXT: 11, // Find as much text as possible
};

// OCR Engine Modes
const OEM = {
  TESSERACT_ONLY: 0, // Legacy engine only
  LSTM_ONLY: 1, // Neural net LSTM only
  BOTH: 2, // Combined
  DEFAULT: 3, // Default based on availability
};

/**
 * Local OCR Adapter
 *
 * Uses on-device ML for OCR processing.
 * Works offline without network connectivity.
 *
 * Integrates with:
 * - Google ML Kit (Android)
 * - Apple Vision Framework (iOS)
 * - Tesseract.js (Web/Node.js fallback)
 */
export class LocalOCRAdapter implements OCRAdapter {
  private isInitialized = false;
  private mlEngine: 'mlkit' | 'vision' | 'tesseract' | null = null;
  private tesseractWorker: TesseractWorker | null = null;
  private config: OCREngineConfig;

  constructor(config: Partial<OCREngineConfig> = {}) {
    this.config = {
      languages: config.languages ?? ['fra', 'eng'],
      oem: config.oem ?? OEM.LSTM_ONLY,
      psm: config.psm ?? PSM.AUTO,
    };
    this.detectEngine();
  }

  /**
   * Extract data from image using local ML
   */
  async extract(imageUri: string): Promise<ExtractionResult> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const { rawText, confidence, words, lines } = await this.recognizeText(imageUri);
      const fields = this.parseFields(rawText, words, lines);

      return {
        success: true,
        fields,
        rawText,
        confidence,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Local OCR failed',
        fields: [] as FieldExtraction[],
        rawText: '',
        confidence: 0,
      };
    }
  }

  /**
   * Extract with progress callback
   */
  async extractWithProgress(
    imageUri: string,
    onProgress: (progress: number, status: string) => void
  ): Promise<ExtractionResult> {
    onProgress(0, 'Initializing OCR engine...');

    if (!this.isInitialized) {
      await this.initialize();
    }

    onProgress(20, 'Loading image...');

    try {
      onProgress(40, 'Recognizing text...');
      const { rawText, confidence, words, lines } = await this.recognizeText(imageUri);

      onProgress(80, 'Extracting fields...');
      const fields = this.parseFields(rawText, words, lines);

      onProgress(100, 'Complete');

      return {
        success: true,
        fields,
        rawText,
        confidence,
      };
    } catch (error) {
      onProgress(100, 'Failed');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Local OCR failed',
        fields: [] as FieldExtraction[],
        rawText: '',
        confidence: 0,
      };
    }
  }

  /**
   * Check if local OCR is available
   */
  async isAvailable(): Promise<boolean> {
    return this.mlEngine !== null;
  }

  /**
   * Get current ML engine
   */
  getEngine(): string | null {
    return this.mlEngine;
  }

  /**
   * Clean up resources
   */
  async dispose(): Promise<void> {
    if (this.tesseractWorker) {
      await this.tesseractWorker.terminate();
      this.tesseractWorker = null;
    }
    this.isInitialized = false;
  }

  /**
   * Set OCR languages
   */
  async setLanguages(languages: string[]): Promise<void> {
    this.config.languages = languages;
    // Reinitialize if already initialized
    if (this.isInitialized && this.mlEngine === 'tesseract') {
      await this.dispose();
      await this.initialize();
    }
  }

  // Private methods

  private detectEngine(): void {
    // Check for ML Kit (React Native Android)
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const MLKit = require('@react-native-ml-kit/text-recognition');
      if (MLKit) {
        this.mlEngine = 'mlkit';
        return;
      }
    } catch {
      // ML Kit not available
    }

    // Check for Vision Framework (would be via native module on iOS)
    // This check is simplified - real implementation would use Platform.OS
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Vision = require('react-native-vision-framework');
      if (Vision) {
        this.mlEngine = 'vision';
        return;
      }
    } catch {
      // Vision not available
    }

    // Check for Tesseract.js (Web/Node)
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Tesseract = require('tesseract.js');
      if (Tesseract) {
        this.mlEngine = 'tesseract';
        return;
      }
    } catch {
      // Tesseract not available
    }

    // No engine available
    this.mlEngine = null;
  }

  private async initialize(): Promise<void> {
    switch (this.mlEngine) {
      case 'mlkit':
        await this.initializeMLKit();
        break;
      case 'vision':
        await this.initializeVision();
        break;
      case 'tesseract':
        await this.initializeTesseract();
        break;
      default:
        throw new Error('No OCR engine available');
    }

    this.isInitialized = true;
  }

  private async initializeMLKit(): Promise<void> {
    // ML Kit initializes on first use, no explicit initialization needed
  }

  private async initializeVision(): Promise<void> {
    // Vision Framework initializes on first use, no explicit initialization needed
  }

  private async initializeTesseract(): Promise<void> {
    try {
      const Tesseract = require('tesseract.js') as {
        createWorker: (
          lang: string,
          oem: number | undefined,
          options: Record<string, unknown>
        ) => Promise<TesseractWorker>;
      };

      // Create worker with specific language(s)
      this.tesseractWorker = await Tesseract.createWorker(this.config.languages[0], this.config.oem, {
        // Configure worker path based on environment
        workerPath: typeof window !== 'undefined'
          ? 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js'
          : undefined,
        langPath: typeof window !== 'undefined'
          ? 'https://tessdata.projectnaptha.com/4.0.0'
          : undefined,
        corePath: typeof window !== 'undefined'
          ? 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core.wasm.js'
          : undefined,
      });

      // Load additional languages if specified
      if (this.tesseractWorker) {
        for (const lang of this.config.languages.slice(1)) {
          await this.tesseractWorker.loadLanguage(lang);
          await this.tesseractWorker.initialize(lang);
        }

        // Set page segmentation mode
        await this.tesseractWorker.setParameters({
          tessedit_pageseg_mode: String(this.config.psm ?? PSM.AUTO),
        });
      }
    } catch (error) {
      throw new Error(`Failed to initialize Tesseract: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async recognizeText(imageUri: string): Promise<{
    rawText: string;
    confidence: number;
    words: Array<{ text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }>;
    lines: Array<{ text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }>;
  }> {
    switch (this.mlEngine) {
      case 'mlkit':
        return this.recognizeWithMLKit(imageUri);
      case 'vision':
        return this.recognizeWithVision(imageUri);
      case 'tesseract':
        return this.recognizeWithTesseract(imageUri);
      default:
        throw new Error('No OCR engine available');
    }
  }

  private async recognizeWithMLKit(imageUri: string): Promise<{
    rawText: string;
    confidence: number;
    words: Array<{ text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }>;
    lines: Array<{ text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }>;
  }> {
    try {
      const TextRecognition = require('@react-native-ml-kit/text-recognition') as {
        recognize: (uri: string) => Promise<{
          text: string;
          blocks?: Array<{
            lines?: Array<{
              text: string;
              recognizedLanguages?: Array<{ confidence?: number }>;
              frame?: { left?: number; top?: number; width?: number; height?: number };
              elements?: Array<{
                text: string;
                frame?: { left?: number; top?: number; width?: number; height?: number };
              }>;
            }>;
          }>;
        }>;
      };
      const result = await TextRecognition.recognize(imageUri);

      const words: Array<{ text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }> = [];
      const lines: Array<{ text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }> = [];

      // ML Kit returns blocks > lines > elements
      let totalConfidence = 0;
      let wordCount = 0;

      for (const block of result.blocks ?? []) {
        for (const line of block.lines ?? []) {
          lines.push({
            text: line.text,
            confidence: line.recognizedLanguages?.[0]?.confidence ?? 0.8,
            bbox: {
              x0: line.frame?.left ?? 0,
              y0: line.frame?.top ?? 0,
              x1: (line.frame?.left ?? 0) + (line.frame?.width ?? 0),
              y1: (line.frame?.top ?? 0) + (line.frame?.height ?? 0),
            },
          });

          for (const element of line.elements ?? []) {
            const conf = 0.8; // ML Kit doesn't provide word-level confidence
            words.push({
              text: element.text,
              confidence: conf,
              bbox: {
                x0: element.frame?.left ?? 0,
                y0: element.frame?.top ?? 0,
                x1: (element.frame?.left ?? 0) + (element.frame?.width ?? 0),
                y1: (element.frame?.top ?? 0) + (element.frame?.height ?? 0),
              },
            });
            totalConfidence += conf;
            wordCount++;
          }
        }
      }

      return {
        rawText: result.text,
        confidence: wordCount > 0 ? totalConfidence / wordCount : 0,
        words,
        lines,
      };
    } catch (error) {
      throw new Error(`ML Kit recognition failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async recognizeWithVision(imageUri: string): Promise<{
    rawText: string;
    confidence: number;
    words: Array<{ text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }>;
    lines: Array<{ text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }>;
  }> {
    // Vision Framework implementation would go here
    // For now, return placeholder data
    // Real implementation requires native iOS module
    void imageUri;
    return {
      rawText: '',
      confidence: 0,
      words: [],
      lines: [],
    };
  }

  private async recognizeWithTesseract(imageUri: string): Promise<{
    rawText: string;
    confidence: number;
    words: Array<{ text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }>;
    lines: Array<{ text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }>;
  }> {
    if (!this.tesseractWorker) {
      throw new Error('Tesseract worker not initialized');
    }

    const result = await this.tesseractWorker.recognize(imageUri);

    return {
      rawText: result.data.text,
      confidence: result.data.confidence / 100, // Tesseract returns 0-100, normalize to 0-1
      words: result.data.words.map(w => ({
        text: w.text,
        confidence: w.confidence / 100,
        bbox: w.bbox,
      })),
      lines: result.data.lines.map(l => ({
        text: l.text,
        confidence: l.confidence / 100,
        bbox: l.bbox,
      })),
    };
  }

  private parseFields(
    rawText: string,
    words: Array<{ text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }> = [],
    lines: Array<{ text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }> = []
  ): FieldExtraction[] {
    const fields: FieldExtraction[] = [];

    // Use line-level data for better field extraction when available
    const linesText = lines.map(l => l.text);

    // Field patterns with multiple variations
    const patterns: Array<{
      name: string;
      patterns: RegExp[];
      postProcess?: (value: string) => string;
    }> = [
      {
        name: 'date',
        patterns: [
          /Date\s*:\s*(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4})/i,
          /(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4})/,
          /Le\s+(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4})/i,
        ],
        postProcess: (v) => v.replace(/[\-\.]/g, '/'),
      },
      {
        name: 'patient_name',
        patterns: [
          /Patient\s*:\s*([A-Za-zÀ-ÿ\s\-]+)/i,
          /Nom\s*:\s*([A-Za-zÀ-ÿ\s\-]+)/i,
          /Assuré\s*:\s*([A-Za-zÀ-ÿ\s\-]+)/i,
        ],
        postProcess: (v) => v.trim(),
      },
      {
        name: 'social_security_number',
        patterns: [
          /N°?\s*(?:Sécurité\s*Sociale|SS|sécu)\s*:?\s*([\d\s]{13,15})/i,
          /(?:NIR|immatriculation)\s*:?\s*([\d\s]{13,15})/i,
          /([12]\s?\d{2}\s?\d{2}\s?\d{2}\s?\d{3}\s?\d{3}\s?\d{2})/,
        ],
        postProcess: (v) => v.replace(/\s/g, ''),
      },
      {
        name: 'amount',
        patterns: [
          /Montant\s*:\s*([\d\s,\.]+)\s*(?:€|EUR|euros?)/i,
          /Total\s*:\s*([\d\s,\.]+)\s*(?:€|EUR|euros?)/i,
          /(?:€|EUR)\s*([\d\s,\.]+)/i,
          /([\d\s,\.]+)\s*(?:€|EUR)/,
        ],
        postProcess: (v) => v.replace(/\s/g, '').replace(',', '.'),
      },
      {
        name: 'prescriber_name',
        patterns: [
          /(?:Dr|Docteur|Médecin)\s*:?\s*([A-Za-zÀ-ÿ\s\-]+)/i,
          /Prescripteur\s*:\s*([A-Za-zÀ-ÿ\s\-]+)/i,
        ],
        postProcess: (v) => v.trim(),
      },
      {
        name: 'act_code',
        patterns: [
          /(?:Code\s*acte|Acte)\s*:?\s*([A-Z]{2,4}\d*)/i,
          /\b(NGAP|CCAM)\s*:?\s*([A-Z0-9]+)/i,
        ],
      },
      {
        name: 'pharmacy_name',
        patterns: [
          /Pharmacie\s+([A-Za-zÀ-ÿ\s\-]+)/i,
          /Officine\s*:\s*([A-Za-zÀ-ÿ\s\-]+)/i,
        ],
        postProcess: (v) => v.trim(),
      },
    ];

    // Try to extract each field
    for (const { name, patterns: fieldPatterns, postProcess } of patterns) {
      // First try lines for better accuracy
      for (const line of linesText) {
        for (const pattern of fieldPatterns) {
          const match = line.match(pattern);
          if (match && match[1]) {
            const lineData = lines.find(l => l.text === line);
            fields.push({
              name,
              value: postProcess ? postProcess(match[1]) : match[1],
              confidence: lineData?.confidence ?? 0.7,
            });
            break;
          }
        }
        if (fields.some(f => f.name === name)) break;
      }

      // Fall back to full text if not found in lines
      if (!fields.some(f => f.name === name)) {
        for (const pattern of fieldPatterns) {
          const match = rawText.match(pattern);
          if (match && match[1]) {
            // Estimate confidence based on word-level data
            const confidence = this.estimateFieldConfidence(match[1], words);
            fields.push({
              name,
              value: postProcess ? postProcess(match[1]) : match[1],
              confidence,
            });
            break;
          }
        }
      }
    }

    return fields;
  }

  /**
   * Estimate field confidence based on OCR word confidences
   */
  private estimateFieldConfidence(
    value: string,
    words: Array<{ text: string; confidence: number }>
  ): number {
    if (words.length === 0) return 0.7; // Default if no word data

    const valueWords = value.toLowerCase().split(/\s+/);
    const matchingConfidences: number[] = [];

    for (const vw of valueWords) {
      const match = words.find(w =>
        w.text.toLowerCase().includes(vw) || vw.includes(w.text.toLowerCase())
      );
      if (match) {
        matchingConfidences.push(match.confidence);
      }
    }

    if (matchingConfidences.length === 0) return 0.6;
    return matchingConfidences.reduce((a, b) => a + b, 0) / matchingConfidences.length;
  }
}
