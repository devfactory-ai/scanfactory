import { useState, useCallback, useRef, useEffect } from 'react';
import type { EdgePoints, EdgeDetectionConfig } from '../types';
import { EdgeDetector } from '../scanner/EdgeDetector';

interface UseEdgeDetectionOptions {
  config: EdgeDetectionConfig;
  onEdgeChange?: (edges: EdgePoints | null) => void;
}

interface UseEdgeDetectionResult {
  edges: EdgePoints | null;
  isStable: boolean;
  stableFrameCount: number;
  processFrame: (frameData: unknown) => void;
  reset: () => void;
}

/**
 * Hook for edge detection in camera frames
 */
export function useEdgeDetection(
  options: UseEdgeDetectionOptions
): UseEdgeDetectionResult {
  const { config, onEdgeChange } = options;

  const [edges, setEdges] = useState<EdgePoints | null>(null);
  const [stableFrameCount, setStableFrameCount] = useState(0);

  const detectorRef = useRef<EdgeDetector>();
  const lastEdgesRef = useRef<EdgePoints | null>(null);

  useEffect(() => {
    if (config.enabled) {
      detectorRef.current = new EdgeDetector({
        minAreaRatio: config.minAreaRatio,
        sensitivity: config.sensitivity ?? 0.7,
      });
    }

    return () => {
      detectorRef.current = undefined;
    };
  }, [config]);

  const processFrame = useCallback(
    (frameData: unknown) => {
      if (!config.enabled || !detectorRef.current) {
        return;
      }

      const detected = detectorRef.current.detectEdges(frameData);

      // Check if edges are stable (similar to previous)
      const isStableEdge = detected && lastEdgesRef.current
        ? detectorRef.current.areEdgesStable(detected, lastEdgesRef.current)
        : false;

      if (detected) {
        setEdges(detected);
        lastEdgesRef.current = detected;

        if (isStableEdge) {
          setStableFrameCount((prev) => prev + 1);
        } else {
          setStableFrameCount(1);
        }

        onEdgeChange?.(detected);
      } else {
        if (lastEdgesRef.current !== null) {
          setEdges(null);
          lastEdgesRef.current = null;
          setStableFrameCount(0);
          onEdgeChange?.(null);
        }
      }
    },
    [config.enabled, onEdgeChange]
  );

  const reset = useCallback(() => {
    setEdges(null);
    setStableFrameCount(0);
    lastEdgesRef.current = null;
  }, []);

  const isStable = stableFrameCount >= config.stabilityThreshold;

  return {
    edges,
    isStable,
    stableFrameCount,
    processFrame,
    reset,
  };
}
