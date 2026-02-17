import { generateId } from '../../lib/ulid';
import { logAudit } from '../../lib/audit';

export type BatchStatus = 'open' | 'closed' | 'verified' | 'exported' | 'settled';

export interface Batch {
  id: string;
  pipeline_id: string;
  group_key: string;
  group_label: string;
  status: BatchStatus;
  document_count: number;
  export_r2_key: string | null;
  opened_at: string;
  closed_at: string | null;
  exported_at: string | null;
  settled_at: string | null;
  settled_amount: number | null;
}

interface BatchConfig {
  group_by: string;
  max_count: number;
  max_days: number;
  export_template: string;
}

// Valid state transitions
const VALID_TRANSITIONS: Record<BatchStatus, BatchStatus[]> = {
  open: ['closed'],
  closed: ['verified', 'open'], // Can reopen if needed
  verified: ['exported', 'closed'], // Can go back to closed
  exported: ['settled'],
  settled: [], // Terminal state
};

export class BatchService {
  constructor(private db: D1Database) {}

  /**
   * Get or create an open batch for the given pipeline and group
   */
  async getOrCreateOpenBatch(
    pipelineId: string,
    groupKey: string,
    groupLabel: string,
    userId?: string
  ): Promise<Batch> {
    // Try to find existing open batch
    const existing = await this.db
      .prepare(
        `SELECT * FROM batches
         WHERE pipeline_id = ? AND group_key = ? AND status = 'open'
         LIMIT 1`
      )
      .bind(pipelineId, groupKey)
      .first<Batch>();

    if (existing) {
      return existing;
    }

    // Create new batch
    const batchId = generateId('batch');
    await this.db
      .prepare(
        `INSERT INTO batches (id, pipeline_id, group_key, group_label, status, document_count)
         VALUES (?, ?, ?, ?, 'open', 0)`
      )
      .bind(batchId, pipelineId, groupKey, groupLabel)
      .run();

    if (userId) {
      await logAudit(this.db, {
        userId,
        action: 'create',
        entityType: 'batch',
        entityId: batchId,
        newValue: { pipeline_id: pipelineId, group_key: groupKey },
      });
    }

    return this.getBatch(batchId) as Promise<Batch>;
  }

  /**
   * Get batch by ID
   */
  async getBatch(batchId: string): Promise<Batch | null> {
    return this.db
      .prepare('SELECT * FROM batches WHERE id = ?')
      .bind(batchId)
      .first<Batch>();
  }

  /**
   * Add document to batch and check auto-close
   */
  async addDocument(
    batchId: string,
    pipelineId: string,
    userId?: string
  ): Promise<{ batch: Batch; shouldClose: boolean }> {
    // Increment document count
    await this.db
      .prepare(
        `UPDATE batches SET document_count = document_count + 1 WHERE id = ?`
      )
      .bind(batchId)
      .run();

    const batch = await this.getBatch(batchId);
    if (!batch) {
      throw new Error(`Batch not found: ${batchId}`);
    }

    // Check if should auto-close based on max_count
    const pipeline = await this.db
      .prepare('SELECT batch_config FROM pipelines WHERE id = ?')
      .bind(pipelineId)
      .first<{ batch_config: string }>();

    if (!pipeline) {
      return { batch, shouldClose: false };
    }

    const config = JSON.parse(pipeline.batch_config) as BatchConfig;

    if (batch.document_count >= config.max_count) {
      return { batch, shouldClose: true };
    }

    return { batch, shouldClose: false };
  }

  /**
   * Close a batch
   */
  async closeBatch(batchId: string, userId?: string): Promise<Batch> {
    const batch = await this.getBatch(batchId);
    if (!batch) {
      throw new Error(`Batch not found: ${batchId}`);
    }

    this.validateTransition(batch.status, 'closed');

    await this.db
      .prepare(
        `UPDATE batches SET status = 'closed', closed_at = datetime('now') WHERE id = ?`
      )
      .bind(batchId)
      .run();

    if (userId) {
      await logAudit(this.db, {
        userId,
        action: 'update',
        entityType: 'batch',
        entityId: batchId,
        oldValue: { status: batch.status },
        newValue: { status: 'closed' },
      });
    }

    return this.getBatch(batchId) as Promise<Batch>;
  }

  /**
   * Verify a batch (mark ready for export)
   */
  async verifyBatch(batchId: string, userId?: string): Promise<Batch> {
    const batch = await this.getBatch(batchId);
    if (!batch) {
      throw new Error(`Batch not found: ${batchId}`);
    }

    this.validateTransition(batch.status, 'verified');

    // Check all documents are validated
    const pendingCount = await this.db
      .prepare(
        `SELECT COUNT(*) as count FROM documents
         WHERE batch_id = ? AND status = 'pending'`
      )
      .bind(batchId)
      .first<{ count: number }>();

    if (pendingCount && pendingCount.count > 0) {
      throw new Error(
        `Cannot verify batch: ${pendingCount.count} documents pending validation`
      );
    }

    await this.db
      .prepare(`UPDATE batches SET status = 'verified' WHERE id = ?`)
      .bind(batchId)
      .run();

    if (userId) {
      await logAudit(this.db, {
        userId,
        action: 'update',
        entityType: 'batch',
        entityId: batchId,
        oldValue: { status: batch.status },
        newValue: { status: 'verified' },
      });
    }

    return this.getBatch(batchId) as Promise<Batch>;
  }

