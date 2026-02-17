import { Hono } from 'hono';
import type { Env } from '../../index';
import { authMiddleware } from '../../middleware/auth';
import { getValidationQueue, getDocumentById, updateDocument } from './queue';
import { logAudit } from '../../lib/audit';
import { NotFoundError, ValidationError } from '../../lib/errors';

const validationRoutes = new Hono<{ Bindings: Env }>();

// All routes require authentication
validationRoutes.use('*', authMiddleware);

// GET /api/validation/queue - List documents in validation queue
validationRoutes.get('/queue', async (c) => {
  const pipelineId = c.req.query('pipeline_id');
  const status = c.req.query('status');
  const minConfidence = c.req.query('min_confidence');
  const maxConfidence = c.req.query('max_confidence');
  const batchId = c.req.query('batch_id');
  const sortBy = c.req.query('sort_by') as 'created_at' | 'confidence_score' | undefined;
  const sortOrder = c.req.query('sort_order') as 'asc' | 'desc' | undefined;
  const limit = parseInt(c.req.query('limit') ?? '50', 10);
  const offset = parseInt(c.req.query('offset') ?? '0', 10);

  const result = await getValidationQueue(c.env.DB, {
    filters: {
      pipeline_id: pipelineId,
      status,
      min_confidence: minConfidence ? parseFloat(minConfidence) : undefined,
      max_confidence: maxConfidence ? parseFloat(maxConfidence) : undefined,
      batch_id: batchId,
    },
    sort_by: sortBy,
    sort_order: sortOrder,
    limit,
    offset,
  });

  // Parse JSON fields for response
  const documents = result.documents.map((doc) => ({
    ...doc,
    extracted_data: JSON.parse(doc.extracted_data),
    computed_data: doc.computed_data ? JSON.parse(doc.computed_data) : null,
    extraction_modes: doc.extraction_modes ? JSON.parse(doc.extraction_modes) : null,
    anomalies: doc.anomalies ? JSON.parse(doc.anomalies) : null,
    metadata: doc.metadata ? JSON.parse(doc.metadata) : null,
  }));

  return c.json({
    documents,
    total: result.total,
    limit,
    offset,
  });
});

