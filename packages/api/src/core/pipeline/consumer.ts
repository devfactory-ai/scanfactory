import type { Env } from '../../index';
import { PipelineEngine } from './engine';
import type { DocumentData } from './types';

// Import rules to register them
import './rules';
import '../../pipelines/bulletin_soin/rules';

interface QueueMessage {
  type: 'process_document';
  documentId: string;
  pipelineId: string;
}

export interface MessageBatch {
  messages: Array<{
    id: string;
    body: unknown;
    ack: () => void;
    retry: () => void;
  }>;
}

export async function handleQueueMessage(
  batch: MessageBatch,
  env: Env
): Promise<void> {
  const engine = new PipelineEngine(env.DB);

  for (const message of batch.messages) {
    try {
      const body = message.body as QueueMessage;
      const { documentId, pipelineId } = body;

      if (body.type !== 'process_document') {
        console.error(`Unknown message type: ${body.type}`);
        message.ack();
        continue;
      }

      // Load document
      const docRow = await env.DB
        .prepare(
          `SELECT id, pipeline_id, extracted_data, computed_data, anomalies, metadata
           FROM documents WHERE id = ?`
        )
        .bind(documentId)
        .first<{
          id: string;
          pipeline_id: string;
          extracted_data: string;
          computed_data: string | null;
          anomalies: string | null;
          metadata: string | null;
        }>();

      if (!docRow) {
        console.error(`Document not found: ${documentId}`);
        message.ack();
        continue;
      }

      // Load pipeline
      const pipeline = await engine.loadPipeline(pipelineId);

      if (!pipeline) {
        console.error(`Pipeline not found: ${pipelineId}`);
        message.ack();
        continue;
      }

      // Prepare document data
      const doc: DocumentData = {
        id: docRow.id,
        pipeline_id: docRow.pipeline_id,
        extracted_data: JSON.parse(docRow.extracted_data),
        computed_data: docRow.computed_data ? JSON.parse(docRow.computed_data) : {},
        anomalies: docRow.anomalies ? JSON.parse(docRow.anomalies) : [],
        metadata: docRow.metadata ? JSON.parse(docRow.metadata) : {},
      };

      // Execute pipeline
      const result = await engine.execute(doc, pipeline);

      // Update document with results
      await env.DB
        .prepare(
          `UPDATE documents
           SET computed_data = ?,
               anomalies = ?,
               metadata = ?,
               updated_at = datetime('now')
           WHERE id = ?`
        )
        .bind(
          JSON.stringify(result.computed_data),
          JSON.stringify(result.anomalies),
          JSON.stringify({
            ...result.metadata,
            pipeline_execution: {
              success: result.success,
              total_duration_ms: result.total_duration_ms,
              step_results: result.step_results,
              executed_at: new Date().toISOString(),
            },
          }),
          documentId
        )
        .run();

      console.log(
        `Processed document ${documentId}: ${result.step_results.length} steps in ${result.total_duration_ms}ms`
      );

      message.ack();
    } catch (error) {
      console.error(`Error processing message:`, error);
      message.retry();
    }
  }
}
