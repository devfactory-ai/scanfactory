import { memo } from 'react';

interface ConfidenceBadgeProps {
  confidence: number | null;
  showPercentage?: boolean;
}

/**
 * Get confidence level for accessibility
 */
function getConfidenceLevel(percentage: number): string {
  if (percentage >= 90) return 'élevée';
  if (percentage >= 70) return 'moyenne';
  return 'faible';
}

/**
 * Badge displaying extraction confidence score with color coding
 */
export const ConfidenceBadge = memo(function ConfidenceBadge({
  confidence,
  showPercentage = true,
}: ConfidenceBadgeProps) {
  if (confidence === null) {
    return (
      <span
        className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600"
        role="status"
        aria-label="Confiance non disponible"
      >
        N/A
      </span>
    );
  }

  const percentage = Math.round(confidence * 100);
  const level = getConfidenceLevel(percentage);

  let colorClasses: string;
  if (percentage >= 90) {
    colorClasses = 'bg-green-100 text-green-800';
  } else if (percentage >= 70) {
    colorClasses = 'bg-yellow-100 text-yellow-800';
  } else {
    colorClasses = 'bg-red-100 text-red-800';
  }

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colorClasses}`}
      role="status"
      aria-label={`Confiance ${level}: ${percentage}%`}
    >
      {showPercentage ? `${percentage}%` : ''}
      {!showPercentage && (
        <span
          className={`w-2 h-2 rounded-full ${
            percentage >= 90 ? 'bg-green-500' : percentage >= 70 ? 'bg-yellow-500' : 'bg-red-500'
          }`}
          aria-hidden="true"
        />
      )}
    </span>
  );
});
