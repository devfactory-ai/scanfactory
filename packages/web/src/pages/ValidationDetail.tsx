import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { ScanViewer } from '../components/ScanViewer';
import { DocumentForm } from '../components/DocumentForm';
import { ConfidenceBadge } from '../components/ConfidenceBadge';

export function ValidationDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editedData, setEditedData] = useState<Record<string, unknown> | null>(null);

  // Fetch document
  const { data, isLoading, error } = useQuery({
    queryKey: ['document', id],
    queryFn: () => api.getDocument(id!),
    enabled: !!id,
  });

  // Validate mutation
  const validateMutation = useMutation({
    mutationFn: async (action: 'validate' | 'reject') => {
      return api.updateDocument(id!, {
        extracted_data: editedData ?? data?.document.extracted_data,
        action,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['validationQueue'] });
      navigate('/validation');
    },
  });

  if (!id) {
    return <div>Document ID manquant</div>;
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
        Erreur lors du chargement du document
      </div>
    );
  }

  const { document: doc, field_display, scan_url } = data;
  const isEditable = doc.status === 'pending';

  return (
    <div className="h-[calc(100vh-12rem)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate('/validation')}
            className="text-gray-600 hover:text-gray-900"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              Validation de document
            </h1>
            <p className="text-sm text-gray-500">
              {doc.pipeline_display_name} | {doc.id.substring(0, 20)}...
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600">Confiance globale:</span>
            <ConfidenceBadge confidence={doc.confidence_score} />
          </div>
          <span className={`
            inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
            ${doc.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : ''}
            ${doc.status === 'validated' ? 'bg-green-100 text-green-800' : ''}
            ${doc.status === 'rejected' ? 'bg-red-100 text-red-800' : ''}
          `}>
            {doc.status === 'pending' && 'En attente'}
            {doc.status === 'validated' && 'Validé'}
            {doc.status === 'rejected' && 'Rejeté'}
          </span>
        </div>
      </div>

      {/* Anomalies warning */}
      {doc.anomalies && doc.anomalies.length > 0 && (
        <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-yellow-800 mb-2">
            Anomalies détectées
          </h3>
          <ul className="text-sm text-yellow-700 space-y-1">
            {doc.anomalies.map((anomaly, index) => (
              <li key={index} className="flex items-start">
                <svg className="w-4 h-4 mr-2 mt-0.5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <span>
                  <span className="font-medium">{anomaly.type}:</span> {anomaly.message}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Split view */}
      <div className="flex h-full gap-4">
        {/* Left: Scan viewer */}
        <div className="w-1/2 bg-white rounded-lg shadow-sm overflow-hidden">
          <ScanViewer scanUrl={scan_url} documentId={doc.id} />
        </div>

        {/* Right: Form */}
        <div className="w-1/2 bg-white rounded-lg shadow-sm flex flex-col">
          <div className="flex-1 overflow-auto">
            <DocumentForm
              extractedData={doc.extracted_data}
              fieldDisplay={field_display}
              onChange={setEditedData}
              disabled={!isEditable}
            />
          </div>

          {/* Action buttons */}
          {isEditable && (
            <div className="border-t p-4 flex justify-end space-x-3">
              <button
                onClick={() => validateMutation.mutate('reject')}
                disabled={validateMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-red-700 bg-red-100 rounded-md hover:bg-red-200 disabled:opacity-50"
              >
                Rejeter
              </button>
              <button
                onClick={() => validateMutation.mutate('validate')}
                disabled={validateMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50"
              >
                {validateMutation.isPending ? 'Validation...' : 'Valider'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
