import type { OCRConfig, ExtractionResult } from '../types';
import { RemoteOCRAdapter } from './adapters/RemoteOCRAdapter';
import { LocalOCRAdapter } from './adapters/LocalOCRAdapter';

/**
 * OCR adapter interface
 */
export interface OCRAdapter {
  extract(imageUri: string): Promise<ExtractionResult>;
  isAvailable(): Promise<boolean>;
}

/**
 * OCR Manager
 *
 * Manages OCR processing with support for both remote and local adapters.
 * Handles fallback between adapters and retry logic.
 */
export class OCRManager {
  private config: OCRConfig;
  private getAuthToken?: () => Promise<string>;
  private remoteAdapter: RemoteOCRAdapter | null = null;
  private localAdapter: LocalOCRAdapter | null = null;

  constructor(config: OCRConfig, getAuthToken?: () => Promise<string>) {
    this.config = config;
    this.getAuthToken = getAuthToken;

    // Initialize adapters based on mode
    if (config.mode === 'remote' || config.mode === 'hybrid') {
      this.remoteAdapter = new RemoteOCRAdapter({
        endpoint: config.endpoint,
        timeout: config.timeout,
        retries: config.retries,
        getAuthToken,
      });
    }

    if (config.mode === 'local' || config.mode === 'hybrid') {
      this.localAdapter = new LocalOCRAdapter();
    }
  }

  /**
   * Extract data from image
   */
  async extract(imageUri: string): Promise<ExtractionResult> {
    const startTime = Date.now();

    try {
      let result: ExtractionResult;

      switch (this.config.mode) {
        case 'remote':
          result = await this.extractRemote(imageUri);
          break;

        case 'local':
          result = await this.extractLocal(imageUri);
          break;

        case 'hybrid':
          result = await this.extractHybrid(imageUri);
          break;

        default:
          throw new Error(`Unknown OCR mode: ${this.config.mode}`);
      }

      // Add processing time
      result.processingTime = Date.now() - startTime;

      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'OCR extraction failed',
        fields: [],
        rawText: '',
        confidence: 0,
        processingTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Check if OCR is available
   */
  async isAvailable(): Promise<boolean> {
    switch (this.config.mode) {
      case 'remote':
        return this.remoteAdapter?.isAvailable() ?? false;

      case 'local':
        return this.localAdapter?.isAvailable() ?? false;

      case 'hybrid':
        const [remoteAvail, localAvail] = await Promise.all([
          this.remoteAdapter?.isAvailable() ?? false,
          this.localAdapter?.isAvailable() ?? false,
        ]);
        return remoteAvail || localAvail;

      default:
        return false;
    }
  }

  /**
   * Get current mode
   */
  getMode(): OCRConfig['mode'] {
    return this.config.mode;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<OCRConfig>): void {
    this.config = { ...this.config, ...config };

    // Reinitialize adapters if mode changed
    if (config.mode) {
      if (config.mode === 'remote' || config.mode === 'hybrid') {
        if (!this.remoteAdapter) {
          this.remoteAdapter = new RemoteOCRAdapter({
            endpoint: this.config.endpoint,
            timeout: this.config.timeout,
            retries: this.config.retries,
            getAuthToken: this.getAuthToken,
          });
        }
      }

      if (config.mode === 'local' || config.mode === 'hybrid') {
        if (!this.localAdapter) {
          this.localAdapter = new LocalOCRAdapter();
        }
      }
    }
  }

  // Private extraction methods

  private async extractRemote(imageUri: string): Promise<ExtractionResult> {
    if (!this.remoteAdapter) {
      throw new Error('Remote OCR adapter not initialized');
    }

    return this.remoteAdapter.extract(imageUri);
  }

  private async extractLocal(imageUri: string): Promise<ExtractionResult> {
    if (!this.localAdapter) {
      throw new Error('Local OCR adapter not initialized');
    }

    return this.localAdapter.extract(imageUri);
  }

  private async extractHybrid(imageUri: string): Promise<ExtractionResult> {
    // Try remote first, fall back to local
    const remoteAvailable = await this.remoteAdapter?.isAvailable();

    if (remoteAvailable && this.remoteAdapter) {
      try {
        return await this.remoteAdapter.extract(imageUri);
      } catch (error) {
        console.warn('Remote OCR failed, falling back to local:', error);
      }
    }

    // Fall back to local
    if (this.localAdapter) {
      const localAvailable = await this.localAdapter.isAvailable();
      if (localAvailable) {
        return this.localAdapter.extract(imageUri);
      }
    }

    throw new Error('No OCR adapter available');
  }
}
