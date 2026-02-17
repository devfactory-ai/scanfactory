/* eslint-disable @typescript-eslint/no-require-imports */
import type { CaptureConfig, EdgePoints } from '../types';
import { QUALITY_PRESETS } from '../utils';
import { PerspectiveCorrector } from '../scanner/PerspectiveCorrector';

// Declare require for dynamic imports (used for optional dependencies)
declare const require: (module: string) => unknown;

interface OptimizeOptions {
  maxWidth?: number;
  quality?: 'low' | 'medium' | 'high';
  correctPerspective?: boolean;
  edges?: EdgePoints;
  rotate?: number;
  crop?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

interface ImageDimensions {
  width: number;
  height: number;
}

interface ImageData {
  data: Uint8Array;
  width: number;
  height: number;
}

// Platform detection
const isExpoAvailable = (): boolean => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('expo-image-manipulator');
    return true;
  } catch {
    return false;
  }
};

const isCanvasAvailable = (): boolean => {
  return typeof document !== 'undefined' && typeof HTMLCanvasElement !== 'undefined';
};

/**
 * Image optimizer for document processing
 *
 * Handles cropping, rotation, perspective correction,
 * and compression of scanned images.
 *
 * Supports multiple backends:
 * - expo-image-manipulator (React Native/Expo)
 * - Canvas API (Web browsers)
 * - Pure JavaScript (fallback)
 */
export class ImageOptimizer {
  private config: CaptureConfig;
  private perspectiveCorrector: PerspectiveCorrector;
  private useExpo: boolean;
  private useCanvas: boolean;

  constructor(config: CaptureConfig) {
    this.config = config;
    this.perspectiveCorrector = new PerspectiveCorrector();
    this.useExpo = isExpoAvailable();
    this.useCanvas = isCanvasAvailable();
  }

  /**
   * Optimize captured image
   *
   * Applies perspective correction, cropping, and compression
   */
  async optimize(imageUri: string, options: OptimizeOptions = {}): Promise<string> {
    const {
      maxWidth = this.config.maxWidth,
      quality = this.config.quality,
      correctPerspective = false,
      edges,
      rotate = 0,
      crop,
    } = options;

    const actions: ImageAction[] = [];

    // 1. Perspective correction (if edges provided)
    if (correctPerspective && edges) {
      actions.push({
        type: 'perspective',
        params: { edges },
      });
    } else if (crop) {
      actions.push({
        type: 'crop',
        params: crop,
      });
    }

    // 2. Rotation
    if (rotate !== 0) {
      actions.push({
        type: 'rotate',
        params: { angle: rotate },
      });
    }

    // 3. Resize to max width
    const preset = QUALITY_PRESETS[quality];
    const targetWidth = Math.min(maxWidth, preset.maxWidth);
    actions.push({
      type: 'resize',
      params: { width: targetWidth },
    });

    // 4. Compress
    actions.push({
      type: 'compress',
      params: { quality: preset.jpegQuality },
    });

    // Apply actions using appropriate backend
    return this.applyActions(imageUri, actions);
  }

  /**
   * Process image with pixel data (for web canvas or direct manipulation)
   */
  async optimizeWithData(
    imageData: ImageData,
    options: OptimizeOptions = {}
  ): Promise<ImageData> {
    const { correctPerspective = false, edges, rotate = 0, crop } = options;

    let result = imageData;

    // 1. Perspective correction
    if (correctPerspective && edges) {
      result = this.applyPerspectiveCorrection(result, edges);
    } else if (crop) {
      result = this.applyCrop(result, crop);
    }

    // 2. Rotation
    if (rotate !== 0) {
      result = this.applyRotation(result, rotate);
    }

    // 3. Resize
    const preset = QUALITY_PRESETS[options.quality ?? this.config.quality];
    const targetWidth = Math.min(options.maxWidth ?? this.config.maxWidth, preset.maxWidth);
    if (result.width > targetWidth) {
      result = this.applyResize(result, targetWidth);
    }

    return result;
  }

  /**
   * Crop image to edges
   */
  async cropToEdges(imageUri: string, edges: EdgePoints): Promise<string> {
    const bounds = this.getEdgeBounds(edges);
    return this.applyActions(imageUri, [
      { type: 'crop', params: bounds },
    ]);
  }

  /**
   * Rotate image
   */
  async rotate(imageUri: string, angle: number): Promise<string> {
    return this.applyActions(imageUri, [
      { type: 'rotate', params: { angle } },
    ]);
  }

