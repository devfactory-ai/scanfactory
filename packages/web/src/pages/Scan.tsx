import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '../lib/api';
import { FileUpload } from '../components/FileUpload';

export function Scan() {
  const navigate = useNavigate();
  const [selectedPipeline, setSelectedPipeline] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch available pipelines
  const { data: pipelinesData, isLoading: isLoadingPipelines } = useQuery({
    queryKey: ['pipelines'],
    queryFn: () => api.getPipelines(),
  });

  // Scan mutation
  const scanMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile || !selectedPipeline) {
        throw new Error('Fichier et pipeline requis');
      }
      return api.scanDocument(selectedFile, selectedPipeline);
    },
    onSuccess: (data) => {
      // Navigate to validation detail
      navigate(`/validation/${data.id}`);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Erreur lors du scan');
    },
  });

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    setError(null);
  };

  const handleSubmit = () => {
    if (!selectedFile) {
      setError('Veuillez sélectionner un fichier');
      return;
    }
    if (!selectedPipeline) {
      setError('Veuillez sélectionner un type de document');
      return;
    }
    scanMutation.mutate();
  };

  const pipelines = pipelinesData?.pipelines ?? [];

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        Numériser un document
      </h1>

      <div className="bg-white rounded-lg shadow-sm p-6 space-y-6">
        {/* Pipeline selector */}
        <div>
          <label
            htmlFor="pipeline"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Type de document
          </label>
          {isLoadingPipelines ? (
            <div className="animate-pulse h-10 bg-gray-200 rounded"></div>
          ) : (
            <select
              id="pipeline"
              value={selectedPipeline}
              onChange={(e) => setSelectedPipeline(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="">Sélectionner un type...</option>
              {pipelines.map((pipeline) => (
                <option key={pipeline.id} value={pipeline.name}>
                  {pipeline.display_name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* File upload */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Document
          </label>
          <FileUpload
            onFileSelect={handleFileSelect}
            disabled={scanMutation.isPending}
          />
        </div>

        {/* Error message */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        {/* Submit button */}
        <div className="flex justify-end">
          <button
            onClick={handleSubmit}
            disabled={!selectedFile || !selectedPipeline || scanMutation.isPending}
            className="px-6 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {scanMutation.isPending ? (
              <span className="flex items-center">
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Traitement...
              </span>
            ) : (
              'Numériser'
            )}
          </button>
        </div>

        {/* Result preview */}
        {scanMutation.isSuccess && scanMutation.data && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <h3 className="font-medium text-green-800 mb-2">
              Document traité avec succès
            </h3>
            <div className="text-sm text-green-700 space-y-1">
              <p>
                <span className="font-medium">ID:</span> {scanMutation.data.id}
              </p>
              <p>
                <span className="font-medium">Confiance:</span>{' '}
                {Math.round(scanMutation.data.confidence_score * 100)}%
              </p>
              <p>
                <span className="font-medium">Lot:</span>{' '}
                {scanMutation.data.batch.group_label}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
