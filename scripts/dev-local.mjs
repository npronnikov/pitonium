import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const children = [];
let stopping = false;
function stop(signal = 'SIGTERM') { if (stopping) return; stopping = true; for (const child of children) child.kill(signal); }
function start(args, env) {
  const child = spawn(process.execPath, args, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } });
  children.push(child);
  child.on('error', error => { console.error(error.message); process.exitCode = 1; stop(); });
  child.on('exit', code => { if (!stopping) { process.exitCode = code || 0; stop(); } });
}
start(['--import', 'tsx', 'apps/api/server.ts'], { HOST: '127.0.0.1', PORT: '8787', PITON_PUBLIC_ORIGIN: 'http://127.0.0.1:8787', PITON_ALLOWED_ORIGINS: 'http://localhost:5173,http://127.0.0.1:5173' });
start(['node_modules/vite/bin/vite.js', '--config', 'vite.standalone.config.ts'], {});
process.once('SIGINT', () => stop('SIGINT'));
process.once('SIGTERM', () => stop());
