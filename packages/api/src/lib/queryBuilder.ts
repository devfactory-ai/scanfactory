/**
 * SQL Query Builder Utility
 *
 * Provides a fluent interface for building SQL queries with proper
 * parameterization to prevent SQL injection.
 */

export class QueryBuilder {
  private selectClauses: string[] = [];
  private fromClause = '';
  private joinClauses: string[] = [];
  private whereClauses: string[] = [];
  private groupByClauses: string[] = [];
  private orderByClauses: string[] = [];
  private limitValue?: number;
  private offsetValue?: number;
  private params: unknown[] = [];

  /**
   * Add SELECT clause
   */
  select(...columns: string[]): this {
    this.selectClauses.push(...columns);
    return this;
  }

  /**
   * Set FROM clause
   */
  from(table: string, alias?: string): this {
    this.fromClause = alias ? `${table} ${alias}` : table;
    return this;
  }

  /**
   * Add JOIN clause
   */
  join(table: string, alias: string, condition: string): this {
    this.joinClauses.push(`JOIN ${table} ${alias} ON ${condition}`);
    return this;
  }

  /**
   * Add LEFT JOIN clause
   */
  leftJoin(table: string, alias: string, condition: string): this {
    this.joinClauses.push(`LEFT JOIN ${table} ${alias} ON ${condition}`);
    return this;
  }

  /**
   * Add WHERE condition with parameter
   */
  where(condition: string, ...values: unknown[]): this {
    this.whereClauses.push(condition);
    this.params.push(...values);
    return this;
  }

  /**
   * Add WHERE condition only if value is defined
   */
  whereIf(condition: boolean, clause: string, ...values: unknown[]): this {
    if (condition) {
      this.whereClauses.push(clause);
      this.params.push(...values);
    }
    return this;
  }

  /**
   * Add WHERE IN condition
   */
  whereIn(column: string, values: unknown[]): this {
    if (values.length === 0) return this;
    const placeholders = values.map(() => '?').join(', ');
    this.whereClauses.push(`${column} IN (${placeholders})`);
    this.params.push(...values);
    return this;
  }

  /**
   * Add GROUP BY clause
   */
  groupBy(...columns: string[]): this {
    this.groupByClauses.push(...columns);
    return this;
  }

  /**
   * Add ORDER BY clause
   */
  orderBy(column: string, direction: 'ASC' | 'DESC' = 'ASC'): this {
    this.orderByClauses.push(`${column} ${direction}`);
    return this;
  }

  /**
   * Set LIMIT
   */
  limit(value: number): this {
    this.limitValue = value;
    return this;
  }

  /**
   * Set OFFSET
   */
  offset(value: number): this {
    this.offsetValue = value;
    return this;
  }

  /**
   * Build the SELECT query
   */
  buildSelect(): { sql: string; params: unknown[] } {
    const parts: string[] = [];

    // SELECT
    if (this.selectClauses.length === 0) {
      parts.push('SELECT *');
    } else {
      parts.push(`SELECT ${this.selectClauses.join(', ')}`);
    }

    // FROM
    if (this.fromClause) {
      parts.push(`FROM ${this.fromClause}`);
    }

    // JOINs
    if (this.joinClauses.length > 0) {
      parts.push(this.joinClauses.join(' '));
    }

    // WHERE
    if (this.whereClauses.length > 0) {
      parts.push(`WHERE ${this.whereClauses.join(' AND ')}`);
    }

    // GROUP BY
    if (this.groupByClauses.length > 0) {
      parts.push(`GROUP BY ${this.groupByClauses.join(', ')}`);
    }

    // ORDER BY
    if (this.orderByClauses.length > 0) {
      parts.push(`ORDER BY ${this.orderByClauses.join(', ')}`);
    }

    // LIMIT & OFFSET
    const params = [...this.params];
    if (this.limitValue !== undefined) {
      parts.push('LIMIT ?');
      params.push(this.limitValue);
    }
    if (this.offsetValue !== undefined) {
      parts.push('OFFSET ?');
      params.push(this.offsetValue);
    }

    return {
      sql: parts.join(' '),
      params,
    };
  }

