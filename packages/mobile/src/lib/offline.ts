import * as SecureStore from 'expo-secure-store';

const HISTORY_KEY = 'scanfactory_history';
const PENDING_KEY = 'scanfactory_pending';

export interface ScanHistoryItem {
  id: string;
  localId: string; // Local ID for pending uploads
  pipeline_name: string;
  pipeline_display_name: string;
  status: 'pending' | 'uploaded' | 'validated' | 'rejected' | 'error';
  confidence_score: number | null;
  created_at: string;
  imageUri?: string; // Local image URI for pending uploads
  error?: string; // Error message if upload failed
}

export interface PendingUpload {
  localId: string;
  imageUri: string;
  pipelineId: string;
  pipelineName: string;
  pipelineDisplayName: string;
  createdAt: string;
  retryCount: number;
}

/**
 * Offline storage manager for scan history and pending uploads
 */
class OfflineStorage {
  private history: ScanHistoryItem[] = [];
  private pending: PendingUpload[] = [];
  private initialized = false;

  /**
   * Initialize storage by loading from secure store
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      const historyJson = await SecureStore.getItemAsync(HISTORY_KEY);
      if (historyJson) {
        this.history = JSON.parse(historyJson);
      }

      const pendingJson = await SecureStore.getItemAsync(PENDING_KEY);
      if (pendingJson) {
        this.pending = JSON.parse(pendingJson);
      }

      this.initialized = true;
    } catch (error) {
      console.error('Failed to load offline storage:', error);
      this.history = [];
      this.pending = [];
    }
  }

  /**
   * Save history to secure store
   */
  private async saveHistory(): Promise<void> {
    try {
      await SecureStore.setItemAsync(HISTORY_KEY, JSON.stringify(this.history));
    } catch (error) {
      console.error('Failed to save history:', error);
    }
  }

  /**
   * Save pending uploads to secure store
   */
  private async savePending(): Promise<void> {
    try {
      await SecureStore.setItemAsync(PENDING_KEY, JSON.stringify(this.pending));
    } catch (error) {
      console.error('Failed to save pending uploads:', error);
    }
  }

  /**
   * Add a new scan to history
   */
  async addToHistory(item: ScanHistoryItem): Promise<void> {
    await this.init();

    // Check if item already exists
    const existingIndex = this.history.findIndex(
      (h) => h.id === item.id || h.localId === item.localId
    );

    if (existingIndex >= 0) {
      this.history[existingIndex] = item;
    } else {
      this.history.unshift(item);
    }

    // Keep only last 100 items
    if (this.history.length > 100) {
      this.history = this.history.slice(0, 100);
    }

    await this.saveHistory();
  }

  /**
   * Get scan history
   */
  async getHistory(): Promise<ScanHistoryItem[]> {
    await this.init();
    return [...this.history];
  }

  /**
   * Add a pending upload
   */
  async addPendingUpload(upload: PendingUpload): Promise<void> {
    await this.init();
    this.pending.push(upload);
    await this.savePending();

    // Also add to history as pending
    await this.addToHistory({
      id: '',
      localId: upload.localId,
      pipeline_name: upload.pipelineName,
      pipeline_display_name: upload.pipelineDisplayName,
      status: 'pending',
      confidence_score: null,
      created_at: upload.createdAt,
      imageUri: upload.imageUri,
    });
  }

  /**
   * Get pending uploads
   */
  async getPendingUploads(): Promise<PendingUpload[]> {
    await this.init();
    return [...this.pending];
  }

  /**
   * Mark a pending upload as completed
   */
  async completePendingUpload(
    localId: string,
    result: {
      id: string;
      status: string;
      confidence_score: number;
    }
  ): Promise<void> {
    await this.init();

    // Remove from pending
    this.pending = this.pending.filter((p) => p.localId !== localId);
    await this.savePending();

    // Update history
    const historyIndex = this.history.findIndex((h) => h.localId === localId);
    if (historyIndex >= 0) {
      this.history[historyIndex] = {
        ...this.history[historyIndex],
        id: result.id,
        status: result.status as ScanHistoryItem['status'],
        confidence_score: result.confidence_score,
      };
      await this.saveHistory();
    }
  }

  /**
   * Mark a pending upload as failed
   */
  async failPendingUpload(localId: string, error: string): Promise<void> {
    await this.init();

    // Update retry count
    const pendingIndex = this.pending.findIndex((p) => p.localId === localId);
    if (pendingIndex >= 0) {
      this.pending[pendingIndex].retryCount++;
      await this.savePending();
    }

    // Update history
    const historyIndex = this.history.findIndex((h) => h.localId === localId);
    if (historyIndex >= 0) {
      this.history[historyIndex].status = 'error';
      this.history[historyIndex].error = error;
      await this.saveHistory();
    }
  }

  /**
   * Remove a pending upload (when user cancels)
   */
  async removePendingUpload(localId: string): Promise<void> {
    await this.init();
    this.pending = this.pending.filter((p) => p.localId !== localId);
    await this.savePending();

    this.history = this.history.filter((h) => h.localId !== localId);
    await this.saveHistory();
  }

  /**
   * Merge server history with local history
   */
  async mergeServerHistory(
    serverItems: Array<{
      id: string;
      pipeline_name: string;
      pipeline_display_name: string;
      status: string;
      confidence_score: number | null;
      created_at: string;
    }>
  ): Promise<void> {
    await this.init();

    for (const serverItem of serverItems) {
      const existingIndex = this.history.findIndex((h) => h.id === serverItem.id);
      if (existingIndex >= 0) {
        // Update existing item
        this.history[existingIndex] = {
          ...this.history[existingIndex],
          status: serverItem.status as ScanHistoryItem['status'],
          confidence_score: serverItem.confidence_score,
        };
      } else {
        // Add new item
        this.history.push({
          id: serverItem.id,
          localId: serverItem.id,
          pipeline_name: serverItem.pipeline_name,
          pipeline_display_name: serverItem.pipeline_display_name,
          status: serverItem.status as ScanHistoryItem['status'],
          confidence_score: serverItem.confidence_score,
          created_at: serverItem.created_at,
        });
      }
    }

    // Sort by date descending
    this.history.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    // Keep only last 100 items
    if (this.history.length > 100) {
      this.history = this.history.slice(0, 100);
    }

    await this.saveHistory();
  }

  /**
   * Clear all data
   */
  async clear(): Promise<void> {
    this.history = [];
    this.pending = [];
    await SecureStore.deleteItemAsync(HISTORY_KEY);
    await SecureStore.deleteItemAsync(PENDING_KEY);
  }
}

export const offlineStorage = new OfflineStorage();

/**
 * Generate a unique local ID
 */
export function generateLocalId(): string {
  return `local_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
