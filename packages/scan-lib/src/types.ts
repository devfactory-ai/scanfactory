/**
 * @devfactory/scan-lib - Core Types
 *
 * Public types and interfaces for the document scanning library
 */

// ============================================================================
// Configuration Types
// ============================================================================

export interface ScanLibConfig {
  /** OCR configuration */
  ocr: OCRConfig;

  /** Capture settings */
  capture: CaptureConfig;

  /** Edge detection settings */
  edgeDetection: EdgeDetectionConfig;

  /** Local storage settings */
  storage: StorageConfig;

  /** Auth token provider (optional) */
  getAuthToken?: () => Promise<string>;
}

export interface OCRConfig {
  /** OCR processing mode */
  mode: 'remote' | 'local' | 'hybrid';

  /** Remote OCR API endpoint */
  endpoint?: string;

  /** Timeout for remote OCR requests (ms) */
  timeout: number;

  /** Number of retries for failed requests */
  retries: number;
}

export interface CaptureConfig {
  /** Image quality preset */
  quality: 'low' | 'medium' | 'high';

  /** Enable automatic capture when document is detected */
  autoCapture: boolean;

  /** Delay before auto-capture triggers (ms) */
  autoCaptureDelay: number;

  /** Maximum image width (px) */
  maxWidth: number;

  /** Target aspect ratio (e.g., 1.414 for A4) */
  aspectRatio?: number;

  /** Camera facing direction */
  defaultFacing?: 'front' | 'back';
}

export interface EdgeDetectionConfig {
  /** Enable edge detection */
  enabled: boolean;

  /** Minimum document area as percentage of frame (0-1) */
  minAreaRatio: number;

  /** Number of stable frames required before auto-capture */
  stabilityThreshold: number;

  /** Edge detection sensitivity (0-1) */
  sensitivity?: number;
}

export interface StorageConfig {
  /** Persist pending uploads locally */
  persistPending: boolean;

  /** Maximum number of pending items to store */
  maxPendingItems: number;

  /** Storage key prefix */
  keyPrefix: string;
}

// ============================================================================
// Scanner Types
// ============================================================================

export interface Point {
  x: number;
  y: number;
}

export interface EdgePoints {
  topLeft: Point;
  topRight: Point;
  bottomLeft: Point;
  bottomRight: Point;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface QualityIssue {
  type: 'blur' | 'low_light' | 'glare' | 'motion' | 'occlusion';
  severity: 'low' | 'medium' | 'high';
  message: string;
}

export interface QualityMetrics {
  /** Overall quality score (0-1) */
  overall: number;

  /** Focus/sharpness score (0-1) */
  focus: number;

  /** Lighting adequacy score (0-1) */
  lighting: number;

  /** Document stability score (0-1) */
  stability: number;

  /** Is document properly framed */
  isFramed: boolean;

  /** Detected issues */
  issues: QualityIssue[];
}

export interface ScannedDocument {
  /** Unique local identifier */
  localId: string;

  /** Original image URI */
  originalUri: string;

  /** Optimized/processed image URI */
  processedUri: string;

  /** Detected document edges (if available) */
  edges?: EdgePoints;

  /** Quality metrics at capture time */
  quality: QualityMetrics;

  /** Image dimensions */
  dimensions: {
    width: number;
    height: number;
  };

  /** Capture timestamp */
  capturedAt: string;

  /** Page number (for multi-page documents) */
  pageNumber: number;
}

export interface ScannedBatch {
  /** Batch identifier */
  batchId: string;

  /** All documents in order */
  documents: ScannedDocument[];

  /** Creation timestamp */
  createdAt: string;

  /** Last modified timestamp */
  updatedAt: string;
}

// ============================================================================
// OCR Types
// ============================================================================

export interface FieldExtraction {
  /** Field name */
  name: string;

  /** Extracted value */
  value: string;

  /** Confidence score (0-1) */
  confidence: number;

  /** Bounding box in the image (optional) */
  boundingBox?: BoundingBox;
}

export interface TableRow {
  /** Cell values */
  cells: string[];

  /** Row confidence */
  confidence: number;
}

export interface TableExtraction {
  /** Table rows */
  rows: TableRow[];

  /** Table headers (optional) */
  headers?: string[];

  /** Overall table confidence */
  confidence: number;

  /** Bounding box (optional) */
  boundingBox?: BoundingBox;
}

export interface ExtractionResult {
  /** Whether extraction was successful */
  success: boolean;

  /** Extracted fields */
  fields: FieldExtraction[];

  /** Extracted tables (if any) */
  tables?: TableExtraction[];

  /** Raw text from OCR */
  rawText: string;

  /** Overall confidence score (0-1) */
  confidence: number;

  /** Processing time in ms */
  processingTime?: number;

