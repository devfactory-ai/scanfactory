import { Hono } from 'hono';
import type { Env } from '../../index';
import { authMiddleware, roleGuard } from '../../middleware/auth';
import { BatchService, type BatchStatus } from './lifecycle';
import { generateBordereauExport } from '../../pipelines/bulletin_soin/export';
import { logAudit } from '../../lib/audit';
import { BadRequestError, NotFoundError } from '../../lib/errors';
import { validatePagination } from '../../middleware/validation';

const batchRoutes = new Hono<{ Bindings: Env }>();

// All routes require authentication
batchRoutes.use('*', authMiddleware);

/**
 * GET /batches - List batches with filters
 */
batchRoutes.get('/', async (c) => {
  const batchService = new BatchService(c.env.DB);

  const pipelineId = c.req.query('pipeline_id');
  const status = c.req.query('status') as BatchStatus | undefined;

  // Validate pagination with limits
  const { limit, offset } = validatePagination(
    c.req.query('limit'),
    c.req.query('offset')
  );

  const { batches, total } = await batchService.listBatches({
    pipeline_id: pipelineId,
    status,
    limit,
    offset,
  });

  return c.json({
    batches,
    total,
    limit,
    offset,
  });
});

/**
 * GET /batches/:id - Get batch details with documents summary
 * Optimized: Single query with LEFT JOIN and GROUP BY instead of correlated subqueries
 */
batchRoutes.get('/:id', async (c) => {
  const batchId = c.req.param('id');

  // Optimized query using LEFT JOIN + GROUP BY instead of 6 correlated subqueries
  const result = await c.env.DB
    .prepare(
      `SELECT
         b.id, b.pipeline_id, b.group_key, b.group_label, b.status,
         b.document_count, b.export_r2_key, b.opened_at, b.closed_at,
         b.exported_at, b.settled_at, b.settled_amount, b.created_at,
         p.name as pipeline_name, p.display_name as pipeline_display_name,
         COUNT(CASE WHEN d.status = 'pending' THEN 1 END) as pending_count,
         COUNT(CASE WHEN d.status = 'validated' THEN 1 END) as validated_count,
         COUNT(CASE WHEN d.status = 'rejected' THEN 1 END) as rejected_count,
         COUNT(CASE WHEN d.status = 'exported' THEN 1 END) as exported_count,
         SUM(CASE WHEN d.status = 'validated'
             THEN CAST(json_extract(d.extracted_data, '$.invoiced_amount') AS REAL)
             ELSE 0 END) as total_invoiced,
         SUM(CASE WHEN d.status = 'validated'
             THEN CAST(json_extract(d.computed_data, '$.reimbursement_amount') AS REAL)
             ELSE 0 END) as total_reimbursement
       FROM batches b
       JOIN pipelines p ON b.pipeline_id = p.id
       LEFT JOIN documents d ON d.batch_id = b.id
       WHERE b.id = ?
       GROUP BY b.id`
    )
    .bind(batchId)
    .first<{
      id: string;
      pipeline_id: string;
      group_key: string;
      group_label: string;
      status: string;
      document_count: number;
      export_r2_key: string | null;
      opened_at: string;
      closed_at: string | null;
      exported_at: string | null;
      settled_at: string | null;
      settled_amount: number | null;
      created_at: string;
      pipeline_name: string;
      pipeline_display_name: string;
      pending_count: number;
      validated_count: number;
      rejected_count: number;
      exported_count: number;
      total_invoiced: number | null;
      total_reimbursement: number | null;
    }>();

  if (!result) {
    throw new NotFoundError(`Lot non trouvé: ${batchId}`);
  }

  // Transform result into expected shape
  const batch = {
    id: result.id,
    pipeline_id: result.pipeline_id,
    group_key: result.group_key,
    group_label: result.group_label,
    status: result.status,
    document_count: result.document_count,
    export_r2_key: result.export_r2_key,
    opened_at: result.opened_at,
    closed_at: result.closed_at,
    exported_at: result.exported_at,
    settled_at: result.settled_at,
    settled_amount: result.settled_amount,
    created_at: result.created_at,
  };

  const pipeline = {
    id: result.pipeline_id,
    name: result.pipeline_name,
    display_name: result.pipeline_display_name,
  };

  // Build status breakdown array
  const statusBreakdown = [
    { status: 'pending', count: result.pending_count },
    { status: 'validated', count: result.validated_count },
    { status: 'rejected', count: result.rejected_count },
    { status: 'exported', count: result.exported_count },
  ].filter(s => s.count > 0);

  return c.json({
    batch,
    pipeline,
    status_breakdown: statusBreakdown,
    totals: {
      invoiced: result.total_invoiced ?? 0,
      reimbursement: result.total_reimbursement ?? 0,
    },
  });
});

