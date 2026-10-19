import type { SqlDatabase, SqlResult, SqlStatement, SqlValue } from '../db';

type D1LikeResult = { success: boolean; results?: Record<string, unknown>[]; meta: { changes?: number; last_row_id?: number }; error?: string };
export interface D1LikeStatement {
  bind(...values: SqlValue[]): D1LikeStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[]; success: boolean; error?: string }>;
  run(): Promise<D1LikeResult>;
}
export interface D1LikeDatabase { prepare(sql: string): D1LikeStatement; batch(statements: D1LikeStatement[]): Promise<D1LikeResult[]> }
class D1Statement implements SqlStatement {
  constructor(readonly owner: D1LikeDatabase, readonly native: D1LikeStatement) {}
  bind(...values: SqlValue[]): SqlStatement { return new D1Statement(this.owner, this.native.bind(...values)); }
  first<T>(): Promise<T | null> { return this.native.first<T>(); }
  async all<T>(): Promise<T[]> { const value = await this.native.all<T>(); if (!value.success) throw new Error(value.error ?? 'D1 query failed'); return value.results; }
  async run(): Promise<SqlResult> { return resultOf(await this.native.run()); }
}
function resultOf(result: D1LikeResult): SqlResult {
  if (!result.success) throw new Error(result.error ?? 'D1 statement failed');
  return { changes: result.meta.changes ?? 0, ...(result.meta.last_row_id !== undefined ? { lastInsertRowId: result.meta.last_row_id } : {}) };
}
export function createD1Adapter(db: D1LikeDatabase): SqlDatabase {
  return {
    prepare(sql) { return new D1Statement(db, db.prepare(sql)); },
    async batch(statements) {
      if (!statements.length) return [];
      const native = statements.map(item => { if (!(item instanceof D1Statement) || item.owner !== db) throw new Error('Foreign database statement'); return item.native; });
      return (await db.batch(native)).map(resultOf);
    },
  };
}
