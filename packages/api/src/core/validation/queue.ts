import { query, update } from '../../lib/queryBuilder';

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

// Document columns for SELECT queries
const DOCUMENT_COLUMNS = [
  'd.id', 'd.pipeline_id', 'p.name as pipeline_name', 'p.display_name as pipeline_display_name',
  'd.batch_id', 'd.scan_r2_key', 'd.status', 'd.extracted_data', 'd.computed_data',
  'd.confidence_score', 'd.extraction_modes', 'd.anomalies', 'd.metadata',
  'd.scanned_by', 'd.validated_by', 'd.validated_at', 'd.created_at', 'd.updated_at',
];

export async function getValidationQueue(
  db: D1Database,
  options: QueueOptions = {}
): Promise<{ documents: DocumentWithPipeline[]; total: number }> {
  const status = options.filters?.status ?? 'pending';
  const sortBy = options.sort_by ?? 'created_at';
  const sortOrder = (options.sort_order ?? 'asc').toUpperCase() as 'ASC' | 'DESC';
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;

  // Build base query with filters
  const baseQuery = query()
    .from('documents', 'd')
    .join('pipelines', 'p', 'd.pipeline_id = p.id')
    .where('d.status = ?', status)
    .whereIf(!!options.filters?.pipeline_id, 'd.pipeline_id = ?', options.filters?.pipeline_id)
    .whereIf(!!options.filters?.batch_id, 'd.batch_id = ?', options.filters?.batch_id)
    .whereIf(options.filters?.min_confidence !== undefined, 'd.confidence_score >= ?', options.filters?.min_confidence)
    .whereIf(options.filters?.max_confidence !== undefined, 'd.confidence_score <= ?', options.filters?.max_confidence);

  // Get total count
  const countQuery = baseQuery.clone().buildCount();
  const countResult = await db
    .prepare(countQuery.sql)
    .bind(...countQuery.params)
    .first<{ count: number }>();

  // Get documents with pagination
  const selectQuery = baseQuery
    .select(...DOCUMENT_COLUMNS)
    .orderBy(`d.${sortBy}`, sortOrder)
    .limit(limit)
    .offset(offset)
    .buildSelect();

  const result = await db
    .prepare(selectQuery.sql)
    .bind(...selectQuery.params)
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
  const builder = update('documents')
    .setRaw("updated_at = datetime('now')")
    .setIf(updates.extracted_data !== undefined, 'extracted_data', JSON.stringify(updates.extracted_data))
    .setIf(updates.computed_data !== undefined, 'computed_data', JSON.stringify(updates.computed_data))
    .setIf(updates.anomalies !== undefined, 'anomalies', JSON.stringify(updates.anomalies))
    .setIf(updates.status !== undefined, 'status', updates.status)
    .setIf(updates.validated_by !== undefined, 'validated_by', updates.validated_by)
    .where('id = ?', documentId);

  // Add validated_at timestamp when status changes to validated or rejected
  if (updates.status === 'validated' || updates.status === 'rejected') {
    builder.setRaw("validated_at = datetime('now')");
  }

  const { sql, params } = builder.build();
  await db.prepare(sql).bind(...params).run();
}
