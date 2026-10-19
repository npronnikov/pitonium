import type { AuthState, LearningMode } from '../contracts';
import type { Actor, RequestContext } from './context';
import { first, statement } from './db';
import { cookieToken, csrfForToken, fail, newId, randomToken, rateLimit, sha256 } from './security';
import { insertProfile, listProfiles, makeProfile, ownedProfile, requireActor } from './profiles';
import { loginSchema, parse, registerSchema } from './validation';

interface UserRow { id: string; email: string | null; auth_method: 'local' | 'platform' | 'demo'; is_demo: number; password_hash: string | null }
interface SessionRow extends UserRow { active_profile_id: string | null }
const actorUser = (row: UserRow): NonNullable<AuthState['user']> => ({ id: row.id, email: row.email, isDemo: !!row.is_demo, authMethod: row.auth_method });
const presetProfiles = [{ name: 'Аня', mode: 'child' }, { name: 'Марк', mode: 'teen' }, { name: 'Лера', mode: 'adult' }] as const;

function setSessionCookie(ctx: RequestContext, token: string, expires: Date): void {
  const secure = ctx.options.cookieSecure ?? new URL(ctx.request.url).protocol === 'https:';
  ctx.responseHeaders.append('Set-Cookie', `piton_session=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${expires.toUTCString()}${secure ? '; Secure' : ''}`);
}
async function createSession(ctx: RequestContext, user: UserRow, activeProfileId: string | null, oldTokenHash?: string): Promise<Actor> {
  const token = randomToken(); const tokenHash = await sha256(token);
  const expires = new Date(ctx.now.getTime() + (ctx.options.sessionDays ?? 30) * 86400000);
  const statements = [statement(ctx.options.db, 'DELETE FROM sessions WHERE expires_at<=?', ctx.now.toISOString()),
    statement(ctx.options.db, 'INSERT INTO sessions (token_hash,user_id,active_profile_id,expires_at,created_at) VALUES (?,?,?,?,?)', tokenHash, user.id, activeProfileId, expires.toISOString(), ctx.now.toISOString())];
  if (oldTokenHash) statements.push(statement(ctx.options.db, 'DELETE FROM sessions WHERE token_hash=?', oldTokenHash));
  await ctx.options.db.batch(statements);
  setSessionCookie(ctx, token, expires);
  ctx.actor = { user: actorUser(user), token, tokenHash, activeProfileId };
  return ctx.actor;
}
async function platformUser(ctx: RequestContext): Promise<UserRow | null> {
  const trusted = ctx.options.trustedUser;
  if (!trusted?.id || trusted.id.length > 512) return null;
  const existing = await first<UserRow>(ctx.options.db, 'SELECT u.* FROM users u JOIN auth_identities i ON i.user_id=u.id WHERE i.provider=? AND i.subject=?', 'platform', trusted.id);
  if (existing) return existing;
  // Deterministic IDs make simultaneous first requests converge on one owner and the same three profiles.
  const digest = (await sha256(`platform:${trusted.id}`)).slice(0, 40);
  const user: UserRow = { id: `user_${digest}`, email: trusted.email?.slice(0, 254) ?? null, auth_method: 'platform', is_demo: 0, password_hash: null };
  const now = ctx.now.toISOString();
  await ctx.options.db.batch([
    statement(ctx.options.db, 'INSERT OR IGNORE INTO users (id,email,password_hash,auth_method,is_demo,created_at,updated_at) VALUES (?,?,NULL,?,0,?,?)', user.id, user.email, 'platform', now, now),
    statement(ctx.options.db, 'INSERT OR IGNORE INTO auth_identities (id,user_id,provider,subject,created_at) VALUES (?,?,?,?,?)', `identity_${digest}`, user.id, 'platform', trusted.id, now),
    ...presetProfiles.map((preset, index) => insertProfile(ctx, makeProfile(user.id, preset.name, preset.mode, now, `profile_${digest}_${index}`), true)),
  ]);
  return user;
}
export async function resolveActor(ctx: RequestContext): Promise<void> {
  const raw = cookieToken(ctx.request); const tokenHash = raw ? await sha256(raw) : null;
  const session = tokenHash ? await first<SessionRow>(ctx.options.db, `SELECT u.*,s.active_profile_id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?`, tokenHash, ctx.now.toISOString()) : null;
  if (ctx.options.authMode === 'platform') {
    const user = await platformUser(ctx);
    if (!user) { ctx.actor = null; return; }
    if (session && session.id === user.id && raw && tokenHash) ctx.actor = { user: actorUser(session), token: raw, tokenHash, activeProfileId: session.active_profile_id };
    else {
      const profile = await first<{ id: string }>(ctx.options.db, "SELECT id FROM profiles WHERE user_id=? ORDER BY created_at,CASE mode WHEN 'child' THEN 0 WHEN 'teen' THEN 1 ELSE 2 END,id LIMIT 1", user.id);
      await createSession(ctx, user, profile?.id ?? null, tokenHash ?? undefined);
    }
  } else if (session && session.auth_method !== 'platform' && raw && tokenHash) {
    // Local mode never consumes trustedUser or any oai-* request header.
    ctx.actor = { user: actorUser(session), token: raw, tokenHash, activeProfileId: session.active_profile_id };
  }
}
export async function authState(ctx: RequestContext): Promise<AuthState> {
  if (!ctx.actor) return { user: null, profiles: [], activeProfileId: null, csrfToken: null, authMode: ctx.options.authMode };
  const profiles = await listProfiles(ctx);
  let activeProfileId = ctx.actor.activeProfileId;
  if (!profiles.some(profile => profile.id === activeProfileId)) {
    activeProfileId = profiles[0]?.id ?? null;
    await statement(ctx.options.db, 'UPDATE sessions SET active_profile_id=? WHERE token_hash=?', activeProfileId, ctx.actor.tokenHash).run();
    ctx.actor.activeProfileId = activeProfileId;
  }
  return { user: ctx.actor.user, profiles, activeProfileId, csrfToken: await csrfForToken(ctx.actor.token), authMode: ctx.options.authMode };
}
export async function demo(ctx: RequestContext): Promise<AuthState> {
  if (ctx.options.authMode === 'platform') { requireActor(ctx); return authState(ctx); }
  await rateLimit(ctx, 'demo', ctx.options.clientAddress ?? 'local-client', 10, 3600);
  const now = ctx.now.toISOString(); const user: UserRow = { id: newId('user'), email: null, password_hash: null, auth_method: 'demo', is_demo: 1 };
  const profiles = presetProfiles.map(preset => makeProfile(user.id, preset.name, preset.mode, now));
  await ctx.options.db.batch([
    statement(ctx.options.db, 'INSERT INTO users (id,email,password_hash,auth_method,is_demo,created_at,updated_at) VALUES (?,NULL,NULL,?,1,?,?)', user.id, 'demo', now, now),
    ...profiles.map(profile => insertProfile(ctx, profile)),
  ]);
  await createSession(ctx, user, profiles[0].id, ctx.actor?.tokenHash);
  return authState(ctx);
}
export async function register(ctx: RequestContext, data: unknown): Promise<AuthState> {
  if (ctx.options.authMode !== 'local') return fail(403, 'PLATFORM_AUTH', 'Здесь используется вход через ChatGPT.');
  if (!ctx.options.passwordHasher) return fail(503, 'LOCAL_AUTH_UNAVAILABLE', 'Локальный вход не настроен.');
  if (ctx.actor && !ctx.actor.user.isDemo) return fail(409, 'ALREADY_REGISTERED', 'Учётная запись уже зарегистрирована.');
  const body = parse(registerSchema, data);
  await rateLimit(ctx, 'register-address', ctx.options.clientAddress ?? 'local-client', 10, 3600);
  await rateLimit(ctx, 'register-email', body.email, 4, 3600);
  const existing = await first<{ id: string }>(ctx.options.db, 'SELECT id FROM auth_identities WHERE provider=? AND subject=?', 'local', body.email);
  if (existing) return fail(409, 'EMAIL_IN_USE', 'Этот адрес уже зарегистрирован. Войдите в учётную запись.');
  const hash = await ctx.options.passwordHasher.hash(body.password); const now = ctx.now.toISOString();
  const user: UserRow = { id: ctx.actor?.user.id ?? newId('user'), email: body.email, auth_method: 'local', is_demo: 0, password_hash: hash };
  const upgrade = !!ctx.actor?.user.isDemo;
  const profile = upgrade ? null : makeProfile(user.id, body.displayName ?? 'Ученик', body.mode ?? 'child', now);
  try {
    await ctx.options.db.batch([
      upgrade ? statement(ctx.options.db, 'UPDATE users SET email=?,password_hash=?,auth_method=?,is_demo=0,updated_at=? WHERE id=? AND is_demo=1', user.email, hash, 'local', now, user.id)
        : statement(ctx.options.db, 'INSERT INTO users (id,email,password_hash,auth_method,is_demo,created_at,updated_at) VALUES (?,?,?,?,0,?,?)', user.id, user.email, hash, 'local', now, now),
      statement(ctx.options.db, 'INSERT INTO auth_identities (id,user_id,provider,subject,created_at) VALUES (?,?,?,?,?)', newId('identity'), user.id, 'local', body.email, now),
      ...(profile ? [insertProfile(ctx, profile)] : []),
      // Password registration invalidates every prior bearer token for this owner, including the guest session.
      statement(ctx.options.db, 'DELETE FROM sessions WHERE user_id=?', user.id),
    ]);
  } catch (error) {
    const collision = await first<{ id: string }>(ctx.options.db, 'SELECT id FROM auth_identities WHERE provider=? AND subject=?', 'local', body.email);
    if (collision) return fail(409, 'EMAIL_IN_USE', 'Этот адрес уже зарегистрирован. Войдите в учётную запись.');
    if (upgrade && await first(ctx.options.db, 'SELECT id FROM users WHERE id=? AND is_demo=0', user.id)) return fail(409, 'ALREADY_REGISTERED', 'Учётная запись уже зарегистрирована в другой вкладке. Обновите страницу.');
    throw error;
  }
  await createSession(ctx, user, profile?.id ?? ctx.actor?.activeProfileId ?? null);
  return authState(ctx);
}
const dummyHash = `scrypt$32768$8$1$${'00'.repeat(32)}$${'00'.repeat(64)}`;
export async function login(ctx: RequestContext, data: unknown): Promise<AuthState> {
  if (ctx.options.authMode !== 'local') return fail(403, 'PLATFORM_AUTH', 'Здесь используется вход через ChatGPT.');
  if (!ctx.options.passwordHasher) return fail(503, 'LOCAL_AUTH_UNAVAILABLE', 'Локальный вход не настроен.');
  const body = parse(loginSchema, data);
  await rateLimit(ctx, 'login-address', ctx.options.clientAddress ?? 'local-client', 30, 900);
  await rateLimit(ctx, 'login-email', body.email, 8, 900);
  const row = await first<UserRow>(ctx.options.db, 'SELECT u.* FROM users u JOIN auth_identities i ON i.user_id=u.id WHERE i.provider=? AND i.subject=?', 'local', body.email);
  const valid = await ctx.options.passwordHasher.verify(body.password, row?.password_hash ?? dummyHash);
  if (!row || !valid) return fail(401, 'INVALID_CREDENTIALS', 'Неверный адрес или пароль.');
  const profile = await first<{ id: string }>(ctx.options.db, "SELECT id FROM profiles WHERE user_id=? ORDER BY created_at,CASE mode WHEN 'child' THEN 0 WHEN 'teen' THEN 1 ELSE 2 END,id LIMIT 1", row.id);
  await createSession(ctx, row, profile?.id ?? null, ctx.actor?.tokenHash);
  return authState(ctx);
}
export async function activateProfile(ctx: RequestContext, id: string): Promise<AuthState> {
  const actor = requireActor(ctx); const profile = await ownedProfile(ctx, id);
  await statement(ctx.options.db, 'UPDATE sessions SET active_profile_id=? WHERE token_hash=? AND user_id=?', profile.id, actor.tokenHash, actor.user.id).run();
  actor.activeProfileId = profile.id;
  return authState(ctx);
}
export async function logout(ctx: RequestContext): Promise<AuthState> {
  if (ctx.actor) await statement(ctx.options.db, 'DELETE FROM sessions WHERE token_hash=?', ctx.actor.tokenHash).run();
  setSessionCookie(ctx, '', new Date(0)); ctx.actor = null;
  return authState(ctx);
}