  /**
   * Compress image
   */
  async compress(imageUri: string, quality: number): Promise<string> {
    return this.applyActions(imageUri, [
      { type: 'compress', params: { quality } },
    ]);
  }

  /**
   * Resize image to max width while maintaining aspect ratio
   */
  async resize(imageUri: string, maxWidth: number): Promise<string> {
    return this.applyActions(imageUri, [
      { type: 'resize', params: { width: maxWidth } },
    ]);
  }

  /**
   * Get image dimensions
   */
  async getDimensions(imageUri: string): Promise<ImageDimensions> {
    // In production, use Image.getSize or expo-image-manipulator
    // This is a placeholder
    return { width: 1920, height: 2560 };
  }

  /**
   * Auto-enhance image (brightness, contrast)
   */
  async autoEnhance(imageUri: string): Promise<string> {
    // Would apply auto-levels or histogram equalization
    // Placeholder: return original
    return imageUri;
  }

  /**
   * Convert to grayscale
   */
  async toGrayscale(imageUri: string): Promise<string> {
    return this.applyActions(imageUri, [
      { type: 'grayscale', params: {} },
    ]);
  }

  // Private helpers - Bounds calculation

  private getEdgeBounds(edges: EdgePoints): { x: number; y: number; width: number; height: number } {
    const minX = Math.min(edges.topLeft.x, edges.bottomLeft.x);
    const minY = Math.min(edges.topLeft.y, edges.topRight.y);
    const maxX = Math.max(edges.topRight.x, edges.bottomRight.x);
    const maxY = Math.max(edges.bottomLeft.y, edges.bottomRight.y);

    return {
      x: Math.round(minX),
      y: Math.round(minY),
      width: Math.round(maxX - minX),
      height: Math.round(maxY - minY),
    };
  }

  // Action application with platform-specific backends

  private async applyActions(imageUri: string, actions: ImageAction[]): Promise<string> {
    // Try Expo first (React Native)
    if (this.useExpo) {
      return this.applyActionsExpo(imageUri, actions);
    }

    // Try Canvas API (Web)
    if (this.useCanvas) {
      return this.applyActionsCanvas(imageUri, actions);
    }

    // Fallback: return original (no processing available)
    console.warn('ImageOptimizer: No processing backend available');
    return imageUri;
  }

  /**
   * Apply actions using expo-image-manipulator
   */
  private async applyActionsExpo(imageUri: string, actions: ImageAction[]): Promise<string> {
    try {
      const ImageManipulator = require('expo-image-manipulator') as {
        manipulateAsync: (
          uri: string,
          actions: Array<Record<string, unknown>>,
          options: { compress: number; format: number }
        ) => Promise<{ uri: string }>;
        SaveFormat: { JPEG: number; PNG: number };
      };

      // Separate perspective correction (needs special handling)
      const perspectiveAction = actions.find(a => a.type === 'perspective');
      const compressAction = actions.find(a => a.type === 'compress');
      const otherActions = actions.filter(a => a.type !== 'perspective' && a.type !== 'compress');

      // Build manipulator actions
      const manipulatorActions = otherActions.map(action => {
        switch (action.type) {
          case 'crop':
            return { crop: action.params };
          case 'rotate':
            return { rotate: (action.params as { angle: number }).angle };
          case 'resize':
            return { resize: { width: (action.params as { width: number }).width } };
          case 'grayscale':
            // expo-image-manipulator doesn't support grayscale directly
            return null;
          default:
            return null;
        }
      }).filter(Boolean) as Array<Record<string, unknown>>;

      // If perspective correction is needed, apply it first using our corrector
      let processedUri = imageUri;
      if (perspectiveAction) {
        const edges = (perspectiveAction.params as { edges: EdgePoints }).edges;
        // For expo, we fall back to crop bounds
        // Real perspective correction needs canvas or native module
        const bounds = this.getEdgeBounds(edges);
        manipulatorActions.unshift({ crop: bounds });
      }

      // Apply manipulator actions
      if (manipulatorActions.length > 0 || compressAction) {
        const quality = compressAction
          ? (compressAction.params as { quality: number }).quality
          : 0.8;

        const result = await ImageManipulator.manipulateAsync(
          processedUri,
          manipulatorActions,
          {
            compress: quality,
            format: ImageManipulator.SaveFormat.JPEG,
          }
        );
        processedUri = result.uri;
      }

      return processedUri;
    } catch (error) {
      console.error('Expo image manipulation failed:', error);
      return imageUri;
    }
  }

