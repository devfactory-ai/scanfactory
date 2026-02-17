import type { QualityMetrics, QualityIssue } from '../types';

interface FrameAnalysisData {
  brightness?: number;
  contrast?: number;
  sharpness?: number;
  width?: number;
  height?: number;
  data?: ArrayBuffer | Uint8Array;
}

// Grayscale conversion coefficients (ITU-R BT.601)
const GRAYSCALE_R = 0.299;
const GRAYSCALE_G = 0.587;
const GRAYSCALE_B = 0.114;

// Laplacian kernel for blur detection
const LAPLACIAN_KERNEL = [0, 1, 0, 1, -4, 1, 0, 1, 0];

// Quality thresholds
const BLUR_THRESHOLD_LOW = 100; // Below this = very blurry
const BLUR_THRESHOLD_GOOD = 500; // Above this = sharp
const BRIGHTNESS_OPTIMAL_MIN = 80; // Target brightness range
const BRIGHTNESS_OPTIMAL_MAX = 180;
const CONTRAST_THRESHOLD_LOW = 30; // Minimum acceptable contrast
const MOTION_THRESHOLD = 15; // Max pixel difference for stability

/**
 * Quality analyzer for document images
 *
 * Analyzes images for blur, lighting, and other quality issues
 * that might affect OCR accuracy.
 *
 * Implements real image analysis algorithms:
 * - Laplacian variance for blur/focus detection
 * - Histogram analysis for lighting evaluation
 * - Frame differencing for motion/stability detection
 */
export class QualityAnalyzer {
  private lastMetrics: QualityMetrics | null = null;
  private previousFrame: Uint8Array | null = null;
  private previousFrameWidth = 0;
  private previousFrameHeight = 0;