  /** Error message if extraction failed */
  error?: string;
}

// ============================================================================
// Storage Types
// ============================================================================

export type PendingStatus = 'pending' | 'uploading' | 'uploaded' | 'failed';

export interface PendingUpload {
  /** Local identifier */
  localId: string;

  /** Upload status */
  status: PendingStatus;

  /** Scanned document */
  document: ScannedDocument;

  /** Custom metadata from the app */
  metadata?: Record<string, unknown>;

  /** Creation timestamp */
  createdAt: string;

  /** Number of upload attempts */
  retryCount: number;

  /** Last attempt timestamp */
  lastAttempt?: string;

  /** Error message if failed */
  error?: string;
}

// ============================================================================
// Hook Types
// ============================================================================

export interface ScannerState {
  /** Scanner is ready to capture */
  isReady: boolean;

  /** Currently capturing */
  isCapturing: boolean;

  /** Camera permission granted */
  hasPermission: boolean;

  /** Permission status */
  permissionStatus: 'undetermined' | 'granted' | 'denied';

  /** Detected document edges */
  edgesDetected: EdgePoints | null;

  /** Current quality metrics */
  qualityScore: QualityMetrics | null;

  /** Auto-capture countdown (ms remaining) */
  autoCaptureCountdown: number | null;

  /** Current camera facing */
  facing: 'front' | 'back';

  /** Current batch (multi-page) */
  currentBatch: ScannedDocument[];

  /** Last captured document */
  lastCapture: ScannedDocument | null;

  /** Error state */
  error: string | null;
}

export interface ScannerActions {
  /** Request camera permission */
  requestPermission: () => Promise<boolean>;

  /** Capture current frame */
  capture: () => Promise<ScannedDocument>;

  /** Cancel ongoing capture */
  cancelCapture: () => void;

  /** Toggle camera facing */
  toggleFacing: () => void;

  /** Run OCR extraction on document */
  extractData: (doc: ScannedDocument) => Promise<ExtractionResult>;

  /** Add document to current batch */
  addToBatch: (doc: ScannedDocument) => void;

  /** Remove document from batch */
  removeFromBatch: (localId: string) => void;

  /** Reorder batch pages */
  reorderBatch: (newOrder: string[]) => void;

  /** Clear current batch */
  clearBatch: () => void;

  /** Reset scanner state */
  reset: () => void;
}

export interface ScannerCallbacks {
  /** Called when edges change */
  onEdgeChange?: (edges: EdgePoints | null) => void;

  /** Called when quality metrics change */
  onQualityChange?: (quality: QualityMetrics) => void;

  /** Called when auto-capture triggers */
  onAutoCapture?: (doc: ScannedDocument) => void;

  /** Called on capture error */
  onCaptureError?: (error: Error) => void;
}

export type UseScannerResult = ScannerState & ScannerActions & ScannerCallbacks;

// ============================================================================
// Component Props
// ============================================================================

export interface ScannerViewProps {
  /** Whether scanner is ready */
  isReady: boolean;

  /** Whether camera permission is granted */
  hasPermission: boolean;

  /** Camera facing direction */
  facing: 'front' | 'back';

  /** Detected document edges */
  edges: EdgePoints | null;

  /** Current quality metrics */
  quality: QualityMetrics | null;

  /** Auto-capture countdown (ms) */
  countdown: number | null;

  /** Whether capture is in progress */
  isCapturing: boolean;

  /** Capture callback */
  onCapture: () => Promise<ScannedDocument>;

  /** Toggle camera facing */
  onToggleFacing?: () => void;

  /** Error callback */
  onError?: (error: Error) => void;

  /** Show frame guide overlay */
  showFrameGuide?: boolean;

  /** Show quality indicator */
  showQualityIndicator?: boolean;

  /** Custom aspect ratio for frame guide */
  aspectRatio?: number;

  /** Style overrides */
  style?: object;

  /** Children rendered inside camera view */
  children?: React.ReactNode;
}

export interface FrameGuideProps {
  /** Detected document edges */
  edges: EdgePoints | null;

  /** Target aspect ratio for guide */
  aspectRatio?: number;

  /** Whether document position is stable */
  isStable?: boolean;

  /** Auto-capture countdown (ms) */
  countdown?: number | null;

  /** Guide frame color */
  color?: string;

  /** Guide frame color when stable */
  stableColor?: string;

  /** Corner radius */
  cornerRadius?: number;

  /** Show corner markers */
  showCorners?: boolean;

  /** Show countdown overlay */
  showCountdown?: boolean;
}

export interface QualityIndicatorProps {
  /** Quality metrics */
  quality: QualityMetrics;

  /** Show detailed metrics */
  showDetails?: boolean;

  /** Show issue messages */
  showIssues?: boolean;

  /** Compact mode */
  compact?: boolean;

  /** Style overrides */
  style?: object;
}
