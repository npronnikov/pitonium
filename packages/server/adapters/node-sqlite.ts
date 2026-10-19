import { DatabaseSync } from 'node:sqlite';
import { chmodSync } from 'node:fs';
import type { SqlDatabase, SqlResult, SqlStatement, SqlValue } from '../db';

class NodeStatement implements SqlStatement {
  constructor(readonly owner: DatabaseSync, readonly sql: string, readonly values: SqlValue[] = []) {}
  bind(...values: SqlValue[]): SqlStatement { return new NodeStatement(this.owner, this.sql, values); }
  async first<T>(): Promise<T | null> { return (this.owner.prepare(this.sql).get(...this.values) as T | undefined) ?? null; }
  async all<T>(): Promise<T[]> { return this.owner.prepare(this.sql).all(...this.values) as T[]; }
  runSync(): SqlResult { const result = this.owner.prepare(this.sql).run(...this.values); return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) }; }
  async run(): Promise<SqlResult> { return this.runSync(); }
}
export interface NodeDatabase extends SqlDatabase { native: DatabaseSync; close(): void }
export function createNodeAdapter(native: DatabaseSync): NodeDatabase {
  native.exec('PRAGMA foreign_keys=ON');
  native.exec('PRAGMA busy_timeout=5000');
  return {
    native,
    prepare(sql) { return new NodeStatement(native, sql); },
    async batch(statements) {
      if (!statements.length) return [];
      const own = statements.map(item => { if (!(item instanceof NodeStatement) || item.owner !== native) throw new Error('Foreign database statement'); return item; });
      // Deliberately no await inside the transaction: synchronous SQLite cannot interleave another request here.
      native.exec('BEGIN IMMEDIATE');
      try { const results = own.map(item => item.runSync()); native.exec('COMMIT'); return results; }
      catch (error) { native.exec('ROLLBACK'); throw error; }
    },
    close() { native.close(); },
  };
}
export function openNodeDatabase(filename = ':memory:'): NodeDatabase {
  const native = new DatabaseSync(filename);
  if (filename !== ':memory:') { chmodSync(filename, 0o600); native.exec('PRAGMA journal_mode=WAL'); }
  return createNodeAdapter(native);
}