/**
 * POST /batches/:id/close - Close a batch (admin only)
 */
batchRoutes.post('/:id/close', roleGuard('admin'), async (c) => {
  const batchId = c.req.param('id');
  const user = c.get('user');
  const batchService = new BatchService(c.env.DB);

  const batch = await batchService.closeBatch(batchId, user.sub);

  return c.json({ batch, message: 'Lot clôturé avec succès' });
});

/**
 * POST /batches/:id/reopen - Reopen a closed batch (admin only)
 */
batchRoutes.post('/:id/reopen', roleGuard('admin'), async (c) => {
  const batchId = c.req.param('id');
  const user = c.get('user');
  const batchService = new BatchService(c.env.DB);

  const batch = await batchService.reopenBatch(batchId, user.sub);

  return c.json({ batch, message: 'Lot réouvert avec succès' });
});

/**
 * POST /batches/:id/verify - Mark batch as verified (admin only)
 */
batchRoutes.post('/:id/verify', roleGuard('admin'), async (c) => {
  const batchId = c.req.param('id');
  const user = c.get('user');
  const batchService = new BatchService(c.env.DB);

  const batch = await batchService.verifyBatch(batchId, user.sub);

  return c.json({ batch, message: 'Lot vérifié avec succès' });
});

/**
 * POST /batches/:id/export - Generate and export batch (admin only)
 */
batchRoutes.post('/:id/export', roleGuard('admin'), async (c) => {
  const batchId = c.req.param('id');
  const user = c.get('user');
  const batchService = new BatchService(c.env.DB);

  // First verify the batch if not already verified
  const batch = await batchService.getBatch(batchId);
  if (!batch) {
    throw new NotFoundError(`Lot non trouvé: ${batchId}`);
  }

  // Get pipeline to determine export type
  const pipeline = await c.env.DB
    .prepare('SELECT name FROM pipelines WHERE id = ?')
    .bind(batch.pipeline_id)
    .first<{ name: string }>();

  if (!pipeline) {
    throw new NotFoundError('Pipeline non trouvé');
  }

  let exportKeys: { pdfKey: string; csvKey: string };

  // Generate export based on pipeline type
  if (pipeline.name === 'bulletin_soin') {
    exportKeys = await generateBordereauExport(c.env, batchId);
  } else {
    throw new BadRequestError(`Export non supporté pour le pipeline: ${pipeline.name}`);
  }

  // Update batch status
  const updatedBatch = await batchService.exportBatch(batchId, exportKeys.pdfKey, user.sub);

  // Log export with all keys
  await logAudit(c.env.DB, {
    userId: user.sub,
    action: 'export',
    entityType: 'batch',
    entityId: batchId,
    newValue: { pdf_key: exportKeys.pdfKey, csv_key: exportKeys.csvKey },
  });

  return c.json({
    batch: updatedBatch,
    exports: {
      pdf: exportKeys.pdfKey,
      csv: exportKeys.csvKey,
    },
    message: 'Lot exporté avec succès',
  });
});

/**
 * GET /batches/:id/export/:type - Download export file
 *
 * Supported types:
 * - html: HTML bordereau for printing (also accepts 'pdf' for backward compatibility)
 * - csv: CSV data export for spreadsheet import
 */
