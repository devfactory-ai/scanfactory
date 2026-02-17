import type { QualityMetrics, QualityIssue } from '../types';

interface FrameAnalysisData {
  brightness?: number;
  contrast?: number;
  sharpness?: number;
  width?: number;
  height?: number;
  data?: ArrayBuffer | Uint8Array;
}

/**
 * Quality analyzer for document images
 *
 * Analyzes images for blur, lighting, and other quality issues
 * that might affect OCR accuracy.
 */
export class QualityAnalyzer {
  private lastMetrics: QualityMetrics | null = null;

  /**
   * Analyze frame quality
   */
  analyze(frameData: unknown): QualityMetrics {
    const frame = frameData as FrameAnalysisData;

    // Calculate individual metrics
    const focus = this.analyzeFocus(frame);
    const lighting = this.analyzeLighting(frame);
    const stability = 1.0; // Stability is tracked by edge detection
    const isFramed = true; // Assume framed if edges detected

    // Detect issues
    const issues = this.detectIssues(focus, lighting);

    // Calculate overall score
    const overall = this.calculateOverall(focus, lighting, stability, isFramed);

    const metrics: QualityMetrics = {
      overall,
      focus,
      lighting,
      stability,
      isFramed,
      issues,
    };

    this.lastMetrics = metrics;
    return metrics;
  }

  /**
   * Quick check if image meets minimum quality
   */
  isAcceptable(metrics: QualityMetrics): boolean {
    return metrics.overall >= 0.6 && metrics.issues.length === 0;
  }

  /**
   * Get last analyzed metrics
   */
  getLastMetrics(): QualityMetrics | null {
    return this.lastMetrics;
  }

  /**
   * Analyze static image (from URI)
   */
  async analyzeImage(imageUri: string): Promise<QualityMetrics> {
    // In production, this would load and analyze the image
    // For now, return simulated good quality
    return {
      overall: 0.85,
      focus: 0.9,
      lighting: 0.85,
      stability: 1.0,
      isFramed: true,
      issues: [],
    };
  }

  // Private analysis methods

  private analyzeFocus(frame: FrameAnalysisData): number {
    // In production, calculate Laplacian variance for blur detection
    // Higher variance = sharper image

    if (frame.sharpness !== undefined) {
      return Math.min(1, Math.max(0, frame.sharpness));
    }

    // Simulate focus analysis
    // Real implementation would analyze high-frequency content
    return 0.7 + Math.random() * 0.3;
  }

  private analyzeLighting(frame: FrameAnalysisData): number {
    // Analyze brightness and contrast

    if (frame.brightness !== undefined && frame.contrast !== undefined) {
      // Good lighting: brightness ~0.5, contrast ~0.5
      const brightnessPenalty = Math.abs(0.5 - frame.brightness);
      const contrastPenalty = Math.abs(0.5 - frame.contrast);

      return Math.max(0, 1 - brightnessPenalty - contrastPenalty);
    }

    // Simulate lighting analysis
    return 0.7 + Math.random() * 0.3;
  }

  private detectIssues(focus: number, lighting: number): QualityIssue[] {
    const issues: QualityIssue[] = [];

    // Check focus issues
    if (focus < 0.4) {
      issues.push({
        type: 'blur',
        severity: 'high',
        message: 'Image is too blurry. Hold camera steady.',
      });
    } else if (focus < 0.6) {
      issues.push({
        type: 'blur',
        severity: 'medium',
        message: 'Image slightly blurry. Try to focus.',
      });
    }

    // Check lighting issues
    if (lighting < 0.3) {
      issues.push({
        type: 'low_light',
        severity: 'high',
        message: 'Not enough light. Move to brighter area.',
      });
    } else if (lighting < 0.5) {
      issues.push({
        type: 'low_light',
        severity: 'medium',
        message: 'Lighting could be better.',
      });
    } else if (lighting > 0.95) {
      issues.push({
        type: 'glare',
        severity: 'medium',
        message: 'Possible glare detected. Adjust angle.',
      });
    }

    return issues;
  }

  private calculateOverall(
    focus: number,
    lighting: number,
    stability: number,
    isFramed: boolean
  ): number {
    const weights = {
      focus: 0.35,
      lighting: 0.25,
      stability: 0.2,
      framing: 0.2,
    };

    return (
      focus * weights.focus +
      lighting * weights.lighting +
      stability * weights.stability +
      (isFramed ? 1 : 0) * weights.framing
    );
  }

  /**
   * Get quality level label
   */
  static getQualityLabel(score: number): string {
    if (score >= 0.9) return 'Excellent';
    if (score >= 0.7) return 'Good';
    if (score >= 0.5) return 'Acceptable';
    return 'Poor';
  }

  /**
   * Get color for quality score
   */
  static getQualityColor(score: number): string {
    if (score >= 0.8) return '#10b981'; // green
    if (score >= 0.6) return '#f59e0b'; // yellow
    return '#ef4444'; // red
  }
}
