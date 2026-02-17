import React from 'react';
import { View, StyleSheet, Dimensions, Text } from 'react-native';
import Svg, { Polygon, Path, Circle } from 'react-native-svg';
import type { EdgePoints } from '../types';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

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

/**
 * Frame guide overlay for document alignment
 *
 * Shows target frame and detected document edges.
 * Changes color based on stability and quality.
 */
export function FrameGuide({
  edges,
  aspectRatio = 1.414,
  isStable = false,
  countdown = null,
  color = '#ffffff',
  stableColor = '#10b981',
  cornerRadius = 8,
  showCorners = true,
  showCountdown = true,
}: FrameGuideProps) {
  // Calculate guide frame dimensions
  const padding = 40;
  const guideWidth = SCREEN_WIDTH - padding * 2;
  const guideHeight = guideWidth * aspectRatio;
  const guideTop = (SCREEN_HEIGHT - guideHeight) / 2;

  const frameColor = isStable ? stableColor : color;
  const cornerSize = 30;

  return (
    <View style={styles.container} pointerEvents="none">
      {/* Semi-transparent overlay outside guide */}
      <View style={styles.overlay}>
        {/* Top dark area */}
        <View style={[styles.darkArea, { height: guideTop }]} />

        {/* Middle row with side dark areas */}
        <View style={styles.middleRow}>
          <View style={[styles.darkArea, { width: padding }]} />
          <View style={{ width: guideWidth, height: guideHeight }} />
          <View style={[styles.darkArea, { width: padding }]} />
        </View>

        {/* Bottom dark area */}
        <View style={[styles.darkArea, { flex: 1 }]} />
      </View>

      {/* Guide frame */}
      <View
        style={[
          styles.guideFrame,
          {
            top: guideTop,
            left: padding,
            width: guideWidth,
            height: guideHeight,
            borderColor: frameColor,
          },
        ]}
      >
        {/* Corner markers */}
        {showCorners && (
          <>
            {/* Top-left corner */}
            <View style={[styles.corner, styles.cornerTopLeft, { borderColor: frameColor }]} />
            {/* Top-right corner */}
            <View style={[styles.corner, styles.cornerTopRight, { borderColor: frameColor }]} />
            {/* Bottom-left corner */}
            <View style={[styles.corner, styles.cornerBottomLeft, { borderColor: frameColor }]} />
            {/* Bottom-right corner */}
            <View style={[styles.corner, styles.cornerBottomRight, { borderColor: frameColor }]} />
          </>
        )}
      </View>

      {/* Detected edges polygon */}
      {edges && (
        <Svg style={StyleSheet.absoluteFill}>
          <Polygon
            points={`
              ${edges.topLeft.x},${edges.topLeft.y}
              ${edges.topRight.x},${edges.topRight.y}
              ${edges.bottomRight.x},${edges.bottomRight.y}
              ${edges.bottomLeft.x},${edges.bottomLeft.y}
            `}
            fill="transparent"
            stroke={isStable ? stableColor : '#3b82f6'}
            strokeWidth={3}
            strokeDasharray={isStable ? '' : '10,5'}
          />

          {/* Corner dots */}
          <Circle cx={edges.topLeft.x} cy={edges.topLeft.y} r={8} fill={stableColor} />
          <Circle cx={edges.topRight.x} cy={edges.topRight.y} r={8} fill={stableColor} />
          <Circle cx={edges.bottomRight.x} cy={edges.bottomRight.y} r={8} fill={stableColor} />
          <Circle cx={edges.bottomLeft.x} cy={edges.bottomLeft.y} r={8} fill={stableColor} />
        </Svg>
      )}

      {/* Countdown overlay */}
      {showCountdown && countdown !== null && countdown > 0 && (
        <View style={styles.countdownContainer}>
          <View style={styles.countdownCircle}>
            <Text style={styles.countdownText}>
              {Math.ceil(countdown / 1000)}
            </Text>
          </View>
        </View>
      )}

      {/* Instructions */}
      <View style={styles.instructionsContainer}>
        <Text style={styles.instructionsText}>
          {!edges
            ? 'Position document within frame'
            : !isStable
              ? 'Hold steady...'
              : countdown
                ? 'Capturing...'
                : 'Ready to capture'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  darkArea: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  middleRow: {
    flexDirection: 'row',
  },
  guideFrame: {
    position: 'absolute',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 8,
  },
  corner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderWidth: 3,
  },
  cornerTopLeft: {
    top: -2,
    left: -2,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 8,
  },
  cornerTopRight: {
    top: -2,
    right: -2,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: 8,
  },
  cornerBottomLeft: {
    bottom: -2,
    left: -2,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: 8,
  },
  cornerBottomRight: {
    bottom: -2,
    right: -2,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: 8,
  },
  countdownContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  countdownCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  countdownText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  instructionsContainer: {
    position: 'absolute',
    bottom: 120,
    left: 20,
    right: 20,
    alignItems: 'center',
  },
  instructionsText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
});
