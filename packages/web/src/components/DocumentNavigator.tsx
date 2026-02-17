import { memo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

interface DocumentNavigatorProps {
  previous: string | null;
  next: string | null;
  position: number;
  total: number;
  onPrevious?: () => void;
  onNext?: () => void;
}

/**
 * Navigation controls for moving between documents
 */
export const DocumentNavigator = memo(function DocumentNavigator({
  previous,
  next,
  position,
  total,
  onPrevious,
  onNext,
}: DocumentNavigatorProps) {
  const navigate = useNavigate();

  const handlePrevious = useCallback(() => {
    if (onPrevious) {
      onPrevious();
    } else if (previous) {
      navigate(`/validation/${previous}`);
    }
  }, [previous, navigate, onPrevious]);

  const handleNext = useCallback(() => {
    if (onNext) {
      onNext();
    } else if (next) {
      navigate(`/validation/${next}`);
    }
  }, [next, navigate, onNext]);

  return (
    <nav className="flex items-center space-x-2" aria-label="Navigation entre documents">
      <button
        onClick={handlePrevious}
        disabled={!previous}
        className="p-1 text-gray-500 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 rounded"
        aria-label="Document précédent"
        title="Document précédent (←)"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <span className="text-sm text-gray-600" aria-live="polite" aria-atomic="true">
        <span className="sr-only">Document </span>{position} / {total}
      </span>
      <button
        onClick={handleNext}
        disabled={!next}
        className="p-1 text-gray-500 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 rounded"
        aria-label="Document suivant"
        title="Document suivant (→)"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </nav>
  );
});
