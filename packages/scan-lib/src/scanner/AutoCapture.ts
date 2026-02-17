import type { EdgePoints, QualityMetrics, CaptureConfig, EdgeDetectionConfig } from '../types';

interface AutoCaptureConfig {
  captureConfig: CaptureConfig;
  edgeConfig: EdgeDetectionConfig;
}

type CaptureCallback = () => Promise<void>;

/**
 * Auto-capture controller
 *
 * Monitors frame stability and quality to trigger automatic capture
 * when optimal conditions are met.
 */
export class AutoCapture {
  private config: AutoCaptureConfig;
  private stableFrameCount = 0;
  private isCapturing = false;
  private captureTimer: ReturnType<typeof setTimeout> | null = null;
  private countdownInterval: ReturnType<typeof setInterval> | null = null;
  private countdown: number | null = null;
  private onCaptureCallback: CaptureCallback | null = null;
  private onCountdownUpdate: ((value: number | null) => void) | null = null;

  constructor(config: AutoCaptureConfig) {
    this.config = config;
  }

  /**
   * Set capture callback
   */
  onCapture(callback: CaptureCallback): void {
    this.onCaptureCallback = callback;
  }

  /**
   * Set countdown update callback
   */
  onCountdown(callback: (value: number | null) => void): void {
    this.onCountdownUpdate = callback;
  }

  /**
   * Process a frame and check for auto-capture trigger
   */
  processFrame(
    edges: EdgePoints | null,
    quality: QualityMetrics | null,
    isStable: boolean
  ): void {
    if (!this.config.captureConfig.autoCapture || this.isCapturing) {
      return;
    }

    const shouldTrigger = this.shouldTriggerCapture(edges, quality, isStable);

    if (shouldTrigger) {
      this.stableFrameCount++;

      if (this.stableFrameCount >= this.config.edgeConfig.stabilityThreshold) {
        this.startCapture();
      }
    } else {
      this.cancelCapture();
    }
  }

  /**
   * Check if conditions are met for auto-capture
   */
  shouldTriggerCapture(
    edges: EdgePoints | null,
    quality: QualityMetrics | null,
    isStable: boolean
  ): boolean {
    // All conditions must be met
    return (
      this.config.edgeConfig.enabled &&
      edges !== null &&
      isStable &&
      quality !== null &&
      quality.overall >= 0.6 &&
      quality.issues.length === 0
    );
  }

  /**
   * Start capture countdown
   */
  private startCapture(): void {
    if (this.captureTimer) {
      return; // Already started
    }

    const delay = this.config.captureConfig.autoCaptureDelay;
    this.countdown = delay;
    this.onCountdownUpdate?.(this.countdown);

    // Update countdown every 100ms
    this.countdownInterval = setInterval(() => {
      if (this.countdown !== null && this.countdown > 0) {
        this.countdown = Math.max(0, this.countdown - 100);
        this.onCountdownUpdate?.(this.countdown);
      }
    }, 100);

    // Trigger capture after delay
    this.captureTimer = setTimeout(async () => {
      this.isCapturing = true;

      try {
        await this.onCaptureCallback?.();
      } finally {
        this.isCapturing = false;
        this.cleanup();
      }
    }, delay);
  }

  /**
   * Cancel pending capture
   */
  cancelCapture(): void {
    this.stableFrameCount = 0;
    this.cleanup();
  }

  /**
   * Get current countdown value
   */
  getCountdown(): number | null {
    return this.countdown;
  }

  /**
   * Check if capture is in progress
   */
  isTriggering(): boolean {
    return this.captureTimer !== null || this.isCapturing;
  }

  /**
   * Reset state
   */
  reset(): void {
    this.stableFrameCount = 0;
    this.isCapturing = false;
    this.cleanup();
  }

  /**
   * Cleanup timers
   */
  private cleanup(): void {
    if (this.captureTimer) {
      clearTimeout(this.captureTimer);
      this.captureTimer = null;
    }

    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }

    this.countdown = null;
    this.onCountdownUpdate?.(null);
  }

  /**
   * Destroy instance
   */
  destroy(): void {
    this.cleanup();
    this.onCaptureCallback = null;
    this.onCountdownUpdate = null;
  }
}
