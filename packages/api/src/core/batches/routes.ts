import { Hono } from 'hono';
import type { Env } from '../../index';
import { authMiddleware, roleGuard } from '../../middleware/auth';
import { BatchService, type BatchStatus } from './lifecycle';
import { generateBordereauExport } from '../../pipelines/bulletin_soin/export';
import { logAudit } from '../../lib/audit';
import { BadRequestError, NotFoundError } from '../../lib/errors';

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
  const limit = parseInt(c.req.query('limit') ?? '50', 10);
  const offset = parseInt(c.req.query('offset') ?? '0', 10);

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
 */
batchRoutes.get('/:id', async (c) => {
  const batchId = c.req.param('id');
  const batchService = new BatchService(c.env.DB);

  const batch = await batchService.getBatch(batchId);
  if (!batch) {
    throw new NotFoundError(`Lot non trouvé: ${batchId}`);
  }

  // Get document status breakdown
  const statusCounts = await c.env.DB
    .prepare(
      `SELECT status, COUNT(*) as count
       FROM documents
       WHERE batch_id = ?
       GROUP BY status`
    )
    .bind(batchId)
    .all<{ status: string; count: number }>();

  // Get pipeline info
  const pipeline = await c.env.DB
    .prepare('SELECT id, name, display_name FROM pipelines WHERE id = ?')
    .bind(batch.pipeline_id)
    .first<{ id: string; name: string; display_name: string }>();

  // Get total amounts if available
  const totals = await c.env.DB
    .prepare(
      `SELECT
         SUM(json_extract(extracted_data, '$.invoiced_amount')) as total_invoiced,
         SUM(json_extract(computed_data, '$.reimbursement_amount')) as total_reimbursement
       FROM documents
       WHERE batch_id = ? AND status = 'validated'`
    )
    .bind(batchId)
    .first<{ total_invoiced: number | null; total_reimbursement: number | null }>();

  return c.json({
    batch,
    pipeline,
    status_breakdown: statusCounts.results ?? [],
    totals: {
      invoiced: totals?.total_invoiced ?? 0,
      reimbursement: totals?.total_reimbursement ?? 0,
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
 */
batchRoutes.get('/:id/export/:type', async (c) => {
  const batchId = c.req.param('id');
  const exportType = c.req.param('type');

  if (!['pdf', 'csv'].includes(exportType)) {
    throw new BadRequestError('Type export invalide (pdf ou csv)');
  }

  const batchService = new BatchService(c.env.DB);
  const batch = await batchService.getBatch(batchId);

  if (!batch) {
    throw new NotFoundError(`Lot non trouvé: ${batchId}`);
  }

  if (!batch.export_r2_key) {
    throw new BadRequestError('Ce lot n\'a pas encore été exporté');
  }

  // Find the export file
  // The export_r2_key points to the PDF/HTML, CSV is in same directory
  const baseDir = batch.export_r2_key.substring(0, batch.export_r2_key.lastIndexOf('/') + 1);

  // List files in the export directory
  const listed = await c.env.EXPORTS.list({ prefix: baseDir });
  const files = listed.objects;

  const targetExtension = exportType === 'pdf' ? '.html' : '.csv';
  const targetFile = files.find(f => f.key.endsWith(targetExtension));

  if (!targetFile) {
    throw new NotFoundError(`Fichier ${exportType} non trouvé`);
  }

  const file = await c.env.EXPORTS.get(targetFile.key);
  if (!file) {
    throw new NotFoundError('Fichier non trouvé');
  }

  const contentType = exportType === 'pdf'
    ? 'text/html; charset=utf-8'
    : 'text/csv; charset=utf-8';

  const filename = `bordereau_${batch.group_label.replace(/\s+/g, '_')}_${batchId.slice(-6)}.${exportType === 'pdf' ? 'html' : 'csv'}`;

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
  const limit = parseInt(c.req.query('limit') ?? '50', 10);
  const offset = parseInt(c.req.query('offset') ?? '0', 10);

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
