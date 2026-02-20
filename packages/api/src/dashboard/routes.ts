/**
 * Dashboard Routes
 *
 * API endpoints for dashboard KPIs and reports
 * T026: Dashboard API
 */

import { Hono } from 'hono';
import type { Env } from '../index';
import { authMiddleware, roleGuard } from '../middleware/auth';
import { generateCSV, generateExcelXML, storeExport } from './export';
import { ValidationError } from '../lib/errors';

const dashboardRoutes = new Hono<{ Bindings: Env }>();

// All dashboard routes require authentication
dashboardRoutes.use('*', authMiddleware);

interface KPIResult {
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

interface TrendData {
  date: string;
  documents_scanned: number;
  documents_validated: number;
  avg_confidence: number;
}

/**
 * GET /api/dashboard/kpis
 *
 * Get key performance indicators by pipeline
 *
 * Query parameters:
 * - pipeline_id: Filter by specific pipeline (optional)
 * - date_from: Start date for metrics (default: today)
 * - date_to: End date for metrics (default: today)
 */
dashboardRoutes.get('/kpis', async (c) => {
  const query = c.req.query();
  const pipelineId = query.pipeline_id;
  const today = new Date().toISOString().split('T')[0];
  const dateFrom = query.date_from || today;
  const dateTo = query.date_to || today;

  // Build base query for KPIs
  let pipelineFilter = '';
  const params: unknown[] = [dateFrom, dateTo];

  if (pipelineId) {
    pipelineFilter = 'AND d.pipeline_id = ?';
    params.push(pipelineId);
  }

  // Get document counts by pipeline
  const documentsQuery = `
    SELECT
      p.id as pipeline_id,
      p.display_name as pipeline_name,
      COUNT(CASE WHEN date(d.created_at) = date('now') THEN 1 END) as documents_today,
      COUNT(CASE WHEN d.status = 'pending' THEN 1 END) as documents_pending,
      COUNT(CASE WHEN d.status = 'validated' THEN 1 END) as documents_validated,
      COUNT(CASE WHEN d.status = 'rejected' THEN 1 END) as documents_rejected,
      COALESCE(AVG(d.confidence_score), 0) as avg_confidence,
      COALESCE(AVG(
        CASE WHEN d.validated_at IS NOT NULL
        THEN (julianday(d.validated_at) - julianday(d.created_at)) * 86400
        END
      ), 0) as avg_validation_time_seconds
    FROM pipelines p
    LEFT JOIN documents d ON p.id = d.pipeline_id
      AND date(d.created_at) BETWEEN ? AND ?
      ${pipelineFilter}
    WHERE p.active = 1
    GROUP BY p.id, p.display_name
  `;

  const documentsResult = await c.env.DB.prepare(documentsQuery)
    .bind(...params)
    .all<{
      pipeline_id: string;
      pipeline_name: string;
      documents_today: number;
      documents_pending: number;
      documents_validated: number;
      documents_rejected: number;
      avg_confidence: number;
      avg_validation_time_seconds: number;
    }>();

  // Get batch counts by pipeline
  const batchParams: unknown[] = [];
  let batchPipelineFilter = '';
  if (pipelineId) {
    batchPipelineFilter = 'WHERE b.pipeline_id = ?';
    batchParams.push(pipelineId);
  }

  const batchesQuery = `
    SELECT
      p.id as pipeline_id,
      COUNT(CASE WHEN b.status = 'open' THEN 1 END) as batches_open,
      COUNT(CASE WHEN b.status IN ('closed', 'verified', 'exported') THEN 1 END) as batches_closed
    FROM pipelines p
    LEFT JOIN batches b ON p.id = b.pipeline_id
    ${batchPipelineFilter ? batchPipelineFilter.replace('WHERE', 'AND') : ''}
    WHERE p.active = 1
    GROUP BY p.id
  `;

  const batchesResult = await c.env.DB.prepare(
    batchPipelineFilter ? batchesQuery : batchesQuery.replace('AND', 'WHERE').replace('WHERE p.active = 1', 'AND p.active = 1')
  )
    .bind(...batchParams)
    .all<{
      pipeline_id: string;
      batches_open: number;
      batches_closed: number;
    }>();

  // Merge results
  const batchMap = new Map(
    (batchesResult.results ?? []).map((b) => [b.pipeline_id, b])
  );

  const kpis: KPIResult[] = (documentsResult.results ?? []).map((doc) => {
    const batch = batchMap.get(doc.pipeline_id);
    return {
      ...doc,
      avg_confidence: Math.round(doc.avg_confidence * 100) / 100,
      avg_validation_time_seconds: Math.round(doc.avg_validation_time_seconds),
      batches_open: batch?.batches_open ?? 0,
      batches_closed: batch?.batches_closed ?? 0,
    };
  });

  // Calculate totals
  const totals = {
    documents_today: kpis.reduce((sum, k) => sum + k.documents_today, 0),
    documents_pending: kpis.reduce((sum, k) => sum + k.documents_pending, 0),
    documents_validated: kpis.reduce((sum, k) => sum + k.documents_validated, 0),
    documents_rejected: kpis.reduce((sum, k) => sum + k.documents_rejected, 0),
    batches_open: kpis.reduce((sum, k) => sum + k.batches_open, 0),
    batches_closed: kpis.reduce((sum, k) => sum + k.batches_closed, 0),
    avg_confidence:
      kpis.length > 0
        ? Math.round(
            (kpis.reduce((sum, k) => sum + k.avg_confidence, 0) / kpis.length) *
              100
          ) / 100
        : 0,
  };

  return c.json({
    date_from: dateFrom,
    date_to: dateTo,
    pipelines: kpis,
    totals,
  });
});

/**
 * GET /api/dashboard/trends
 *
 * Get trend data for charts
 *
 * Query parameters:
 * - pipeline_id: Filter by specific pipeline (optional)
 * - days: Number of days to include (default: 30, max: 90)
 */
dashboardRoutes.get('/trends', async (c) => {
  const query = c.req.query();
  const pipelineId = query.pipeline_id;
  const days = Math.min(parseInt(query.days || '30', 10), 90);

  let pipelineFilter = '';
  const params: unknown[] = [days];

  if (pipelineId) {
    pipelineFilter = 'AND pipeline_id = ?';
    params.push(pipelineId);
  }

  const trendsQuery = `
    SELECT
      date(created_at) as date,
      COUNT(*) as documents_scanned,
      COUNT(CASE WHEN status = 'validated' THEN 1 END) as documents_validated,
      COALESCE(AVG(confidence_score), 0) as avg_confidence
    FROM documents
    WHERE date(created_at) >= date('now', '-' || ? || ' days')
    ${pipelineFilter}
    GROUP BY date(created_at)
    ORDER BY date(created_at) ASC
  `;

  const result = await c.env.DB.prepare(trendsQuery)
    .bind(...params)
    .all<TrendData>();

  return c.json({
    days,
    pipeline_id: pipelineId || 'all',
    trends: (result.results ?? []).map((t) => ({
      ...t,
      avg_confidence: Math.round(t.avg_confidence * 100) / 100,
    })),
  });
});

/**
 * GET /api/dashboard/reports
 *
 * Get filterable report data
 *
 * Query parameters:
 * - pipeline_id: Filter by pipeline
 * - status: Filter by document status
 * - date_from: Start date
 * - date_to: End date
 * - group_by: Grouping (day, week, month, company)
 * - limit: Number of results (default: 100)
 * - offset: Pagination offset
 */
dashboardRoutes.get('/reports', async (c) => {
  const query = c.req.query();
  const pipelineId = query.pipeline_id;
  const status = query.status;
  const dateFrom = query.date_from;
  const dateTo = query.date_to;
  const groupBy = query.group_by || 'day';
  const limit = Math.min(parseInt(query.limit || '100', 10), 1000);
  const offset = parseInt(query.offset || '0', 10);

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (pipelineId) {
    conditions.push('d.pipeline_id = ?');
    params.push(pipelineId);
  }

  if (status) {
    conditions.push('d.status = ?');
    params.push(status);
  }

  if (dateFrom) {
    conditions.push("date(d.created_at) >= ?");
    params.push(dateFrom);
  }

  if (dateTo) {
    conditions.push("date(d.created_at) <= ?");
    params.push(dateTo);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  let groupByClause: string;
  let selectGroup: string;

  switch (groupBy) {
    case 'week':
      selectGroup = "strftime('%Y-W%W', d.created_at) as period";
      groupByClause = "strftime('%Y-W%W', d.created_at)";
      break;
    case 'month':
      selectGroup = "strftime('%Y-%m', d.created_at) as period";
      groupByClause = "strftime('%Y-%m', d.created_at)";
      break;
    case 'company':
      selectGroup =
        "COALESCE(json_extract(d.computed_data, '$.company_name_resolved'), 'Non identifié') as period";
      groupByClause =
        "json_extract(d.computed_data, '$.company_name_resolved')";
      break;
    default: // day
      selectGroup = "date(d.created_at) as period";
      groupByClause = "date(d.created_at)";
  }

  const reportQuery = `
    SELECT
      ${selectGroup},
      p.display_name as pipeline_name,
      COUNT(*) as document_count,
      COUNT(CASE WHEN d.status = 'validated' THEN 1 END) as validated_count,
      COUNT(CASE WHEN d.status = 'rejected' THEN 1 END) as rejected_count,
      COUNT(CASE WHEN d.status = 'pending' THEN 1 END) as pending_count,
      COALESCE(SUM(CAST(json_extract(d.computed_data, '$.reimbursement_amount') AS REAL)), 0) as total_reimbursement,
      COALESCE(AVG(d.confidence_score), 0) as avg_confidence
    FROM documents d
    JOIN pipelines p ON d.pipeline_id = p.id
    ${whereClause}
    GROUP BY ${groupByClause}, p.id
    ORDER BY period DESC
    LIMIT ? OFFSET ?
  `;

  params.push(limit, offset);

  const result = await c.env.DB.prepare(reportQuery)
    .bind(...params)
    .all<{
      period: string;
      pipeline_name: string;
      document_count: number;
      validated_count: number;
      rejected_count: number;
      pending_count: number;
      total_reimbursement: number;
      avg_confidence: number;
    }>();

  // Get total count for pagination
  const countQuery = `
    SELECT COUNT(DISTINCT ${groupByClause} || '-' || p.id) as total
    FROM documents d
    JOIN pipelines p ON d.pipeline_id = p.id
    ${whereClause}
  `;

  const countResult = await c.env.DB.prepare(countQuery)
    .bind(...params.slice(0, -2))
    .first<{ total: number }>();

  return c.json({
    group_by: groupBy,
    filters: {
      pipeline_id: pipelineId,
      status,
      date_from: dateFrom,
      date_to: dateTo,
    },
    data: (result.results ?? []).map((r) => ({
      ...r,
      total_reimbursement: Math.round(r.total_reimbursement * 100) / 100,
      avg_confidence: Math.round(r.avg_confidence * 100) / 100,
    })),
    pagination: {
      limit,
      offset,
      total: countResult?.total ?? 0,
    },
  });
});

/**
 * GET /api/dashboard/operator-stats
 *
 * Get statistics per operator
 */
dashboardRoutes.get('/operator-stats', async (c) => {
  const query = c.req.query();
  const dateFrom = query.date_from;
  const dateTo = query.date_to;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (dateFrom) {
    conditions.push("date(d.validated_at) >= ?");
    params.push(dateFrom);
  }

  if (dateTo) {
    conditions.push("date(d.validated_at) <= ?");
    params.push(dateTo);
  }

  const whereClause =
    conditions.length > 0
      ? `WHERE d.validated_by IS NOT NULL AND ${conditions.join(' AND ')}`
      : 'WHERE d.validated_by IS NOT NULL';

  const statsQuery = `
    SELECT
      u.id as user_id,
      u.name as user_name,
      COUNT(*) as documents_validated,
      AVG((julianday(d.validated_at) - julianday(d.created_at)) * 86400) as avg_validation_time_seconds,
      COUNT(DISTINCT date(d.validated_at)) as active_days
    FROM documents d
    JOIN users u ON d.validated_by = u.id
    ${whereClause}
    GROUP BY u.id, u.name
    ORDER BY documents_validated DESC
  `;

  const result = await c.env.DB.prepare(statsQuery)
    .bind(...params)
    .all<{
      user_id: string;
      user_name: string;
      documents_validated: number;
      avg_validation_time_seconds: number;
      active_days: number;
    }>();

  return c.json({
    filters: { date_from: dateFrom, date_to: dateTo },
    operators: (result.results ?? []).map((r) => ({
      ...r,
      avg_validation_time_seconds: Math.round(r.avg_validation_time_seconds),
      documents_per_day:
        r.active_days > 0
          ? Math.round((r.documents_validated / r.active_days) * 10) / 10
          : 0,
    })),
  });
});

/**
 * POST /api/dashboard/reports/export
 *
 * Generate and store a report export
 *
 * Body:
 * - format: 'csv' | 'excel'
 * - title: Report title
 * - filters: Same as /reports endpoint
 */
dashboardRoutes.post('/reports/export', roleGuard('admin'), async (c) => {
  const body = await c.req.json<{
    format: 'csv' | 'excel';
    title?: string;
    pipeline_id?: string;
    status?: string;
    date_from?: string;
    date_to?: string;
    group_by?: string;
  }>();

  const format = body.format;
  if (!format || !['csv', 'excel'].includes(format)) {
    throw new ValidationError('Format invalide. Utilisez "csv" ou "excel"');
  }

  const title = body.title || 'Rapport ScanFactory';
  const pipelineId = body.pipeline_id;
  const status = body.status;
  const dateFrom = body.date_from;
  const dateTo = body.date_to;
  const groupBy = body.group_by || 'day';

  // Build query (same logic as /reports)
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (pipelineId) {
    conditions.push('d.pipeline_id = ?');
    params.push(pipelineId);
  }

  if (status) {
    conditions.push('d.status = ?');
    params.push(status);
  }

  if (dateFrom) {
    conditions.push("date(d.created_at) >= ?");
    params.push(dateFrom);
  }

  if (dateTo) {
    conditions.push("date(d.created_at) <= ?");
    params.push(dateTo);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  let groupByClause: string;
  let selectGroup: string;

  switch (groupBy) {
    case 'week':
      selectGroup = "strftime('%Y-W%W', d.created_at) as period";
      groupByClause = "strftime('%Y-W%W', d.created_at)";
      break;
    case 'month':
      selectGroup = "strftime('%Y-%m', d.created_at) as period";
      groupByClause = "strftime('%Y-%m', d.created_at)";
      break;
    case 'company':
      selectGroup =
        "COALESCE(json_extract(d.computed_data, '$.company_name_resolved'), 'Non identifié') as period";
      groupByClause =
        "json_extract(d.computed_data, '$.company_name_resolved')";
      break;
    default:
      selectGroup = "date(d.created_at) as period";
      groupByClause = "date(d.created_at)";
  }

  const reportQuery = `
    SELECT
      ${selectGroup},
      p.display_name as pipeline_name,
      COUNT(*) as document_count,
      COUNT(CASE WHEN d.status = 'validated' THEN 1 END) as validated_count,
      COUNT(CASE WHEN d.status = 'rejected' THEN 1 END) as rejected_count,
      COUNT(CASE WHEN d.status = 'pending' THEN 1 END) as pending_count,
      COALESCE(SUM(CAST(json_extract(d.computed_data, '$.reimbursement_amount') AS REAL)), 0) as total_reimbursement,
      COALESCE(AVG(d.confidence_score), 0) as avg_confidence
    FROM documents d
    JOIN pipelines p ON d.pipeline_id = p.id
    ${whereClause}
    GROUP BY ${groupByClause}, p.id
    ORDER BY period DESC
  `;

  const result = await c.env.DB.prepare(reportQuery)
    .bind(...params)
    .all<{
      period: string;
      pipeline_name: string;
      document_count: number;
      validated_count: number;
      rejected_count: number;
      pending_count: number;
      total_reimbursement: number;
      avg_confidence: number;
    }>();

  const data = (result.results ?? []).map((r) => ({
    ...r,
    total_reimbursement: Math.round(r.total_reimbursement * 100) / 100,
    avg_confidence: Math.round(r.avg_confidence * 100) / 100,
  }));

  // Generate export content
  const options = {
    format,
    title,
    filters: {
      pipeline_id: pipelineId,
      status,
      date_from: dateFrom,
      date_to: dateTo,
      group_by: groupBy,
    },
    data,
  };

  const content =
    format === 'excel' ? generateExcelXML(options) : generateCSV(options);

  // Store in R2
  const filename = `rapport_${new Date().toISOString().split('T')[0]}`;
  const exportResult = await storeExport(c.env, content, format, filename);

  return c.json({
    success: true,
    export: {
      key: exportResult.key,
      download_url: exportResult.url,
      format,
      rows: data.length,
      created_at: new Date().toISOString(),
    },
  });
});

/**
 * GET /api/dashboard/exports/:id/:filename
 *
 * Download an exported report
 */
dashboardRoutes.get('/exports/:id/:filename', async (c) => {
  const exportId = c.req.param('id');
  const filename = c.req.param('filename');
  const key = `reports/${exportId}/${filename}`;

  const object = await c.env.EXPORTS.get(key);

  if (!object) {
    return c.json({ error: 'Export non trouvé' }, 404);
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Cache-Control', 'private, max-age=3600');

  return new Response(object.body, { headers });
});

export { dashboardRoutes };
