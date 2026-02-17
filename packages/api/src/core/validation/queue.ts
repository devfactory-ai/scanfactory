import type { Env } from '../../index';

export interface DocumentWithPipeline {
  id: string;
  pipeline_id: string;
  pipeline_name: string;
  pipeline_display_name: string;
  batch_id: string | null;
  scan_r2_key: string;
  status: string;
  extracted_data: string;
  computed_data: string | null;
  confidence_score: number | null;
  extraction_modes: string | null;
  anomalies: string | null;
  metadata: string | null;
  scanned_by: string | null;
  validated_by: string | null;
  validated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface QueueFilters {
  pipeline_id?: string;
  status?: string;
  min_confidence?: number;
  max_confidence?: number;
  batch_id?: string;
}

export interface QueueOptions {
  filters?: QueueFilters;
  sort_by?: 'created_at' | 'confidence_score';
  sort_order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export async function getValidationQueue(
  db: D1Database,
  options: QueueOptions = {}
): Promise<{ documents: DocumentWithPipeline[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  // Default to pending status
  const status = options.filters?.status ?? 'pending';
  conditions.push('d.status = ?');
  params.push(status);

  if (options.filters?.pipeline_id) {
    conditions.push('d.pipeline_id = ?');
    params.push(options.filters.pipeline_id);
  }

  if (options.filters?.batch_id) {
    conditions.push('d.batch_id = ?');
    params.push(options.filters.batch_id);
  }

  if (options.filters?.min_confidence !== undefined) {
    conditions.push('d.confidence_score >= ?');
    params.push(options.filters.min_confidence);
  }

  if (options.filters?.max_confidence !== undefined) {
    conditions.push('d.confidence_score <= ?');
    params.push(options.filters.max_confidence);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Sort: oldest first by default, or by confidence
  const sortBy = options.sort_by ?? 'created_at';
  const sortOrder = options.sort_order ?? 'asc';
  const orderClause = `ORDER BY d.${sortBy} ${sortOrder.toUpperCase()}`;

  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;

  // Get total count
  const countResult = await db
    .prepare(
      `SELECT COUNT(*) as count FROM documents d ${whereClause}`
    )
    .bind(...params)
    .first<{ count: number }>();

  // Get documents with pipeline info
  const query = `
    SELECT
      d.id, d.pipeline_id, p.name as pipeline_name, p.display_name as pipeline_display_name,
      d.batch_id, d.scan_r2_key, d.status, d.extracted_data, d.computed_data,
      d.confidence_score, d.extraction_modes, d.anomalies, d.metadata,
      d.scanned_by, d.validated_by, d.validated_at, d.created_at, d.updated_at
    FROM documents d
    JOIN pipelines p ON d.pipeline_id = p.id
    ${whereClause}
    ${orderClause}
    LIMIT ? OFFSET ?
  `;

  const result = await db
    .prepare(query)
    .bind(...params, limit, offset)
    .all<DocumentWithPipeline>();

  return {
    documents: result.results ?? [],
    total: countResult?.count ?? 0,
  };
}

export async function getDocumentById(
  db: D1Database,
  documentId: string
): Promise<DocumentWithPipeline | null> {
  const query = `
    SELECT
      d.id, d.pipeline_id, p.name as pipeline_name, p.display_name as pipeline_display_name,
      d.batch_id, d.scan_r2_key, d.status, d.extracted_data, d.computed_data,
      d.confidence_score, d.extraction_modes, d.anomalies, d.metadata,
      d.scanned_by, d.validated_by, d.validated_at, d.created_at, d.updated_at
    FROM documents d
    JOIN pipelines p ON d.pipeline_id = p.id
    WHERE d.id = ?
  `;

  return db.prepare(query).bind(documentId).first<DocumentWithPipeline>();
}

export async function updateDocument(
  db: D1Database,
  documentId: string,
  updates: {
    extracted_data?: Record<string, unknown>;
    computed_data?: Record<string, unknown>;
    anomalies?: Array<{ type: string; message: string; severity: string }>;
    status?: string;
    validated_by?: string;
  }
): Promise<void> {
  const setClauses: string[] = ['updated_at = datetime(\'now\')'];
  const params: unknown[] = [];

  if (updates.extracted_data !== undefined) {
    setClauses.push('extracted_data = ?');
    params.push(JSON.stringify(updates.extracted_data));
  }

  if (updates.computed_data !== undefined) {
    setClauses.push('computed_data = ?');
    params.push(JSON.stringify(updates.computed_data));
  }

  if (updates.anomalies !== undefined) {
    setClauses.push('anomalies = ?');
    params.push(JSON.stringify(updates.anomalies));
  }

  if (updates.status !== undefined) {
    setClauses.push('status = ?');
    params.push(updates.status);

    if (updates.status === 'validated' || updates.status === 'rejected') {
      setClauses.push('validated_at = datetime(\'now\')');
    }
  }

  if (updates.validated_by !== undefined) {
    setClauses.push('validated_by = ?');
    params.push(updates.validated_by);
  }

  params.push(documentId);

  await db
    .prepare(`UPDATE documents SET ${setClauses.join(', ')} WHERE id = ?`)
    .bind(...params)
    .run();
}
