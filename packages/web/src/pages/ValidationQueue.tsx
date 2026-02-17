import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { ConfidenceBadge } from '../components/ConfidenceBadge';

export function ValidationQueue() {
  const [pipelineFilter, setPipelineFilter] = useState<string>('');
  const [page, setPage] = useState(0);
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

  const pipelines = pipelinesData?.pipelines ?? [];
  const documents = data?.documents ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          File d'attente de validation
        </h1>
        <div className="flex items-center space-x-4">
          <select
            value={pipelineFilter}
            onChange={(e) => {
              setPipelineFilter(e.target.value);
              setPage(0);
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Document
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Pipeline
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Confiance
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {documents.map((doc) => (
                  <tr key={doc.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">
                        {doc.id.substring(0, 16)}...
                      </div>
                      <div className="text-sm text-gray-500 truncate max-w-md">
                        {getFieldSummary(doc.extracted_data)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {doc.pipeline_display_name}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <ConfidenceBadge confidence={doc.confidence_score} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(doc.created_at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <Link
                        to={`/validation/${doc.id}`}
                        className="text-primary-600 hover:text-primary-900 text-sm font-medium"
                      >
                        Valider
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
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Précédent
              </button>
              <span className="text-sm text-gray-600">
                Page {page + 1} sur {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
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