  /**
   * Build COUNT query (for pagination)
   */
  buildCount(countColumn = '*'): { sql: string; params: unknown[] } {
    const parts: string[] = [];

    parts.push(`SELECT COUNT(${countColumn}) as count`);

    // FROM
    if (this.fromClause) {
      parts.push(`FROM ${this.fromClause}`);
    }

    // JOINs
    if (this.joinClauses.length > 0) {
      parts.push(this.joinClauses.join(' '));
    }

    // WHERE
    if (this.whereClauses.length > 0) {
      parts.push(`WHERE ${this.whereClauses.join(' AND ')}`);
    }

    // GROUP BY (for count distinct scenarios)
    if (this.groupByClauses.length > 0) {
      parts.push(`GROUP BY ${this.groupByClauses.join(', ')}`);
    }

    return {
      sql: parts.join(' '),
      params: [...this.params],
    };
  }

  /**
   * Clone the builder (for reuse)
   */
  clone(): QueryBuilder {
    const cloned = new QueryBuilder();
    cloned.selectClauses = [...this.selectClauses];
    cloned.fromClause = this.fromClause;
    cloned.joinClauses = [...this.joinClauses];
    cloned.whereClauses = [...this.whereClauses];
    cloned.groupByClauses = [...this.groupByClauses];
    cloned.orderByClauses = [...this.orderByClauses];
    cloned.limitValue = this.limitValue;
    cloned.offsetValue = this.offsetValue;
    cloned.params = [...this.params];
    return cloned;
  }

  /**
   * Reset the builder
   */
  reset(): this {
    this.selectClauses = [];
    this.fromClause = '';
    this.joinClauses = [];
    this.whereClauses = [];
    this.groupByClauses = [];
    this.orderByClauses = [];
    this.limitValue = undefined;
    this.offsetValue = undefined;
    this.params = [];
    return this;
  }
}

/**
 * Create a new query builder instance
 */
export function query(): QueryBuilder {
  return new QueryBuilder();
}

/**
 * Update builder for building UPDATE queries
 */
export class UpdateBuilder {
  private table = '';
  private setClauses: string[] = [];
  private whereClauses: string[] = [];
  private params: unknown[] = [];

  /**
   * Set table name
   */
  update(table: string): this {
    this.table = table;
    return this;
  }

  /**
   * Add SET clause with value
   */
  set(column: string, value: unknown): this {
    this.setClauses.push(`${column} = ?`);
    this.params.push(value);
    return this;
  }

  /**
   * Add SET clause only if value is defined
   */
  setIf(condition: boolean, column: string, value: unknown): this {
    if (condition) {
      this.setClauses.push(`${column} = ?`);
      this.params.push(value);
    }
    return this;
  }

  /**
   * Add raw SET clause (for things like datetime('now'))
   */
  setRaw(clause: string): this {
    this.setClauses.push(clause);
    return this;
  }

  /**
   * Add WHERE condition
   */
  where(condition: string, ...values: unknown[]): this {
    this.whereClauses.push(condition);
    this.params.push(...values);
    return this;
  }

  /**
   * Build the UPDATE query
   */
  build(): { sql: string; params: unknown[] } {
    if (!this.table) throw new Error('Table name required');
    if (this.setClauses.length === 0) throw new Error('At least one SET clause required');

    const parts: string[] = [];

    parts.push(`UPDATE ${this.table}`);
    parts.push(`SET ${this.setClauses.join(', ')}`);

    if (this.whereClauses.length > 0) {
      parts.push(`WHERE ${this.whereClauses.join(' AND ')}`);
    }

    return {
      sql: parts.join(' '),
      params: this.params,
    };
  }
}

/**
 * Create a new update builder instance
 */
export function update(table: string): UpdateBuilder {
  return new UpdateBuilder().update(table);
}
