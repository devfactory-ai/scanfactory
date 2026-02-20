/**
 * Admin Routes
 *
 * Protected endpoints for administrative operations
 * All routes require admin role
 */

import { Hono } from 'hono';
import type { Env } from '../index';
import { authMiddleware, roleGuard } from '../middleware/auth';
import { getAuditLog, type AuditAction, type EntityType } from '../lib/audit';
import { ValidationError } from '../lib/errors';

const adminRoutes = new Hono<{ Bindings: Env }>();

// All admin routes require authentication and admin role
adminRoutes.use('*', authMiddleware);
adminRoutes.use('*', roleGuard('admin'));

/**
 * GET /api/admin/audit-log
 *
 * Retrieve audit log entries with optional filtering
 *
 * Query parameters:
 * - entity_type: Filter by entity type (document, batch, user, etc.)
 * - entity_id: Filter by specific entity ID
 * - user_id: Filter by user who performed the action
 * - action: Filter by action type (create, update, delete, validate, etc.)
 * - limit: Number of entries to return (default: 50, max: 100)
 * - offset: Pagination offset (default: 0)
 */
adminRoutes.get('/audit-log', async (c) => {
  const query = c.req.query();

  // Parse and validate pagination
  const limit = Math.min(parseInt(query.limit ?? '50', 10) || 50, 100);
  const offset = parseInt(query.offset ?? '0', 10) || 0;

  if (limit < 1 || offset < 0) {
    throw new ValidationError('Paramètres de pagination invalides');
  }

  // Parse filters
  const filters: {
    entityType?: EntityType;
    entityId?: string;
    userId?: string;
    action?: AuditAction;
    limit: number;
    offset: number;
  } = {
    limit,
    offset,
  };

  if (query.entity_type) {
    filters.entityType = query.entity_type as EntityType;
  }

  if (query.entity_id) {
    filters.entityId = query.entity_id;
  }

  if (query.user_id) {
    filters.userId = query.user_id;
  }

  if (query.action) {
    filters.action = query.action as AuditAction;
  }

  // Fetch audit log
  const result = await getAuditLog(c.env.DB, filters);

  return c.json({
    entries: result.entries,
    total: result.total,
    limit,
    offset,
  });
});

/**
 * GET /api/admin/audit-log/:entity_type/:entity_id
 *
 * Get audit history for a specific entity
 */
adminRoutes.get('/audit-log/:entity_type/:entity_id', async (c) => {
  const entityType = c.req.param('entity_type') as EntityType;
  const entityId = c.req.param('entity_id');

  const query = c.req.query();
  const limit = Math.min(parseInt(query.limit ?? '50', 10) || 50, 100);
  const offset = parseInt(query.offset ?? '0', 10) || 0;

  const result = await getAuditLog(c.env.DB, {
    entityType,
    entityId,
    limit,
    offset,
  });

  return c.json({
    entity_type: entityType,
    entity_id: entityId,
    entries: result.entries,
    total: result.total,
    limit,
    offset,
  });
});

/**
 * GET /api/admin/pipelines
 *
 * List all active pipelines (moved from index.ts)
 */
adminRoutes.get('/pipelines', async (c) => {
  const pipelines = await c.env.DB.prepare(
    'SELECT id, name, display_name, description FROM pipelines WHERE active = 1'
  ).all();
  return c.json({ pipelines: pipelines.results ?? [] });
});

/**
 * GET /api/admin/pipelines/full
 *
 * List all pipelines with full configuration
 */
adminRoutes.get('/pipelines/full', async (c) => {
  const pipelines = await c.env.DB.prepare(
    'SELECT * FROM pipelines WHERE active = 1'
  ).all();
  return c.json({ pipelines: pipelines.results ?? [] });
});

/**
 * PUT /api/admin/pipelines/:id
 *
 * Update pipeline configuration
 */
