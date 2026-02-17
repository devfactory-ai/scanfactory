import { useState } from 'react';

interface ScanViewerProps {
  scanUrl: string;
  documentId: string;
}

export function ScanViewer({ scanUrl, documentId }: ScanViewerProps) {
  const [zoom, setZoom] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.25, 3));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.25, 0.5));
  const handleResetZoom = () => setZoom(1);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-100 border-b">
        <span className="text-sm text-gray-600 truncate">
          Document: {documentId}
        </span>
        <div className="flex items-center space-x-2">
          <button
            onClick={handleZoomOut}
            className="p-1 text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded"
            title="Zoom arrière"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
            </svg>
          </button>
          <button
            onClick={handleResetZoom}
            className="px-2 py-1 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            onClick={handleZoomIn}
            className="p-1 text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded"
            title="Zoom avant"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Image container */}
      <div className="flex-1 overflow-auto bg-gray-50 p-4">
        <div className="flex items-center justify-center min-h-full">
          {isLoading && !error && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
          )}
          {error ? (
            <div className="text-center text-gray-500">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="mt-2">Impossible de charger l'image</p>
            </div>
          ) : (
            <img
              src={scanUrl}
              alt="Document scan"
              className="max-w-full shadow-lg rounded transition-transform"
              style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }}
              onLoad={() => setIsLoading(false)}
              onError={() => {
                setIsLoading(false);
                setError(true);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
