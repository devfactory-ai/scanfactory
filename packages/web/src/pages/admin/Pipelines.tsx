/**
 * Pipeline Configuration UI
 *
 * View and edit pipeline configurations
 * T029: Pipeline configuration UI
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorAlert } from '../../components/ErrorAlert';

interface Pipeline {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  ocr_schema: string;
  rule_steps: string;
  batch_config: string;
  field_display: string | null;
  active: number;
}

interface PipelineDetail extends Pipeline {
  rule_steps_parsed: Array<{
    name: string;
    type: string;
    config: Record<string, unknown>;
  }>;
  batch_config_parsed: {
    group_by: string;
    max_count: number;
    max_days: number;
    export_template: string;
  };
}

function PipelineEditor({
  pipeline,
  onClose,
  onSave,
}: {
  pipeline: PipelineDetail;
  onClose: () => void;
  onSave: (data: Partial<Pipeline>) => void;
}) {
  const [displayName, setDisplayName] = useState(pipeline.display_name);
  const [description, setDescription] = useState(pipeline.description || '');
  const [ruleSteps, setRuleSteps] = useState(
    JSON.stringify(pipeline.rule_steps_parsed, null, 2)
  );
  const [batchConfig, setBatchConfig] = useState(
    JSON.stringify(pipeline.batch_config_parsed, null, 2)
  );
  const [fieldDisplay, setFieldDisplay] = useState(
    pipeline.field_display || '{}'
  );
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    try {
      // Validate JSON
      JSON.parse(ruleSteps);
      JSON.parse(batchConfig);
      JSON.parse(fieldDisplay);

      onSave({
        display_name: displayName,
        description: description || null,
        rule_steps: ruleSteps,
        batch_config: batchConfig,
        field_display: fieldDisplay,
      });
    } catch (e) {
      setError('JSON invalide. Vérifiez la syntaxe.');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-xl font-semibold">
            Modifier: {pipeline.display_name}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)] space-y-4">
          {error && <ErrorAlert error={error} />}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nom d'affichage
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nom interne
              </label>
              <input
                type="text"
                value={pipeline.name}
                disabled
                className="w-full rounded-md border-gray-300 bg-gray-100 text-gray-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Schéma OCR
              </label>
              <input
                type="text"
                value={pipeline.ocr_schema}
                disabled
                className="w-full rounded-md border-gray-300 bg-gray-100 text-gray-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Étapes de règles (JSON)
            </label>
            <textarea
              value={ruleSteps}
              onChange={(e) => setRuleSteps(e.target.value)}
              rows={10}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 font-mono text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Configuration des lots (JSON)
            </label>
            <textarea
              value={batchConfig}
              onChange={(e) => setBatchConfig(e.target.value)}
              rows={6}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 font-mono text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Affichage des champs (JSON)
            </label>
            <textarea
              value={fieldDisplay}
              onChange={(e) => setFieldDisplay(e.target.value)}
              rows={4}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 font-mono text-sm"
            />
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
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminPipelines() {
  const queryClient = useQueryClient();
  const [editingPipeline, setEditingPipeline] = useState<PipelineDetail | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-pipelines'],
    queryFn: () =>
      api.get<{ pipelines: Pipeline[] }>('/api/admin/pipelines/full'),
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<Pipeline>;
    }) => {
      return api.put(`/api/admin/pipelines/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-pipelines'] });
      setEditingPipeline(null);
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return <ErrorAlert error="Erreur lors du chargement des pipelines" />;
  }

  const pipelines = data?.pipelines ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          Configuration des Pipelines
        </h1>
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Pipeline
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Schéma OCR
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Règles
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Statut
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {pipelines.map((pipeline) => {
              let ruleCount = 0;
              try {
                const rules = JSON.parse(pipeline.rule_steps);
                ruleCount = Array.isArray(rules) ? rules.length : 0;
              } catch {
                // ignore
              }

              return (
                <tr key={pipeline.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {pipeline.display_name}
                    </div>
                    <div className="text-sm text-gray-500">{pipeline.name}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {pipeline.ocr_schema}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {ruleCount} étapes
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        pipeline.active
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {pipeline.active ? 'Actif' : 'Inactif'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => {
                        let ruleStepsParsed = [];
                        let batchConfigParsed = {};
                        try {
                          ruleStepsParsed = JSON.parse(pipeline.rule_steps);
                          batchConfigParsed = JSON.parse(pipeline.batch_config);
                        } catch {
                          // ignore
                        }
                        setEditingPipeline({
                          ...pipeline,
                          rule_steps_parsed: ruleStepsParsed,
                          batch_config_parsed: batchConfigParsed as PipelineDetail['batch_config_parsed'],
                        });
                      }}
                      className="text-blue-600 hover:text-blue-900"
                    >
                      Modifier
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <p className="text-sm text-yellow-800">
          <strong>Note:</strong> Pour ajouter un nouveau pipeline, vous devez
          créer le code des règles correspondantes dans{' '}
          <code className="bg-yellow-100 px-1 rounded">
            packages/api/src/pipelines/
          </code>{' '}
          puis insérer la configuration en base de données.
        </p>
      </div>

      {editingPipeline && (
        <PipelineEditor
          pipeline={editingPipeline}
          onClose={() => setEditingPipeline(null)}
          onSave={(data) =>
            updateMutation.mutate({ id: editingPipeline.id, data })
          }
        />
      )}
    </div>
  );
}
