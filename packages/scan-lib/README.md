# @devfactory/scan-lib

Document scanning library for React Native/Expo applications with edge detection, auto-capture, quality analysis, and OCR support.

## Features

- **Edge Detection**: Automatic document boundary detection
- **Auto-Capture**: Captures when document is stable and quality is good
- **Quality Analysis**: Real-time focus, lighting, and stability metrics
- **Perspective Correction**: Corrects camera angle distortion
- **Multi-page Batching**: Scan multiple pages in sequence
- **OCR Integration**: Remote (API) and local (ML Kit/Vision) modes
- **Offline Storage**: Persist scans for later upload

## Installation

```bash
npm install @devfactory/scan-lib
# or
yarn add @devfactory/scan-lib
```

### Peer Dependencies

```bash
expo install expo-camera expo-image-manipulator react-native-svg
```

## Quick Start

```tsx
import { useDocumentScanner, ScannerView } from '@devfactory/scan-lib';

function ScanScreen() {
  const scanner = useDocumentScanner({
    capture: {
      autoCapture: true,
      autoCaptureDelay: 1500,
    },
    edgeDetection: {
      enabled: true,
    },
    getAuthToken: async () => getToken(), // For remote OCR
  });

  return (
    <ScannerView
      isReady={scanner.isReady}
      hasPermission={scanner.hasPermission}
      facing={scanner.facing}
      edges={scanner.edgesDetected}
      quality={scanner.qualityScore}
      countdown={scanner.autoCaptureCountdown}
      isCapturing={scanner.isCapturing}
      onCapture={scanner.capture}
      onToggleFacing={scanner.toggleFacing}
    />
  );
}
```

## API Reference

### useDocumentScanner

Main hook for document scanning functionality.

```tsx
const scanner = useDocumentScanner(config?: Partial<ScanLibConfig>);
```

#### Config Options

```typescript
interface ScanLibConfig {
  ocr: {
    mode: 'remote' | 'local' | 'hybrid';
    endpoint?: string;
    timeout: number;
    retries: number;
  };
  capture: {
    quality: 'low' | 'medium' | 'high';
    autoCapture: boolean;
    autoCaptureDelay: number;
    maxWidth: number;
    aspectRatio: number;
    defaultFacing: 'front' | 'back';
  };
  edgeDetection: {
    enabled: boolean;
    minAreaRatio: number;
    stabilityThreshold: number;
    sensitivity: number;
  };
  storage: {
    persistPending: boolean;
    maxPendingItems: number;
    keyPrefix: string;
  };
  getAuthToken?: () => Promise<string>;
}
```

#### Return Values

```typescript
interface UseScannerResult {
  // State
  isReady: boolean;
  isCapturing: boolean;
  hasPermission: boolean;
  permissionStatus: 'granted' | 'denied' | 'undetermined';
  edgesDetected: EdgePoints | null;
  qualityScore: QualityMetrics | null;
  autoCaptureCountdown: number | null;
  facing: 'front' | 'back';
  currentBatch: ScannedDocument[];
  lastCapture: ScannedDocument | null;
  error: string | null;

  // Actions
  requestPermission: () => Promise<boolean>;
  capture: () => Promise<ScannedDocument>;
  cancelCapture: () => void;
  toggleFacing: () => void;
  extractData: (doc: ScannedDocument) => Promise<ExtractionResult>;
  addToBatch: (doc: ScannedDocument) => void;
  removeFromBatch: (localId: string) => void;
  reorderBatch: (newOrder: string[]) => void;
  clearBatch: () => void;
  reset: () => void;

  // Callbacks (setters)
  onEdgeChange: (edges: EdgePoints | null) => void;
  onQualityChange: (quality: QualityMetrics) => void;
  onAutoCapture: (doc: ScannedDocument) => void;
  onCaptureError: (error: Error) => void;
}
```

### Components

#### ScannerView

Complete scanner view with camera, frame guide, and capture button.

```tsx
<ScannerView
  isReady={boolean}
  hasPermission={boolean}
  facing={'front' | 'back'}
  edges={EdgePoints | null}
  quality={QualityMetrics | null}
  countdown={number | null}
  isCapturing={boolean}
  onCapture={() => Promise<ScannedDocument>}
  onToggleFacing={() => void}
  showFrameGuide={boolean}
  showQualityIndicator={boolean}
  aspectRatio={number}
/>
```

#### FrameGuide

Document alignment overlay.

```tsx
<FrameGuide
  edges={EdgePoints | null}
  aspectRatio={number}
  isStable={boolean}
  countdown={number | null}
  color={string}
  stableColor={string}
/>
```

#### QualityIndicator

Real-time quality metrics display.

```tsx
<QualityIndicator
  quality={QualityMetrics}
  showDetails={boolean}
  showIssues={boolean}
  compact={boolean}
/>
```

### OCR Modes

#### Remote Mode (default)

Sends images to backend API for processing.

```typescript
const scanner = useDocumentScanner({
  ocr: {
    mode: 'remote',
    endpoint: '/api/ocr/extract',
    timeout: 30000,
  },
  getAuthToken: async () => secureStore.getItem('token'),
});
```

#### Local Mode

Uses on-device ML (ML Kit on Android, Vision on iOS).

```typescript
const scanner = useDocumentScanner({
  ocr: { mode: 'local' },
});
```

#### Hybrid Mode

Tries remote first, falls back to local if unavailable.

```typescript
const scanner = useDocumentScanner({
  ocr: { mode: 'hybrid' },
});
```

### Offline Storage

```typescript
import { ScanStorage } from '@devfactory/scan-lib';
import AsyncStorage from '@react-native-async-storage/async-storage';

const storage = new ScanStorage(
  { persistPending: true, maxPendingItems: 50, keyPrefix: 'scans_' },
  AsyncStorage
);

// Save for later upload
await storage.savePending(document);

// Get pending uploads
const pending = await storage.getAllPending();

// Mark as uploaded
await storage.markUploaded(localId, serverId);
```

## Types

```typescript
interface ScannedDocument {
  localId: string;
  originalUri: string;
  processedUri: string;
  edges?: EdgePoints;
  quality: QualityMetrics;
  dimensions: { width: number; height: number };
  capturedAt: string;
  pageNumber: number;
}

interface EdgePoints {
  topLeft: Point;
  topRight: Point;
  bottomRight: Point;
  bottomLeft: Point;
}

interface QualityMetrics {
  overall: number;      // 0-1
  focus: number;        // 0-1
  lighting: number;     // 0-1
  stability: number;    // 0-1
  isFramed: boolean;
  issues: QualityIssue[];
}

interface ExtractionResult {
  success: boolean;
  fields: FieldExtraction[];
  tables?: TableExtraction[];
  rawText: string;
  confidence: number;
  error?: string;
  processingTime?: number;
}
```

## License

Proprietary - DevFactory
