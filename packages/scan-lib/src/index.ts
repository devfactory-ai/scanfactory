/**
 * @devfactory/scan-lib
 *
 * Document scanning library for React Native/Expo
 * with edge detection, auto-capture, and OCR support
 */

// Types
export type {
  // Configuration
  ScanLibConfig,
  OCRConfig,
  CaptureConfig,
  EdgeDetectionConfig,
  StorageConfig,

  // Scanner
  Point,
  EdgePoints,
  BoundingBox,
  QualityMetrics,
  QualityIssue,
  ScannedDocument,
  ScannedBatch,

  // OCR
  FieldExtraction,
  TableRow,
  TableExtraction,
  ExtractionResult,

  // Storage
  PendingStatus,
  PendingUpload,

  // Hooks
  ScannerState,
  ScannerActions,
  ScannerCallbacks,
  UseScannerResult,

  // Components
  ScannerViewProps,
  FrameGuideProps,
  QualityIndicatorProps,
} from './types';

// Hooks
export { useDocumentScanner } from './hooks/useDocumentScanner';
export { useEdgeDetection } from './hooks/useEdgeDetection';
export { useAutoCapture } from './hooks/useAutoCapture';
export { useOCR } from './hooks/useOCR';

// Components
export { ScannerView } from './ui/ScannerView';
export { FrameGuide } from './ui/FrameGuide';
export { QualityIndicator } from './ui/QualityIndicator';
export { CaptureButton } from './ui/CaptureButton';

// Scanner utilities
export { EdgeDetector } from './scanner/EdgeDetector';
export { AutoCapture } from './scanner/AutoCapture';
export { PerspectiveCorrector } from './scanner/PerspectiveCorrector';

// Processor utilities
export { ImageOptimizer } from './processor/ImageOptimizer';
export { QualityAnalyzer } from './processor/QualityAnalyzer';

// OCR
export { OCRManager } from './ocr/OCRManager';
export { RemoteOCRAdapter } from './ocr/adapters/RemoteOCRAdapter';
export { LocalOCRAdapter } from './ocr/adapters/LocalOCRAdapter';

// Storage
export { ScanStorage } from './storage/ScanStorage';

// Utilities
export { generateLocalId, createDefaultConfig } from './utils';

// Configuration System
export {
  ConfigManager,
  getConfigManager,
  resetConfigManager,
  initializeConfig,
  type RuntimeConfig,
  type FeatureFlags,
  type DebugConfig,
  useConfig,
  useFeatureFlag,
} from './config';

// Plugin System
export {
  // Types
  type Plugin,
  type PluginMetadata,
  type PluginContext,
  type PluginType,
  type ScanLibPlugin,
  type OCRAdapterPlugin,
  type OCRAdapterOptions,
  type ImageProcessorPlugin,
  type QualityValidatorPlugin,
  type PostProcessorPlugin,
  type FieldTransformerPlugin,

  // Registry
  PluginRegistry,
  getPluginRegistry,
  resetPluginRegistry,

  // Executor
  PluginExecutor,
  getPluginExecutor,
  createPluginExecutor,

  // Built-in plugins
  createDateFormatterPlugin,
  createAmountNormalizerPlugin,
} from './plugins';