batchRoutes.get('/:id/export/:type', async (c) => {
  const batchId = c.req.param('id');
  const exportType = c.req.param('type');

  // Accept both 'html' and 'pdf' for HTML export (backward compatibility)
  const validTypes = ['html', 'pdf', 'csv'];
  if (!validTypes.includes(exportType)) {
    throw new BadRequestError('Type export invalide (html, csv)');
  }

  const batchService = new BatchService(c.env.DB);
  const batch = await batchService.getBatch(batchId);

  if (!batch) {
    throw new NotFoundError(`Lot non trouvé: ${batchId}`);
  }

  if (!batch.export_r2_key) {
    throw new BadRequestError('Ce lot n\'a pas encore été exporté');
  }

  // Normalize export type: 'pdf' → 'html' for backward compatibility
  const normalizedType = exportType === 'pdf' ? 'html' : exportType;

  // Find the export file
  const baseDir = batch.export_r2_key.substring(0, batch.export_r2_key.lastIndexOf('/') + 1);

  // List files in the export directory
  const listed = await c.env.EXPORTS.list({ prefix: baseDir });
  const files = listed.objects;

  const targetExtension = normalizedType === 'html' ? '.html' : '.csv';
  const targetFile = files.find(f => f.key.endsWith(targetExtension));

  if (!targetFile) {
    throw new NotFoundError(`Fichier ${normalizedType} non trouvé`);
  }

  const file = await c.env.EXPORTS.get(targetFile.key);
  if (!file) {
    throw new NotFoundError('Fichier non trouvé');
  }

  // Set correct Content-Type based on actual file type
  const contentType = normalizedType === 'html'
    ? 'text/html; charset=utf-8'
    : 'text/csv; charset=utf-8';

  const filename = `bordereau_${batch.group_label.replace(/\s+/g, '_')}_${batchId.slice(-6)}.${normalizedType}`;

  return new Response(file.body, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
});

/**
 * POST /batches/:id/settle - Mark batch as settled (admin only)
 */
batchRoutes.post('/:id/settle', roleGuard('admin'), async (c) => {
  const batchId = c.req.param('id');
  const user = c.get('user');
  const batchService = new BatchService(c.env.DB);

  const body = await c.req.json<{ settled_amount: number }>();

  if (typeof body.settled_amount !== 'number' || body.settled_amount < 0) {
    throw new BadRequestError('Montant réglé invalide');
  }

  const batch = await batchService.settleBatch(batchId, body.settled_amount, user.sub);

  return c.json({ batch, message: 'Règlement enregistré avec succès' });
});

/**
 * GET /batches/:id/documents - List documents in batch
 */
batchRoutes.get('/:id/documents', async (c) => {
  const batchId = c.req.param('id');
  const status = c.req.query('status');

  // Validate pagination with limits
  const { limit, offset } = validatePagination(
    c.req.query('limit'),
    c.req.query('offset')
  );

  const conditions = ['batch_id = ?'];
  const params: unknown[] = [batchId];

  if (status) {
    conditions.push('status = ?');
    params.push(status);
  }

  const whereClause = conditions.join(' AND ');

  const countResult = await c.env.DB
    .prepare(`SELECT COUNT(*) as count FROM documents WHERE ${whereClause}`)
    .bind(...params)
    .first<{ count: number }>();

  const documents = await c.env.DB
    .prepare(
      `SELECT id, filename, status, confidence_score, created_at, validated_at
       FROM documents
       WHERE ${whereClause}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`
    )
    .bind(...params, limit, offset)
    .all<{
      id: string;
      filename: string;
      status: string;
      confidence_score: number | null;
      created_at: string;
      validated_at: string | null;
    }>();

  return c.json({
    documents: documents.results ?? [],
    total: countResult?.count ?? 0,
    limit,
    offset,
  });
});

export { batchRoutes };
