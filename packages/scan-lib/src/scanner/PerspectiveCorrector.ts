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

  /**
   * Compute homography matrix using Direct Linear Transform (DLT) algorithm
   * Maps 4 source points to 4 destination points
   *
   * The homography matrix H maps point (x,y) to (x',y') as:
   * [x']   [a b c] [x]
   * [y'] = [d e f] [y]
   * [w']   [g h 1] [1]
   *
   * where x' = x'/w' and y' = y'/w'
   */
  private computeHomography(src: Point[], dst: Point[]): TransformMatrix {
    // Build the 8x8 matrix A for the equation Ah = 0
    // Each point correspondence gives us 2 equations
    const A: number[][] = [];

    for (let i = 0; i < 4; i++) {
      const sx = src[i].x;
      const sy = src[i].y;
      const dx = dst[i].x;
      const dy = dst[i].y;

      // First equation: -x*a - y*b - c + x*g*x' + y*h*x' + x' = 0
      A.push([
        -sx, -sy, -1, 0, 0, 0, sx * dx, sy * dx,
      ]);

      // Second equation: 0 - x*d - y*e - f + x*g*y' + y*h*y' + y' = 0
      A.push([
        0, 0, 0, -sx, -sy, -1, sx * dy, sy * dy,
      ]);
    }

    // Right-hand side vector (destination coordinates)
    const b = dst.flatMap(p => [-p.x, -p.y]);

    // Solve using Gaussian elimination with partial pivoting
    const h = this.solveLinearSystem(A, b);

    if (!h) {
      // Fallback to simple scaling if solving fails
      return this.computeSimpleTransform(src, dst);
    }

    return {
      a: h[0],
      b: h[1],
      c: h[2],
      d: h[3],
      e: h[4],
      f: h[5],
      g: h[6],
      h: h[7],
    };
  }

  /**
   * Solve linear system Ax = b using Gaussian elimination with partial pivoting
   */
  private solveLinearSystem(A: number[][], b: number[]): number[] | null {
    const n = 8;
    const aug: number[][] = A.map((row, i) => [...row, b[i]]);

    // Forward elimination with partial pivoting
    for (let col = 0; col < n; col++) {
      // Find pivot
      let maxRow = col;
      for (let row = col + 1; row < n; row++) {
        if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) {
          maxRow = row;
        }
      }

      // Swap rows
      [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];

      // Check for singular matrix
      if (Math.abs(aug[col][col]) < 1e-10) {
        return null;
      }

      // Eliminate below
      for (let row = col + 1; row < n; row++) {
        const factor = aug[row][col] / aug[col][col];
        for (let j = col; j <= n; j++) {
          aug[row][j] -= factor * aug[col][j];
        }
      }
    }

    // Back substitution
    const x = new Array(n).fill(0);
    for (let row = n - 1; row >= 0; row--) {
      let sum = aug[row][n];
      for (let col = row + 1; col < n; col++) {
        sum -= aug[row][col] * x[col];
      }
      x[row] = sum / aug[row][row];
    }

    return x;
  }

  /**
   * Fallback simple transform (scale + translate)
   */
  private computeSimpleTransform(src: Point[], dst: Point[]): TransformMatrix {
    const scaleX = (dst[1].x - dst[0].x) / Math.max(src[1].x - src[0].x, 1);
    const scaleY = (dst[3].y - dst[0].y) / Math.max(src[3].y - src[0].y, 1);

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

  /**
   * Apply homography transform to a point
   */
  transformPoint(point: Point, matrix: TransformMatrix): Point {
    const w = matrix.g * point.x + matrix.h * point.y + 1;
    return {
      x: (matrix.a * point.x + matrix.b * point.y + matrix.c) / w,
      y: (matrix.d * point.x + matrix.e * point.y + matrix.f) / w,
    };
  }

  /**
   * Apply perspective correction to image data
   * This performs bilinear interpolation for smooth output
   *
   * @param sourceData - RGBA pixel data of source image
   * @param sourceWidth - Width of source image
   * @param sourceHeight - Height of source image
   * @param edges - Detected document corners
   * @param outputWidth - Desired output width
   * @param outputHeight - Desired output height
   * @returns Corrected RGBA pixel data
   */
  correctPerspective(
    sourceData: Uint8Array,
    sourceWidth: number,
    sourceHeight: number,
    edges: EdgePoints,
    outputWidth: number,
    outputHeight: number
  ): Uint8Array {
    const output = new Uint8Array(outputWidth * outputHeight * 4);

    // Calculate inverse transform (from output to source)
    const dstPoints: Point[] = [
      { x: 0, y: 0 },
      { x: outputWidth, y: 0 },
      { x: outputWidth, y: outputHeight },
      { x: 0, y: outputHeight },
    ];
    const srcPoints = [edges.topLeft, edges.topRight, edges.bottomRight, edges.bottomLeft];

    // Swap src and dst for inverse mapping
    const invMatrix = this.computeHomography(dstPoints, srcPoints);

    // Map each output pixel to source
    for (let y = 0; y < outputHeight; y++) {
      for (let x = 0; x < outputWidth; x++) {
        // Transform output coordinate to source coordinate
        const srcPoint = this.transformPoint({ x, y }, invMatrix);

        // Bilinear interpolation
        const pixel = this.bilinearInterpolate(
          sourceData, sourceWidth, sourceHeight,
          srcPoint.x, srcPoint.y
        );

        const outIdx = (y * outputWidth + x) * 4;
        output[outIdx] = pixel.r;
        output[outIdx + 1] = pixel.g;
        output[outIdx + 2] = pixel.b;
        output[outIdx + 3] = pixel.a;
      }
    }

    return output;
  }

  /**
   * Bilinear interpolation for smooth pixel sampling
   */
  private bilinearInterpolate(
    data: Uint8Array,
    width: number,
    height: number,
    x: number,
    y: number
  ): { r: number; g: number; b: number; a: number } {
    // Clamp coordinates
    x = Math.max(0, Math.min(x, width - 1));
    y = Math.max(0, Math.min(y, height - 1));

    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.min(x0 + 1, width - 1);
    const y1 = Math.min(y0 + 1, height - 1);

    const dx = x - x0;
    const dy = y - y0;

    // Get four corner pixels
    const getPixel = (px: number, py: number) => {
      const idx = (py * width + px) * 4;
      return {
        r: data[idx] ?? 0,
        g: data[idx + 1] ?? 0,
        b: data[idx + 2] ?? 0,
        a: data[idx + 3] ?? 255,
      };
    };

    const p00 = getPixel(x0, y0);
    const p10 = getPixel(x1, y0);
    const p01 = getPixel(x0, y1);
    const p11 = getPixel(x1, y1);

    // Interpolate
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const bilerp = (c00: number, c10: number, c01: number, c11: number) =>
      lerp(lerp(c00, c10, dx), lerp(c01, c11, dx), dy);

    return {
      r: Math.round(bilerp(p00.r, p10.r, p01.r, p11.r)),
      g: Math.round(bilerp(p00.g, p10.g, p01.g, p11.g)),
      b: Math.round(bilerp(p00.b, p10.b, p01.b, p11.b)),
      a: Math.round(bilerp(p00.a, p10.a, p01.a, p11.a)),
    };
  }
}
