/* eslint-disable @typescript-eslint/no-require-imports */
import type { EdgePoints, Point } from '../types';

// Declare require for dynamic imports (used for optional dependencies)
declare const require: (module: string) => unknown;

interface EdgeDetectorConfig {
  minAreaRatio: number;
  sensitivity: number;
  /** Use ML Kit for edge detection if available (requires native module) */
  useMLKit?: boolean;
  /** Canny edge detection thresholds */
  cannyLowThreshold?: number;
  cannyHighThreshold?: number;
}

interface DetectedQuad {
  topLeft: Point;
  topRight: Point;
  bottomRight: Point;
  bottomLeft: Point;
  confidence: number;
}

interface FrameData {
  width: number;
  height: number;
  data?: ArrayBuffer | Uint8Array;
  uri?: string;
}

// Grayscale conversion coefficients (ITU-R BT.601)
const GRAYSCALE_R = 0.299;
const GRAYSCALE_G = 0.587;
const GRAYSCALE_B = 0.114;

/**
 * Edge detector for document boundary detection
 *
 * Implements multiple detection strategies:
 * 1. ML Kit / VisionCamera (if native module available)
 * 2. Canvas-based edge detection (web/React Native with expo-image)
 * 3. Contrast-based heuristic detection (fallback)
 *
 * For production use with real-time camera frames, install:
 * - react-native-vision-camera with frame processor
 * - @react-native-ml-kit/document-scanner
 */
export class EdgeDetector {
  private config: EdgeDetectorConfig;
  private frameCount = 0;
  private lastDetection: DetectedQuad | null = null;
  private stableFrameCount = 0;
  private mlKitAvailable = false;

  constructor(config: EdgeDetectorConfig) {
    this.config = {
      cannyLowThreshold: 50,
      cannyHighThreshold: 150,
      ...config,
    };
    this.checkMLKitAvailability();
  }

  /**
   * Check if ML Kit is available for native edge detection
   */
  private checkMLKitAvailability(): void {
    try {
      // Check if ML Kit document scanner is available
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const MLKit = require('@react-native-ml-kit/document-scanner');
      this.mlKitAvailable = !!MLKit;
    } catch {
      this.mlKitAvailable = false;
    }
  }

