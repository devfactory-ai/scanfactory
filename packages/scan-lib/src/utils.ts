import type { ScanLibConfig } from './types';

/**
 * Generate a unique local identifier
 */
export function generateLocalId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 9);
  return `scan_${timestamp}_${random}`;
}

/**
 * Create default configuration
 */
export function createDefaultConfig(
  overrides: Partial<ScanLibConfig> = {}
): ScanLibConfig {
  return {
    ocr: {
      mode: 'remote',
      timeout: 30000,
      retries: 3,
      ...overrides.ocr,
    },
    capture: {
      quality: 'high',
      autoCapture: true,
      autoCaptureDelay: 1000,
      maxWidth: 2400,
      aspectRatio: 1.414, // A4 ratio
      defaultFacing: 'back',
      ...overrides.capture,
    },
    edgeDetection: {
      enabled: true,
      minAreaRatio: 0.2,
      stabilityThreshold: 5,
      sensitivity: 0.7,
      ...overrides.edgeDetection,
    },
    storage: {
      persistPending: true,
      maxPendingItems: 50,
      keyPrefix: 'scanlib_',
      ...overrides.storage,
    },
    getAuthToken: overrides.getAuthToken,
  };
}

/**
 * Quality preset configurations
 */
export const QUALITY_PRESETS = {
  low: {
    maxWidth: 1200,
    jpegQuality: 0.6,
  },
  medium: {
    maxWidth: 1800,
    jpegQuality: 0.75,
  },
  high: {
    maxWidth: 2400,
    jpegQuality: 0.9,
  },
} as const;

/**
 * Calculate overall quality score from metrics
 */
export function calculateOverallQuality(metrics: {
  focus: number;
  lighting: number;
  stability: number;
  isFramed: boolean;
}): number {
  const weights = {
    focus: 0.35,
    lighting: 0.25,
    stability: 0.2,
    framing: 0.2,
  };

  return (
    metrics.focus * weights.focus +
    metrics.lighting * weights.lighting +
    metrics.stability * weights.stability +
    (metrics.isFramed ? 1 : 0) * weights.framing
  );
}

/**
 * Check if quality is good enough for capture
 */
export function isQualityAcceptable(quality: {
  overall: number;
  issues: string[];
}): boolean {
  return quality.overall >= 0.6 && quality.issues.length === 0;
}

/**
 * Format confidence score for display
 */
export function formatConfidence(score: number): string {
  return `${Math.round(score * 100)}%`;
}

/**
 * Get confidence color based on score
 */
export function getConfidenceColor(score: number): string {
  if (score >= 0.9) return '#10b981'; // green
  if (score >= 0.7) return '#f59e0b'; // yellow
  return '#ef4444'; // red
}
