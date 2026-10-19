import type { RequestContext } from './context';
import { statement } from './db';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) { super(message); }
}
export const fail = (status: number, code: string, message: string, details?: unknown): never => { throw new ApiError(status, code, message, details); };
export const newId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;
export function randomToken(): string { return Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join(''); }
export async function sha256(value: string): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join('');
}
export async function csrfForToken(token: string): Promise<string> { return sha256(`piton-v5:csrf:${token}`); }
export function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}
export function cookieToken(request: Request): string | null {
  const match = request.headers.get('cookie')?.match(/(?:^|;\s*)piton_session=([a-f0-9]{64})(?:;|$)/);
  return match?.[1] ?? null;
}
export function verifyOrigin(ctx: RequestContext): void {
  const raw = ctx.request.headers.get('origin');
  let origin: string;
  try { origin = new URL(raw ?? '').origin; } catch { return fail(403, 'ORIGIN_REQUIRED', 'Для записи нужен запрос с разрешённого адреса приложения.'); }
  const allowed = ctx.options.allowedOrigins ?? [new URL(ctx.request.url).origin];
  if (!allowed.includes(origin) || origin === 'null') fail(403, 'ORIGIN_MISMATCH', 'Запись с другого сайта запрещена.');
  const fetchSite = ctx.request.headers.get('sec-fetch-site');
  if (fetchSite === 'cross-site') fail(403, 'CROSS_SITE_REQUEST', 'Запись с другого сайта запрещена.');
}
export async function verifyCsrf(ctx: RequestContext): Promise<void> {
  if (!ctx.actor) fail(401, 'AUTH_REQUIRED', 'Сначала войдите или откройте деморежим.');
  const supplied = ctx.request.headers.get('x-csrf-token') ?? '';
  if (!sameSecret(supplied, await csrfForToken(ctx.actor!.token))) fail(403, 'CSRF_INVALID', 'Сессия обновилась. Обновите страницу и повторите действие.');
}
export async function readJson(ctx: RequestContext): Promise<unknown> {
  if (!ctx.request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) fail(415, 'JSON_REQUIRED', 'Отправьте данные в формате JSON.');
  const limit = 2 * 1024 * 1024;
  if (Number(ctx.request.headers.get('content-length') ?? 0) > limit) fail(413, 'BODY_TOO_LARGE', 'Слишком большой запрос.');
  const reader = ctx.request.body?.getReader();
  const chunks: Uint8Array[] = []; let bytes = 0;
  if (reader) for (;;) {
    const result = await reader.read(); if (result.done) break;
    bytes += result.value.byteLength;
    if (bytes > limit) { await reader.cancel(); fail(413, 'BODY_TOO_LARGE', 'Слишком большой запрос.'); }
    chunks.push(result.value);
  }
  const data = new Uint8Array(bytes); let offset = 0;
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
  let parsed: unknown;
  try { parsed = JSON.parse(new TextDecoder().decode(data)); } catch { return fail(400, 'INVALID_JSON', 'Некорректный JSON.'); }
  const stack: { value: unknown; depth: number }[] = [{ value: parsed, depth: 0 }]; let nodes = 0;
  while (stack.length) {
    const item = stack.pop()!;
    if (++nodes > 40000 || item.depth > 40) fail(413, 'JSON_TOO_COMPLEX', 'Слишком сложная структура данных.');
    if (item.value && typeof item.value === 'object') for (const child of Object.values(item.value)) stack.push({ value: child, depth: item.depth + 1 });
  }
  return parsed;
}
/** Database-backed fixed-window quotas work across local requests and hosted isolates. */
export async function rateLimit(ctx: RequestContext, scope: string, subject: string, limit: number, seconds: number): Promise<void> {
  const bucket = Math.floor(ctx.now.getTime() / (seconds * 1000));
  const key = `${scope}:${await sha256(subject)}:${bucket}`;
  const expires = new Date((bucket + 2) * seconds * 1000).toISOString();
  const result = await ctx.options.db.batch([
    statement(ctx.options.db, 'DELETE FROM rate_limits WHERE expires_at < ?', ctx.now.toISOString()),
    statement(ctx.options.db, 'INSERT OR IGNORE INTO rate_limits (key,count,expires_at) VALUES (?,0,?)', key, expires),
    statement(ctx.options.db, 'UPDATE rate_limits SET count=count+1 WHERE key=? AND count<?', key, limit),
  ]);
  if (result[2].changes === 0) { ctx.responseHeaders.set('Retry-After', String(seconds)); fail(429, 'RATE_LIMITED', 'Слишком много запросов. Подождите немного и повторите.'); }
}
