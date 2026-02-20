/**
 * Audit Trail Viewer UI
 *
 * Paginated audit log with filters and JSON diff view
 * T033: Audit trail viewer
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorAlert } from '../../components/ErrorAlert';

interface AuditEntry {
  id: string;
  user_id: string;
  user_name?: string;
  action: string;
  entity_type: string;
  entity_id: string;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}

interface AuditResponse {
  entries: AuditEntry[];
  total: number;
  limit: number;
  offset: number;
}

function JsonDiffViewer({
  oldValue,
  newValue,
  onClose,
}: {
  oldValue: string | null;
  newValue: string | null;
  onClose: () => void;
}) {
  let oldJson: Record<string, unknown> | null = null;
  let newJson: Record<string, unknown> | null = null;

  try {
    if (oldValue) oldJson = JSON.parse(oldValue);
    if (newValue) newJson = JSON.parse(newValue);
  } catch {
    // Non-JSON values
  }

  const allKeys = new Set([
    ...Object.keys(oldJson || {}),
    ...Object.keys(newJson || {}),
  ]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-xl font-semibold">Détails du changement</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-100px)]">
          {oldJson && newJson ? (
            <div className="space-y-4">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-gray-500">Champ</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-500">Ancienne valeur</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-500">Nouvelle valeur</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {Array.from(allKeys).map((key) => {
                    const oldVal = oldJson?.[key];
                    const newVal = newJson?.[key];
                    const changed = JSON.stringify(oldVal) !== JSON.stringify(newVal);

                    return (
                      <tr
                        key={key}
                        className={changed ? 'bg-yellow-50' : ''}
                      >
                        <td className="px-4 py-2 font-medium">{key}</td>
                        <td className="px-4 py-2 font-mono text-xs">
                          {oldVal !== undefined ? (
                            <span className={changed ? 'text-red-600' : ''}>
                              {JSON.stringify(oldVal)}
                            </span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-2 font-mono text-xs">
                          {newVal !== undefined ? (
                            <span className={changed ? 'text-green-600' : ''}>
                              {JSON.stringify(newVal)}
                            </span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">
                  Ancienne valeur
                </h3>
                <pre className="bg-red-50 p-4 rounded-md text-xs overflow-x-auto">
                  {oldValue || '(vide)'}
                </pre>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">
                  Nouvelle valeur
                </h3>
                <pre className="bg-green-50 p-4 rounded-md text-xs overflow-x-auto">
                  {newValue || '(vide)'}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AdminAuditLog() {
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');
  const [userId, setUserId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [offset, setOffset] = useState(0);
  const [selectedEntry, setSelectedEntry] = useState<AuditEntry | null>(null);
  const limit = 50;

  const { data, isLoading, error } = useQuery({
    queryKey: ['audit-log', entityType, action, userId, dateFrom, dateTo, offset],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      params.set('offset', String(offset));
      if (entityType) params.set('entity_type', entityType);
      if (action) params.set('action', action);
      if (userId) params.set('user_id', userId);
      // Note: date filters would need API support
      return api.get<AuditResponse>(`/api/admin/audit-log?${params}`);
    },
  });

  // Fetch users for filter dropdown
  const { data: usersData } = useQuery({
    queryKey: ['admin-users-list'],
    queryFn: () => api.get<{ users: { id: string; name: string }[] }>('/api/admin/users'),
  });

  if (error) {
    return <ErrorAlert error="Erreur lors du chargement du journal d'audit" />;
  }

  const entries = data?.entries ?? [];
  const total = data?.total ?? 0;
  const users = usersData?.users ?? [];

  const entityTypes = ['document', 'batch', 'user', 'pipeline', 'company', 'contract'];
  const actions = ['create', 'update', 'delete', 'validate', 'reject', 'export', 'login'];

  const formatAction = (action: string) => {
    const labels: Record<string, { label: string; color: string }> = {
      create: { label: 'Création', color: 'bg-green-100 text-green-800' },
      update: { label: 'Modification', color: 'bg-blue-100 text-blue-800' },
      delete: { label: 'Suppression', color: 'bg-red-100 text-red-800' },
      validate: { label: 'Validation', color: 'bg-emerald-100 text-emerald-800' },
      reject: { label: 'Rejet', color: 'bg-orange-100 text-orange-800' },
      export: { label: 'Export', color: 'bg-purple-100 text-purple-800' },
      login: { label: 'Connexion', color: 'bg-gray-100 text-gray-800' },
    };
    return labels[action] || { label: action, color: 'bg-gray-100 text-gray-800' };
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">
        Journal d'audit
      </h1>

      {/* Filters */}
      <div className="bg-white shadow rounded-lg p-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Type d'entité
            </label>
            <select
              value={entityType}
              onChange={(e) => { setEntityType(e.target.value); setOffset(0); }}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
            >
              <option value="">Tous</option>
              {entityTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Action
            </label>
            <select
              value={action}
              onChange={(e) => { setAction(e.target.value); setOffset(0); }}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
            >
              <option value="">Toutes</option>
              {actions.map((a) => (
                <option key={a} value={a}>{formatAction(a).label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Utilisateur
            </label>
            <select
              value={userId}
              onChange={(e) => { setUserId(e.target.value); setOffset(0); }}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
            >
              <option value="">Tous</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Date début
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setOffset(0); }}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Date fin
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setOffset(0); }}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
            />
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : (
          <>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Date/Heure
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Utilisateur
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Action
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Entité
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    ID
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Détails
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {entries.map((entry) => {
                  const actionInfo = formatAction(entry.action);
                  return (
                    <tr key={entry.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                        {new Date(entry.created_at).toLocaleString('fr-FR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        {entry.user_name || entry.user_id || 'Système'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${actionInfo.color}`}
                        >
                          {actionInfo.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 capitalize">
                        {entry.entity_type}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-mono text-gray-500">
                        {entry.entity_id.substring(0, 8)}...
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        {(entry.old_value || entry.new_value) && (
                          <button
                            onClick={() => setSelectedEntry(entry)}
                            className="text-blue-600 hover:text-blue-900 text-sm"
                          >
                            Voir
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {entries.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-12 text-center text-gray-500"
                    >
                      Aucune entrée d'audit trouvée
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Pagination */}
            {total > limit && (
              <div className="px-4 py-3 border-t flex items-center justify-between">
                <div className="text-sm text-gray-500">
                  Affichage {offset + 1} - {Math.min(offset + limit, total)} sur {total}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setOffset(Math.max(0, offset - limit))}
                    disabled={offset === 0}
                    className="px-3 py-1 border border-gray-300 rounded-md text-sm disabled:opacity-50 hover:bg-gray-50"
                  >
                    Précédent
                  </button>
                  <button
                    onClick={() => setOffset(offset + limit)}
                    disabled={offset + limit >= total}
                    className="px-3 py-1 border border-gray-300 rounded-md text-sm disabled:opacity-50 hover:bg-gray-50"
                  >
                    Suivant
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* JSON Diff Modal */}
      {selectedEntry && (
        <JsonDiffViewer
          oldValue={selectedEntry.old_value}
          newValue={selectedEntry.new_value}
          onClose={() => setSelectedEntry(null)}
        />
      )}
    </div>
  );
}
