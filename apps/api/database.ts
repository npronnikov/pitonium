import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync, backup } from 'node:sqlite';
import { readFile, mkdir, access, open, unlink, link, rename, chmod } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NodeDatabase } from '../../packages/server/adapters/node-sqlite';

export const defaultMigrationsDirectory = fileURLToPath(new URL('../../drizzle/', import.meta.url));
export async function migrateDatabase(db: NodeDatabase, directory = defaultMigrationsDirectory): Promise<string[]> {
  const journal = JSON.parse(await readFile(resolve(directory, 'meta/_journal.json'), 'utf8')) as { entries: { tag: string }[] };
  db.native.exec('CREATE TABLE IF NOT EXISTS _piton_migrations (tag TEXT PRIMARY KEY NOT NULL, sha256 TEXT NOT NULL, applied_at TEXT NOT NULL)');
  const applied: string[] = [];
  for (const entry of journal.entries) {
    if (!/^[a-zA-Z0-9_-]+$/.test(entry.tag)) throw new Error('Invalid migration tag');
    const sql = await readFile(resolve(directory, `${entry.tag}.sql`), 'utf8');
    const hash = createHash('sha256').update(sql).digest('hex');
    const existing = db.native.prepare('SELECT sha256 FROM _piton_migrations WHERE tag=?').get(entry.tag) as { sha256: string } | undefined;
    if (existing) { if (existing.sha256 !== hash) throw new Error(`Applied migration changed: ${entry.tag}`); continue; }
    db.native.exec('BEGIN IMMEDIATE');
    try {
      for (const chunk of sql.split('--> statement-breakpoint')) if (chunk.trim()) db.native.exec(chunk);
      db.native.prepare('INSERT INTO _piton_migrations (tag,sha256,applied_at) VALUES (?,?,?)').run(entry.tag, hash, new Date().toISOString());
      db.native.exec('COMMIT'); applied.push(entry.tag);
    } catch (error) { db.native.exec('ROLLBACK'); throw error; }
  }
  return applied;
}
export async function fileExists(path: string): Promise<boolean> { try { await access(path); return true; } catch { return false; } }
export async function acquireDatabaseLock(filename: string): Promise<() => Promise<void>> {
  await mkdir(dirname(resolve(filename)), { recursive: true });
  const lock = `${resolve(filename)}.lock`;
  let descriptor;
  try { descriptor = await open(lock, 'wx', 0o600); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error(`Database is in use or has a stale lock: ${lock}. Stop the API before migration or recovery.`); throw error; }
  await descriptor.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })); await descriptor.close();
  let released = false;
  return async () => { if (!released) { released = true; await unlink(lock); } };
}
export function validateDatabaseFile(filename: string): void {
  const db = new DatabaseSync(resolve(filename), { readOnly: true });
  try {
    const rows = db.prepare('PRAGMA integrity_check').all() as { integrity_check: string }[];
    if (rows.length !== 1 || rows[0].integrity_check !== 'ok') throw new Error('SQLite integrity check failed');
    if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('SQLite foreign key check failed');
    const count = db.prepare("SELECT COUNT(*) AS count FROM sqlite_schema WHERE type='table' AND name IN ('users','profiles','submissions','projects','xp_ledger')").get() as { count: number };
    if (count.count !== 5) throw new Error('Backup is not a PITON application database');
  } finally { db.close(); }
}
/** SQLite's online backup API includes committed WAL changes and produces an independent, consistent snapshot. */
export async function backupDatabase(source: string, destination: string): Promise<void> {
  const from = resolve(source); const to = resolve(destination);
  if (from === to) throw new Error('Backup destination must differ from its source');
  if (await fileExists(to)) throw new Error('Backup destination already exists; choose a new filename');
  validateDatabaseFile(from); await mkdir(dirname(to), { recursive: true });
  const temporary = `${to}.tmp-${randomUUID()}`; const db = new DatabaseSync(from, { readOnly: true });
  try {
    await backup(db, temporary); await chmod(temporary, 0o600); validateDatabaseFile(temporary);
    // link() publishes the complete snapshot atomically and refuses to replace an existing file.
    await link(temporary, to);
  } finally { db.close(); if (await fileExists(temporary)) await unlink(temporary); }
}
/** Recovery refuses an active API lock. Existing databases require an explicit force option. */
export async function restoreDatabase(snapshot: string, destination: string, options: { force?: boolean } = {}): Promise<void> {
  const from = resolve(snapshot); const to = resolve(destination);
  if (from === to) throw new Error('Recovery source and destination must differ');
  validateDatabaseFile(from);
  if (!options.force && await fileExists(to)) throw new Error('Recovery destination exists; stop the API and use --force or a fresh path');
  const release = await acquireDatabaseLock(to); const temporary = `${to}.restore-${randomUUID()}`;
  try {
    await backupDatabase(from, temporary);
    // The API lock excludes all application writers. Discard journal sidecars only during this explicit recovery operation.
    for (const suffix of ['-wal', '-shm']) if (await fileExists(`${to}${suffix}`)) await unlink(`${to}${suffix}`);
    if (options.force) await rename(temporary, to); else { await link(temporary, to); await unlink(temporary); }
    validateDatabaseFile(to);
  } finally { if (await fileExists(temporary)) await unlink(temporary); await release(); }
}
