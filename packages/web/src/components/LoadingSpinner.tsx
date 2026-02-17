/**
 * Loading spinner component for Suspense fallbacks
 */
export function LoadingSpinner() {
  return (
    <div
      className="flex items-center justify-center min-h-[200px]"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div
        className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"
        aria-hidden="true"
      ></div>
      <span className="sr-only">Chargement en cours...</span>
    </div>
  );
}

/**
 * Full page loading spinner
 */
export function PageLoadingSpinner() {
  return (
    <div
      className="flex items-center justify-center min-h-screen bg-gray-50"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="text-center">
        <div
          className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"
          aria-hidden="true"
        ></div>
        <p className="mt-4 text-gray-600">Chargement...</p>
      </div>
    </div>
  );
}
