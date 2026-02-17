import { memo } from 'react';
import { getErrorMessage, type ErrorMessageOptions } from '../lib/errorMessages';

interface ErrorAlertProps {
  error: unknown;
  title?: string;
  context?: ErrorMessageOptions['context'];
  onRetry?: () => void;
  onDismiss?: () => void;
  className?: string;
}

/**
 * Contextual error alert component with user-friendly messages
 */
export const ErrorAlert = memo(function ErrorAlert({
  error,
  title = 'Erreur',
  context,
  onRetry,
  onDismiss,
  className = '',
}: ErrorAlertProps) {
  if (!error) return null;

  const message = getErrorMessage(error, { context });

  return (
    <div
      className={`bg-red-50 border border-red-200 rounded-lg p-4 ${className}`}
      role="alert"
      aria-live="assertive"
    >
      <div className="flex">
        <div className="flex-shrink-0">
          <svg
            className="h-5 w-5 text-red-400"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <div className="ml-3 flex-1">
          <h3 className="text-sm font-medium text-red-800">{title}</h3>
          <p className="mt-1 text-sm text-red-700">{message}</p>
          {(onRetry || onDismiss) && (
            <div className="mt-3 flex space-x-3">
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="text-sm font-medium text-red-800 hover:text-red-900 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 rounded"
                >
                  Réessayer
                </button>
              )}
              {onDismiss && (
                <button
                  type="button"
                  onClick={onDismiss}
                  className="text-sm font-medium text-red-600 hover:text-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 rounded"
                >
                  Fermer
                </button>
              )}
            </div>
          )}
        </div>
        {onDismiss && (
          <div className="ml-auto pl-3">
            <button
              type="button"
              onClick={onDismiss}
              className="inline-flex rounded-md p-1.5 text-red-500 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
              aria-label="Fermer l'alerte"
            >
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
});

/**
 * Inline error text for form fields
 */
export const FieldError = memo(function FieldError({
  error,
  id,
}: {
  error?: string | null;
  id?: string;
}) {
  if (!error) return null;

  return (
    <p
      id={id}
      className="mt-1 text-sm text-red-600"
      role="alert"
    >
      {error}
    </p>
  );
});

/**
 * Toast-style error notification
 */
export const ErrorToast = memo(function ErrorToast({
  error,
  context,
  onDismiss,
  autoHideDuration = 5000,
}: {
  error: unknown;
  context?: ErrorMessageOptions['context'];
  onDismiss: () => void;
  autoHideDuration?: number;
}) {
  const message = getErrorMessage(error, { context });

  // Auto-dismiss after duration
  if (autoHideDuration > 0) {
    setTimeout(onDismiss, autoHideDuration);
  }

  return (
    <div
      className="fixed bottom-4 right-4 z-50 max-w-sm bg-red-600 text-white rounded-lg shadow-lg p-4"
      role="alert"
      aria-live="assertive"
    >
      <div className="flex items-start">
        <svg
          className="h-5 w-5 text-red-200 mr-3 flex-shrink-0"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
            clipRule="evenodd"
          />
        </svg>
        <p className="text-sm font-medium flex-1">{message}</p>
        <button
          type="button"
          onClick={onDismiss}
          className="ml-3 text-red-200 hover:text-white focus:outline-none focus:ring-2 focus:ring-white rounded"
          aria-label="Fermer"
        >
          <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>
      </div>
    </div>
  );
});
