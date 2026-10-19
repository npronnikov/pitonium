import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdir, realpath, stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { handleApi, createGenericTutorProvider, type TutorProvider } from '../../packages/server';
import { openNodeDatabase } from '../../packages/server/adapters/node-sqlite';
import { createScryptHasher } from '../../packages/server/adapters/password-scrypt';
import { acquireDatabaseLock, migrateDatabase } from './database';

const port = Number(process.env.PORT ?? 8787);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer between 1 and 65535');
const hostname = process.env.HOST ?? '127.0.0.1';
const publicOrigin = new URL(process.env.PITON_PUBLIC_ORIGIN ?? `http://localhost:${port}`).origin;
const allowedOrigins = [...new Set([publicOrigin, `http://localhost:${port}`, `http://127.0.0.1:${port}`, ...(process.env.PITON_ALLOWED_ORIGINS ?? '').split(',').filter(Boolean).map(value => new URL(value.trim()).origin)])];
const allowedHosts = new Set(allowedOrigins.map(origin => new URL(origin).host.toLowerCase()));
const databasePath = resolve(process.env.PITON_DB_PATH ?? 'data/piton.sqlite'); const staticRoot = resolve(process.env.PITON_STATIC_DIR ?? 'dist/standalone');
await mkdir(dirname(databasePath), { recursive: true }); const releaseLock = await acquireDatabaseLock(databasePath); const db = openNodeDatabase(databasePath);
try { await migrateDatabase(db); } catch (error) { db.close(); await releaseLock(); throw error; }
const passwordHasher = createScryptHasher();
let tutorProvider: TutorProvider | undefined;
if (process.env.TUTOR_ENDPOINT && process.env.TUTOR_API_KEY && process.env.TUTOR_MODEL) {
  try { tutorProvider = createGenericTutorProvider({ endpoint: process.env.TUTOR_ENDPOINT, apiKey: process.env.TUTOR_API_KEY, model: process.env.TUTOR_MODEL }); }
  catch { console.error('Tutor provider configuration is invalid; authored static hints remain available.'); }
}
const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.zip': 'application/zip', '.whl': 'application/zip' };
async function serveStatic(pathname: string, request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (!['GET', 'HEAD'].includes(request.method ?? 'GET')) { response.writeHead(405); response.end(); return; }
  let decoded: string; try { decoded = decodeURIComponent(pathname); } catch { response.writeHead(400); response.end(); return; }
  if (decoded.includes('\0') || decoded.split('/').some(part => part.startsWith('.'))) { response.writeHead(404); response.end(); return; }
  let candidate = resolve(staticRoot, `.${decoded}`);
  if (candidate !== staticRoot && !candidate.startsWith(staticRoot + sep)) { response.writeHead(404); response.end(); return; }
  try { if (!(await stat(candidate)).isFile()) candidate = resolve(staticRoot, 'index.html'); }
  catch { if (extname(decoded)) { response.writeHead(404); response.end('Not found'); return; } candidate = resolve(staticRoot, 'index.html'); }
  try {
    const real = await realpath(candidate); const root = await realpath(staticRoot);
    if (!real.startsWith(root + sep)) { response.writeHead(404); response.end(); return; }
    const details = await stat(real);
    response.writeHead(200, { 'Content-Type': mime[extname(real)] ?? 'application/octet-stream', 'Content-Length': details.size,
      'Cache-Control': extname(real) === '.html' ? 'no-cache' : /-[a-zA-Z0-9_-]{8,}\./.test(real) ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
    if (request.method === 'HEAD') response.end(); else await pipeline(createReadStream(real), response);
  } catch { if (!response.headersSent) response.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' }); response.end('Сборка интерфейса отсутствует. Выполните сборку standalone.'); }
}
async function handleNodeRequest(incoming: IncomingMessage, outgoing: ServerResponse): Promise<void> {
  if (!allowedHosts.has((incoming.headers.host ?? '').toLowerCase())) { outgoing.writeHead(400); outgoing.end('Unrecognized host'); return; }
  const url = new URL(incoming.url ?? '/', publicOrigin);
  if (url.origin !== publicOrigin) { outgoing.writeHead(400); outgoing.end(); return; }
  if (!url.pathname.startsWith('/api/v1')) { await serveStatic(url.pathname, incoming, outgoing); return; }
  const headers = new Headers(); for (const [name, value] of Object.entries(incoming.headers)) if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
  const method = incoming.method ?? 'GET'; const init: RequestInit & { duplex?: 'half' } = { method, headers };
  if (!['GET', 'HEAD'].includes(method)) { init.body = Readable.toWeb(incoming) as unknown as ReadableStream<Uint8Array>; init.duplex = 'half'; }
  const result = await handleApi(new Request(url, init), { db, authMode: 'local', passwordHasher, tutorProvider, allowedOrigins,
    clientAddress: incoming.socket.remoteAddress ?? 'unknown', cookieSecure: publicOrigin.startsWith('https:'), timeZone: process.env.PITON_TIME_ZONE ?? 'UTC',
    onError: (_error, requestId) => console.error(`PITON API failure ${requestId}`) });
  outgoing.statusCode = result.status;
  result.headers.forEach((value, name) => { if (name.toLowerCase() !== 'set-cookie') outgoing.setHeader(name, value); });
  const cookies = result.headers.getSetCookie(); if (cookies.length) outgoing.setHeader('Set-Cookie', cookies);
  if (!result.body || method === 'HEAD') outgoing.end(); else await pipeline(Readable.fromWeb(result.body as unknown as import('node:stream/web').ReadableStream), outgoing);
}
const server = createServer({ maxHeaderSize: 16384 }, (request, response) => { void handleNodeRequest(request, response).catch(() => {
  if (!response.headersSent) response.writeHead(500, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Не удалось выполнить запрос.' } }));
}); });
server.requestTimeout = 15000; server.headersTimeout = 10000; server.keepAliveTimeout = 5000;
server.on('error', async error => { db.close(); await releaseLock(); console.error(error.message); process.exitCode = 1; });
server.listen(port, hostname, () => console.log(`PITON API and standalone UI: ${publicOrigin} (${hostname}:${port})`));
let stopping = false;
function stop() { if (stopping) return; stopping = true; server.close(() => { db.close(); void releaseLock().catch(() => { process.exitCode = 1; }); }); }
process.once('SIGTERM', stop); process.once('SIGINT', stop);
