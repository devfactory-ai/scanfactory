/**
 * Dashboard Page
 *
 * KPI cards, charts, and reports view
 * T027: Dashboard UI
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ErrorAlert } from '../components/ErrorAlert';

interface KPI {
  pipeline_id: string;
  pipeline_name: string;
  documents_today: number;
  documents_pending: number;
  documents_validated: number;
  documents_rejected: number;
  batches_open: number;
  batches_closed: number;
  avg_confidence: number;
  avg_validation_time_seconds: number;
}

interface KPIResponse {
  date_from: string;
  date_to: string;
  pipelines: KPI[];
  totals: {
    documents_today: number;
    documents_pending: number;
    documents_validated: number;
    documents_rejected: number;
    batches_open: number;
    batches_closed: number;
    avg_confidence: number;
  };
}

interface TrendData {
  date: string;
  documents_scanned: number;
  documents_validated: number;
  avg_confidence: number;
}

interface TrendResponse {
  days: number;
  pipeline_id: string;
  trends: TrendData[];
}

interface OperatorStats {
  user_id: string;
  user_name: string;
  documents_validated: number;
  avg_validation_time_seconds: number;
  active_days: number;
  documents_per_day: number;
}

function KPICard({
  title,
  value,
  subtitle,
  color = 'blue',
  icon,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  color?: 'blue' | 'green' | 'yellow' | 'red' | 'purple';
  icon?: React.ReactNode;
}) {
  const colorClasses = {
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    green: 'bg-green-50 border-green-200 text-green-700',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-700',
    red: 'bg-red-50 border-red-200 text-red-700',
    purple: 'bg-purple-50 border-purple-200 text-purple-700',
  };

  return (
    <div className={`rounded-lg border p-4 ${colorClasses[color]}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium opacity-75">{title}</p>
          <p className="text-2xl font-bold">{value}</p>
          {subtitle && <p className="text-xs opacity-60 mt-1">{subtitle}</p>}
        </div>
        {icon && <div className="text-3xl opacity-50">{icon}</div>}
      </div>
    </div>
  );
}

function TrendChart({ data }: { data: TrendData[] }) {
  if (data.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-gray-500">
        Aucune donnée disponible
      </div>
    );
  }

  const maxScanned = Math.max(...data.map((d) => d.documents_scanned), 1);

  return (
    <div className="h-48">
      <div className="flex items-end h-40 gap-1">
        {data.slice(-30).map((item, index) => {
          const height = (item.documents_scanned / maxScanned) * 100;
          const validatedHeight = (item.documents_validated / maxScanned) * 100;

          return (
            <div
              key={index}
              className="flex-1 flex flex-col items-center justify-end group relative"
            >
              <div
                className="w-full bg-blue-200 rounded-t relative"
                style={{ height: `${height}%`, minHeight: '2px' }}
              >
                <div
                  className="absolute bottom-0 left-0 right-0 bg-green-500 rounded-t"
                  style={{ height: `${(validatedHeight / height) * 100}%` }}
                />
              </div>
              <div className="absolute bottom-full mb-2 hidden group-hover:block bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10">
                {item.date}: {item.documents_scanned} scannés,{' '}
                {item.documents_validated} validés
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-xs text-gray-500 mt-2">
        <span>{data[0]?.date}</span>
        <span>{data[data.length - 1]?.date}</span>
      </div>
    </div>
  );
}

function OperatorTable({ operators }: { operators: OperatorStats[] }) {
  if (operators.length === 0) {
    return (
      <div className="text-center py-4 text-gray-500">
        Aucune statistique opérateur disponible
      </div>
    );
  }

  return (
    <table className="min-w-full divide-y divide-gray-200">
      <thead className="bg-gray-50">
        <tr>
          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
            Opérateur
          </th>
          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
            Documents
          </th>
          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
            Temps moyen
          </th>
          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
            /jour
          </th>
        </tr>
      </thead>
      <tbody className="bg-white divide-y divide-gray-200">
        {operators.map((op) => (
          <tr key={op.user_id}>
            <td className="px-4 py-2 text-sm font-medium text-gray-900">
              {op.user_name}
            </td>
            <td className="px-4 py-2 text-sm text-right text-gray-600">
              {op.documents_validated}
            </td>
            <td className="px-4 py-2 text-sm text-right text-gray-600">
              {formatDuration(op.avg_validation_time_seconds)}
            </td>
            <td className="px-4 py-2 text-sm text-right text-gray-600">
              {op.documents_per_day}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${minutes}m ${secs}s`;
}

export function Dashboard() {
  const [selectedPipeline, setSelectedPipeline] = useState<string>('');
  const [dateRange, setDateRange] = useState<{ from: string; to: string }>(() => {
    const today = new Date().toISOString().split('T')[0];
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];
    return { from: thirtyDaysAgo, to: today };
  });

  // Fetch KPIs
  const {
    data: kpiData,
    isLoading: kpiLoading,
    error: kpiError,
  } = useQuery({
    queryKey: ['dashboard-kpis', selectedPipeline, dateRange],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedPipeline) params.set('pipeline_id', selectedPipeline);
      params.set('date_from', dateRange.from);
      params.set('date_to', dateRange.to);
      return api.get<KPIResponse>(`/api/dashboard/kpis?${params}`);
    },
    refetchInterval: 60000, // Refresh every minute
  });

  // Fetch trends
  const { data: trendData, isLoading: trendLoading } = useQuery({
    queryKey: ['dashboard-trends', selectedPipeline],
    queryFn: async () => {
      const params = new URLSearchParams({ days: '30' });
      if (selectedPipeline) params.set('pipeline_id', selectedPipeline);
      return api.get<TrendResponse>(`/api/dashboard/trends?${params}`);
    },
  });

  // Fetch operator stats
  const { data: operatorData, isLoading: operatorLoading } = useQuery({
    queryKey: ['dashboard-operators', dateRange],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('date_from', dateRange.from);
      params.set('date_to', dateRange.to);
      return api.get<{ operators: OperatorStats[] }>(
        `/api/dashboard/operator-stats?${params}`
      );
    },
  });

  // Fetch pipelines for filter
  const { data: pipelinesData } = useQuery({
    queryKey: ['pipelines'],
    queryFn: () => api.get<{ pipelines: { id: string; display_name: string }[] }>('/api/admin/pipelines'),
  });

  if (kpiLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  if (kpiError) {
    return <ErrorAlert error="Erreur lors du chargement du dashboard" />;
  }

  const totals = kpiData?.totals;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

        <div className="flex items-center gap-4">
          {/* Pipeline filter */}
          <select
            value={selectedPipeline}
            onChange={(e) => setSelectedPipeline(e.target.value)}
            className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            <option value="">Tous les pipelines</option>
            {pipelinesData?.pipelines.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name}
              </option>
            ))}
          </select>

          {/* Date range */}
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dateRange.from}
              onChange={(e) =>
                setDateRange((prev) => ({ ...prev, from: e.target.value }))
              }
              className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
            <span className="text-gray-500">-</span>
            <input
              type="date"
              value={dateRange.to}
              onChange={(e) =>
                setDateRange((prev) => ({ ...prev, to: e.target.value }))
              }
              className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Documents aujourd'hui"
          value={totals?.documents_today ?? 0}
          color="blue"
        />
        <KPICard
          title="En attente"
          value={totals?.documents_pending ?? 0}
          subtitle="À valider"
          color="yellow"
        />
        <KPICard
          title="Validés"
          value={totals?.documents_validated ?? 0}
          color="green"
        />
        <KPICard
          title="Rejetés"
          value={totals?.documents_rejected ?? 0}
          color="red"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KPICard
          title="Lots ouverts"
          value={totals?.batches_open ?? 0}
          color="purple"
        />
        <KPICard
          title="Lots clôturés"
          value={totals?.batches_closed ?? 0}
          color="green"
        />
        <KPICard
          title="Confiance moyenne"
          value={`${((totals?.avg_confidence ?? 0) * 100).toFixed(1)}%`}
          color="blue"
        />
      </div>

      {/* Charts and Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Trend Chart */}
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Tendance (30 jours)
          </h2>
          {trendLoading ? (
            <LoadingSpinner />
          ) : (
            <TrendChart data={trendData?.trends ?? []} />
          )}
          <div className="flex items-center gap-4 mt-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-blue-200 rounded" />
              <span className="text-gray-600">Scannés</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-green-500 rounded" />
              <span className="text-gray-600">Validés</span>
            </div>
          </div>
        </div>

        {/* Operator Stats */}
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Performance opérateurs
          </h2>
          {operatorLoading ? (
            <LoadingSpinner />
          ) : (
            <OperatorTable operators={operatorData?.operators ?? []} />
          )}
        </div>
      </div>

      {/* Pipeline breakdown */}
      {kpiData?.pipelines && kpiData.pipelines.length > 1 && (
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Par pipeline
          </h2>
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  Pipeline
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                  Aujourd'hui
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                  En attente
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                  Validés
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                  Lots ouverts
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                  Confiance
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {kpiData.pipelines.map((pipeline) => (
                <tr key={pipeline.pipeline_id}>
                  <td className="px-4 py-2 text-sm font-medium text-gray-900">
                    {pipeline.pipeline_name}
                  </td>
                  <td className="px-4 py-2 text-sm text-right text-gray-600">
                    {pipeline.documents_today}
                  </td>
                  <td className="px-4 py-2 text-sm text-right text-yellow-600 font-medium">
                    {pipeline.documents_pending}
                  </td>
                  <td className="px-4 py-2 text-sm text-right text-green-600">
                    {pipeline.documents_validated}
                  </td>
                  <td className="px-4 py-2 text-sm text-right text-gray-600">
                    {pipeline.batches_open}
                  </td>
                  <td className="px-4 py-2 text-sm text-right text-gray-600">
                    {(pipeline.avg_confidence * 100).toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Export buttons */}
      <div className="flex justify-end gap-4">
        <ExportButton format="csv" dateRange={dateRange} pipelineId={selectedPipeline} />
        <ExportButton format="excel" dateRange={dateRange} pipelineId={selectedPipeline} />
      </div>
    </div>
  );
}

function ExportButton({
  format,
  dateRange,
  pipelineId,
}: {
  format: 'csv' | 'excel';
  dateRange: { from: string; to: string };
  pipelineId?: string;
}) {
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      const response = await api.post<{
        success: boolean;
        export: { download_url: string };
      }>('/api/dashboard/reports/export', {
        format,
        title: 'Rapport ScanFactory',
        date_from: dateRange.from,
        date_to: dateRange.to,
        pipeline_id: pipelineId || undefined,
      });

      if (response.success && response.export.download_url) {
        window.open(response.export.download_url, '_blank');
      }
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={loading}
      className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
    >
      {loading ? (
        <span className="animate-spin mr-2">...</span>
      ) : format === 'excel' ? (
        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ) : (
        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      )}
      Export {format.toUpperCase()}
    </button>
  );
}

export default Dashboard;
