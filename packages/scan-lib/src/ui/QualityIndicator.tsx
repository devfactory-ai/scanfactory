import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { QualityMetrics, QualityIssue } from '../types';

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

/**
 * Real-time quality indicator
 *
 * Shows current image quality metrics including
 * focus, lighting, and stability.
 */
export function QualityIndicator({
  quality,
  showDetails = false,
  showIssues = true,
  compact = false,
  style,
}: QualityIndicatorProps) {
  const overallColor = getQualityColor(quality.overall);
  const overallLabel = getQualityLabel(quality.overall);

  if (compact) {
    return (
      <View style={[styles.compactContainer, style]}>
        <View style={[styles.compactBadge, { backgroundColor: overallColor }]}>
          <Text style={styles.compactText}>{Math.round(quality.overall * 100)}%</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      {/* Overall quality badge */}
      <View style={styles.header}>
        <View style={[styles.overallBadge, { backgroundColor: overallColor }]}>
          <Text style={styles.overallText}>{overallLabel}</Text>
          <Text style={styles.overallPercent}>{Math.round(quality.overall * 100)}%</Text>
        </View>
      </View>

      {/* Detailed metrics */}
      {showDetails && (
        <View style={styles.details}>
          <MetricBar label="Focus" value={quality.focus} />
          <MetricBar label="Lighting" value={quality.lighting} />
          <MetricBar label="Stability" value={quality.stability} />
        </View>
      )}

      {/* Issues */}
      {showIssues && quality.issues.length > 0 && (
        <View style={styles.issues}>
          {quality.issues.map((issue, index) => (
            <IssueItem key={index} issue={issue} />
          ))}
        </View>
      )}
    </View>
  );
}

/**
 * Metric bar component
 */
function MetricBar({ label, value }: { label: string; value: number }) {
  const color = getQualityColor(value);
  const width = `${Math.round(value * 100)}%`;

  return (
    <View style={styles.metricRow}>
      <Text style={styles.metricLabel}>{label}</Text>
      <View style={styles.metricBarContainer}>
        <View style={[styles.metricBar, { width, backgroundColor: color }]} />
      </View>
      <Text style={styles.metricValue}>{Math.round(value * 100)}%</Text>
    </View>
  );
}

/**
 * Issue item component
 */
function IssueItem({ issue }: { issue: QualityIssue }) {
  const icon = getIssueIcon(issue.type);
  const color = getSeverityColor(issue.severity);

  return (
    <View style={[styles.issueRow, { borderLeftColor: color }]}>
      <Text style={styles.issueIcon}>{icon}</Text>
      <Text style={styles.issueText}>{issue.message}</Text>
    </View>
  );
}

// Helper functions

function getQualityColor(score: number): string {
  if (score >= 0.8) return '#10b981'; // green
  if (score >= 0.6) return '#f59e0b'; // yellow
  return '#ef4444'; // red
}

function getQualityLabel(score: number): string {
  if (score >= 0.9) return 'Excellent';
  if (score >= 0.7) return 'Good';
  if (score >= 0.5) return 'Acceptable';
  return 'Poor';
}

function getIssueIcon(type: QualityIssue['type']): string {
  switch (type) {
    case 'blur':
      return '⚪';
    case 'low_light':
      return '☀️';
    case 'glare':
      return '✨';
    case 'motion':
      return '📷';
    case 'occlusion':
      return '🚫';
    default:
      return '⚠️';
  }
}

function getSeverityColor(severity: QualityIssue['severity']): string {
  switch (severity) {
    case 'high':
      return '#ef4444';
    case 'medium':
      return '#f59e0b';
    case 'low':
      return '#10b981';
    default:
      return '#6b7280';
  }
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 12,
    padding: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  overallBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 8,
  },
  overallText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  overallPercent: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  details: {
    marginTop: 12,
    gap: 8,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metricLabel: {
    color: '#9ca3af',
    fontSize: 12,
    width: 60,
  },
  metricBarContainer: {
    flex: 1,
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  metricBar: {
    height: '100%',
    borderRadius: 3,
  },
  metricValue: {
    color: '#ffffff',
    fontSize: 12,
    width: 40,
    textAlign: 'right',
  },
  issues: {
    marginTop: 12,
    gap: 6,
  },
  issueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderLeftWidth: 3,
    gap: 8,
  },
  issueIcon: {
    fontSize: 14,
  },
  issueText: {
    color: '#ffffff',
    fontSize: 12,
    flex: 1,
  },
  compactContainer: {},
  compactBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  compactText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
});
