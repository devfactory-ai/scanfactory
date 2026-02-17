import { useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

// Types for cache management
interface DocumentResponse {
  document: {
    id: string;
    pipeline_id: string;
    pipeline_name: string;
    pipeline_display_name: string;
    batch_id: string | null;
    status: string;
    extracted_data: Record<string, unknown>;
    computed_data: Record<string, unknown> | null;
    confidence_score: number | null;
    extraction_modes: { replace: string[]; table: string[]; direct: string[] } | null;
    anomalies: Array<{ type: string; message: string; severity: string }> | null;
    created_at: string;
    updated_at: string;
  };
  field_display: {
    groups: Array<{
      name: string;
      label: string;
      fields: string[];
    }>;
  } | null;
  scan_url: string;
}
import { ScanViewer } from '../components/ScanViewer';
import { DocumentForm } from '../components/DocumentForm';
import { ConfidenceBadge } from '../components/ConfidenceBadge';
import { StatusBadge } from '../components/StatusBadge';
import { AnomaliesAlert } from '../components/AnomaliesAlert';
import { DocumentNavigator } from '../components/DocumentNavigator';
import { KeyboardShortcutsModal } from '../components/KeyboardShortcutsModal';
import { ErrorAlert } from '../components/ErrorAlert';
import { useKeyboardNavigation } from '../hooks/useKeyboard';

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

  // Prefetch adjacent documents for faster navigation
  useEffect(() => {
    if (adjacentData?.previous) {
      queryClient.prefetchQuery({
        queryKey: ['document', adjacentData.previous],
        queryFn: () => api.getDocument(adjacentData.previous!),
        staleTime: 5 * 60 * 1000, // 5 minutes
      });
    }
    if (adjacentData?.next) {
      queryClient.prefetchQuery({
        queryKey: ['document', adjacentData.next],
        queryFn: () => api.getDocument(adjacentData.next!),
        staleTime: 5 * 60 * 1000,
      });
    }
  }, [adjacentData?.previous, adjacentData?.next, queryClient]);

  // Validate mutation with optimistic updates
  const validateMutation = useMutation({
    mutationFn: async (action: 'validate' | 'reject') => {
      return api.updateDocument(id!, {
        extracted_data: editedData ?? data?.document.extracted_data,
        action,
      });
    },
    // Optimistic update: immediately update cache before server responds
    onMutate: async (action) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['document', id] });
      await queryClient.cancelQueries({ queryKey: ['validationQueue'] });

      // Snapshot previous value
      const previousDocument = queryClient.getQueryData<DocumentResponse>(['document', id]);

      // Optimistically update the document status
      if (previousDocument) {
        const newStatus = action === 'validate' ? 'validated' : 'rejected';
        queryClient.setQueryData<DocumentResponse>(['document', id], {
          ...previousDocument,
          document: {
            ...previousDocument.document,
            status: newStatus,
            extracted_data: editedData ?? previousDocument.document.extracted_data,
          },
        });
      }

      return { previousDocument };
    },
    // Rollback on error
    onError: (_err, _action, context) => {
      if (context?.previousDocument) {
        queryClient.setQueryData(['document', id], context.previousDocument);
      }
    },
    // Refetch on success or error
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['validationQueue'] });
    },
    onSuccess: () => {
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
      <ErrorAlert
        error={error}
        title="Erreur de chargement"
        context="fetch"
        onRetry={() => window.location.reload()}
      />
    );
  }

  const { document: doc, field_display, scan_url } = data;
  const isEditable = doc.status === 'pending';

  return (
    <div className="h-[calc(100vh-12rem)]">
      {/* Keyboard shortcuts modal */}
      <KeyboardShortcutsModal isOpen={showShortcuts} onClose={() => setShowShortcuts(false)} />

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate('/validation')}
            className="text-gray-600 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 rounded"
            aria-label="Retour à la liste de validation"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Validation de document</h1>
            <p className="text-sm text-gray-500">
              {doc.pipeline_display_name} | {doc.id.substring(0, 20)}...
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          {adjacentData && (
            <DocumentNavigator
              previous={adjacentData.previous}
              next={adjacentData.next}
              position={adjacentData.position}
              total={adjacentData.total}
              onPrevious={handlePrevious}
              onNext={handleNext}
            />
          )}
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600">Confiance:</span>
            <ConfidenceBadge confidence={doc.confidence_score} />
          </div>
          <StatusBadge status={doc.status} />
          <button
            onClick={() => setShowShortcuts(!showShortcuts)}
            className="p-1 text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500 rounded"
            title="Raccourcis clavier"
            aria-label="Afficher les raccourcis clavier"
            aria-expanded={showShortcuts}
            aria-haspopup="dialog"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Anomalies warning */}
      <AnomaliesAlert anomalies={doc.anomalies} />

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
            <div className="border-t p-4 flex justify-end space-x-3" role="group" aria-label="Actions de validation">
              <button
                onClick={() => validateMutation.mutate('reject')}
                disabled={validateMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-red-700 bg-red-100 rounded-md hover:bg-red-200 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                aria-busy={validateMutation.isPending}
              >
                Rejeter
              </button>
              <button
                onClick={() => validateMutation.mutate('validate')}
                disabled={validateMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                aria-busy={validateMutation.isPending}
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
