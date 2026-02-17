import React from 'react';
import {
  TouchableOpacity,
  View,
  StyleSheet,
  ActivityIndicator,
  Text,
} from 'react-native';

export interface CaptureButtonProps {
  /** Press handler */
  onPress: () => void;
  /** Whether capture is in progress */
  isCapturing?: boolean;
  /** Auto-capture countdown (ms) */
  countdown?: number | null;
  /** Whether button is disabled */
  disabled?: boolean;
  /** Button size */
  size?: 'small' | 'medium' | 'large';
  /** Primary color */
  color?: string;
  /** Style overrides */
  style?: object;
}

/**
 * Capture button component
 *
 * Circular capture button with capturing state indicator
 * and countdown progress ring.
 */
export function CaptureButton({
  onPress,
  isCapturing = false,
  countdown = null,
  disabled = false,
  size = 'large',
  color = '#ffffff',
  style,
}: CaptureButtonProps) {
  const sizeConfig = SIZES[size];
  const isActive = countdown !== null && countdown > 0;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || isCapturing}
      activeOpacity={0.7}
      style={[styles.container, style]}
    >
      {/* Outer ring */}
      <View
        style={[
          styles.outerRing,
          {
            width: sizeConfig.outer,
            height: sizeConfig.outer,
            borderRadius: sizeConfig.outer / 2,
            borderColor: disabled ? '#6b7280' : color,
            opacity: disabled ? 0.5 : 1,
          },
        ]}
      >
        {/* Progress ring for countdown */}
        {isActive && (
          <View
            style={[
              styles.progressRing,
              {
                width: sizeConfig.outer - 4,
                height: sizeConfig.outer - 4,
                borderRadius: (sizeConfig.outer - 4) / 2,
                borderColor: '#10b981',
                borderWidth: 3,
              },
            ]}
          />
        )}

        {/* Inner button */}
        <View
          style={[
            styles.innerButton,
            {
              width: sizeConfig.inner,
              height: sizeConfig.inner,
              borderRadius: sizeConfig.inner / 2,
              backgroundColor: disabled
                ? '#6b7280'
                : isCapturing
                  ? '#ef4444'
                  : isActive
                    ? '#10b981'
                    : color,
            },
          ]}
        >
          {isCapturing ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : isActive ? (
            <Text style={styles.countdownText}>
              {Math.ceil((countdown || 0) / 1000)}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Label */}
      {!isCapturing && !isActive && (
        <Text style={styles.label}>Capture</Text>
      )}
    </TouchableOpacity>
  );
}

const SIZES = {
  small: { outer: 60, inner: 48 },
  medium: { outer: 72, inner: 58 },
  large: { outer: 84, inner: 68 },
} as const;

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  outerRing: {
    borderWidth: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressRing: {
    position: 'absolute',
  },
  innerButton: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  countdownText: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  label: {
    color: '#ffffff',
    fontSize: 14,
    marginTop: 8,
    fontWeight: '500',
  },
});
