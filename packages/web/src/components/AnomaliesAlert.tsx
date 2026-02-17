import { memo } from 'react';

interface Anomaly {
  type: string;
  message: string;
  severity?: string;
}

interface AnomaliesAlertProps {
  anomalies: Anomaly[] | null;
}

/**
 * Alert component displaying detected anomalies
 */
export const AnomaliesAlert = memo(function AnomaliesAlert({ anomalies }: AnomaliesAlertProps) {
  if (!anomalies || anomalies.length === 0) return null;

  const count = anomalies.length;

  return (
    <div
      className="mb-4 bg-yellow-50 border border-yellow-200 rounded-lg p-4"
      role="alert"
      aria-live="polite"
      aria-label={`${count} anomalie${count > 1 ? 's' : ''} détectée${count > 1 ? 's' : ''}`}
    >
      <h3 className="text-sm font-medium text-yellow-800 mb-2" id="anomalies-heading">
        Anomalies détectées ({count})
      </h3>
      <ul className="text-sm text-yellow-700 space-y-1" aria-labelledby="anomalies-heading">
        {anomalies.map((anomaly, index) => (
          <li key={index} className="flex items-start">
            <svg
              className="w-4 h-4 mr-2 mt-0.5 text-yellow-500"
              fill="currentColor"
              viewBox="0 0 20 20"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            <span>
              <span className="font-medium">{anomaly.type}:</span> {anomaly.message}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
});
