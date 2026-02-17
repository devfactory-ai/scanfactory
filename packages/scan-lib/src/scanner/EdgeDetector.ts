import type { EdgePoints, Point } from '../types';

interface EdgeDetectorConfig {
  minAreaRatio: number;
  sensitivity: number;
}

interface DetectedQuad {
  topLeft: Point;
  topRight: Point;
  bottomRight: Point;
  bottomLeft: Point;
  confidence: number;
}

/**
 * Edge detector for document boundary detection
 *
 * Uses image processing to detect rectangular document boundaries
 * in camera frames. Works with expo-camera frame data.
 */
export class EdgeDetector {
  private config: EdgeDetectorConfig;
  private frameCount = 0;
  private lastDetection: DetectedQuad | null = null;

  constructor(config: EdgeDetectorConfig) {
    this.config = config;
  }

  /**
   * Detect document edges in a camera frame
   *
   * @param frameData - Raw frame data from expo-camera
   * @returns Detected edge points or null if no document found
   */
  detectEdges(frameData: unknown): EdgePoints | null {
    this.frameCount++;

    // In production, this would use native modules or ML Kit
    // for actual edge detection. This is a simplified simulation
    // that demonstrates the API contract.

    const frame = frameData as {
      width?: number;
      height?: number;
      data?: ArrayBuffer;
    };

    if (!frame || !frame.width || !frame.height) {
      return null;
    }

    // Simulate edge detection with probabilistic detection
    // In real implementation, this analyzes pixel data for contours
    const detected = this.simulateDetection(frame.width, frame.height);

    if (!detected) {
      this.lastDetection = null;
      return null;
    }

    this.lastDetection = detected;

    return {
      topLeft: detected.topLeft,
      topRight: detected.topRight,
      bottomRight: detected.bottomRight,
      bottomLeft: detected.bottomLeft,
    };
  }

  /**
   * Check if edges are stable compared to previous detection
   */
  areEdgesStable(current: EdgePoints, previous: EdgePoints): boolean {
    const threshold = 10; // pixels

    const distances = [
      this.pointDistance(current.topLeft, previous.topLeft),
      this.pointDistance(current.topRight, previous.topRight),
      this.pointDistance(current.bottomRight, previous.bottomRight),
      this.pointDistance(current.bottomLeft, previous.bottomLeft),
    ];

    return distances.every((d) => d < threshold);
  }

  /**
   * Get confidence score for current detection
   */
  getConfidence(): number {
    return this.lastDetection?.confidence ?? 0;
  }

  /**
   * Calculate area ratio of detected quad to frame
   */
  getAreaRatio(edges: EdgePoints, frameWidth: number, frameHeight: number): number {
    const quadArea = this.calculateQuadArea(edges);
    const frameArea = frameWidth * frameHeight;
    return quadArea / frameArea;
  }

  /**
   * Check if detected area meets minimum ratio requirement
   */
  isAreaSufficient(edges: EdgePoints, frameWidth: number, frameHeight: number): boolean {
    return this.getAreaRatio(edges, frameWidth, frameHeight) >= this.config.minAreaRatio;
  }

  /**
   * Reset detector state
   */
  reset(): void {
    this.frameCount = 0;
    this.lastDetection = null;
  }

  // Private helpers

  private simulateDetection(width: number, height: number): DetectedQuad | null {
    // Simulate detection probability based on sensitivity
    // In production, this analyzes actual pixel data
    const detectProbability = this.config.sensitivity;

    if (Math.random() > detectProbability) {
      return null;
    }

    // Simulate detected document with slight variations
    const margin = 0.1; // 10% margin from edges
    const variation = 0.02; // 2% random variation

    const addVariation = (base: number) =>
      base + (Math.random() - 0.5) * variation * Math.max(width, height);

    return {
      topLeft: {
        x: addVariation(width * margin),
        y: addVariation(height * margin),
      },
      topRight: {
        x: addVariation(width * (1 - margin)),
        y: addVariation(height * margin),
      },
      bottomRight: {
        x: addVariation(width * (1 - margin)),
        y: addVariation(height * (1 - margin)),
      },
      bottomLeft: {
        x: addVariation(width * margin),
        y: addVariation(height * (1 - margin)),
      },
      confidence: 0.7 + Math.random() * 0.3, // 70-100% confidence
    };
  }

  private pointDistance(a: Point, b: Point): number {
    return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
  }

  private calculateQuadArea(edges: EdgePoints): number {
    // Shoelace formula for quadrilateral area
    const points = [
      edges.topLeft,
      edges.topRight,
      edges.bottomRight,
      edges.bottomLeft,
    ];

    let area = 0;
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      area += points[i].x * points[j].y;
      area -= points[j].x * points[i].y;
    }

    return Math.abs(area) / 2;
  }
}
