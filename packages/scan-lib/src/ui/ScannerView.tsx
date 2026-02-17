import React, { useRef, useEffect, useCallback } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { CameraView } from 'expo-camera';
import type { EdgePoints, QualityMetrics, ScannedDocument } from '../types';
import { FrameGuide } from './FrameGuide';
import { QualityIndicator } from './QualityIndicator';
import { CaptureButton } from './CaptureButton';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

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

/**
 * Complete scanner view component
 *
 * Renders camera preview with frame guide, quality indicator,
 * and capture button. Integrates with useDocumentScanner hook.
 */
export function ScannerView({
  isReady,
  hasPermission,
  facing,
  edges,
  quality,
  countdown,
  isCapturing,
  onCapture,
  onToggleFacing,
  onError,
  showFrameGuide = true,
  showQualityIndicator = true,
  aspectRatio = 1.414,
  style,
  children,
}: ScannerViewProps) {
  const cameraRef = useRef<CameraView>(null);

  const handleCapture = useCallback(async () => {
    try {
      await onCapture();
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error('Capture failed'));
    }
  }, [onCapture, onError]);

  if (!hasPermission) {
    return (
      <View style={[styles.container, styles.noPermission, style]}>
        {/* Permission request UI should be handled by parent */}
      </View>
    );
  }

  if (!isReady) {
    return (
      <View style={[styles.container, styles.loading, style]}>
        {/* Loading UI */}
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing={facing}
      >
        {/* Frame guide overlay */}
        {showFrameGuide && (
          <FrameGuide
            edges={edges}
            aspectRatio={aspectRatio}
            isStable={quality?.stability === 1}
            countdown={countdown}
          />
        )}

        {/* Quality indicator */}
        {showQualityIndicator && quality && (
          <View style={styles.qualityContainer}>
            <QualityIndicator
              quality={quality}
              showDetails={true}
            />
          </View>
        )}

        {/* Capture button */}
        <View style={styles.captureContainer}>
          <CaptureButton
            onPress={handleCapture}
            isCapturing={isCapturing}
            countdown={countdown}
            disabled={!isReady || isCapturing}
          />
        </View>

        {/* Toggle camera button */}
        {onToggleFacing && (
          <View style={styles.toggleContainer}>
            {/* Flip camera button - can be customized */}
          </View>
        )}

        {/* Custom children */}
        {children}
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  noPermission: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loading: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  qualityContainer: {
    position: 'absolute',
    top: 60,
    left: 20,
    right: 20,
  },
  captureContainer: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  toggleContainer: {
    position: 'absolute',
    top: 60,
    right: 20,
  },
});
