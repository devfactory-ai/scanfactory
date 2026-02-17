import type { RuleStep, DocumentData, RuleResult, PipelineContext } from '../types';
import { ruleRegistry } from '../registry';

interface LookupConfig {
  table: string;
  field: string;
  match_field: string;
  match_type?: 'exact' | 'prefix' | 'fuzzy';
  output_field?: string;
  required?: boolean;
}

async function lookupInGenericTable(
  db: D1Database,
  tableName: string,
  matchField: string,
  matchValue: string,
  matchType: string
): Promise<Record<string, unknown> | null> {
  let query: string;
  let params: string[];

  switch (matchType) {
    case 'prefix':
      query = `
        SELECT le.data FROM lookup_entries le
        JOIN lookup_tables lt ON le.table_id = lt.id
        WHERE lt.name = ? AND le.active = 1
        AND ? LIKE (le.key || '%')
        AND (le.valid_to IS NULL OR le.valid_to >= date('now'))
        ORDER BY LENGTH(le.key) DESC
        LIMIT 1
      `;
      params = [tableName, matchValue];
      break;
    case 'fuzzy':
      // Simple fuzzy: case-insensitive contains
      query = `
        SELECT le.data FROM lookup_entries le
        JOIN lookup_tables lt ON le.table_id = lt.id
        WHERE lt.name = ? AND le.active = 1
        AND LOWER(le.key) LIKE LOWER('%' || ? || '%')
        AND (le.valid_to IS NULL OR le.valid_to >= date('now'))
        LIMIT 1
      `;
      params = [tableName, matchValue];
      break;
    default: // exact
      query = `
        SELECT le.data FROM lookup_entries le
        JOIN lookup_tables lt ON le.table_id = lt.id
        WHERE lt.name = ? AND le.key = ? AND le.active = 1
        AND (le.valid_to IS NULL OR le.valid_to >= date('now'))
        LIMIT 1
      `;
      params = [tableName, matchValue];
  }

  const result = await db.prepare(query).bind(...params).first<{ data: string }>();
  return result ? JSON.parse(result.data) : null;
}

async function lookupInBsTable(
  db: D1Database,
  tableName: string,
  matchField: string,
  matchValue: string,
  matchType: string
): Promise<Record<string, unknown> | null> {
  // Handle bulletin_soin specific tables
  switch (tableName) {
    case 'bs_companies': {
      const query = matchType === 'prefix'
        ? `SELECT * FROM bs_companies WHERE active = 1 AND ? LIKE (code || '%') LIMIT 1`
        : `SELECT * FROM bs_companies WHERE active = 1 AND (name = ? OR code = ?) LIMIT 1`;
      const params = matchType === 'prefix' ? [matchValue] : [matchValue, matchValue];
      return db.prepare(query).bind(...params).first();
    }
    case 'bs_contracts': {
      if (matchType === 'prefix') {
        const result = await db
          .prepare(
            `SELECT c.*, co.name as company_name, co.code as company_code
             FROM bs_contracts c
             JOIN bs_companies co ON c.company_id = co.id
             WHERE c.active = 1 AND ? LIKE (c.policy_prefix || '%')
             AND (c.valid_to IS NULL OR c.valid_to >= date('now'))
             ORDER BY LENGTH(c.policy_prefix) DESC
             LIMIT 1`
          )
          .bind(matchValue)
          .first();
        return result;
      }
      return null;
    }
    case 'bs_conditions': {
      return db
        .prepare(
          `SELECT * FROM bs_conditions
           WHERE contract_id = ? AND service_type = ?
           LIMIT 1`
        )
        .bind(matchValue, matchField)
        .first();
    }
    case 'bs_pct_medications': {
      if (matchType === 'fuzzy') {
        return db
          .prepare(
            `SELECT * FROM bs_pct_medications
             WHERE LOWER(name_commercial) LIKE LOWER('%' || ? || '%')
             AND (valid_to IS NULL OR valid_to >= date('now'))
             LIMIT 1`
          )
          .bind(matchValue)
          .first();
      }
      return db
        .prepare(
          `SELECT * FROM bs_pct_medications
           WHERE name_commercial = ?
           AND (valid_to IS NULL OR valid_to >= date('now'))
           LIMIT 1`
        )
        .bind(matchValue)
        .first();
    }
    case 'bs_practitioners': {
      return db
        .prepare(
          `SELECT * FROM bs_practitioners
           WHERE active = 1 AND (name = ? OR cnam_code = ?)
           LIMIT 1`
        )
        .bind(matchValue, matchValue)
        .first();
    }
    default:
      return null;
  }
}

const lookupRule: RuleStep = {
  type: 'lookup',

  async execute(
    doc: DocumentData,
    config: Record<string, unknown>,
    ctx: PipelineContext
  ): Promise<RuleResult> {
    const cfg = config as unknown as LookupConfig;
    const fieldValue = doc.extracted_data[cfg.field];

    if (!fieldValue) {
      if (cfg.required) {
        return {
          success: true,
          anomalies: [
            {
              type: 'missing_lookup_field',
              message: `Champ "${cfg.field}" requis pour la recherche dans "${cfg.table}"`,
              severity: 'warning',
              field: cfg.field,
            },
          ],
        };
      }
      return { success: true };
    }

    const matchValue = String(fieldValue);
    const matchType = cfg.match_type ?? 'exact';
    const cacheKey = `${cfg.table}:${cfg.match_field}:${matchValue}:${matchType}`;

    // Check cache
    if (ctx.lookupCache.has(cacheKey)) {
      const cached = ctx.lookupCache.get(cacheKey);
      const outputField = cfg.output_field ?? `${cfg.table}_data`;
      return {
        success: true,
        computed: { [outputField]: cached },
      };
    }

    // Perform lookup
    let result: Record<string, unknown> | null = null;

    if (cfg.table.startsWith('bs_')) {
      result = await lookupInBsTable(
        ctx.db,
        cfg.table,
        cfg.match_field,
        matchValue,
        matchType
      );
    } else {
      result = await lookupInGenericTable(
        ctx.db,
        cfg.table,
        cfg.match_field,
        matchValue,
        matchType
      );
    }

    // Cache result
    ctx.lookupCache.set(cacheKey, result);

    if (!result && cfg.required) {
      return {
        success: true,
        anomalies: [
          {
            type: 'lookup_not_found',
            message: `Aucune correspondance trouvée dans "${cfg.table}" pour "${matchValue}"`,
            severity: 'warning',
            field: cfg.field,
          },
        ],
      };
    }

    const outputField = cfg.output_field ?? `${cfg.table}_data`;
    return {
      success: true,
      computed: result ? { [outputField]: result } : undefined,
    };
  },
};

// Register the rule
ruleRegistry.register('lookup', lookupRule);

export { lookupRule };