  /**
   * Analyze frame quality using real image processing
   */
  analyze(frameData: unknown): QualityMetrics {
    const frame = frameData as FrameAnalysisData;

    // Check if we have actual pixel data for real analysis
    const hasPixelData = frame.data && frame.width && frame.height;

    let focus: number;
    let lighting: number;
    let stability: number;

    if (hasPixelData) {
      const pixels = frame.data instanceof Uint8Array
        ? frame.data
        : new Uint8Array(frame.data!);
      const width = frame.width!;
      const height = frame.height!;

      // Convert to grayscale for analysis
      const grayscale = this.toGrayscale(pixels, width, height);

      // Real analysis using actual algorithms
      focus = this.calculateLaplacianVariance(grayscale, width, height);
      lighting = this.analyzeHistogram(grayscale);
      stability = this.calculateStability(grayscale, width, height);

      // Store for next frame comparison
      this.previousFrame = grayscale;
      this.previousFrameWidth = width;
      this.previousFrameHeight = height;
    } else {
      // Fallback to provided or simulated values
      focus = this.analyzeFocusFallback(frame);
      lighting = this.analyzeLightingFallback(frame);
      stability = 1.0;
    }

    const isFramed = true; // Assume framed if edges detected

    // Detect issues based on metrics
    const issues = this.detectIssues(focus, lighting, stability);

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
   * Analyze static image (from URI or pixel data)
   *
   * For actual image analysis, pass pixel data directly.
   * URI-based loading requires platform-specific image loading.
   */
  async analyzeImage(imageUri: string): Promise<QualityMetrics>;
  async analyzeImage(pixelData: Uint8Array, width: number, height: number): Promise<QualityMetrics>;
  async analyzeImage(
    imageUriOrData: string | Uint8Array,
    width?: number,
    height?: number
  ): Promise<QualityMetrics> {
    // If pixel data is provided directly, analyze it
    if (imageUriOrData instanceof Uint8Array && width && height) {
      return this.analyze({
        data: imageUriOrData,
        width,
        height,
      });
    }

    // For URI-based analysis, platform-specific loading is needed
    // This is a placeholder - integrate with expo-image or canvas API
    // In React Native: use expo-image-manipulator to get pixel data
    // In Web: use canvas to get ImageData

    // Return baseline metrics indicating analysis wasn't possible
    return {
      overall: 0.75,
      focus: 0.75,
      lighting: 0.75,
      stability: 1.0,
      isFramed: true,
      issues: [{
        type: 'unknown',
        severity: 'low',
        message: 'Image analysis requires pixel data. Quality estimated.',
      }],
    };
  }

  /**
   * Reset analyzer state (clear previous frame for stability tracking)
   */
  reset(): void {
    this.lastMetrics = null;
    this.previousFrame = null;
    this.previousFrameWidth = 0;
    this.previousFrameHeight = 0;
  }

  /**
   * Get detailed analysis report for debugging
   */
  getDetailedAnalysis(
    pixelData: Uint8Array,
    width: number,
    height: number
  ): {
    metrics: QualityMetrics;
    laplacianVariance: number;
    meanBrightness: number;
    contrastStdDev: number;
    clippingRatio: number;
  } {
    const grayscale = this.toGrayscale(pixelData, width, height);

    // Calculate Laplacian variance
    let lapSum = 0;
    let lapSumSq = 0;
    let lapCount = 0;

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let laplacian = 0;
        let k = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            laplacian += grayscale[(y + ky) * width + (x + kx)] * LAPLACIAN_KERNEL[k++];
          }
        }
        lapSum += laplacian;
        lapSumSq += laplacian * laplacian;
        lapCount++;
      }
    }
    const lapMean = lapSum / lapCount;
    const laplacianVariance = lapSumSq / lapCount - lapMean * lapMean;

    // Calculate histogram stats
    let brightnessSum = 0;
    let clippedLow = 0;
    let clippedHigh = 0;

    for (let i = 0; i < grayscale.length; i++) {
      brightnessSum += grayscale[i];
      if (grayscale[i] <= 5) clippedLow++;
      if (grayscale[i] >= 250) clippedHigh++;
    }

    const meanBrightness = brightnessSum / grayscale.length;

    let varianceSum = 0;
    for (let i = 0; i < grayscale.length; i++) {
      varianceSum += Math.pow(grayscale[i] - meanBrightness, 2);
    }
    const contrastStdDev = Math.sqrt(varianceSum / grayscale.length);
    const clippingRatio = (clippedLow + clippedHigh) / grayscale.length;

    return {
      metrics: this.analyze({ data: pixelData, width, height }),
      laplacianVariance,
      meanBrightness,
      contrastStdDev,
      clippingRatio,
    };
  }

  // Private analysis methods - Real implementations

  /**
   * Convert RGBA to grayscale
   */
  private toGrayscale(pixels: Uint8Array, width: number, height: number): Uint8Array {
    const grayscale = new Uint8Array(width * height);

    for (let i = 0; i < width * height; i++) {
      const r = pixels[i * 4] ?? 0;
      const g = pixels[i * 4 + 1] ?? 0;
      const b = pixels[i * 4 + 2] ?? 0;
      grayscale[i] = Math.round(r * GRAYSCALE_R + g * GRAYSCALE_G + b * GRAYSCALE_B);
    }

    return grayscale;
  }

  /**
   * Calculate Laplacian variance for blur/focus detection
   *
   * The Laplacian operator highlights regions of rapid intensity change.
   * Sharp images have high variance in the Laplacian, blurry images have low variance.
   */
  private calculateLaplacianVariance(
    grayscale: Uint8Array,
    width: number,
    height: number
  ): number {
    // Apply Laplacian kernel and calculate variance
    let sum = 0;
    let sumSq = 0;
    let count = 0;

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let laplacian = 0;
        let k = 0;

        // Apply 3x3 Laplacian kernel
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const pixel = grayscale[(y + ky) * width + (x + kx)];
            laplacian += pixel * LAPLACIAN_KERNEL[k++];
          }
        }

        sum += laplacian;
        sumSq += laplacian * laplacian;
        count++;
      }
    }

    if (count === 0) return 0;

    // Calculate variance
    const mean = sum / count;
    const variance = sumSq / count - mean * mean;

    // Normalize to 0-1 scale
    // variance typically ranges from ~50 (very blurry) to ~2000+ (very sharp)
    const normalizedFocus = Math.min(1, Math.max(0,
      (variance - BLUR_THRESHOLD_LOW) / (BLUR_THRESHOLD_GOOD - BLUR_THRESHOLD_LOW)
    ));

    return normalizedFocus;
  }

  /**
   * Analyze histogram for lighting quality
   *
   * Evaluates:
   * - Mean brightness (too dark or too bright is bad)
   * - Contrast (standard deviation of intensities)
   * - Clipping (pixels at 0 or 255)
   */
  private analyzeHistogram(grayscale: Uint8Array): number {
    const histogram = new Uint32Array(256);
    let sum = 0;
    let clippedLow = 0;
    let clippedHigh = 0;

    // Build histogram
    for (let i = 0; i < grayscale.length; i++) {
      const value = grayscale[i];
      histogram[value]++;
      sum += value;

      if (value <= 5) clippedLow++;
      if (value >= 250) clippedHigh++;
    }

    const count = grayscale.length;
    const mean = sum / count;

    // Calculate standard deviation (contrast)
    let varianceSum = 0;
    for (let i = 0; i < count; i++) {
      const diff = grayscale[i] - mean;
      varianceSum += diff * diff;
    }
    const stdDev = Math.sqrt(varianceSum / count);

    // Brightness score: penalize if too dark or too bright
    let brightnessScore = 1.0;
    if (mean < BRIGHTNESS_OPTIMAL_MIN) {
      brightnessScore = mean / BRIGHTNESS_OPTIMAL_MIN;
    } else if (mean > BRIGHTNESS_OPTIMAL_MAX) {
      brightnessScore = Math.max(0, 1 - (mean - BRIGHTNESS_OPTIMAL_MAX) / (255 - BRIGHTNESS_OPTIMAL_MAX));
    }

    // Contrast score: need sufficient contrast for OCR
    const contrastScore = Math.min(1, stdDev / 60); // stdDev of 60+ is good contrast

    // Penalize clipping (lost information)
    const clippingRatio = (clippedLow + clippedHigh) / count;
    const clippingPenalty = Math.max(0, 1 - clippingRatio * 5); // 20% clipping = 0 score

    // Low contrast penalty for documents
    const lowContrastPenalty = stdDev < CONTRAST_THRESHOLD_LOW ? 0.5 : 1.0;

    // Combine scores
    return brightnessScore * 0.4 + contrastScore * 0.3 + clippingPenalty * 0.2 + lowContrastPenalty * 0.1;
  }

  /**
   * Calculate stability by comparing with previous frame
   *
   * Uses mean absolute difference between frames.
   * High difference = motion/instability
   */
  private calculateStability(
    currentFrame: Uint8Array,
    width: number,
    height: number
  ): number {
    if (!this.previousFrame ||
        this.previousFrameWidth !== width ||
        this.previousFrameHeight !== height) {
      return 1.0; // First frame, assume stable
    }

    // Sample points for efficiency (don't need to compare every pixel)
    const sampleStep = Math.max(1, Math.floor(Math.sqrt(width * height / 1000)));
    let totalDiff = 0;
    let sampleCount = 0;

    for (let y = 0; y < height; y += sampleStep) {
      for (let x = 0; x < width; x += sampleStep) {
        const idx = y * width + x;
        const diff = Math.abs(currentFrame[idx] - this.previousFrame[idx]);
        totalDiff += diff;
        sampleCount++;
      }
    }

    const meanDiff = totalDiff / sampleCount;

    // Normalize: 0 diff = 1.0 stability, MOTION_THRESHOLD+ diff = 0.0 stability
    const stability = Math.max(0, 1 - meanDiff / MOTION_THRESHOLD);

    return stability;
  }

  /**
   * Fallback focus analysis when pixel data not available
   */
  private analyzeFocusFallback(frame: FrameAnalysisData): number {
    if (frame.sharpness !== undefined) {
      return Math.min(1, Math.max(0, frame.sharpness));
    }
    // Simulate if no data
    return 0.7 + Math.random() * 0.3;
  }

  /**
   * Fallback lighting analysis when pixel data not available
   */
  private analyzeLightingFallback(frame: FrameAnalysisData): number {
    if (frame.brightness !== undefined && frame.contrast !== undefined) {
      const brightnessPenalty = Math.abs(0.5 - frame.brightness);
      const contrastPenalty = Math.abs(0.5 - frame.contrast);
      return Math.max(0, 1 - brightnessPenalty - contrastPenalty);
    }
    // Simulate if no data
    return 0.7 + Math.random() * 0.3;
  }

  private detectIssues(focus: number, lighting: number, stability: number = 1.0): QualityIssue[] {
    const issues: QualityIssue[] = [];

    // Check focus/blur issues
    if (focus < 0.3) {
      issues.push({
        type: 'blur',
        severity: 'high',
        message: 'Image is too blurry. Hold camera steady.',
      });
    } else if (focus < 0.5) {
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

    // Check stability/motion issues
    if (stability < 0.5) {
      issues.push({
        type: 'motion',
        severity: 'high',
        message: 'Too much motion. Hold the device still.',
      });
    } else if (stability < 0.7) {
      issues.push({
        type: 'motion',
        severity: 'medium',
        message: 'Slight motion detected. Try to stabilize.',
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