adminRoutes.put('/pipelines/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{
    display_name?: string;
    description?: string | null;
    rule_steps?: string;
    batch_config?: string;
    field_display?: string | null;
  }>();

  const updates: string[] = [];
  const params: unknown[] = [];

  if (body.display_name !== undefined) {
    updates.push('display_name = ?');
    params.push(body.display_name);
  }
  if (body.description !== undefined) {
    updates.push('description = ?');
    params.push(body.description);
  }
  if (body.rule_steps !== undefined) {
    updates.push('rule_steps = ?');
    params.push(body.rule_steps);
  }
  if (body.batch_config !== undefined) {
    updates.push('batch_config = ?');
    params.push(body.batch_config);
  }
  if (body.field_display !== undefined) {
    updates.push('field_display = ?');
    params.push(body.field_display);
  }

  if (updates.length === 0) {
    return c.json({ success: true });
  }

  params.push(id);
  await c.env.DB.prepare(
    `UPDATE pipelines SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...params).run();

  return c.json({ success: true });
});

// ============================================================================
// Lookup Tables Management
// ============================================================================

/**
 * GET /api/admin/lookup-tables
 */
adminRoutes.get('/lookup-tables', async (c) => {
  const tables = await c.env.DB.prepare(`
    SELECT lt.*, COUNT(le.id) as entry_count
    FROM lookup_tables lt
    LEFT JOIN lookup_entries le ON lt.id = le.table_id
    GROUP BY lt.id
  `).all();
  return c.json({ tables: tables.results ?? [] });
});

/**
 * POST /api/admin/lookup-tables
 */
adminRoutes.post('/lookup-tables', async (c) => {
  const body = await c.req.json<{
    name: string;
    description?: string | null;
    pipeline_id?: string | null;
  }>();

  const { generateULID } = await import('../lib/ulid');
  const id = generateULID();

  await c.env.DB.prepare(
    'INSERT INTO lookup_tables (id, name, description, pipeline_id) VALUES (?, ?, ?, ?)'
  ).bind(id, body.name, body.description || null, body.pipeline_id || null).run();

  return c.json({ id, success: true });
});

/**
 * PUT /api/admin/lookup-tables/:id
 */
adminRoutes.put('/lookup-tables/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{
    name?: string;
    description?: string | null;
    pipeline_id?: string | null;
  }>();

  const updates: string[] = [];
  const params: unknown[] = [];

  if (body.name !== undefined) {
    updates.push('name = ?');
    params.push(body.name);
  }
  if (body.description !== undefined) {
    updates.push('description = ?');
    params.push(body.description);
  }
  if (body.pipeline_id !== undefined) {
    updates.push('pipeline_id = ?');
    params.push(body.pipeline_id);
  }

  if (updates.length > 0) {
    params.push(id);
    await c.env.DB.prepare(
      `UPDATE lookup_tables SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...params).run();
  }

  return c.json({ success: true });
});

/**
 * GET /api/admin/lookup-tables/:id/entries
 */
