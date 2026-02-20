/**
 * Lookup Tables Management UI
 *
 * CRUD for lookup tables and entries with CSV import
 * T030: Lookup tables management
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorAlert } from '../../components/ErrorAlert';

interface LookupTable {
  id: string;
  name: string;
  pipeline_id: string | null;
  description: string | null;
  entry_count?: number;
}

interface LookupEntry {
  id: string;
  table_id: string;
  key: string;
  data: string;
  active: number;
  valid_from: string;
  valid_to: string | null;
}

function TableEditor({
  table,
  onClose,
  onSave,
}: {
  table: LookupTable | null;
  onClose: () => void;
  onSave: (data: Partial<LookupTable>) => void;
}) {
  const [name, setName] = useState(table?.name || '');
  const [description, setDescription] = useState(table?.description || '');
  const [pipelineId, setPipelineId] = useState(table?.pipeline_id || '');

  const { data: pipelinesData } = useQuery({
    queryKey: ['pipelines'],
    queryFn: () =>
      api.get<{ pipelines: { id: string; display_name: string }[] }>(
        '/api/admin/pipelines'
      ),
  });

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full">
        <div className="px-6 py-4 border-b">
          <h2 className="text-xl font-semibold">
            {table ? 'Modifier la table' : 'Nouvelle table'}
          </h2>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nom *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              placeholder="ex: pct_medications, suppliers"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Pipeline (optionnel)
            </label>
            <select
              value={pipelineId}
              onChange={(e) => setPipelineId(e.target.value)}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="">Partagée (tous les pipelines)</option>
              {pipelinesData?.pipelines.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="px-6 py-4 border-t flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          >
            Annuler
          </button>
          <button
            onClick={() =>
              onSave({
                name,
                description: description || null,
                pipeline_id: pipelineId || null,
              })
            }
            disabled={!name}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

function EntryEditor({
  entry,
  tableId,
  onClose,
  onSave,
}: {
  entry: LookupEntry | null;
  tableId: string;
  onClose: () => void;
  onSave: (data: Partial<LookupEntry>) => void;
}) {
  const [key, setKey] = useState(entry?.key || '');
  const [data, setData] = useState(
    entry?.data ? JSON.stringify(JSON.parse(entry.data), null, 2) : '{}'
  );
  const [validFrom, setValidFrom] = useState(
    entry?.valid_from || new Date().toISOString().split('T')[0]
  );
  const [validTo, setValidTo] = useState(entry?.valid_to || '');
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    try {
      JSON.parse(data);
      onSave({
        table_id: tableId,
        key,
        data,
        valid_from: validFrom,
        valid_to: validTo || null,
        active: 1,
      });
    } catch {
      setError('JSON invalide');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full">
        <div className="px-6 py-4 border-b">
          <h2 className="text-xl font-semibold">
            {entry ? 'Modifier l\'entrée' : 'Nouvelle entrée'}
          </h2>
        </div>

        <div className="p-6 space-y-4">
          {error && <ErrorAlert error={error} />}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Clé *
            </label>
            <input
              type="text"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Données (JSON) *
            </label>
            <textarea
              value={data}
              onChange={(e) => setData(e.target.value)}
              rows={6}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 font-mono text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Valide depuis
              </label>
              <input
                type="date"
                value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Valide jusqu'au
              </label>
              <input
                type="date"
                value={validTo}
                onChange={(e) => setValidTo(e.target.value)}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={!key}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

function CSVImportModal({
  tableId: _tableId,
  onClose,
  onImport,
}: {
  tableId: string;
  onClose: () => void;
  onImport: (entries: Array<{ key: string; data: Record<string, unknown> }>) => void;
}) {
  const [csvContent, setCsvContent] = useState('');
  const [preview, setPreview] = useState<Array<{ key: string; data: Record<string, unknown> }>>([]);
  const [error, setError] = useState<string | null>(null);

  const parseCSV = () => {
    try {
      const lines = csvContent.trim().split('\n');
      if (lines.length < 2) {
        setError('Le CSV doit contenir au moins un en-tête et une ligne de données');
        return;
      }

      const headers = lines[0].split(';').map((h) => h.trim());
      const keyIndex = headers.findIndex(
        (h) => h.toLowerCase() === 'key' || h.toLowerCase() === 'cle'
      );

      if (keyIndex === -1) {
        setError('Le CSV doit contenir une colonne "key" ou "cle"');
        return;
      }

      const entries = lines.slice(1).map((line) => {
        const values = line.split(';').map((v) => v.trim());
        const data: Record<string, unknown> = {};

        headers.forEach((header, index) => {
          if (index !== keyIndex && values[index]) {
            data[header] = values[index];
          }
        });

        return {
          key: values[keyIndex],
          data,
        };
      });

      setPreview(entries);
      setError(null);
    } catch {
      setError('Erreur lors du parsing du CSV');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h2 className="text-xl font-semibold">Import CSV</h2>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto max-h-[calc(90vh-140px)]">
          {error && <ErrorAlert error={error} />}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Contenu CSV (séparateur: point-virgule)
            </label>
            <textarea
              value={csvContent}
              onChange={(e) => setCsvContent(e.target.value)}
              rows={8}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 font-mono text-sm"
              placeholder="key;nom;prix;categorie&#10;MED001;Doliprane 500mg;2.50;antalgique&#10;MED002;Efferalgan 1g;3.20;antalgique"
            />
          </div>

          <button
            onClick={parseCSV}
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          >
            Prévisualiser
          </button>

          {preview.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">
                Prévisualisation ({preview.length} entrées)
              </h3>
              <div className="border rounded-md overflow-hidden max-h-48 overflow-y-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left">Clé</th>
                      <th className="px-3 py-2 text-left">Données</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {preview.slice(0, 10).map((entry, idx) => (
                      <tr key={idx}>
                        <td className="px-3 py-2 font-mono">{entry.key}</td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {JSON.stringify(entry.data)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.length > 10 && (
                <p className="text-sm text-gray-500 mt-1">
                  ... et {preview.length - 10} autres entrées
                </p>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          >
            Annuler
          </button>
          <button
            onClick={() => onImport(preview)}
            disabled={preview.length === 0}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            Importer {preview.length} entrées
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminLookupTables() {
  const queryClient = useQueryClient();
  const [selectedTable, setSelectedTable] = useState<LookupTable | null>(null);
  const [showTableEditor, setShowTableEditor] = useState(false);
  const [editingTable, setEditingTable] = useState<LookupTable | null>(null);
  const [showEntryEditor, setShowEntryEditor] = useState(false);
  const [editingEntry, setEditingEntry] = useState<LookupEntry | null>(null);
  const [showCSVImport, setShowCSVImport] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch tables
  const { data: tablesData, isLoading: tablesLoading } = useQuery({
    queryKey: ['lookup-tables'],
    queryFn: () =>
      api.get<{ tables: LookupTable[] }>('/api/admin/lookup-tables'),
  });

  // Fetch entries for selected table
  const { data: entriesData, isLoading: entriesLoading } = useQuery({
    queryKey: ['lookup-entries', selectedTable?.id, searchTerm],
    queryFn: () =>
      api.get<{ entries: LookupEntry[] }>(
        `/api/admin/lookup-tables/${selectedTable!.id}/entries?search=${searchTerm}`
      ),
    enabled: !!selectedTable,
  });

  // Mutations
  const createTableMutation = useMutation({
    mutationFn: (data: Partial<LookupTable>) =>
      api.post('/api/admin/lookup-tables', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lookup-tables'] });
      setShowTableEditor(false);
      setEditingTable(null);
    },
  });

  const updateTableMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<LookupTable> }) =>
      api.put(`/api/admin/lookup-tables/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lookup-tables'] });
      setShowTableEditor(false);
      setEditingTable(null);
    },
  });

  const createEntryMutation = useMutation({
    mutationFn: (data: Partial<LookupEntry>) =>
      api.post(`/api/admin/lookup-tables/${selectedTable!.id}/entries`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lookup-entries'] });
      setShowEntryEditor(false);
      setEditingEntry(null);
    },
  });

  const updateEntryMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<LookupEntry> }) =>
      api.put(`/api/admin/lookup-entries/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lookup-entries'] });
      setShowEntryEditor(false);
      setEditingEntry(null);
    },
  });

  const importEntriesMutation = useMutation({
    mutationFn: (entries: Array<{ key: string; data: Record<string, unknown> }>) =>
      api.post(`/api/admin/lookup-tables/${selectedTable!.id}/import`, { entries }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lookup-entries'] });
      setShowCSVImport(false);
    },
  });

  const deleteEntryMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/admin/lookup-entries/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lookup-entries'] });
    },
  });

  if (tablesLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  const tables = tablesData?.tables ?? [];
  const entries = entriesData?.entries ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          Tables de référence
        </h1>
        <button
          onClick={() => {
            setEditingTable(null);
            setShowTableEditor(true);
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Nouvelle table
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Tables list */}
        <div className="lg:col-span-1 bg-white shadow rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-4">Tables</h2>
          <div className="space-y-2">
            {tables.map((table) => (
              <button
                key={table.id}
                onClick={() => setSelectedTable(table)}
                className={`w-full text-left px-3 py-2 rounded-md transition ${
                  selectedTable?.id === table.id
                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                    : 'hover:bg-gray-50'
                }`}
              >
                <div className="font-medium">{table.name}</div>
                {table.description && (
                  <div className="text-xs text-gray-500 truncate">
                    {table.description}
                  </div>
                )}
              </button>
            ))}
            {tables.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-4">
                Aucune table
              </p>
            )}
          </div>
        </div>

        {/* Entries */}
        <div className="lg:col-span-3 bg-white shadow rounded-lg p-4">
          {selectedTable ? (
            <>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold">{selectedTable.name}</h2>
                  {selectedTable.description && (
                    <p className="text-sm text-gray-500">
                      {selectedTable.description}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowCSVImport(true)}
                    className="px-3 py-1.5 border border-gray-300 rounded-md text-sm hover:bg-gray-50"
                  >
                    Import CSV
                  </button>
                  <button
                    onClick={() => {
                      setEditingEntry(null);
                      setShowEntryEditor(true);
                    }}
                    className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
                  >
                    Nouvelle entrée
                  </button>
                </div>
              </div>

              <div className="mb-4">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Rechercher..."
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>

              {entriesLoading ? (
                <LoadingSpinner />
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left">Clé</th>
                        <th className="px-4 py-2 text-left">Données</th>
                        <th className="px-4 py-2 text-left">Validité</th>
                        <th className="px-4 py-2 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {entries.map((entry) => (
                        <tr key={entry.id}>
                          <td className="px-4 py-2 font-mono font-medium">
                            {entry.key}
                          </td>
                          <td className="px-4 py-2 font-mono text-xs max-w-md truncate">
                            {entry.data}
                          </td>
                          <td className="px-4 py-2 text-gray-500">
                            {entry.valid_from}
                            {entry.valid_to && ` → ${entry.valid_to}`}
                          </td>
                          <td className="px-4 py-2 text-right">
                            <button
                              onClick={() => {
                                setEditingEntry(entry);
                                setShowEntryEditor(true);
                              }}
                              className="text-blue-600 hover:text-blue-900 mr-3"
                            >
                              Modifier
                            </button>
                            <button
                              onClick={() => {
                                if (
                                  confirm('Supprimer cette entrée ?')
                                ) {
                                  deleteEntryMutation.mutate(entry.id);
                                }
                              }}
                              className="text-red-600 hover:text-red-900"
                            >
                              Supprimer
                            </button>
                          </td>
                        </tr>
                      ))}
                      {entries.length === 0 && (
                        <tr>
                          <td
                            colSpan={4}
                            className="px-4 py-8 text-center text-gray-500"
                          >
                            Aucune entrée
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-12 text-gray-500">
              Sélectionnez une table pour voir ses entrées
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showTableEditor && (
        <TableEditor
          table={editingTable}
          onClose={() => {
            setShowTableEditor(false);
            setEditingTable(null);
          }}
          onSave={(data) => {
            if (editingTable) {
              updateTableMutation.mutate({ id: editingTable.id, data });
            } else {
              createTableMutation.mutate(data);
            }
          }}
        />
      )}

      {showEntryEditor && selectedTable && (
        <EntryEditor
          entry={editingEntry}
          tableId={selectedTable.id}
          onClose={() => {
            setShowEntryEditor(false);
            setEditingEntry(null);
          }}
          onSave={(data) => {
            if (editingEntry) {
              updateEntryMutation.mutate({ id: editingEntry.id, data });
            } else {
              createEntryMutation.mutate(data);
            }
          }}
        />
      )}

      {showCSVImport && selectedTable && (
        <CSVImportModal
          tableId={selectedTable.id}
          onClose={() => setShowCSVImport(false)}
          onImport={(entries) => importEntriesMutation.mutate(entries)}
        />
      )}
    </div>
  );
}
