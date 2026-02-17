import { useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { ScanViewer } from '../components/ScanViewer';
import { DocumentForm } from '../components/DocumentForm';
import { ConfidenceBadge } from '../components/ConfidenceBadge';
import { useKeyboardNavigation, KEYBOARD_SHORTCUTS } from '../hooks/useKeyboard';

export function ValidationDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editedData, setEditedData] = useState<Record<string, unknown> | null>(null);

  const [showShortcuts, setShowShortcuts] = useState(false);

  // Fetch document
  const { data, isLoading, error } = useQuery({
    queryKey: ['document', id],
    queryFn: () => api.getDocument(id!),
    enabled: !!id,
  });

  // Fetch adjacent documents for navigation
  const { data: adjacentData } = useQuery({
    queryKey: ['documentAdjacent', id, data?.document.pipeline_id],
    queryFn: () => api.getAdjacentDocuments(id!, data?.document.pipeline_id),
    enabled: !!id && !!data?.document.pipeline_id,
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
      // Navigate to next document if available, otherwise go back to queue
      if (adjacentData?.next) {
        navigate(`/validation/${adjacentData.next}`);
      } else {
        navigate('/validation');
      }
    },
  });

  // Keyboard navigation callbacks
  const handlePrevious = useCallback(() => {
    if (adjacentData?.previous) {
      navigate(`/validation/${adjacentData.previous}`);
    }
  }, [adjacentData?.previous, navigate]);

  const handleNext = useCallback(() => {
    if (adjacentData?.next) {
      navigate(`/validation/${adjacentData.next}`);
    }
  }, [adjacentData?.next, navigate]);

  const handleValidate = useCallback(() => {
    if (data?.document.status === 'pending' && !validateMutation.isPending) {
      validateMutation.mutate('validate');
    }
  }, [data?.document.status, validateMutation]);

  const handleReject = useCallback(() => {
    if (data?.document.status === 'pending' && !validateMutation.isPending) {
      validateMutation.mutate('reject');
    }
  }, [data?.document.status, validateMutation]);

  const handleBack = useCallback(() => {
    navigate('/validation');
  }, [navigate]);

  // Setup keyboard navigation
  useKeyboardNavigation({
    onPrevious: handlePrevious,
    onNext: handleNext,
    onValidate: handleValidate,
    onReject: handleReject,
    onBack: handleBack,
    enabled: !!data && !validateMutation.isPending,
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
      {/* Keyboard shortcuts modal */}
      {showShortcuts && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowShortcuts(false)}>
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">Raccourcis clavier</h3>
              <button onClick={() => setShowShortcuts(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">Navigation</h4>
                <div className="space-y-1">
                  {KEYBOARD_SHORTCUTS.navigation.map((shortcut) => (
                    <div key={shortcut.key} className="flex items-center justify-between text-sm">
                      <kbd className="px-2 py-1 bg-gray-100 border border-gray-300 rounded text-xs font-mono">{shortcut.key}</kbd>
                      <span className="text-gray-600">{shortcut.description}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">Actions</h4>
                <div className="space-y-1">
                  {KEYBOARD_SHORTCUTS.actions.map((shortcut) => (
                    <div key={shortcut.key} className="flex items-center justify-between text-sm">
                      <kbd className="px-2 py-1 bg-gray-100 border border-gray-300 rounded text-xs font-mono">{shortcut.key}</kbd>
                      <span className="text-gray-600">{shortcut.description}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">Vue</h4>
                <div className="space-y-1">
                  {KEYBOARD_SHORTCUTS.view.map((shortcut) => (
                    <div key={shortcut.key} className="flex items-center justify-between text-sm">
                      <kbd className="px-2 py-1 bg-gray-100 border border-gray-300 rounded text-xs font-mono">{shortcut.key}</kbd>
                      <span className="text-gray-600">{shortcut.description}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

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
          {/* Navigation arrows */}
          {adjacentData && (
            <div className="flex items-center space-x-2">
              <button
                onClick={handlePrevious}
                disabled={!adjacentData.previous}
                className="p-1 text-gray-500 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed"
                title="Document précédent (←)"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <span className="text-sm text-gray-600">
                {adjacentData.position} / {adjacentData.total}
              </span>
              <button
                onClick={handleNext}
                disabled={!adjacentData.next}
                className="p-1 text-gray-500 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed"
                title="Document suivant (→)"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          )}
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600">Confiance:</span>
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
          {/* Keyboard shortcuts help */}
          <button
            onClick={() => setShowShortcuts(!showShortcuts)}
            className="p-1 text-gray-400 hover:text-gray-600"
            title="Raccourcis clavier"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
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
