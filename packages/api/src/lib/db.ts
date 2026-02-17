/**
 * Database utilities and performance monitoring
 *
 * Provides:
 * - Query timing and logging
 * - Slow query detection
 * - Error wrapping with context
 */

// Slow query threshold in milliseconds
const SLOW_QUERY_THRESHOLD_MS = 100;

interface QueryLogEntry {
  type: 'db_query';
  timestamp: string;
  label: string;
  duration_ms: number;
  slow: boolean;
  request_id?: string;
  error?: string;
}

/**
 * Log a database query execution
 */
function logQuery(entry: QueryLogEntry): void {
  console.log(JSON.stringify(entry));
}

/**
 * Measure and log a database query execution
 *
 * Usage:
 * ```typescript
 * const result = await measureQuery('get_user_by_id', async () => {
 *   return db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
 * });
 * ```
 */
export async function measureQuery<T>(
  label: string,
  queryFn: () => Promise<T>,
  requestId?: string
): Promise<T> {
  const start = Date.now();
  let error: string | undefined;

  try {
    const result = await queryFn();
    return result;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    const duration = Date.now() - start;
    const slow = duration > SLOW_QUERY_THRESHOLD_MS;

    logQuery({
      type: 'db_query',
      timestamp: new Date().toISOString(),
      label,
      duration_ms: duration,
      slow,
      request_id: requestId,
      error,
    });

    // Warn on slow queries
    if (slow && !error) {
      console.warn(`[DB] Slow query detected: ${label} took ${duration}ms`);
    }
  }
}

/**
 * Create a measured database wrapper for a context
 * Automatically includes request ID in logs
 */
export function createMeasuredDB(db: D1Database, requestId?: string) {
  return {
    /**
     * Execute a query with timing
     */
    async query<T>(
      label: string,
      queryFn: (db: D1Database) => Promise<T>
    ): Promise<T> {
      return measureQuery(label, () => queryFn(db), requestId);
    },

    /**
     * Prepare a statement (no timing, just passthrough)
     */
    prepare(query: string) {
      return db.prepare(query);
    },

    /**
     * Execute a batch of statements with timing
     */
    async batch<T extends unknown[]>(
      label: string,
      statements: D1PreparedStatement[]
    ): Promise<D1Result<T>[]> {
      return measureQuery(
        label,
        () => db.batch(statements) as Promise<D1Result<T>[]>,
        requestId
      );
    },

    /**
     * Execute raw SQL with timing
     */
    async exec(label: string, query: string): Promise<D1ExecResult> {
      return measureQuery(label, () => db.exec(query), requestId);
    },
  };
}

/**
 * Batch multiple database operations into a single transaction
 * All operations succeed or fail together
 */
export async function withTransaction<T>(
  db: D1Database,
  operations: D1PreparedStatement[],
  label: string,
  requestId?: string
): Promise<D1Result<T>[]> {
  return measureQuery(
    `${label}_transaction`,
    () => db.batch(operations) as Promise<D1Result<T>[]>,
    requestId
  );
}