adminRoutes.get('/lookup-tables/:id/entries', async (c) => {
  const tableId = c.req.param('id');
  const search = c.req.query('search') || '';

  let query = 'SELECT * FROM lookup_entries WHERE table_id = ?';
  const params: unknown[] = [tableId];

  if (search) {
    query += ' AND (key LIKE ? OR data LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  query += ' ORDER BY key ASC LIMIT 100';

  const entries = await c.env.DB.prepare(query).bind(...params).all();
  return c.json({ entries: entries.results ?? [] });
});

/**
 * POST /api/admin/lookup-tables/:id/entries
 */
adminRoutes.post('/lookup-tables/:id/entries', async (c) => {
  const tableId = c.req.param('id');
  const body = await c.req.json<{
    key: string;
    data: string;
    valid_from?: string;
    valid_to?: string | null;
  }>();

  const { generateULID } = await import('../lib/ulid');
  const id = generateULID();

  await c.env.DB.prepare(
    'INSERT INTO lookup_entries (id, table_id, key, data, valid_from, valid_to, active) VALUES (?, ?, ?, ?, ?, ?, 1)'
  ).bind(
    id,
    tableId,
    body.key,
    body.data,
    body.valid_from || new Date().toISOString().split('T')[0],
    body.valid_to || null
  ).run();

  return c.json({ id, success: true });
});

/**
 * POST /api/admin/lookup-tables/:id/import
 */
adminRoutes.post('/lookup-tables/:id/import', async (c) => {
  const tableId = c.req.param('id');
  const body = await c.req.json<{
    entries: Array<{ key: string; data: Record<string, unknown> }>;
  }>();

  const { generateULID } = await import('../lib/ulid');
  const today = new Date().toISOString().split('T')[0];

  for (const entry of body.entries) {
    const id = generateULID();
    await c.env.DB.prepare(
      'INSERT INTO lookup_entries (id, table_id, key, data, valid_from, active) VALUES (?, ?, ?, ?, ?, 1)'
    ).bind(id, tableId, entry.key, JSON.stringify(entry.data), today).run();
  }

  return c.json({ imported: body.entries.length, success: true });
});

/**
 * PUT /api/admin/lookup-entries/:id
 */
adminRoutes.put('/lookup-entries/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{
    key?: string;
    data?: string;
    valid_from?: string;
    valid_to?: string | null;
    active?: number;
  }>();

  const updates: string[] = [];
  const params: unknown[] = [];

  if (body.key !== undefined) {
    updates.push('key = ?');
    params.push(body.key);
  }
  if (body.data !== undefined) {
    updates.push('data = ?');
    params.push(body.data);
  }
  if (body.valid_from !== undefined) {
    updates.push('valid_from = ?');
    params.push(body.valid_from);
  }
  if (body.valid_to !== undefined) {
    updates.push('valid_to = ?');
    params.push(body.valid_to);
  }
  if (body.active !== undefined) {
    updates.push('active = ?');
    params.push(body.active);
  }

  if (updates.length > 0) {
    params.push(id);
    await c.env.DB.prepare(
      `UPDATE lookup_entries SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...params).run();
  }

  return c.json({ success: true });
});

/**
 * DELETE /api/admin/lookup-entries/:id
 */
adminRoutes.delete('/lookup-entries/:id', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM lookup_entries WHERE id = ?').bind(id).run();
  return c.json({ success: true });
});

// ============================================================================
// User Management
// ============================================================================

/**
 * GET /api/admin/users
 */
adminRoutes.get('/users', async (c) => {
  const search = c.req.query('search') || '';
  const role = c.req.query('role') || '';

  let query = 'SELECT id, email, name, role, phone, active, created_at FROM users WHERE 1=1';
  const params: unknown[] = [];

  if (search) {
    query += ' AND (name LIKE ? OR email LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  if (role) {
    query += ' AND role = ?';
    params.push(role);
  }

  query += ' ORDER BY created_at DESC';

  const users = await c.env.DB.prepare(query).bind(...params).all();
  return c.json({ users: users.results ?? [] });
});

/**
 * POST /api/admin/users
 */
adminRoutes.post('/users', async (c) => {
  const body = await c.req.json<{
    email: string;
    name: string;
    password: string;
    role: 'admin' | 'operator' | 'consultant';
    phone?: string | null;
  }>();

  const { generateULID } = await import('../lib/ulid');
  const { hashPassword } = await import('../auth/password');

  const id = generateULID();
  const passwordHash = await hashPassword(body.password);

  await c.env.DB.prepare(
    'INSERT INTO users (id, email, name, password_hash, role, phone, active) VALUES (?, ?, ?, ?, ?, ?, 1)'
  ).bind(id, body.email, body.name, passwordHash, body.role, body.phone || null).run();

  return c.json({ id, success: true });
});

/**
 * PUT /api/admin/users/:id
 */
adminRoutes.put('/users/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{
    email?: string;
    name?: string;
    password?: string;
    role?: 'admin' | 'operator' | 'consultant';
    phone?: string | null;
    active?: number;
  }>();

  const updates: string[] = [];
  const params: unknown[] = [];

  if (body.email !== undefined) {
    updates.push('email = ?');
    params.push(body.email);
  }
  if (body.name !== undefined) {
    updates.push('name = ?');
    params.push(body.name);
  }
  if (body.password !== undefined) {
    const { hashPassword } = await import('../auth/password');
    updates.push('password_hash = ?');
    params.push(await hashPassword(body.password));
  }
  if (body.role !== undefined) {
    updates.push('role = ?');
    params.push(body.role);
  }
  if (body.phone !== undefined) {
    updates.push('phone = ?');
    params.push(body.phone);
  }
  if (body.active !== undefined) {
    updates.push('active = ?');
    params.push(body.active);
  }

  if (updates.length > 0) {
    params.push(id);
    await c.env.DB.prepare(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...params).run();
  }

  return c.json({ success: true });
});

// ============================================================================
// Bulletin de Soin Administration
// ============================================================================

/**
 * GET /api/admin/bulletin-soin/companies
 */
adminRoutes.get('/bulletin-soin/companies', async (c) => {
  const companies = await c.env.DB.prepare(
    'SELECT * FROM bs_companies ORDER BY name'
  ).all();
  return c.json({ companies: companies.results ?? [] });
});

/**
 * POST /api/admin/bulletin-soin/companies
 */
adminRoutes.post('/bulletin-soin/companies', async (c) => {
  const body = await c.req.json<{
    name: string;
    code: string;
    lot_max_bulletins?: number;
    lot_max_days?: number;
  }>();

  const { generateULID } = await import('../lib/ulid');
  const id = generateULID();

  await c.env.DB.prepare(
    'INSERT INTO bs_companies (id, name, code, lot_max_bulletins, lot_max_days, active) VALUES (?, ?, ?, ?, ?, 1)'
  ).bind(id, body.name, body.code, body.lot_max_bulletins || 50, body.lot_max_days || 7).run();

  return c.json({ id, success: true });
});

/**
 * PUT /api/admin/bulletin-soin/companies/:id
 */
adminRoutes.put('/bulletin-soin/companies/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{
    name?: string;
    code?: string;
    lot_max_bulletins?: number;
    lot_max_days?: number;
    active?: number;
  }>();

  const updates: string[] = [];
  const params: unknown[] = [];

  if (body.name !== undefined) { updates.push('name = ?'); params.push(body.name); }
  if (body.code !== undefined) { updates.push('code = ?'); params.push(body.code); }
  if (body.lot_max_bulletins !== undefined) { updates.push('lot_max_bulletins = ?'); params.push(body.lot_max_bulletins); }
  if (body.lot_max_days !== undefined) { updates.push('lot_max_days = ?'); params.push(body.lot_max_days); }
  if (body.active !== undefined) { updates.push('active = ?'); params.push(body.active); }

  if (updates.length > 0) {
    params.push(id);
    await c.env.DB.prepare(`UPDATE bs_companies SET ${updates.join(', ')} WHERE id = ?`).bind(...params).run();
  }

  return c.json({ success: true });
});

/**
 * GET /api/admin/bulletin-soin/contracts
 */
adminRoutes.get('/bulletin-soin/contracts', async (c) => {
  const contracts = await c.env.DB.prepare(`
    SELECT c.*, co.name as company_name
    FROM bs_contracts c
    JOIN bs_companies co ON c.company_id = co.id
    ORDER BY co.name, c.policy_prefix
  `).all();
  return c.json({ contracts: contracts.results ?? [] });
});

/**
 * POST /api/admin/bulletin-soin/contracts
 */
adminRoutes.post('/bulletin-soin/contracts', async (c) => {
  const body = await c.req.json<{
    company_id: string;
    policy_prefix: string;
    category?: string;
    valid_from?: string;
    valid_to?: string | null;
  }>();

  const { generateULID } = await import('../lib/ulid');
  const id = generateULID();

  await c.env.DB.prepare(
    'INSERT INTO bs_contracts (id, company_id, policy_prefix, category, valid_from, valid_to, active) VALUES (?, ?, ?, ?, ?, ?, 1)'
  ).bind(id, body.company_id, body.policy_prefix, body.category || null, body.valid_from || null, body.valid_to || null).run();

  return c.json({ id, success: true });
});

/**
 * PUT /api/admin/bulletin-soin/contracts/:id
 */
adminRoutes.put('/bulletin-soin/contracts/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{
    company_id?: string;
    policy_prefix?: string;
    category?: string;
    valid_from?: string;
    valid_to?: string | null;
    active?: number;
  }>();

  const updates: string[] = [];
  const params: unknown[] = [];

  if (body.company_id !== undefined) { updates.push('company_id = ?'); params.push(body.company_id); }
  if (body.policy_prefix !== undefined) { updates.push('policy_prefix = ?'); params.push(body.policy_prefix); }
  if (body.category !== undefined) { updates.push('category = ?'); params.push(body.category); }
  if (body.valid_from !== undefined) { updates.push('valid_from = ?'); params.push(body.valid_from); }
  if (body.valid_to !== undefined) { updates.push('valid_to = ?'); params.push(body.valid_to); }
  if (body.active !== undefined) { updates.push('active = ?'); params.push(body.active); }

  if (updates.length > 0) {
    params.push(id);
    await c.env.DB.prepare(`UPDATE bs_contracts SET ${updates.join(', ')} WHERE id = ?`).bind(...params).run();
  }

  return c.json({ success: true });
});

/**
 * GET /api/admin/bulletin-soin/contracts/:id/conditions
 */
adminRoutes.get('/bulletin-soin/contracts/:id/conditions', async (c) => {
  const contractId = c.req.param('id');
  const conditions = await c.env.DB.prepare(
    'SELECT * FROM bs_conditions WHERE contract_id = ? ORDER BY service_type'
  ).bind(contractId).all();
  return c.json({ conditions: conditions.results ?? [] });
});

/**
 * POST /api/admin/bulletin-soin/contracts/:id/conditions
 */
adminRoutes.post('/bulletin-soin/contracts/:id/conditions', async (c) => {
  const contractId = c.req.param('id');
  const body = await c.req.json<{
    service_type: string;
    reimbursement_rate: number;
    ceiling_per_act?: number | null;
    ceiling_annual?: number | null;
    waiting_days?: number;
    special_conditions?: string | null;
  }>();

  const { generateULID } = await import('../lib/ulid');
  const id = generateULID();

  await c.env.DB.prepare(
    'INSERT INTO bs_conditions (id, contract_id, service_type, reimbursement_rate, ceiling_per_act, ceiling_annual, waiting_days, special_conditions) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    id,
    contractId,
    body.service_type,
    body.reimbursement_rate,
    body.ceiling_per_act ?? null,
    body.ceiling_annual ?? null,
    body.waiting_days ?? 0,
    body.special_conditions ?? null
  ).run();

  return c.json({ id, success: true });
});

/**
 * PUT /api/admin/bulletin-soin/conditions/:id
 */
adminRoutes.put('/bulletin-soin/conditions/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{
    service_type?: string;
    reimbursement_rate?: number;
    ceiling_per_act?: number | null;
    ceiling_annual?: number | null;
    waiting_days?: number;
    special_conditions?: string | null;
  }>();

  const updates: string[] = [];
  const params: unknown[] = [];

  if (body.service_type !== undefined) { updates.push('service_type = ?'); params.push(body.service_type); }
  if (body.reimbursement_rate !== undefined) { updates.push('reimbursement_rate = ?'); params.push(body.reimbursement_rate); }
  if (body.ceiling_per_act !== undefined) { updates.push('ceiling_per_act = ?'); params.push(body.ceiling_per_act); }
  if (body.ceiling_annual !== undefined) { updates.push('ceiling_annual = ?'); params.push(body.ceiling_annual); }
  if (body.waiting_days !== undefined) { updates.push('waiting_days = ?'); params.push(body.waiting_days); }
  if (body.special_conditions !== undefined) { updates.push('special_conditions = ?'); params.push(body.special_conditions); }

  if (updates.length > 0) {
    params.push(id);
    await c.env.DB.prepare(`UPDATE bs_conditions SET ${updates.join(', ')} WHERE id = ?`).bind(...params).run();
  }

  return c.json({ success: true });
});

/**
 * GET /api/admin/bulletin-soin/pct
 */
adminRoutes.get('/bulletin-soin/pct', async (c) => {
  const search = c.req.query('search') || '';

  let query = 'SELECT * FROM bs_pct_medications WHERE 1=1';
  const params: unknown[] = [];

  if (search) {
    query += ' AND (name_commercial LIKE ? OR dci LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  query += ' ORDER BY name_commercial LIMIT 100';

  const medications = await c.env.DB.prepare(query).bind(...params).all();
  return c.json({ medications: medications.results ?? [] });
});

/**
 * GET /api/admin/bulletin-soin/practitioners
 */
adminRoutes.get('/bulletin-soin/practitioners', async (c) => {
  const search = c.req.query('search') || '';

  let query = 'SELECT * FROM bs_practitioners WHERE 1=1';
  const params: unknown[] = [];

  if (search) {
    query += ' AND (name LIKE ? OR cnam_code LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  query += ' ORDER BY name LIMIT 100';

  const practitioners = await c.env.DB.prepare(query).bind(...params).all();
  return c.json({ practitioners: practitioners.results ?? [] });
});

export { adminRoutes };