  /**
   * Apply actions using Canvas API (Web)
   */
  private async applyActionsCanvas(imageUri: string, actions: ImageAction[]): Promise<string> {
    try {
      // Load image
      const img = await this.loadImage(imageUri);

      // Create canvas
      let canvas = document.createElement('canvas');
      let ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not get canvas context');

      // Start with original dimensions
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      // Apply actions in order
      for (const action of actions) {
        const result = this.applyCanvasAction(canvas, ctx, action);
        canvas = result.canvas;
        ctx = result.ctx;
      }

      // Get compression quality from actions
      const compressAction = actions.find(a => a.type === 'compress');
      const quality = compressAction
        ? (compressAction.params as { quality: number }).quality
        : 0.8;

      // Convert to data URL
      return canvas.toDataURL('image/jpeg', quality);
    } catch (error) {
      console.error('Canvas image manipulation failed:', error);
      return imageUri;
    }
  }

  private applyCanvasAction(
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
    action: ImageAction
  ): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
    switch (action.type) {
      case 'crop': {
        const { x, y, width, height } = action.params as {
          x: number;
          y: number;
          width: number;
          height: number;
        };
        const imageData = ctx.getImageData(x, y, width, height);
        const newCanvas = document.createElement('canvas');
        newCanvas.width = width;
        newCanvas.height = height;
        const newCtx = newCanvas.getContext('2d')!;
        newCtx.putImageData(imageData, 0, 0);
        return { canvas: newCanvas, ctx: newCtx };
      }

      case 'rotate': {
        const angle = (action.params as { angle: number }).angle;
        const radians = (angle * Math.PI) / 180;
        const cos = Math.abs(Math.cos(radians));
        const sin = Math.abs(Math.sin(radians));
        const newWidth = Math.round(canvas.width * cos + canvas.height * sin);
        const newHeight = Math.round(canvas.width * sin + canvas.height * cos);

        const newCanvas = document.createElement('canvas');
        newCanvas.width = newWidth;
        newCanvas.height = newHeight;
        const newCtx = newCanvas.getContext('2d')!;

        newCtx.translate(newWidth / 2, newHeight / 2);
        newCtx.rotate(radians);
        newCtx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);

        return { canvas: newCanvas, ctx: newCtx };
      }

      case 'resize': {
        const targetWidth = (action.params as { width: number }).width;
        const scale = targetWidth / canvas.width;
        const newWidth = targetWidth;
        const newHeight = Math.round(canvas.height * scale);

        const newCanvas = document.createElement('canvas');
        newCanvas.width = newWidth;
        newCanvas.height = newHeight;
        const newCtx = newCanvas.getContext('2d')!;

        // Use high-quality scaling
        newCtx.imageSmoothingEnabled = true;
        newCtx.imageSmoothingQuality = 'high';
        newCtx.drawImage(canvas, 0, 0, newWidth, newHeight);

        return { canvas: newCanvas, ctx: newCtx };
      }

      case 'perspective': {
        const edges = (action.params as { edges: EdgePoints }).edges;
        const dims = this.perspectiveCorrector.getOptimalDimensions(edges);

        // Get source image data
        const sourceData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const sourcePixels = new Uint8Array(sourceData.data.buffer);

        // Apply perspective correction
        const correctedPixels = this.perspectiveCorrector.correctPerspective(
          sourcePixels,
          canvas.width,
          canvas.height,
          edges,
          dims.width,
          dims.height
        );

        // Create new canvas with corrected image
        const newCanvas = document.createElement('canvas');
        newCanvas.width = dims.width;
        newCanvas.height = dims.height;
        const newCtx = newCanvas.getContext('2d')!;

        const newImageData = newCtx.createImageData(dims.width, dims.height);
        newImageData.data.set(correctedPixels);
        newCtx.putImageData(newImageData, 0, 0);

        return { canvas: newCanvas, ctx: newCtx };
      }

      case 'grayscale': {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
          const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
          data[i] = data[i + 1] = data[i + 2] = gray;
        }

