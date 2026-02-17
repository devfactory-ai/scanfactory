import type { Env } from '../../index';
import { BatchService } from './lifecycle';
import { logAudit } from '../../lib/audit';

export async function handleScheduledBatchClosure(env: Env): Promise<void> {
  const batchService = new BatchService(env.DB);

  console.log('[CRON] Starting scheduled batch closure check...');

  try {
    // Get batches past max_days
    const batchesToClose = await batchService.getBatchesPastMaxDays();

    console.log(`[CRON] Found ${batchesToClose.length} batches to auto-close`);

    for (const { batch } of batchesToClose) {
      try {
        await batchService.closeBatch(batch.id);

        // Log as system action
        await logAudit(env.DB, {
          userId: null, // System action
          action: 'update',
          entityType: 'batch',
          entityId: batch.id,
          oldValue: { status: 'open' },
          newValue: { status: 'closed', reason: 'auto_close_max_days' },
        });

        console.log(
          `[CRON] Auto-closed batch ${batch.id} (${batch.group_label}) - ${batch.document_count} documents`
        );
      } catch (error) {
        console.error(`[CRON] Failed to close batch ${batch.id}:`, error);
      }
    }

    console.log('[CRON] Batch closure check completed');
  } catch (error) {
    console.error('[CRON] Error during batch closure:', error);
  }
}
