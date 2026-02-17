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

export { adminRoutes };
