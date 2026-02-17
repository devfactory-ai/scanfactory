import { useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { ConfidenceBadge } from '../components/ConfidenceBadge';
import { useBatchKeyboardNavigation, KEYBOARD_SHORTCUTS } from '../hooks/useKeyboard';

export function ValidationBatch() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [pipelineFilter, setPipelineFilter] = useState<string>('');
  const [page, setPage] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const limit = 20;

  // Fetch pipelines for filter
  const { data: pipelinesData } = useQuery({
    queryKey: ['pipelines'],
    queryFn: () => api.getPipelines(),
  });

  // Fetch validation queue
  const { data, isLoading, error } = useQuery({
    queryKey: ['validationQueue', pipelineFilter, page],
    queryFn: () =>
      api.getValidationQueue({
        pipeline_id: pipelineFilter || undefined,
        status: 'pending',
        sort_by: 'created_at',
        sort_order: 'asc',
        limit,
        offset: page * limit,
      }),
  });

  // Batch action mutation
  const batchMutation = useMutation({
    mutationFn: async ({ ids, action }: { ids: string[]; action: 'validate' | 'reject' }) => {
      return api.batchValidate(ids, action);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['validationQueue'] });
      setSelectedIds(new Set());
      // Show success message (could be a toast)
      console.log(`${result.success_count} documents traités, ${result.error_count} erreurs`);
    },
  });

  const pipelines = pipelinesData?.pipelines ?? [];
  const documents = data?.documents ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  // Selection handlers
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    if (selectedIds.size === documents.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(documents.map((d) => d.id)));
    }
  }, [documents, selectedIds.size]);

  const handleToggleHighlighted = useCallback(() => {
    if (documents[highlightedIndex]) {
      toggleSelect(documents[highlightedIndex].id);
    }
  }, [documents, highlightedIndex, toggleSelect]);

  // Keyboard navigation
  useBatchKeyboardNavigation({
    total: documents.length,
    selectedIndex: highlightedIndex,
    onSelectionChange: setHighlightedIndex,
    onToggleSelect: handleToggleHighlighted,
    onSelectAll: selectAll,
    enabled: !batchMutation.isPending,
  });

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getFieldSummary = (extractedData: Record<string, unknown>): string => {
    const fields = Object.entries(extractedData)
      .filter(([, value]) => typeof value === 'string' || typeof value === 'number')
      .slice(0, 3)
      .map(([key, value]) => `${key}: ${String(value).substring(0, 20)}`);
    return fields.join(' | ');
  };

  const selectedCount = selectedIds.size;
  const isAllSelected = documents.length > 0 && selectedIds.size === documents.length;
  const isSomeSelected = selectedIds.size > 0 && selectedIds.size < documents.length;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
          <h1 className="text-2xl font-bold text-gray-900">
            Validation par lot
          </h1>
          <Link
            to="/validation"
            className="text-sm text-primary-600 hover:text-primary-700"
          >
            Mode individuel
          </Link>
        </div>
        <div className="flex items-center space-x-4">
          <select
            value={pipelineFilter}
            onChange={(e) => {
              setPipelineFilter(e.target.value);
              setPage(0);
              setSelectedIds(new Set());
            }}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">Tous les pipelines</option>
            {pipelines.map((pipeline) => (
              <option key={pipeline.id} value={pipeline.id}>
                {pipeline.display_name}
              </option>
            ))}
          </select>
          <span className="text-sm text-gray-600">
            {total} document{total > 1 ? 's' : ''} en attente
          </span>
        </div>
      </div>

      {/* Batch action bar */}
      {selectedCount > 0 && (
        <div className="mb-4 flex items-center justify-between bg-primary-50 border border-primary-200 rounded-lg p-4">
          <span className="text-sm font-medium text-primary-800">
            {selectedCount} document{selectedCount > 1 ? 's' : ''} sélectionné{selectedCount > 1 ? 's' : ''}
          </span>
          <div className="flex items-center space-x-3">
            <button
              onClick={() => batchMutation.mutate({ ids: Array.from(selectedIds), action: 'reject' })}
              disabled={batchMutation.isPending}
              className="px-4 py-2 text-sm font-medium text-red-700 bg-red-100 rounded-md hover:bg-red-200 disabled:opacity-50"
            >
              Rejeter tout
            </button>
            <button
              onClick={() => batchMutation.mutate({ ids: Array.from(selectedIds), action: 'validate' })}
              disabled={batchMutation.isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50"
            >
              {batchMutation.isPending ? 'Traitement...' : 'Valider tout'}
            </button>
          </div>
        </div>
      )}

      {/* Keyboard shortcuts hint */}
      <div className="mb-4 flex items-center space-x-4 text-xs text-gray-500">
        {KEYBOARD_SHORTCUTS.batch.map((shortcut) => (
          <span key={shortcut.key}>
            <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded font-mono">{shortcut.key}</kbd>
            {' '}{shortcut.description}
          </span>
        ))}
        <span>
          <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded font-mono">Enter</kbd>
          {' '}Ouvrir document
        </span>
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          Erreur lors du chargement de la file d'attente
        </div>
      )}

      {!isLoading && !error && documents.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          Aucun document en attente de validation
        </div>
      )}

      {!isLoading && !error && documents.length > 0 && (
        <>
          <div className="bg-white shadow-sm rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = isSomeSelected;
                      }}
                      onChange={selectAll}
                      className="h-4 w-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Document
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Pipeline
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Confiance
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Anomalies
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {documents.map((doc, index) => (
                  <tr
                    key={doc.id}
                    className={`
                      ${highlightedIndex === index ? 'bg-primary-50' : 'hover:bg-gray-50'}
                      ${selectedIds.has(doc.id) ? 'bg-primary-25' : ''}
                      cursor-pointer transition-colors
                    `}
                    onClick={() => toggleSelect(doc.id)}
                    onDoubleClick={() => navigate(`/validation/${doc.id}`)}
                  >
                    <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(doc.id)}
                        onChange={() => toggleSelect(doc.id)}
                        className="h-4 w-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
                      />
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-sm font-medium text-gray-900">
                        {doc.id.substring(0, 16)}...
                      </div>
                      <div className="text-sm text-gray-500 truncate max-w-xs">
                        {getFieldSummary(doc.extracted_data)}
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {doc.pipeline_display_name}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <ConfidenceBadge confidence={doc.confidence_score} />
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      {doc.anomalies && doc.anomalies.length > 0 ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                          {doc.anomalies.length} anomalie{doc.anomalies.length > 1 ? 's' : ''}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(doc.created_at)}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                      <Link
                        to={`/validation/${doc.id}`}
                        className="text-primary-600 hover:text-primary-900 text-sm font-medium"
                      >
                        Détails
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <button
                onClick={() => {
                  setPage((p) => Math.max(0, p - 1));
                  setSelectedIds(new Set());
                }}
                disabled={page === 0}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Précédent
              </button>
              <span className="text-sm text-gray-600">
                Page {page + 1} sur {totalPages}
              </span>
              <button
                onClick={() => {
                  setPage((p) => Math.min(totalPages - 1, p + 1));
                  setSelectedIds(new Set());
                }}
                disabled={page >= totalPages - 1}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Suivant
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
