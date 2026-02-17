import type { EdgePoints, Point } from '../types';

interface PerspectiveCorrectionOptions {
  outputWidth?: number;
  outputHeight?: number;
  padding?: number;
}

interface TransformMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
  g: number;
  h: number;
}

/**
 * Perspective correction for scanned documents
 *
 * Transforms a quadrilateral region into a rectangle,
 * correcting for camera angle distortion.
 */
export class PerspectiveCorrector {
  /**
   * Calculate perspective transform matrix
   *
   * Uses homography to map source quad to destination rectangle
   */
  calculateTransform(
    sourceQuad: EdgePoints,
    destWidth: number,
    destHeight: number
  ): TransformMatrix {
    const src = [
      sourceQuad.topLeft,
      sourceQuad.topRight,
      sourceQuad.bottomRight,
      sourceQuad.bottomLeft,
    ];

    const dst: Point[] = [
      { x: 0, y: 0 },
      { x: destWidth, y: 0 },
      { x: destWidth, y: destHeight },
      { x: 0, y: destHeight },
    ];

    // Calculate homography matrix using direct linear transform
    return this.computeHomography(src, dst);
  }

  /**
   * Get optimal output dimensions based on detected quad
   */
  getOptimalDimensions(
    edges: EdgePoints,
    options: PerspectiveCorrectionOptions = {}
  ): { width: number; height: number } {
    const { outputWidth, outputHeight, padding = 0 } = options;

    if (outputWidth && outputHeight) {
      return { width: outputWidth, height: outputHeight };
    }

    // Calculate dimensions from quad edges
    const topWidth = this.distance(edges.topLeft, edges.topRight);
    const bottomWidth = this.distance(edges.bottomLeft, edges.bottomRight);
    const leftHeight = this.distance(edges.topLeft, edges.bottomLeft);
    const rightHeight = this.distance(edges.topRight, edges.bottomRight);

    const width = Math.max(topWidth, bottomWidth) + padding * 2;
    const height = Math.max(leftHeight, rightHeight) + padding * 2;

    return { width: Math.round(width), height: Math.round(height) };
  }

  /**
   * Calculate aspect ratio of detected document
   */
  getAspectRatio(edges: EdgePoints): number {
    const dims = this.getOptimalDimensions(edges);
    return dims.width / dims.height;
  }

  /**
   * Check if document is roughly A4 ratio (1:1.414)
   */
  isA4Ratio(edges: EdgePoints, tolerance = 0.1): boolean {
    const ratio = this.getAspectRatio(edges);
    const a4Ratio = 1 / 1.414; // Portrait A4

    return (
      Math.abs(ratio - a4Ratio) < tolerance ||
      Math.abs(ratio - 1.414) < tolerance // Landscape
    );
  }

  /**
   * Determine document orientation
   */
  getOrientation(edges: EdgePoints): 'portrait' | 'landscape' {
    const dims = this.getOptimalDimensions(edges);
    return dims.height > dims.width ? 'portrait' : 'landscape';
  }

  /**
   * Check if quad is significantly skewed
   */
  isSkewed(edges: EdgePoints, threshold = 5): boolean {
    // Check if opposite edges are roughly parallel
    const topAngle = this.getAngle(edges.topLeft, edges.topRight);
    const bottomAngle = this.getAngle(edges.bottomLeft, edges.bottomRight);
    const leftAngle = this.getAngle(edges.topLeft, edges.bottomLeft);
    const rightAngle = this.getAngle(edges.topRight, edges.bottomRight);

    const horizontalSkew = Math.abs(topAngle - bottomAngle);
    const verticalSkew = Math.abs(leftAngle - rightAngle);

    return horizontalSkew > threshold || verticalSkew > threshold;
  }

  /**
   * Normalize quad points to ensure correct ordering
   * (topLeft, topRight, bottomRight, bottomLeft clockwise)
   */
  normalizeQuad(points: Point[]): EdgePoints {
    if (points.length !== 4) {
      throw new Error('Quad must have exactly 4 points');
    }

    // Sort by y coordinate to get top and bottom pairs
    const sorted = [...points].sort((a, b) => a.y - b.y);
    const topPair = sorted.slice(0, 2);
    const bottomPair = sorted.slice(2, 4);

    // Sort each pair by x coordinate
    topPair.sort((a, b) => a.x - b.x);
    bottomPair.sort((a, b) => a.x - b.x);

    return {
      topLeft: topPair[0],
      topRight: topPair[1],
      bottomRight: bottomPair[1],
      bottomLeft: bottomPair[0],
    };
  }

  // Private helpers

  private distance(p1: Point, p2: Point): number {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
  }

  private getAngle(p1: Point, p2: Point): number {
    return (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180) / Math.PI;
  }

  private computeHomography(src: Point[], dst: Point[]): TransformMatrix {
    // Simplified homography calculation
    // In production, use proper matrix inversion with Gaussian elimination

    // For now, return identity-like transform
    // Real implementation would solve the system of equations
    const scaleX = (dst[1].x - dst[0].x) / (src[1].x - src[0].x);
    const scaleY = (dst[3].y - dst[0].y) / (src[3].y - src[0].y);

    return {
      a: scaleX,
      b: 0,
      c: dst[0].x - src[0].x * scaleX,
      d: 0,
      e: scaleY,
      f: dst[0].y - src[0].y * scaleY,
      g: 0,
      h: 0,
    };
  }
}