        ctx.putImageData(imageData, 0, 0);
        return { canvas, ctx };
      }

      default:
        return { canvas, ctx };
    }
  }

  private loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  // Pure JavaScript image processing (for use without Canvas)

  private applyPerspectiveCorrection(imageData: ImageData, edges: EdgePoints): ImageData {
    const dims = this.perspectiveCorrector.getOptimalDimensions(edges);
    const correctedPixels = this.perspectiveCorrector.correctPerspective(
      imageData.data,
      imageData.width,
      imageData.height,
      edges,
      dims.width,
      dims.height
    );
    return { data: correctedPixels, width: dims.width, height: dims.height };
  }

  private applyCrop(
    imageData: ImageData,
    crop: { x: number; y: number; width: number; height: number }
  ): ImageData {
    const { x, y, width, height } = crop;
    const newData = new Uint8Array(width * height * 4);

    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const srcIdx = ((y + row) * imageData.width + (x + col)) * 4;
        const dstIdx = (row * width + col) * 4;
        newData[dstIdx] = imageData.data[srcIdx];
        newData[dstIdx + 1] = imageData.data[srcIdx + 1];
        newData[dstIdx + 2] = imageData.data[srcIdx + 2];
        newData[dstIdx + 3] = imageData.data[srcIdx + 3];
      }
    }

    return { data: newData, width, height };
  }

  private applyRotation(imageData: ImageData, angle: number): ImageData {
    // Only support 90-degree rotations for pure JS
    const normalizedAngle = ((angle % 360) + 360) % 360;

    if (normalizedAngle === 0) return imageData;

    const { data, width, height } = imageData;

    if (normalizedAngle === 90 || normalizedAngle === 270) {
      const newWidth = height;
      const newHeight = width;
      const newData = new Uint8Array(newWidth * newHeight * 4);

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const srcIdx = (y * width + x) * 4;
          let dstX: number, dstY: number;

          if (normalizedAngle === 90) {
            dstX = height - 1 - y;
            dstY = x;
          } else {
            dstX = y;
            dstY = width - 1 - x;
          }

          const dstIdx = (dstY * newWidth + dstX) * 4;
          newData[dstIdx] = data[srcIdx];
          newData[dstIdx + 1] = data[srcIdx + 1];
          newData[dstIdx + 2] = data[srcIdx + 2];
          newData[dstIdx + 3] = data[srcIdx + 3];
        }
      }

      return { data: newData, width: newWidth, height: newHeight };
    }

    if (normalizedAngle === 180) {
      const newData = new Uint8Array(width * height * 4);

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const srcIdx = (y * width + x) * 4;
          const dstIdx = ((height - 1 - y) * width + (width - 1 - x)) * 4;
          newData[dstIdx] = data[srcIdx];
          newData[dstIdx + 1] = data[srcIdx + 1];
          newData[dstIdx + 2] = data[srcIdx + 2];
          newData[dstIdx + 3] = data[srcIdx + 3];
        }
      }

      return { data: newData, width, height };
    }

    // Other angles not supported in pure JS mode
    return imageData;
  }

  private applyResize(imageData: ImageData, targetWidth: number): ImageData {
    const scale = targetWidth / imageData.width;
    const newWidth = targetWidth;
    const newHeight = Math.round(imageData.height * scale);
    const newData = new Uint8Array(newWidth * newHeight * 4);

    // Bilinear interpolation for smooth scaling
    for (let y = 0; y < newHeight; y++) {
      for (let x = 0; x < newWidth; x++) {
        const srcX = x / scale;
        const srcY = y / scale;

        const x0 = Math.floor(srcX);
        const y0 = Math.floor(srcY);
        const x1 = Math.min(x0 + 1, imageData.width - 1);
        const y1 = Math.min(y0 + 1, imageData.height - 1);

        const dx = srcX - x0;
        const dy = srcY - y0;

        const dstIdx = (y * newWidth + x) * 4;

        for (let c = 0; c < 4; c++) {
          const p00 = imageData.data[(y0 * imageData.width + x0) * 4 + c];
          const p10 = imageData.data[(y0 * imageData.width + x1) * 4 + c];
          const p01 = imageData.data[(y1 * imageData.width + x0) * 4 + c];
          const p11 = imageData.data[(y1 * imageData.width + x1) * 4 + c];

          const top = p00 + (p10 - p00) * dx;
          const bottom = p01 + (p11 - p01) * dx;
          newData[dstIdx + c] = Math.round(top + (bottom - top) * dy);
        }
      }
    }

    return { data: newData, width: newWidth, height: newHeight };
  }
}

interface ImageAction {
  type: 'crop' | 'rotate' | 'resize' | 'compress' | 'grayscale' | 'perspective';
  params: Record<string, unknown>;
}
