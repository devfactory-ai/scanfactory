import { useState, useCallback, useRef, useEffect } from 'react';
import type { EdgePoints, QualityMetrics, CaptureConfig, EdgeDetectionConfig } from '../types';

interface UseAutoCaptureOptions {
  captureConfig: CaptureConfig;
  edgeConfig: EdgeDetectionConfig;
  edges: EdgePoints | null;
  quality: QualityMetrics | null;
  isStable: boolean;
  onAutoCapture: () => Promise<void>;
}

interface UseAutoCaptureResult {
  countdown: number | null;
  isTriggering: boolean;
  cancel: () => void;
}

/**
 * Hook for auto-capture logic
 *
 * Triggers capture when:
 * - Document is detected (edges present)
 * - Quality is acceptable
 * - Frame is stable for required duration
 */
export function useAutoCapture(
  options: UseAutoCaptureOptions
): UseAutoCaptureResult {
  const {
    captureConfig,
    edgeConfig,
    edges,
    quality,
    isStable,
    onAutoCapture,
  } = options;

  const [countdown, setCountdown] = useState<number | null>(null);
  const [isTriggering, setIsTriggering] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval>>();

  // Check if conditions are met for auto-capture
  const shouldTrigger =
    captureConfig.autoCapture &&
    edgeConfig.enabled &&
    edges !== null &&
    isStable &&
    quality !== null &&
    quality.overall >= 0.6 &&
    quality.issues.length === 0;

  // Start countdown when conditions are met
  useEffect(() => {
    if (shouldTrigger && !isTriggering && countdown === null) {
      // Start countdown
      setCountdown(captureConfig.autoCaptureDelay);

      // Update countdown every 100ms
      countdownIntervalRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev === null || prev <= 100) {
            return 0;
          }
          return prev - 100;
        });
      }, 100);

      // Trigger capture after delay
      timerRef.current = setTimeout(async () => {
        setIsTriggering(true);
        try {
          await onAutoCapture();
        } finally {
          setIsTriggering(false);
          setCountdown(null);
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
          }
        }
      }, captureConfig.autoCaptureDelay);
    } else if (!shouldTrigger && countdown !== null && !isTriggering) {
      // Conditions no longer met, cancel
      cancel();
    }
  }, [shouldTrigger, isTriggering, countdown, captureConfig.autoCaptureDelay, onAutoCapture]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, []);

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = undefined;
    }
    setCountdown(null);
  }, []);

  return {
    countdown,
    isTriggering,
    cancel,
  };
}
