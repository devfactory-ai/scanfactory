import { useState, useCallback, useRef, useEffect } from 'react';
import { useCameraPermissions, CameraView } from 'expo-camera';
import type {
  ScanLibConfig,
  ScannerState,
  ScannerActions,
  ScannerCallbacks,
  UseScannerResult,
  ScannedDocument,
  EdgePoints,
  QualityMetrics,
  ExtractionResult,
} from '../types';
import { generateLocalId, createDefaultConfig } from '../utils';
import { QualityAnalyzer } from '../processor/QualityAnalyzer';
import { ImageOptimizer } from '../processor/ImageOptimizer';
import { OCRManager } from '../ocr/OCRManager';

/**
 * Main hook for document scanning functionality
 *
 * Provides camera control, edge detection, auto-capture,
 * quality analysis, and OCR integration.
 */
export function useDocumentScanner(
  configOverrides: Partial<ScanLibConfig> = {}
): UseScannerResult {
  const config = createDefaultConfig(configOverrides);

  // Camera permission
  const [permission, requestPermission] = useCameraPermissions();

  // Camera ref
  const cameraRef = useRef<CameraView>(null);

  // Core state
  const [isReady, setIsReady] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [facing, setFacing] = useState<'front' | 'back'>(
    config.capture.defaultFacing ?? 'back'
  );
  const [error, setError] = useState<string | null>(null);

  // Detection state
  const [edgesDetected, setEdgesDetected] = useState<EdgePoints | null>(null);
  const [qualityScore, setQualityScore] = useState<QualityMetrics | null>(null);
  const [autoCaptureCountdown, setAutoCaptureCountdown] = useState<number | null>(null);

  // Batch state
  const [currentBatch, setCurrentBatch] = useState<ScannedDocument[]>([]);
  const [lastCapture, setLastCapture] = useState<ScannedDocument | null>(null);

  // Callbacks (stored in refs to avoid re-renders)
  const onEdgeChangeRef = useRef<ScannerCallbacks['onEdgeChange']>();
  const onQualityChangeRef = useRef<ScannerCallbacks['onQualityChange']>();
  const onAutoCaptureRef = useRef<ScannerCallbacks['onAutoCapture']>();
  const onCaptureErrorRef = useRef<ScannerCallbacks['onCaptureError']>();

  // Services
  const qualityAnalyzerRef = useRef<QualityAnalyzer>();
  const imageOptimizerRef = useRef<ImageOptimizer>();
  const ocrManagerRef = useRef<OCRManager>();

  // Auto-capture timer
  const autoCaptureTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const stableFrameCountRef = useRef(0);

  // Initialize services
  useEffect(() => {
    qualityAnalyzerRef.current = new QualityAnalyzer();
    imageOptimizerRef.current = new ImageOptimizer(config.capture);
    ocrManagerRef.current = new OCRManager(config.ocr, config.getAuthToken);

    setIsReady(true);

    return () => {
      if (autoCaptureTimerRef.current) {
        clearTimeout(autoCaptureTimerRef.current);
      }
    };
  }, []);

  // Permission status
  const permissionStatus = permission?.granted
    ? 'granted'
    : permission?.canAskAgain === false
      ? 'denied'
      : 'undetermined';

  // Request camera permission
  const handleRequestPermission = useCallback(async (): Promise<boolean> => {
    try {
      const result = await requestPermission();
      return result.granted;
    } catch (err) {
      setError('Failed to request camera permission');
      return false;
    }
  }, [requestPermission]);

  // Capture document
  const capture = useCallback(async (): Promise<ScannedDocument> => {
    if (!cameraRef.current) {
      throw new Error('Camera not ready');
    }

    setIsCapturing(true);
    setError(null);

    try {
      // Take picture
      const photo = await cameraRef.current.takePictureAsync({
        quality: config.capture.quality === 'high' ? 0.9 : config.capture.quality === 'medium' ? 0.75 : 0.6,
        base64: false,
        skipProcessing: false,
      });

      if (!photo) {
        throw new Error('Failed to capture photo');
      }

      // Optimize image
      const optimizedUri = await imageOptimizerRef.current!.optimize(
        photo.uri,
        {
          maxWidth: config.capture.maxWidth,
          quality: config.capture.quality,
          correctPerspective: config.edgeDetection.enabled && edgesDetected !== null,
          edges: edgesDetected ?? undefined,
        }
      );

      // Get quality at capture time
      const quality = qualityScore ?? {
        overall: 0.8,
        focus: 0.8,
        lighting: 0.8,
        stability: 1,
        isFramed: edgesDetected !== null,
        issues: [],
      };

      // Create document
      const doc: ScannedDocument = {
        localId: generateLocalId(),
        originalUri: photo.uri,
        processedUri: optimizedUri,
        edges: edgesDetected ?? undefined,
        quality,
        dimensions: {
          width: photo.width,
          height: photo.height,
        },
        capturedAt: new Date().toISOString(),
        pageNumber: currentBatch.length + 1,
      };

      setLastCapture(doc);
      setIsCapturing(false);

      return doc;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Capture failed');
      setError(error.message);
      setIsCapturing(false);
      onCaptureErrorRef.current?.(error);
      throw error;
    }
  }, [config, edgesDetected, qualityScore, currentBatch.length]);

  // Cancel capture
  const cancelCapture = useCallback(() => {
    setIsCapturing(false);
    if (autoCaptureTimerRef.current) {
      clearTimeout(autoCaptureTimerRef.current);
      autoCaptureTimerRef.current = undefined;
    }
    setAutoCaptureCountdown(null);
    stableFrameCountRef.current = 0;
  }, []);

  // Toggle camera facing
  const toggleFacing = useCallback(() => {
    setFacing((prev) => (prev === 'back' ? 'front' : 'back'));
  }, []);

  // Extract data using OCR
  const extractData = useCallback(
    async (doc: ScannedDocument): Promise<ExtractionResult> => {
      if (!ocrManagerRef.current) {
        throw new Error('OCR not initialized');
      }

      return ocrManagerRef.current.extract(doc.processedUri);
    },
    []
  );

  // Batch management
  const addToBatch = useCallback((doc: ScannedDocument) => {
    setCurrentBatch((prev) => [...prev, { ...doc, pageNumber: prev.length + 1 }]);
  }, []);

  const removeFromBatch = useCallback((localId: string) => {
    setCurrentBatch((prev) => {
      const filtered = prev.filter((d) => d.localId !== localId);
      // Renumber pages
      return filtered.map((d, i) => ({ ...d, pageNumber: i + 1 }));
    });
  }, []);

  const reorderBatch = useCallback((newOrder: string[]) => {
    setCurrentBatch((prev) => {
      const ordered = newOrder
        .map((id) => prev.find((d) => d.localId === id))
        .filter((d): d is ScannedDocument => d !== undefined);
      // Renumber pages
      return ordered.map((d, i) => ({ ...d, pageNumber: i + 1 }));
    });
  }, []);

  const clearBatch = useCallback(() => {
    setCurrentBatch([]);
  }, []);

  // Reset scanner
  const reset = useCallback(() => {
    setIsCapturing(false);
    setError(null);
    setEdgesDetected(null);
    setQualityScore(null);
    setAutoCaptureCountdown(null);
    setLastCapture(null);
    stableFrameCountRef.current = 0;
    if (autoCaptureTimerRef.current) {
      clearTimeout(autoCaptureTimerRef.current);
    }
  }, []);

  // Handle edge detection updates
  const handleEdgeChange = useCallback(
    (edges: EdgePoints | null) => {
      setEdgesDetected(edges);
      onEdgeChangeRef.current?.(edges);

      // Auto-capture logic
      if (config.capture.autoCapture && config.edgeDetection.enabled) {
        if (edges && qualityScore && qualityScore.overall >= 0.6) {
          stableFrameCountRef.current++;

          if (stableFrameCountRef.current >= config.edgeDetection.stabilityThreshold) {
            // Start countdown
            if (!autoCaptureTimerRef.current) {
              setAutoCaptureCountdown(config.capture.autoCaptureDelay);

              autoCaptureTimerRef.current = setTimeout(async () => {
                try {
                  const doc = await capture();
                  onAutoCaptureRef.current?.(doc);
                } catch {
                  // Error handled in capture
                }
                autoCaptureTimerRef.current = undefined;
                setAutoCaptureCountdown(null);
                stableFrameCountRef.current = 0;
              }, config.capture.autoCaptureDelay);
            }
          }
        } else {
          // Reset stability counter
          stableFrameCountRef.current = 0;
          if (autoCaptureTimerRef.current) {
            clearTimeout(autoCaptureTimerRef.current);
            autoCaptureTimerRef.current = undefined;
          }
          setAutoCaptureCountdown(null);
        }
      }
    },
    [config, qualityScore, capture]
  );

  // Handle quality updates
  const handleQualityChange = useCallback((quality: QualityMetrics) => {
    setQualityScore(quality);
    onQualityChangeRef.current?.(quality);
  }, []);

  // Public API
  const result: UseScannerResult = {
    // State
    isReady,
    isCapturing,
    hasPermission: permission?.granted ?? false,
    permissionStatus,
    edgesDetected,
    qualityScore,
    autoCaptureCountdown,
    facing,
    currentBatch,
    lastCapture,
    error,

    // Actions
    requestPermission: handleRequestPermission,
    capture,
    cancelCapture,
    toggleFacing,
    extractData,
    addToBatch,
    removeFromBatch,
    reorderBatch,
    clearBatch,
    reset,

    // Callbacks (setters)
    set onEdgeChange(cb: ScannerCallbacks['onEdgeChange']) {
      onEdgeChangeRef.current = cb;
    },
    set onQualityChange(cb: ScannerCallbacks['onQualityChange']) {
      onQualityChangeRef.current = cb;
    },
    set onAutoCapture(cb: ScannerCallbacks['onAutoCapture']) {
      onAutoCaptureRef.current = cb;
    },
    set onCaptureError(cb: ScannerCallbacks['onCaptureError']) {
      onCaptureErrorRef.current = cb;
    },
  };

  // Expose internal handlers for components
  (result as unknown as Record<string, unknown>)._cameraRef = cameraRef;
  (result as unknown as Record<string, unknown>)._handleEdgeChange = handleEdgeChange;
  (result as unknown as Record<string, unknown>)._handleQualityChange = handleQualityChange;

  return result;
}
