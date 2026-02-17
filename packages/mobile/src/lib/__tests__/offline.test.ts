import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock SecureStore
vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}));

import * as SecureStore from 'expo-secure-store';
import { offlineStorage, generateLocalId, type ScanHistoryItem } from '../offline';

describe('offline storage', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset storage state
    (SecureStore.getItemAsync as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (SecureStore.setItemAsync as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (SecureStore.deleteItemAsync as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    // Force re-init by clearing the singleton
    await offlineStorage.clear();
  });

  describe('generateLocalId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateLocalId();
      const id2 = generateLocalId();
      expect(id1).not.toBe(id2);
    });

    it('should start with "local_"', () => {
      const id = generateLocalId();
      expect(id.startsWith('local_')).toBe(true);
    });

    it('should include timestamp', () => {
      const before = Date.now();
      const id = generateLocalId();
      const after = Date.now();

      const parts = id.split('_');
      const timestamp = parseInt(parts[1], 10);
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('history management', () => {
    it('should add item to history', async () => {
      const item: ScanHistoryItem = {
        id: 'doc_123',
        localId: 'local_123',
        pipeline_name: 'bulletin_soin',
        pipeline_display_name: 'Bulletin de Soin',
        status: 'uploaded',
        confidence_score: 0.95,
        created_at: '2024-01-01T00:00:00Z',
      };

      await offlineStorage.addToHistory(item);
      const history = await offlineStorage.getHistory();

      expect(history).toHaveLength(1);
      expect(history[0]).toEqual(item);
    });

    it('should update existing item by id', async () => {
      const item1: ScanHistoryItem = {
        id: 'doc_123',
        localId: 'local_123',
        pipeline_name: 'bulletin_soin',
        pipeline_display_name: 'Bulletin de Soin',
        status: 'pending',
        confidence_score: null,
        created_at: '2024-01-01T00:00:00Z',
      };

      const item2: ScanHistoryItem = {
        ...item1,
        status: 'validated',
        confidence_score: 0.98,
      };

      await offlineStorage.addToHistory(item1);
      await offlineStorage.addToHistory(item2);
      const history = await offlineStorage.getHistory();

      expect(history).toHaveLength(1);
      expect(history[0].status).toBe('validated');
      expect(history[0].confidence_score).toBe(0.98);
    });

    it('should limit history to 100 items', async () => {
      // Add 105 items
      for (let i = 0; i < 105; i++) {
        await offlineStorage.addToHistory({
          id: `doc_${i}`,
          localId: `local_${i}`,
          pipeline_name: 'test',
          pipeline_display_name: 'Test',
          status: 'uploaded',
          confidence_score: 0.9,
          created_at: new Date(2024, 0, 1, 0, 0, i).toISOString(),
        });
      }

      const history = await offlineStorage.getHistory();
      expect(history).toHaveLength(100);
    });
  });

  describe('conflict resolution', () => {
    it('should detect conflict when local is modified', async () => {
      // Add item and mark as locally modified
      await offlineStorage.addToHistory({
        id: 'doc_123',
        localId: 'local_123',
        pipeline_name: 'test',
        pipeline_display_name: 'Test',
        status: 'pending',
        confidence_score: null,
        created_at: '2024-01-01T00:00:00Z',
      });
      await offlineStorage.markLocallyModified('doc_123');

      // Merge with server data
      const result = await offlineStorage.mergeServerHistory([
        {
          id: 'doc_123',
          pipeline_name: 'test',
          pipeline_display_name: 'Test',
          status: 'validated',
          confidence_score: 0.95,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T01:00:00Z',
        },
      ]);

      expect(result.conflicts).toBe(1);
    });

    it('should keep local data when locally modified', async () => {
      await offlineStorage.addToHistory({
        id: 'doc_123',
        localId: 'local_123',
        pipeline_name: 'test',
        pipeline_display_name: 'Test',
        status: 'pending',
        confidence_score: null,
        created_at: '2024-01-01T00:00:00Z',
      });
      await offlineStorage.markLocallyModified('doc_123');

      await offlineStorage.mergeServerHistory([
        {
          id: 'doc_123',
          pipeline_name: 'test',
          pipeline_display_name: 'Test',
          status: 'validated',
          confidence_score: 0.95,
          created_at: '2024-01-01T00:00:00Z',
        },
      ]);

      const history = await offlineStorage.getHistory();
      // Local pending status should be kept (locallyModified wins)
      expect(history[0].locallyModified).toBe(true);
    });

    it('should accept server data when no local modifications', async () => {
      await offlineStorage.addToHistory({
        id: 'doc_123',
        localId: 'local_123',
        pipeline_name: 'test',
        pipeline_display_name: 'Test',
        status: 'pending',
        confidence_score: null,
        created_at: '2024-01-01T00:00:00Z',
      });

      await offlineStorage.mergeServerHistory([
        {
          id: 'doc_123',
          pipeline_name: 'test',
          pipeline_display_name: 'Test',
          status: 'validated',
          confidence_score: 0.95,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T01:00:00Z',
        },
      ]);

      const history = await offlineStorage.getHistory();
      expect(history[0].status).toBe('validated');
      expect(history[0].confidence_score).toBe(0.95);
    });

    it('should add new items from server', async () => {
      await offlineStorage.mergeServerHistory([
        {
          id: 'doc_new',
          pipeline_name: 'test',
          pipeline_display_name: 'Test',
          status: 'validated',
          confidence_score: 0.9,
          created_at: '2024-01-01T00:00:00Z',
        },
      ]);

      const history = await offlineStorage.getHistory();
      expect(history).toHaveLength(1);
      expect(history[0].id).toBe('doc_new');
    });

    it('should return merge statistics', async () => {
      await offlineStorage.addToHistory({
        id: 'doc_existing',
        localId: 'local_existing',
        pipeline_name: 'test',
        pipeline_display_name: 'Test',
        status: 'pending',
        confidence_score: null,
        created_at: '2024-01-01T00:00:00Z',
      });

      const result = await offlineStorage.mergeServerHistory([
        {
          id: 'doc_existing',
          pipeline_name: 'test',
          pipeline_display_name: 'Test',
          status: 'validated',
          confidence_score: 0.9,
          created_at: '2024-01-01T00:00:00Z',
        },
        {
          id: 'doc_new',
          pipeline_name: 'test',
          pipeline_display_name: 'Test',
          status: 'pending',
          confidence_score: 0.8,
          created_at: '2024-01-02T00:00:00Z',
        },
      ]);

      expect(result.merged).toBe(2);
    });
  });

  describe('pending uploads', () => {
    it('should add pending upload', async () => {
      await offlineStorage.addPendingUpload({
        localId: 'local_123',
        imageUri: 'file://image.jpg',
        pipelineId: 'pipeline_1',
        pipelineName: 'bulletin_soin',
        pipelineDisplayName: 'Bulletin de Soin',
        createdAt: '2024-01-01T00:00:00Z',
        retryCount: 0,
      });

      const pending = await offlineStorage.getPendingUploads();
      expect(pending).toHaveLength(1);
      expect(pending[0].localId).toBe('local_123');
    });

    it('should remove pending upload after completion', async () => {
      await offlineStorage.addPendingUpload({
        localId: 'local_123',
        imageUri: 'file://image.jpg',
        pipelineId: 'pipeline_1',
        pipelineName: 'test',
        pipelineDisplayName: 'Test',
        createdAt: '2024-01-01T00:00:00Z',
        retryCount: 0,
      });

      await offlineStorage.completePendingUpload('local_123', {
        id: 'doc_123',
        status: 'pending',
        confidence_score: 0.9,
      });

      const pending = await offlineStorage.getPendingUploads();
      expect(pending).toHaveLength(0);
    });

    it('should update history after completion', async () => {
      await offlineStorage.addPendingUpload({
        localId: 'local_123',
        imageUri: 'file://image.jpg',
        pipelineId: 'pipeline_1',
        pipelineName: 'test',
        pipelineDisplayName: 'Test',
        createdAt: '2024-01-01T00:00:00Z',
        retryCount: 0,
      });

      await offlineStorage.completePendingUpload('local_123', {
        id: 'doc_123',
        status: 'pending',
        confidence_score: 0.9,
      });

      const history = await offlineStorage.getHistory();
      expect(history[0].id).toBe('doc_123');
      expect(history[0].status).toBe('pending');
    });

    it('should increment retry count on failure', async () => {
      await offlineStorage.addPendingUpload({
        localId: 'local_123',
        imageUri: 'file://image.jpg',
        pipelineId: 'pipeline_1',
        pipelineName: 'test',
        pipelineDisplayName: 'Test',
        createdAt: '2024-01-01T00:00:00Z',
        retryCount: 0,
      });

      await offlineStorage.failPendingUpload('local_123', 'Network error');
      await offlineStorage.failPendingUpload('local_123', 'Network error');

      const pending = await offlineStorage.getPendingUploads();
      expect(pending[0].retryCount).toBe(2);
    });
  });

  describe('getLocallyModified', () => {
    it('should return only locally modified items', async () => {
      await offlineStorage.addToHistory({
        id: 'doc_1',
        localId: 'local_1',
        pipeline_name: 'test',
        pipeline_display_name: 'Test',
        status: 'pending',
        confidence_score: null,
        created_at: '2024-01-01T00:00:00Z',
      });
      await offlineStorage.addToHistory({
        id: 'doc_2',
        localId: 'local_2',
        pipeline_name: 'test',
        pipeline_display_name: 'Test',
        status: 'pending',
        confidence_score: null,
        created_at: '2024-01-01T00:01:00Z',
      });

      await offlineStorage.markLocallyModified('doc_1');

      const modified = await offlineStorage.getLocallyModified();
      expect(modified).toHaveLength(1);
      expect(modified[0].id).toBe('doc_1');
    });
  });
});
