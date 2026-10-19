import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { openNodeDatabase } from '../../packages/server/adapters/node-sqlite';
import { acquireDatabaseLock, backupDatabase, migrateDatabase, restoreDatabase, validateDatabaseFile } from './database';

const args = process.argv.slice(2); const command = args.shift() ?? 'migrate';
function option(name: string): string | undefined { const index = args.indexOf(name); if (index < 0) return undefined; const value = args[index + 1]; if (!value || value.startsWith('--')) throw new Error(`Missing value for ${name}`); return value; }
const databasePath = resolve(option('--db') ?? process.env.PITON_DB_PATH ?? 'data/piton.sqlite');
try {
  if (command === 'migrate') {
    await mkdir(dirname(databasePath), { recursive: true }); const release = await acquireDatabaseLock(databasePath); const db = openNodeDatabase(databasePath);
    try { const applied = await migrateDatabase(db, option('--migrations')); console.log(JSON.stringify({ database: databasePath, migrated: applied })); }
    finally { db.close(); await release(); }
  } else if (command === 'backup') {
    const to = option('--to'); if (!to) throw new Error('Usage: db-cli.ts backup --db data/piton.sqlite --to backups/piton-YYYY-MM-DD.sqlite');
    await backupDatabase(databasePath, to); console.log(JSON.stringify({ backup: resolve(to), verified: true }));
  } else if (command === 'restore') {
    const from = option('--from'); if (!from) throw new Error('Usage: db-cli.ts restore --from backups/piton.sqlite --db data/recovered.sqlite [--force]');
    await restoreDatabase(from, databasePath, { force: args.includes('--force') }); console.log(JSON.stringify({ restored: databasePath, verified: true }));
  } else if (command === 'check') { validateDatabaseFile(databasePath); console.log(JSON.stringify({ database: databasePath, integrity: 'ok' })); }
  else throw new Error('Commands: migrate, backup, restore, check');
} catch (error) { console.error(error instanceof Error ? error.message : 'Database command failed'); process.exitCode = 1; }