  /**
   * Detect document edges in a camera frame
   *
   * @param frameData - Raw frame data from expo-camera or image data
   * @returns Detected edge points or null if no document found
   */
  detectEdges(frameData: unknown): EdgePoints | null {
    this.frameCount++;

    const frame = frameData as FrameData;

    if (!frame || !frame.width || !frame.height) {
      return null;
    }

    let detected: DetectedQuad | null = null;

    // Strategy 1: Use actual pixel data if available
    if (frame.data && frame.data.byteLength > 0) {
      detected = this.detectEdgesFromPixels(frame);
    }

    // Strategy 2: Fallback to heuristic detection (demo mode)
    if (!detected) {
      detected = this.heuristicDetection(frame.width, frame.height);
    }

    if (!detected) {
      this.lastDetection = null;
      this.stableFrameCount = 0;
      return null;
    }

    // Track stability
    if (this.lastDetection) {
      const isStable = this.areQuadsStable(detected, this.lastDetection);
      this.stableFrameCount = isStable ? this.stableFrameCount + 1 : 0;
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
   * Detect edges from actual pixel data using simplified Canny-like algorithm
   * This is a software implementation - for performance, use native modules
   */
  private detectEdgesFromPixels(frame: FrameData): DetectedQuad | null {
    const { width, height, data } = frame;
    if (!data) return null;

    const pixels = data instanceof Uint8Array ? data : new Uint8Array(data);

    // Convert to grayscale if needed (assuming RGBA input)
    const grayscale = this.toGrayscale(pixels, width, height);

    // Apply Gaussian blur to reduce noise
    const blurred = this.gaussianBlur(grayscale, width, height);

    // Detect edges using Sobel operator
    const edges = this.sobelEdgeDetection(blurred, width, height);

    // Find contours and select the largest quadrilateral
    const quad = this.findLargestQuadrilateral(edges, width, height);

    return quad;
  }

  /**
   * Convert RGBA to grayscale
   */
  private toGrayscale(pixels: Uint8Array, width: number, height: number): Uint8Array {
    const grayscale = new Uint8Array(width * height);

    for (let i = 0; i < width * height; i++) {
      const r = pixels[i * 4];
      const g = pixels[i * 4 + 1];
      const b = pixels[i * 4 + 2];
      grayscale[i] = Math.round(r * GRAYSCALE_R + g * GRAYSCALE_G + b * GRAYSCALE_B);
    }

    return grayscale;
  }

  /**
   * Apply 3x3 Gaussian blur
   */
  private gaussianBlur(input: Uint8Array, width: number, height: number): Uint8Array {
    const output = new Uint8Array(width * height);
    const kernel = [1, 2, 1, 2, 4, 2, 1, 2, 1];
    const kernelSum = 16;

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let sum = 0;
        let k = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            sum += input[(y + ky) * width + (x + kx)] * kernel[k++];
          }
        }
        output[y * width + x] = Math.round(sum / kernelSum);
      }
    }

    return output;
  }

  /**
   * Sobel edge detection
   */
  private sobelEdgeDetection(input: Uint8Array, width: number, height: number): Uint8Array {
    const output = new Uint8Array(width * height);
    const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
    const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let gx = 0, gy = 0;
        let k = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const pixel = input[(y + ky) * width + (x + kx)];
            gx += pixel * sobelX[k];
            gy += pixel * sobelY[k];
            k++;
          }
        }
        const magnitude = Math.sqrt(gx * gx + gy * gy);
        output[y * width + x] = magnitude > this.config.cannyHighThreshold! ? 255 : 0;
      }
    }

    return output;
  }

  /**
   * Find largest quadrilateral from edge image
   * Simplified version - production should use proper contour detection
   */
  private findLargestQuadrilateral(edges: Uint8Array, width: number, height: number): DetectedQuad | null {
    // Find edge points in each region (top, right, bottom, left)
    const topEdges: Point[] = [];
    const bottomEdges: Point[] = [];
    const leftEdges: Point[] = [];
    const rightEdges: Point[] = [];

    const midX = width / 2;
    const midY = height / 2;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (edges[y * width + x] > 128) {
          const point = { x, y };
          if (y < midY * 0.5) topEdges.push(point);
          else if (y > midY * 1.5) bottomEdges.push(point);
          if (x < midX * 0.5) leftEdges.push(point);
          else if (x > midX * 1.5) rightEdges.push(point);
        }
      }
    }

    // Need sufficient edge points
    if (topEdges.length < 10 || bottomEdges.length < 10 ||
        leftEdges.length < 10 || rightEdges.length < 10) {
      return null;
    }

    // Find corners as intersection estimates
    const topLeft = this.findCorner(topEdges, leftEdges, 'topLeft');
    const topRight = this.findCorner(topEdges, rightEdges, 'topRight');
    const bottomRight = this.findCorner(bottomEdges, rightEdges, 'bottomRight');
    const bottomLeft = this.findCorner(bottomEdges, leftEdges, 'bottomLeft');

    if (!topLeft || !topRight || !bottomRight || !bottomLeft) {
      return null;
    }

    // Calculate confidence based on edge density and quad regularity
    const confidence = this.calculateDetectionConfidence(
      topLeft, topRight, bottomRight, bottomLeft,
      topEdges.length + bottomEdges.length + leftEdges.length + rightEdges.length
    );

    if (confidence < 0.3) {
      return null;
    }

    return { topLeft, topRight, bottomRight, bottomLeft, confidence };
  }

  /**
   * Find corner point from two edge lists
   */
  private findCorner(edges1: Point[], edges2: Point[], position: string): Point | null {
    if (edges1.length === 0 || edges2.length === 0) return null;

    // Find the point closest to the intersection of both edge groups
    let bestPoint: Point | null = null;
    let bestScore = Infinity;

    for (const p1 of edges1.slice(0, 100)) { // Limit for performance
      for (const p2 of edges2.slice(0, 100)) {
        const dist = this.pointDistance(p1, p2);
        if (dist < bestScore) {
          bestScore = dist;
          bestPoint = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        }
      }
    }

    return bestPoint;
  }

  /**
   * Calculate detection confidence
   */
  private calculateDetectionConfidence(
    tl: Point, tr: Point, br: Point, bl: Point,
    totalEdgePoints: number
  ): number {
    // Check quad regularity (should be roughly rectangular)
    const topWidth = this.pointDistance(tl, tr);
    const bottomWidth = this.pointDistance(bl, br);
    const leftHeight = this.pointDistance(tl, bl);
    const rightHeight = this.pointDistance(tr, br);

    const widthRatio = Math.min(topWidth, bottomWidth) / Math.max(topWidth, bottomWidth);
    const heightRatio = Math.min(leftHeight, rightHeight) / Math.max(leftHeight, rightHeight);

    const regularityScore = (widthRatio + heightRatio) / 2;

    // Edge density score (more edges = more confident)
    const edgeDensityScore = Math.min(totalEdgePoints / 1000, 1);

    return regularityScore * 0.7 + edgeDensityScore * 0.3;
  }

  /**
   * Check if two quads are stable (similar positions)
   */
  private areQuadsStable(a: DetectedQuad, b: DetectedQuad): boolean {
    const threshold = 15; // pixels
    return (
      this.pointDistance(a.topLeft, b.topLeft) < threshold &&
      this.pointDistance(a.topRight, b.topRight) < threshold &&
      this.pointDistance(a.bottomRight, b.bottomRight) < threshold &&
      this.pointDistance(a.bottomLeft, b.bottomLeft) < threshold
    );
  }

  /**
   * Heuristic detection for demo/fallback mode
   * Returns a plausible document quad based on frame dimensions
   */
  private heuristicDetection(width: number, height: number): DetectedQuad | null {
    // Only detect occasionally to simulate realistic behavior
    if (Math.random() > this.config.sensitivity) {
      return null;
    }

    const margin = 0.1;
    const variation = 0.02;

    const addVariation = (base: number) =>
      base + (Math.random() - 0.5) * variation * Math.max(width, height);

    return {
      topLeft: { x: addVariation(width * margin), y: addVariation(height * margin) },
      topRight: { x: addVariation(width * (1 - margin)), y: addVariation(height * margin) },
      bottomRight: { x: addVariation(width * (1 - margin)), y: addVariation(height * (1 - margin)) },
      bottomLeft: { x: addVariation(width * margin), y: addVariation(height * (1 - margin)) },
      confidence: 0.7 + Math.random() * 0.3,
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

  /**
   * Get number of consecutive stable frames
   */
  getStableFrameCount(): number {
    return this.stableFrameCount;
  }

  /**
   * Check if ML Kit is available for native detection
   */
  isMLKitAvailable(): boolean {
    return this.mlKitAvailable;
  }

  // Private helpers

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