  /**
   * Mark batch as exported
   */
  async exportBatch(
    batchId: string,
    exportR2Key: string,
    userId?: string
  ): Promise<Batch> {
    const batch = await this.getBatch(batchId);
    if (!batch) {
      throw new Error(`Batch not found: ${batchId}`);
    }

    this.validateTransition(batch.status, 'exported');

    await this.db
      .prepare(
        `UPDATE batches
         SET status = 'exported', export_r2_key = ?, exported_at = datetime('now')
         WHERE id = ?`
      )
      .bind(exportR2Key, batchId)
      .run();

    // Mark all documents as exported
    await this.db
      .prepare(
        `UPDATE documents SET status = 'exported' WHERE batch_id = ? AND status = 'validated'`
      )
      .bind(batchId)
      .run();

    if (userId) {
      await logAudit(this.db, {
        userId,
        action: 'export',
        entityType: 'batch',
        entityId: batchId,
        oldValue: { status: batch.status },
        newValue: { status: 'exported', export_r2_key: exportR2Key },
      });
    }

    return this.getBatch(batchId) as Promise<Batch>;
  }

  /**
   * Settle a batch (confirm payment received)
   */
  async settleBatch(
    batchId: string,
    settledAmount: number,
    userId?: string
  ): Promise<Batch> {
    const batch = await this.getBatch(batchId);
    if (!batch) {
      throw new Error(`Batch not found: ${batchId}`);
    }

    this.validateTransition(batch.status, 'settled');

    await this.db
      .prepare(
        `UPDATE batches
         SET status = 'settled', settled_at = datetime('now'), settled_amount = ?
         WHERE id = ?`
      )
      .bind(settledAmount, batchId)
      .run();

    if (userId) {
      await logAudit(this.db, {
        userId,
        action: 'update',
        entityType: 'batch',
        entityId: batchId,
        oldValue: { status: batch.status },
        newValue: { status: 'settled', settled_amount: settledAmount },
      });
    }

    return this.getBatch(batchId) as Promise<Batch>;
  }

  /**
   * Reopen a closed batch
   */
  async reopenBatch(batchId: string, userId?: string): Promise<Batch> {
    const batch = await this.getBatch(batchId);
    if (!batch) {
      throw new Error(`Batch not found: ${batchId}`);
    }

    if (batch.status !== 'closed' && batch.status !== 'verified') {
      throw new Error(
        `Cannot reopen batch in status: ${batch.status}`
      );
    }

    await this.db
      .prepare(
        `UPDATE batches SET status = 'open', closed_at = NULL WHERE id = ?`
      )
      .bind(batchId)
      .run();

    if (userId) {
      await logAudit(this.db, {
        userId,
        action: 'update',
        entityType: 'batch',
        entityId: batchId,
        oldValue: { status: batch.status },
        newValue: { status: 'open' },
      });
    }

    return this.getBatch(batchId) as Promise<Batch>;
  }

  /**
   * Get batches past max_days that should be auto-closed
   */
  async getBatchesPastMaxDays(): Promise<Array<{ batch: Batch; pipeline_id: string }>> {
    const result = await this.db
      .prepare(
        `SELECT b.*, p.batch_config
         FROM batches b
         JOIN pipelines p ON b.pipeline_id = p.id
         WHERE b.status = 'open'`
      )
      .all<Batch & { batch_config: string }>();

    const batchesToClose: Array<{ batch: Batch; pipeline_id: string }> = [];
    const now = new Date();

    for (const row of result.results ?? []) {
      const config = JSON.parse(row.batch_config) as BatchConfig;
      const openedAt = new Date(row.opened_at);
      const daysSinceOpened = Math.floor(
        (now.getTime() - openedAt.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysSinceOpened >= config.max_days) {
        batchesToClose.push({
          batch: row,
          pipeline_id: row.pipeline_id,
        });
      }
    }

    return batchesToClose;
  }

  /**
   * List batches with filters
   */
  async listBatches(options: {
    pipeline_id?: string;
    status?: BatchStatus;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ batches: Batch[]; total: number }> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options.pipeline_id) {
      conditions.push('pipeline_id = ?');
      params.push(options.pipeline_id);
    }

    if (options.status) {
      conditions.push('status = ?');
      params.push(options.status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;

    const countResult = await this.db
      .prepare(`SELECT COUNT(*) as count FROM batches ${whereClause}`)
      .bind(...params)
      .first<{ count: number }>();

    const batchesResult = await this.db
      .prepare(
        `SELECT * FROM batches ${whereClause}
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`
      )
      .bind(...params, limit, offset)
      .all<Batch>();

    return {
      batches: batchesResult.results ?? [],
      total: countResult?.count ?? 0,
    };
  }

  private validateTransition(currentStatus: BatchStatus, targetStatus: BatchStatus): void {
    const allowed = VALID_TRANSITIONS[currentStatus];
    if (!allowed.includes(targetStatus)) {
      throw new Error(
        `Invalid batch transition: ${currentStatus} -> ${targetStatus}`
      );
    }
  }
}
