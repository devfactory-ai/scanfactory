import { Hono } from 'hono';
import type { Env } from '../../index';
import { authMiddleware } from '../../middleware/auth';
import { OCRAdapter } from './adapter';
import { mapOCRToDocument, type Pipeline } from './mapper';
import { generateId } from '../../lib/ulid';
import { logAudit } from '../../lib/audit';
import { ValidationError, NotFoundError } from '../../lib/errors';

interface BatchConfig {
  group_by: string;
  max_count: number;
  max_days: number;
  export_template: string;
}

interface Batch {
  id: string;
  pipeline_id: string;
  group_key: string;
  group_label: string;
  status: string;
  document_count: number;
}

const extractionRoutes = new Hono<{ Bindings: Env }>();

// All routes require authentication
extractionRoutes.use('*', authMiddleware);

// POST /api/documents/scan
extractionRoutes.post('/scan', async (c) => {
  const user = c.get('user');
  const formData = await c.req.formData();
  const file = formData.get('file');
  const pipelineName = formData.get('pipeline');

  if (!file || typeof file === 'string') {
    throw new ValidationError('Fichier image requis');
  }

  // file is a Blob-like object in Workers
  const fileBlob = file as unknown as { arrayBuffer(): Promise<ArrayBuffer>; type: string; name?: string };

  if (!pipelineName || typeof pipelineName !== 'string') {
    throw new ValidationError('Pipeline requis');
  }

  // Load pipeline config
  const pipeline = await c.env.DB.prepare(
    'SELECT id, name, display_name, ocr_schema, rule_steps, batch_config, field_display FROM pipelines WHERE name = ? AND active = 1'
  )
    .bind(pipelineName)
    .first<Pipeline>();

  if (!pipeline) {
    throw new NotFoundError(`Pipeline "${pipelineName}" non trouvé`);
  }

  // Read file as ArrayBuffer
  const imageBuffer = await fileBlob.arrayBuffer();
  const fileName = fileBlob.name ?? 'document.jpg';
  const fileType = fileBlob.type || 'image/jpeg';

  // Store scan in R2
  const scanId = generateId('scan');
  const scanKey = `${pipeline.name}/${scanId}/${fileName}`;
  await c.env.SCANS.put(scanKey, imageBuffer, {
    httpMetadata: {
      contentType: fileType,
    },
    customMetadata: {
      originalName: fileName,
      uploadedBy: user.sub,
      pipeline: pipeline.name,
    },
  });

  // Call OCR adapter
  const ocrAdapter = new OCRAdapter(c.env);
  const ocrResult = await ocrAdapter.extract(imageBuffer, pipeline.ocr_schema);

  if (!ocrResult.success) {
    // Still create document but mark as failed
    const docId = generateId('doc');
    await c.env.DB.prepare(
      `INSERT INTO documents (id, pipeline_id, scan_r2_key, status, raw_ocr_data, extracted_data, confidence_score, extraction_modes, scanned_by)
       VALUES (?, ?, ?, 'failed', ?, '{}', 0, '{}', ?)`
    )
      .bind(
        docId,
        pipeline.id,
        scanKey,
        JSON.stringify({ error: ocrResult.error }),
        user.sub
      )
      .run();

    await logAudit(c.env.DB, {
      userId: user.sub,
      action: 'create',
      entityType: 'document',
      entityId: docId,
      newValue: { status: 'failed', error: ocrResult.error },
    });

    return c.json(
      {
        id: docId,
        status: 'failed',
        error: ocrResult.error,
      },
      201
    );
  }

  // Map OCR result to document
  const mappedDoc = mapOCRToDocument(ocrResult, pipeline);

  // Find or create batch
  const batchConfig = JSON.parse(pipeline.batch_config) as BatchConfig;
  const groupByField = batchConfig.group_by;
  const groupKey = String(mappedDoc.extractedData[groupByField] ?? 'default');
  const groupLabel = groupKey;

  let batch = await c.env.DB.prepare(
    `SELECT id, pipeline_id, group_key, group_label, status, document_count
     FROM batches
     WHERE pipeline_id = ? AND group_key = ? AND status = 'open'`
  )
    .bind(pipeline.id, groupKey)
    .first<Batch>();

  if (!batch) {
    // Create new batch
    const batchId = generateId('batch');
    await c.env.DB.prepare(
      `INSERT INTO batches (id, pipeline_id, group_key, group_label, status, document_count)
       VALUES (?, ?, ?, ?, 'open', 0)`
    )
      .bind(batchId, pipeline.id, groupKey, groupLabel)
      .run();

    batch = {
      id: batchId,
      pipeline_id: pipeline.id,
      group_key: groupKey,
      group_label: groupLabel,
      status: 'open',
      document_count: 0,
    };

    await logAudit(c.env.DB, {
      userId: user.sub,
      action: 'create',
      entityType: 'batch',
      entityId: batchId,
      newValue: { pipeline_id: pipeline.id, group_key: groupKey },
    });
  }

  // Create document
  const docId = generateId('doc');
  await c.env.DB.prepare(
    `INSERT INTO documents (id, pipeline_id, batch_id, scan_r2_key, status, raw_ocr_data, extracted_data, confidence_score, extraction_modes, scanned_by)
     VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`
  )
    .bind(
      docId,
      pipeline.id,
      batch.id,
      scanKey,
      JSON.stringify(mappedDoc.rawOcrData),
      JSON.stringify(mappedDoc.extractedData),
      mappedDoc.confidenceScore,
      JSON.stringify(mappedDoc.extractionModes),
      user.sub
    )
    .run();

  // Update batch document count
  await c.env.DB.prepare(
    'UPDATE batches SET document_count = document_count + 1 WHERE id = ?'
  )
    .bind(batch.id)
    .run();

  // Queue for pipeline processing
  await c.env.DOC_QUEUE.send({
    type: 'process_document',
    documentId: docId,
    pipelineId: pipeline.id,
  });

  await logAudit(c.env.DB, {
    userId: user.sub,
    action: 'create',
    entityType: 'document',
    entityId: docId,
    newValue: {
      pipeline_id: pipeline.id,
      batch_id: batch.id,
      confidence_score: mappedDoc.confidenceScore,
    },
  });

  return c.json(
    {
      id: docId,
      pipeline: {
        id: pipeline.id,
        name: pipeline.name,
        display_name: pipeline.display_name,
      },
      batch: {
        id: batch.id,
        group_key: batch.group_key,
        group_label: batch.group_label,
      },
      status: 'pending',
      extracted_data: mappedDoc.extractedData,
      confidence_score: mappedDoc.confidenceScore,
      extraction_modes: mappedDoc.extractionModes,
      scan_url: `/api/documents/${docId}/scan`,
    },
    201
  );
});

// GET /api/documents/:id/scan - Get signed URL for scan image
extractionRoutes.get('/:id/scan', async (c) => {
  const docId = c.req.param('id');

  const doc = await c.env.DB.prepare(
    'SELECT scan_r2_key FROM documents WHERE id = ?'
  )
    .bind(docId)
    .first<{ scan_r2_key: string }>();

  if (!doc) {
    throw new NotFoundError('Document non trouvé');
  }

  // Get object from R2
  const object = await c.env.SCANS.get(doc.scan_r2_key);

  if (!object) {
    throw new NotFoundError('Image non trouvée');
  }

  const headers = new Headers();
  headers.set('Content-Type', object.httpMetadata?.contentType ?? 'image/jpeg');
  headers.set('Cache-Control', 'private, max-age=3600');

  return new Response(object.body, { headers });
});

// GET /api/pipelines - List active pipelines
extractionRoutes.get('/pipelines', async (c) => {
  const pipelines = await c.env.DB.prepare(
    'SELECT id, name, display_name, description FROM pipelines WHERE active = 1'
  ).all();

  return c.json({
    pipelines: pipelines.results ?? [],
  });
});

export { extractionRoutes };
