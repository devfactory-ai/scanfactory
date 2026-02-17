import { useState, useCallback, useRef } from 'react';
import type { OCRConfig, ExtractionResult, ScannedDocument, FieldExtraction } from '../types';
import { OCRManager } from '../ocr/OCRManager';

interface UseOCROptions {
  config: OCRConfig;
  getAuthToken?: () => Promise<string>;
}

interface UseOCRResult {
  /** Extract data from document */
  extract: (doc: ScannedDocument) => Promise<ExtractionResult>;
  /** Extract from image URI directly */
  extractFromUri: (imageUri: string) => Promise<ExtractionResult>;
  /** Whether extraction is in progress */
  isExtracting: boolean;
  /** Last extraction result */
  lastResult: ExtractionResult | null;
  /** Last error */
  error: string | null;
  /** Check if OCR is available */
  isAvailable: () => Promise<boolean>;
  /** Current OCR mode */
  mode: OCRConfig['mode'];
  /** Cancel ongoing extraction */
  cancel: () => void;
}

/**
 * Hook for OCR extraction
 *
 * Provides OCR functionality with support for remote and local modes.
 */
export function useOCR(options: UseOCROptions): UseOCRResult {
  const { config, getAuthToken } = options;

  const [isExtracting, setIsExtracting] = useState(false);
  const [lastResult, setLastResult] = useState<ExtractionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const managerRef = useRef<OCRManager>();
  const abortRef = useRef(false);

  // Initialize manager
  if (!managerRef.current) {
    managerRef.current = new OCRManager(config, getAuthToken);
  }

  const extract = useCallback(
    async (doc: ScannedDocument): Promise<ExtractionResult> => {
      return extractFromUri(doc.processedUri);
    },
    []
  );

  const extractFromUri = useCallback(
    async (imageUri: string): Promise<ExtractionResult> => {
      if (!managerRef.current) {
        throw new Error('OCR manager not initialized');
      }

      setIsExtracting(true);
      setError(null);
      abortRef.current = false;

      try {
        const result = await managerRef.current.extract(imageUri);

        if (abortRef.current) {
          throw new Error('Extraction cancelled');
        }

        setLastResult(result);

        if (!result.success) {
          setError(result.error || 'Extraction failed');
        }

        return result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        setError(errorMessage);

        return {
          success: false,
          error: errorMessage,
          fields: [] as FieldExtraction[],
          rawText: '',
          confidence: 0,
        };
      } finally {
        setIsExtracting(false);
      }
    },
    []
  );

  const isAvailable = useCallback(async (): Promise<boolean> => {
    return managerRef.current?.isAvailable() ?? false;
  }, []);

  const cancel = useCallback(() => {
    abortRef.current = true;
  }, []);

  return {
    extract,
    extractFromUri,
    isExtracting,
    lastResult,
    error,
    isAvailable,
    mode: config.mode,
    cancel,
  };
}
