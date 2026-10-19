export type SqlValue = string | number | null;
export interface SqlResult { changes: number; lastInsertRowId?: number }
export interface SqlStatement {
  bind(...values: SqlValue[]): SqlStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<T[]>;
  run(): Promise<SqlResult>;
}
/** batch must execute all mutations atomically and in order, or roll back all of them. */
export interface SqlDatabase {
  prepare(sql: string): SqlStatement;
  batch(statements: SqlStatement[]): Promise<SqlResult[]>;
}
export const statement = (db: SqlDatabase, sql: string, ...values: SqlValue[]) => db.prepare(sql).bind(...values);
export const first = <T>(db: SqlDatabase, sql: string, ...values: SqlValue[]) => statement(db, sql, ...values).first<T>();
export const all = <T>(db: SqlDatabase, sql: string, ...values: SqlValue[]) => statement(db, sql, ...values).all<T>();
export const run = (db: SqlDatabase, sql: string, ...values: SqlValue[]) => statement(db, sql, ...values).run();