// GET /api/validation/:id/adjacent - Get previous and next document IDs for navigation
validationRoutes.get('/:id/adjacent', async (c) => {
  const documentId = c.req.param('id');
  const pipelineId = c.req.query('pipeline_id');

  // Get current document to find its position
  const currentDoc = await getDocumentById(c.env.DB, documentId);
  if (!currentDoc) {
    throw new NotFoundError('Document non trouvé');
  }

  // Build conditions for finding adjacent documents in the same queue
  const conditions = ["status = 'pending'"];
  const params: unknown[] = [];

  if (pipelineId) {
    conditions.push('pipeline_id = ?');
    params.push(pipelineId);
  }

  const whereClause = conditions.join(' AND ');

  // Get previous document (older, sorted by created_at ASC)
  const previousDoc = await c.env.DB
    .prepare(
      `SELECT id FROM documents
       WHERE ${whereClause} AND created_at < ?
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .bind(...params, currentDoc.created_at)
    .first<{ id: string }>();

  // Get next document (newer, sorted by created_at ASC)
  const nextDoc = await c.env.DB
    .prepare(
      `SELECT id FROM documents
       WHERE ${whereClause} AND created_at > ?
       ORDER BY created_at ASC
       LIMIT 1`
    )
    .bind(...params, currentDoc.created_at)
    .first<{ id: string }>();

  // Get position and total count
  const positionResult = await c.env.DB
    .prepare(
      `SELECT COUNT(*) as position FROM documents
       WHERE ${whereClause} AND created_at <= ?`
    )
    .bind(...params, currentDoc.created_at)
    .first<{ position: number }>();

  const totalResult = await c.env.DB
    .prepare(`SELECT COUNT(*) as total FROM documents WHERE ${whereClause}`)
    .bind(...params)
    .first<{ total: number }>();

  return c.json({
    previous: previousDoc?.id ?? null,
    next: nextDoc?.id ?? null,
    position: positionResult?.position ?? 1,
    total: totalResult?.total ?? 1,
  });
});

// GET /api/validation/:id - Get document detail with signed scan URL
validationRoutes.get('/:id', async (c) => {
  const documentId = c.req.param('id');

  const doc = await getDocumentById(c.env.DB, documentId);

  if (!doc) {
    throw new NotFoundError('Document non trouvé');
  }

  // Get pipeline field_display config for UI
  const pipeline = await c.env.DB.prepare(
    'SELECT field_display FROM pipelines WHERE id = ?'
  )
    .bind(doc.pipeline_id)
    .first<{ field_display: string | null }>();

  return c.json({
    document: {
      ...doc,
      extracted_data: JSON.parse(doc.extracted_data),
      computed_data: doc.computed_data ? JSON.parse(doc.computed_data) : null,
      extraction_modes: doc.extraction_modes ? JSON.parse(doc.extraction_modes) : null,
      anomalies: doc.anomalies ? JSON.parse(doc.anomalies) : null,
      metadata: doc.metadata ? JSON.parse(doc.metadata) : null,
    },
    field_display: pipeline?.field_display ? JSON.parse(pipeline.field_display) : null,
    scan_url: `/api/documents/${documentId}/scan`,
  });
});

// PUT /api/validation/:id - Update document (corrections) and optionally validate/reject
validationRoutes.put('/:id', async (c) => {
  const user = c.get('user');
  const documentId = c.req.param('id');

  const body = await c.req.json<{
    extracted_data?: Record<string, unknown>;
    action?: 'validate' | 'reject';
  }>();

  // Get current document
  const doc = await getDocumentById(c.env.DB, documentId);

  if (!doc) {
    throw new NotFoundError('Document non trouvé');
  }

  // Check if document can be modified
  if (doc.status === 'exported' || doc.status === 'settled') {
    throw new ValidationError('Document déjà exporté, modification impossible');
  }

  const oldData = JSON.parse(doc.extracted_data);
  const updates: Parameters<typeof updateDocument>[2] = {};

  // Apply corrections
  if (body.extracted_data) {
    updates.extracted_data = body.extracted_data;
  }

  // Apply action
  if (body.action === 'validate') {
    updates.status = 'validated';
    updates.validated_by = user.sub;
  } else if (body.action === 'reject') {
    updates.status = 'rejected';
    updates.validated_by = user.sub;
  }

  // Update document
  await updateDocument(c.env.DB, documentId, updates);

  // Log audit
  await logAudit(c.env.DB, {
    userId: user.sub,
    action: body.action === 'validate' ? 'validate' : body.action === 'reject' ? 'reject' : 'update',
    entityType: 'document',
    entityId: documentId,
    oldValue: { extracted_data: oldData, status: doc.status },
    newValue: {
      extracted_data: body.extracted_data ?? oldData,
      status: updates.status ?? doc.status,
    },
  });

  // Get updated document
  const updatedDoc = await getDocumentById(c.env.DB, documentId);

  return c.json({
    document: updatedDoc ? {
      ...updatedDoc,
      extracted_data: JSON.parse(updatedDoc.extracted_data),
      computed_data: updatedDoc.computed_data ? JSON.parse(updatedDoc.computed_data) : null,
      anomalies: updatedDoc.anomalies ? JSON.parse(updatedDoc.anomalies) : null,
    } : null,
  });
});

// POST /api/validation/batch - Batch validate multiple documents
validationRoutes.post('/batch', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{
    document_ids: string[];
    action: 'validate' | 'reject';
  }>();

  if (!body.document_ids || !Array.isArray(body.document_ids) || body.document_ids.length === 0) {
    throw new ValidationError('Liste de documents requise');
  }

  if (body.document_ids.length > 20) {
    throw new ValidationError('Maximum 20 documents par lot');
  }

  if (!body.action || !['validate', 'reject'].includes(body.action)) {
    throw new ValidationError('Action invalide');
  }

  const results: Array<{ id: string; success: boolean; error?: string }> = [];

  for (const docId of body.document_ids) {
    try {
      const doc = await getDocumentById(c.env.DB, docId);

      if (!doc) {
        results.push({ id: docId, success: false, error: 'Document non trouvé' });
        continue;
      }

      if (doc.status !== 'pending') {
        results.push({ id: docId, success: false, error: 'Document déjà traité' });
        continue;
      }

      await updateDocument(c.env.DB, docId, {
        status: body.action === 'validate' ? 'validated' : 'rejected',
        validated_by: user.sub,
      });

      await logAudit(c.env.DB, {
        userId: user.sub,
        action: body.action,
        entityType: 'document',
        entityId: docId,
        oldValue: { status: doc.status },
        newValue: { status: body.action === 'validate' ? 'validated' : 'rejected' },
      });

      results.push({ id: docId, success: true });
    } catch {
      results.push({ id: docId, success: false, error: 'Erreur interne' });
    }
  }

  return c.json({
    results,
    success_count: results.filter((r) => r.success).length,
    error_count: results.filter((r) => !r.success).length,
  });
});

export { validationRoutes };
