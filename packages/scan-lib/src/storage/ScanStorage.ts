import type { StorageConfig, PendingUpload, ScannedDocument, ScannedBatch } from '../types';

/**
 * Storage interface for persistence
 */
interface StorageProvider {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  getAllKeys(): Promise<string[]>;
}

/**
 * Local storage for scanned documents
 *
 * Handles offline persistence of scans pending upload.
 * Works with AsyncStorage or SecureStore.
 */
export class ScanStorage {
  private config: StorageConfig;
  private storage: StorageProvider;

  constructor(config: StorageConfig, storage?: StorageProvider) {
    this.config = config;

    // Use provided storage or default to AsyncStorage-like interface
    this.storage = storage || this.createDefaultStorage();
  }

  /**
   * Save document for pending upload
   */
  async savePending(doc: ScannedDocument, metadata?: Record<string, unknown>): Promise<PendingUpload> {
    const pending: PendingUpload = {
      localId: doc.localId,
      status: 'pending',
      document: doc,
      metadata,
      createdAt: new Date().toISOString(),
      retryCount: 0,
    };

    const key = this.getPendingKey(doc.localId);
    await this.storage.setItem(key, JSON.stringify(pending));

    // Update pending list
    await this.addToPendingList(doc.localId);

    return pending;
  }

  /**
   * Save batch for pending upload
   */
  async saveBatchPending(
    batch: ScannedBatch,
    metadata?: Record<string, unknown>
  ): Promise<PendingUpload[]> {
    const pendings: PendingUpload[] = [];

    for (const doc of batch.documents) {
      const pending = await this.savePending(doc, {
        ...metadata,
        batchId: batch.batchId,
        totalPages: batch.documents.length,
      });
      pendings.push(pending);
    }

    return pendings;
  }

  /**
   * Get pending upload by ID
   */
  async getPending(localId: string): Promise<PendingUpload | null> {
    const key = this.getPendingKey(localId);
    const data = await this.storage.getItem(key);

    if (!data) return null;

    return JSON.parse(data);
  }

  /**
   * Get all pending uploads
   */
  async getAllPending(): Promise<PendingUpload[]> {
    const listKey = this.getListKey();
    const listData = await this.storage.getItem(listKey);

    if (!listData) return [];

    const ids: string[] = JSON.parse(listData);
    const pendings: PendingUpload[] = [];

    for (const id of ids) {
      const pending = await this.getPending(id);
      if (pending) {
        pendings.push(pending);
      }
    }

    // Sort by creation date, oldest first
    return pendings.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }

  /**
   * Update pending status
   */
  async updatePendingStatus(
    localId: string,
    status: PendingUpload['status'],
    error?: string
  ): Promise<void> {
    const pending = await this.getPending(localId);

    if (!pending) {
      throw new Error(`Pending upload not found: ${localId}`);
    }

    pending.status = status;
    pending.lastAttempt = new Date().toISOString();

    if (error) {
      pending.error = error;
      pending.retryCount = (pending.retryCount || 0) + 1;
    }

    if (status === 'uploaded') {
      // Remove from storage on success
      await this.removePending(localId);
    } else {
      // Update in storage
      const key = this.getPendingKey(localId);
      await this.storage.setItem(key, JSON.stringify(pending));
    }
  }

  /**
   * Mark as uploaded and remove
   */
  async markUploaded(localId: string, serverId?: string): Promise<void> {
    const pending = await this.getPending(localId);

    if (pending) {
      // Could save to history before removing
      if (serverId) {
        await this.saveToHistory(pending, serverId);
      }
    }

    await this.removePending(localId);
  }

  /**
   * Remove pending upload
   */
  async removePending(localId: string): Promise<void> {
    const key = this.getPendingKey(localId);
    await this.storage.removeItem(key);
    await this.removeFromPendingList(localId);
  }

  /**
   * Clear all pending uploads
   */
  async clearAllPending(): Promise<void> {
    const pendings = await this.getAllPending();

    for (const pending of pendings) {
      await this.removePending(pending.localId);
    }
  }

  /**
   * Get count of pending uploads
   */
  async getPendingCount(): Promise<number> {
    const listKey = this.getListKey();
    const listData = await this.storage.getItem(listKey);

    if (!listData) return 0;

    const ids: string[] = JSON.parse(listData);
    return ids.length;
  }

  /**
   * Check if storage limit reached
   */
  async isStorageFull(): Promise<boolean> {
    const count = await this.getPendingCount();
    return count >= this.config.maxPendingItems;
  }

  /**
   * Get uploads ready for retry
   */
  async getRetryQueue(maxRetries = 3): Promise<PendingUpload[]> {
    const pendings = await this.getAllPending();

    return pendings.filter(
      (p) =>
        (p.status === 'pending' || p.status === 'failed') &&
        (p.retryCount || 0) < maxRetries
    );
  }

  // Private helpers

  private getPendingKey(localId: string): string {
    return `${this.config.keyPrefix}pending_${localId}`;
  }

  private getListKey(): string {
    return `${this.config.keyPrefix}pending_list`;
  }

  private getHistoryKey(localId: string): string {
    return `${this.config.keyPrefix}history_${localId}`;
  }

  private async addToPendingList(localId: string): Promise<void> {
    const listKey = this.getListKey();
    const listData = await this.storage.getItem(listKey);

    const ids: string[] = listData ? JSON.parse(listData) : [];

    if (!ids.includes(localId)) {
      ids.push(localId);
      await this.storage.setItem(listKey, JSON.stringify(ids));
    }
  }

  private async removeFromPendingList(localId: string): Promise<void> {
    const listKey = this.getListKey();
    const listData = await this.storage.getItem(listKey);

    if (!listData) return;

    const ids: string[] = JSON.parse(listData);
    const filtered = ids.filter((id) => id !== localId);

    await this.storage.setItem(listKey, JSON.stringify(filtered));
  }

  private async saveToHistory(
    pending: PendingUpload,
    serverId: string
  ): Promise<void> {
    // Optional: Save completed uploads to history
    const historyKey = this.getHistoryKey(pending.localId);
    const historyEntry = {
      ...pending,
      status: 'uploaded' as const,
      serverId,
      uploadedAt: new Date().toISOString(),
    };

    await this.storage.setItem(historyKey, JSON.stringify(historyEntry));
  }

  private createDefaultStorage(): StorageProvider {
    // In-memory fallback storage
    // In production, use AsyncStorage or SecureStore
    const store = new Map<string, string>();

    return {
      async getItem(key: string): Promise<string | null> {
        return store.get(key) || null;
      },
      async setItem(key: string, value: string): Promise<void> {
        store.set(key, value);
      },
      async removeItem(key: string): Promise<void> {
        store.delete(key);
      },
      async getAllKeys(): Promise<string[]> {
        return Array.from(store.keys());
      },
    };
  }
}
