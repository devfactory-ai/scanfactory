// ULID generation for audit log IDs
function generateULID(): string {
  const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const ENCODING_LEN = ENCODING.length;
  const TIME_LEN = 10;
  const RANDOM_LEN = 16;

  const now = Date.now();
  let str = '';

  // Encode timestamp (48 bits, 10 chars)
  let time = now;
  for (let i = TIME_LEN - 1; i >= 0; i--) {
    str = ENCODING[time % ENCODING_LEN] + str;
    time = Math.floor(time / ENCODING_LEN);
  }

  // Encode random (80 bits, 16 chars)
  const randomBytes = new Uint8Array(10);
  crypto.getRandomValues(randomBytes);
  for (let i = 0; i < RANDOM_LEN; i++) {
    const byte = randomBytes[Math.floor(i / 2)];
    const shift = (i % 2 === 0) ? 4 : 0;
    const nibble = (byte >> shift) & 0x1f;
    str += ENCODING[nibble];
  }

  return str;
}

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'validate'
  | 'reject'
  | 'export'
  | 'login'
  | 'logout';

export type EntityType =
  | 'document'
  | 'batch'
  | 'pipeline'
  | 'user'
  | 'lookup_table'
  | 'lookup_entry'
  | 'bs_company'
  | 'bs_contract'
  | 'bs_condition'
  | 'bs_pct_medication'
  | 'bs_practitioner';

interface AuditLogEntry {
  userId: string | null;
  action: AuditAction;
  entityType: EntityType;
  entityId: string;
  oldValue?: unknown;
  newValue?: unknown;
}

export async function logAudit(
  db: D1Database,
  entry: AuditLogEntry
): Promise<string> {
  const id = `audit_${generateULID()}`;
  const oldValueJson = entry.oldValue ? JSON.stringify(entry.oldValue) : null;
  const newValueJson = entry.newValue ? JSON.stringify(entry.newValue) : null;

  await db
    .prepare(
      `INSERT INTO audit_log (id, user_id, action, entity_type, entity_id, old_value, new_value)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      entry.userId,
      entry.action,
      entry.entityType,
      entry.entityId,
      oldValueJson,
      newValueJson
    )
    .run();

  return id;
}

export async function getAuditLog(
  db: D1Database,
  options: {
    entityType?: EntityType;
    entityId?: string;
    userId?: string;
    action?: AuditAction;
    limit?: number;
    offset?: number;
  } = {}
): Promise<{
  entries: Array<{
    id: string;
    user_id: string | null;
    action: string;
    entity_type: string;
    entity_id: string;
    old_value: unknown;
    new_value: unknown;
    created_at: string;
  }>;
  total: number;
}> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (options.entityType) {
    conditions.push('entity_type = ?');
    params.push(options.entityType);
  }

  if (options.entityId) {
    conditions.push('entity_id = ?');
    params.push(options.entityId);
  }

  if (options.userId) {
    conditions.push('user_id = ?');
    params.push(options.userId);
  }

  if (options.action) {
    conditions.push('action = ?');
    params.push(options.action);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;

  // Get total count
  const countResult = await db
    .prepare(`SELECT COUNT(*) as count FROM audit_log ${whereClause}`)
    .bind(...params)
    .first<{ count: number }>();

  // Get entries
  const entries = await db
    .prepare(
      `SELECT id, user_id, action, entity_type, entity_id, old_value, new_value, created_at
       FROM audit_log ${whereClause}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`
    )
    .bind(...params, limit, offset)
    .all();

  return {
    entries: (entries.results ?? []).map((row) => ({
      ...row,
      old_value: row.old_value ? JSON.parse(row.old_value as string) : null,
      new_value: row.new_value ? JSON.parse(row.new_value as string) : null,
    })) as Array<{
      id: string;
      user_id: string | null;
      action: string;
      entity_type: string;
      entity_id: string;
      old_value: unknown;
      new_value: unknown;
      created_at: string;
    }>,
    total: countResult?.count ?? 0,
  };
}
