import { memo } from 'react';

type DocumentStatus = 'pending' | 'validated' | 'rejected' | 'exported' | 'failed';

interface StatusBadgeProps {
  status: DocumentStatus | string;
}

const STATUS_CONFIG: Record<DocumentStatus, { bg: string; text: string; label: string }> = {
  pending: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'En attente' },
  validated: { bg: 'bg-green-100', text: 'text-green-800', label: 'Valid\u00e9' },
  rejected: { bg: 'bg-red-100', text: 'text-red-800', label: 'Rejet\u00e9' },
  exported: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Export\u00e9' },
  failed: { bg: 'bg-gray-100', text: 'text-gray-800', label: '\u00c9chou\u00e9' },
};

/**
 * Status badge component with color coding
 */
export const StatusBadge = memo(function StatusBadge({ status }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status as DocumentStatus] || {
    bg: 'bg-gray-100',
    text: 'text-gray-800',
    label: status,
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.text}`}
      role="status"
      aria-label={`Statut: ${config.label}`}
    >
      {config.label}
    </span>
  );
});
