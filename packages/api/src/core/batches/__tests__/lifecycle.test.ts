/**
 * T042: Tests for Batch Lifecycle
 * Tests state transitions, auto-close, and batch management
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BatchService } from '../lifecycle';
import type { BatchStatus, Batch } from '../lifecycle';

// Mock audit logging
vi.mock('../../../lib/audit', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

// Mock ULID generation
vi.mock('../../../lib/ulid', () => ({
  generateId: vi.fn((prefix: string) => `${prefix}_test123`),
}));

// Mock D1 Database
const createMockDb = () => {
  const batches: Map<string, Batch> = new Map();
  let pendingDocCount = 0;

  const mockStmt = {
    bind: vi.fn().mockReturnThis(),
    first: vi.fn().mockImplementation(async () => null),
    all: vi.fn().mockImplementation(async () => ({ results: [] })),
    run: vi.fn().mockResolvedValue({ success: true }),
  };

  const db = {
    prepare: vi.fn().mockReturnValue(mockStmt),
    batch: vi.fn().mockResolvedValue([{ success: true }, { success: true }]),
    _batches: batches,
    _mockStmt: mockStmt,
    _pendingDocCount: pendingDocCount,
    setPendingDocCount: (count: number) => {
      pendingDocCount = count;
    },
  };

  return db as unknown as D1Database & {
    _batches: Map<string, Batch>;
    _mockStmt: typeof mockStmt;
    setPendingDocCount: (count: number) => void;
  };
};

describe('BatchService', () => {
  let service: BatchService;
  let mockDb: ReturnType<typeof createMockDb>;

  const createBatch = (overrides: Partial<Batch> = {}): Batch => ({
    id: 'batch_test123',
    pipeline_id: 'pipe_bs',
    group_key: 'STAR',
    group_label: 'STAR Assurances',
    status: 'open',
    document_count: 0,
    export_r2_key: null,
    opened_at: '2024-01-01T00:00:00Z',
    closed_at: null,
    exported_at: null,
    settled_at: null,
    settled_amount: null,
    ...overrides,
  });

  beforeEach(() => {
    mockDb = createMockDb();
    service = new BatchService(mockDb);
    vi.clearAllMocks();
  });

  describe('getOrCreateOpenBatch', () => {
    it('should return existing open batch', async () => {
      const existingBatch = createBatch();
      mockDb._mockStmt.first.mockResolvedValueOnce(existingBatch);

      const result = await service.getOrCreateOpenBatch(
        'pipe_bs',
        'STAR',
        'STAR Assurances'
      );

      expect(result).toEqual(existingBatch);
      expect(mockDb._mockStmt.run).not.toHaveBeenCalled();
    });

    it('should create new batch when none exists', async () => {
      // First call returns null (no existing batch)
      mockDb._mockStmt.first.mockResolvedValueOnce(null);
      // Second call returns the newly created batch
      const newBatch = createBatch({ id: 'batch_test123' });
      mockDb._mockStmt.first.mockResolvedValueOnce(newBatch);

      const result = await service.getOrCreateOpenBatch(
        'pipe_bs',
        'STAR',
        'STAR Assurances',
        'user_123'
      );

      expect(result.id).toBe('batch_test123');
      expect(mockDb._mockStmt.run).toHaveBeenCalled();
    });
  });

  describe('getBatch', () => {
    it('should return batch by ID', async () => {
      const batch = createBatch();
      mockDb._mockStmt.first.mockResolvedValueOnce(batch);

      const result = await service.getBatch('batch_test123');

      expect(result).toEqual(batch);
    });

    it('should return null for non-existent batch', async () => {
      mockDb._mockStmt.first.mockResolvedValueOnce(null);

      const result = await service.getBatch('non_existent');

      expect(result).toBeNull();
    });
  });

  describe('addDocument', () => {
    it('should increment document count', async () => {
      const batch = createBatch({ document_count: 5 });
      mockDb._mockStmt.first
        .mockResolvedValueOnce({ ...batch, document_count: 6 })
        .mockResolvedValueOnce({ batch_config: JSON.stringify({ max_count: 100, max_days: 30 }) });

      const result = await service.addDocument('batch_test123', 'pipe_bs');

      expect(result.batch.document_count).toBe(6);
      expect(result.shouldClose).toBe(false);
    });

    it('should signal auto-close when max_count reached', async () => {
      const batch = createBatch({ document_count: 100 });
      mockDb._mockStmt.first
        .mockResolvedValueOnce(batch)
        .mockResolvedValueOnce({ batch_config: JSON.stringify({ max_count: 100, max_days: 30 }) });

      const result = await service.addDocument('batch_test123', 'pipe_bs');

      expect(result.shouldClose).toBe(true);
    });

    it('should throw error for non-existent batch', async () => {
      mockDb._mockStmt.first.mockResolvedValueOnce(null);

      await expect(
        service.addDocument('non_existent', 'pipe_bs')
      ).rejects.toThrow('Batch not found');
    });
  });

  describe('State Transitions', () => {
    describe('closeBatch', () => {
      it('should close an open batch', async () => {
        const openBatch = createBatch({ status: 'open' });
        const closedBatch = createBatch({ status: 'closed', closed_at: '2024-01-15T00:00:00Z' });
        mockDb._mockStmt.first
          .mockResolvedValueOnce(openBatch)
          .mockResolvedValueOnce(closedBatch);

        const result = await service.closeBatch('batch_test123', 'user_123');

        expect(result.status).toBe('closed');
      });

      it('should throw error for invalid transition', async () => {
        const exportedBatch = createBatch({ status: 'exported' });
        mockDb._mockStmt.first.mockResolvedValueOnce(exportedBatch);

        await expect(
          service.closeBatch('batch_test123')
        ).rejects.toThrow('Invalid batch transition');
      });
    });

    describe('verifyBatch', () => {
      it('should verify a closed batch with no pending documents', async () => {
        const closedBatch = createBatch({ status: 'closed' });
        const verifiedBatch = createBatch({ status: 'verified' });
        mockDb._mockStmt.first
          .mockResolvedValueOnce(closedBatch)
          .mockResolvedValueOnce({ count: 0 }) // No pending docs
          .mockResolvedValueOnce(verifiedBatch);

        const result = await service.verifyBatch('batch_test123');

        expect(result.status).toBe('verified');
      });

      it('should throw error if documents pending validation', async () => {
        const closedBatch = createBatch({ status: 'closed' });
        mockDb._mockStmt.first
          .mockResolvedValueOnce(closedBatch)
          .mockResolvedValueOnce({ count: 5 }); // 5 pending docs

        await expect(
          service.verifyBatch('batch_test123')
        ).rejects.toThrow('5 documents pending validation');
      });

      it('should throw error for open batch', async () => {
        const openBatch = createBatch({ status: 'open' });
        mockDb._mockStmt.first.mockResolvedValueOnce(openBatch);

        await expect(
          service.verifyBatch('batch_test123')
        ).rejects.toThrow('Invalid batch transition');
      });
    });

    describe('exportBatch', () => {
      it('should export a verified batch', async () => {
        const verifiedBatch = createBatch({ status: 'verified' });
        const exportedBatch = createBatch({
          status: 'exported',
          export_r2_key: 'exports/batch_test123.csv',
          exported_at: '2024-01-20T00:00:00Z',
        });
        mockDb._mockStmt.first
          .mockResolvedValueOnce(verifiedBatch)
          .mockResolvedValueOnce(exportedBatch);

        const result = await service.exportBatch(
          'batch_test123',
          'exports/batch_test123.csv',
          'user_123'
        );

        expect(result.status).toBe('exported');
        expect(result.export_r2_key).toBe('exports/batch_test123.csv');
        expect(mockDb.batch).toHaveBeenCalled(); // Atomic transaction
      });

      it('should throw error for non-verified batch', async () => {
        const closedBatch = createBatch({ status: 'closed' });
        mockDb._mockStmt.first.mockResolvedValueOnce(closedBatch);

        await expect(
          service.exportBatch('batch_test123', 'key.csv')
        ).rejects.toThrow('Invalid batch transition');
      });
    });

    describe('settleBatch', () => {
      it('should settle an exported batch', async () => {
        const exportedBatch = createBatch({ status: 'exported' });
        const settledBatch = createBatch({
          status: 'settled',
          settled_at: '2024-02-01T00:00:00Z',
          settled_amount: 15000.50,
        });
        mockDb._mockStmt.first
          .mockResolvedValueOnce(exportedBatch)
          .mockResolvedValueOnce(settledBatch);

        const result = await service.settleBatch('batch_test123', 15000.50, 'user_123');

        expect(result.status).toBe('settled');
        expect(result.settled_amount).toBe(15000.50);
      });

      it('should throw error for non-exported batch', async () => {
        const verifiedBatch = createBatch({ status: 'verified' });
        mockDb._mockStmt.first.mockResolvedValueOnce(verifiedBatch);

        await expect(
          service.settleBatch('batch_test123', 15000)
        ).rejects.toThrow('Invalid batch transition');
      });
    });

    describe('reopenBatch', () => {
      it('should reopen a closed batch', async () => {
        const closedBatch = createBatch({ status: 'closed' });
        const openBatch = createBatch({ status: 'open', closed_at: null });
        mockDb._mockStmt.first
          .mockResolvedValueOnce(closedBatch)
          .mockResolvedValueOnce(openBatch);

        const result = await service.reopenBatch('batch_test123', 'user_123');

        expect(result.status).toBe('open');
        expect(result.closed_at).toBeNull();
      });

      it('should reopen a verified batch', async () => {
        const verifiedBatch = createBatch({ status: 'verified' });
        const openBatch = createBatch({ status: 'open' });
        mockDb._mockStmt.first
          .mockResolvedValueOnce(verifiedBatch)
          .mockResolvedValueOnce(openBatch);

        const result = await service.reopenBatch('batch_test123');

        expect(result.status).toBe('open');
      });

      it('should throw error for exported batch', async () => {
        const exportedBatch = createBatch({ status: 'exported' });
        mockDb._mockStmt.first.mockResolvedValueOnce(exportedBatch);

        await expect(
          service.reopenBatch('batch_test123')
        ).rejects.toThrow('Cannot reopen batch in status: exported');
      });

      it('should throw error for settled batch', async () => {
        const settledBatch = createBatch({ status: 'settled' });
        mockDb._mockStmt.first.mockResolvedValueOnce(settledBatch);

        await expect(
          service.reopenBatch('batch_test123')
        ).rejects.toThrow('Cannot reopen batch in status: settled');
      });
    });
  });

  describe('getBatchesPastMaxDays', () => {
    it('should return batches past max_days', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 35); // 35 days ago

      const oldBatch = createBatch({
        opened_at: oldDate.toISOString(),
      });

      mockDb._mockStmt.all.mockResolvedValueOnce({
        results: [
          {
            ...oldBatch,
            batch_config: JSON.stringify({ max_count: 100, max_days: 30 }),
          },
        ],
      });

      const result = await service.getBatchesPastMaxDays();

      expect(result).toHaveLength(1);
      expect(result[0].batch.id).toBe('batch_test123');
    });

    it('should not return batches within max_days', async () => {
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 10); // 10 days ago

      const recentBatch = createBatch({
        opened_at: recentDate.toISOString(),
      });

      mockDb._mockStmt.all.mockResolvedValueOnce({
        results: [
          {
            ...recentBatch,
            batch_config: JSON.stringify({ max_count: 100, max_days: 30 }),
          },
        ],
      });

      const result = await service.getBatchesPastMaxDays();

      expect(result).toHaveLength(0);
    });
  });

  describe('listBatches', () => {
    it('should list batches with default pagination', async () => {
      const batches = [createBatch(), createBatch({ id: 'batch_test456' })];
      mockDb._mockStmt.first.mockResolvedValueOnce({ count: 2 });
      mockDb._mockStmt.all.mockResolvedValueOnce({ results: batches });

      const result = await service.listBatches({});

      expect(result.batches).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should filter by pipeline_id', async () => {
      const batches = [createBatch()];
      mockDb._mockStmt.first.mockResolvedValueOnce({ count: 1 });
      mockDb._mockStmt.all.mockResolvedValueOnce({ results: batches });

      const result = await service.listBatches({ pipeline_id: 'pipe_bs' });

      expect(result.batches).toHaveLength(1);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('pipeline_id = ?')
      );
    });

    it('should filter by status', async () => {
      mockDb._mockStmt.first.mockResolvedValueOnce({ count: 0 });
      mockDb._mockStmt.all.mockResolvedValueOnce({ results: [] });

      await service.listBatches({ status: 'exported' });

      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('status = ?')
      );
    });

    it('should apply pagination', async () => {
      mockDb._mockStmt.first.mockResolvedValueOnce({ count: 100 });
      mockDb._mockStmt.all.mockResolvedValueOnce({ results: [] });

      await service.listBatches({ limit: 10, offset: 20 });

      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT ? OFFSET ?')
      );
    });
  });

  describe('Valid State Transitions Map', () => {
    const transitions: Array<{
      from: BatchStatus;
      to: BatchStatus;
      valid: boolean;
    }> = [
      { from: 'open', to: 'closed', valid: true },
      { from: 'open', to: 'verified', valid: false },
      { from: 'open', to: 'exported', valid: false },
      { from: 'open', to: 'settled', valid: false },
      { from: 'closed', to: 'open', valid: true },
      { from: 'closed', to: 'verified', valid: true },
      { from: 'closed', to: 'exported', valid: false },
      { from: 'closed', to: 'settled', valid: false },
      { from: 'verified', to: 'open', valid: true }, // reopenBatch allows this
      { from: 'verified', to: 'closed', valid: true },
      { from: 'verified', to: 'exported', valid: true },
      { from: 'verified', to: 'settled', valid: false },
      { from: 'exported', to: 'open', valid: false },
      { from: 'exported', to: 'closed', valid: false },
      { from: 'exported', to: 'verified', valid: false },
      { from: 'exported', to: 'settled', valid: true },
      { from: 'settled', to: 'open', valid: false },
      { from: 'settled', to: 'closed', valid: false },
      { from: 'settled', to: 'verified', valid: false },
      { from: 'settled', to: 'exported', valid: false },
    ];

    transitions.forEach(({ from, to, valid }) => {
      it(`${from} -> ${to} should be ${valid ? 'valid' : 'invalid'}`, async () => {
        const batch = createBatch({ status: from });
        mockDb._mockStmt.first.mockResolvedValueOnce(batch);

        if (to === 'closed') {
          if (valid) {
            mockDb._mockStmt.first.mockResolvedValueOnce(createBatch({ status: 'closed' }));
            const result = await service.closeBatch('batch_test123');
            expect(result.status).toBe('closed');
          } else {
            await expect(service.closeBatch('batch_test123')).rejects.toThrow('Invalid batch transition');
          }
        } else if (to === 'verified') {
          if (valid) {
            mockDb._mockStmt.first
              .mockResolvedValueOnce({ count: 0 })
              .mockResolvedValueOnce(createBatch({ status: 'verified' }));
            const result = await service.verifyBatch('batch_test123');
            expect(result.status).toBe('verified');
          } else {
            await expect(service.verifyBatch('batch_test123')).rejects.toThrow('Invalid batch transition');
          }
        } else if (to === 'exported') {
          if (valid) {
            mockDb._mockStmt.first.mockResolvedValueOnce(createBatch({ status: 'exported' }));
            const result = await service.exportBatch('batch_test123', 'key.csv');
            expect(result.status).toBe('exported');
          } else {
            await expect(service.exportBatch('batch_test123', 'key.csv')).rejects.toThrow('Invalid batch transition');
          }
        } else if (to === 'settled') {
          if (valid) {
            mockDb._mockStmt.first.mockResolvedValueOnce(createBatch({ status: 'settled' }));
            const result = await service.settleBatch('batch_test123', 1000);
            expect(result.status).toBe('settled');
          } else {
            await expect(service.settleBatch('batch_test123', 1000)).rejects.toThrow('Invalid batch transition');
          }
        } else if (to === 'open') {
          if (valid) {
            mockDb._mockStmt.first.mockResolvedValueOnce(createBatch({ status: 'open' }));
            const result = await service.reopenBatch('batch_test123');
            expect(result.status).toBe('open');
          } else {
            await expect(service.reopenBatch('batch_test123')).rejects.toThrow('Cannot reopen batch');
          }
        }
      });
    });
  });
});
