import type { Profile, LearningMode } from '../contracts';
import type { RequestContext } from './context';
import { all, first, statement } from './db';
import { fail, newId } from './security';
import { parse, profileCreateSchema, profilePatchSchema } from './validation';

export interface ProfileRow {
  id: string; user_id: string; display_name: string; age_band: Profile['ageBand']; mode: LearningMode;
  difficulty: Profile['difficulty']; avatar: Profile['avatar']; interests_json: string; pace: Profile['pace'];
  accessibility_json: string; onboarded: number; diagnostic_score: number | null; created_at: string; updated_at: string;
}
export const defaultAccessibility: Profile['accessibility'] = { reducedMotion: false, sound: false, highContrast: false, fontScale: 1 };
export function profileFromRow(row: ProfileRow): Profile {
  return { id: row.id, userId: row.user_id, displayName: row.display_name, ageBand: row.age_band, mode: row.mode,
    difficulty: row.difficulty, avatar: row.avatar, interests: JSON.parse(row.interests_json), pace: row.pace,
    accessibility: JSON.parse(row.accessibility_json), onboarded: !!row.onboarded, diagnosticScore: row.diagnostic_score,
    createdAt: row.created_at, updatedAt: row.updated_at };
}
export function makeProfile(userId: string, name: string, mode: LearningMode, now: string, id = newId('profile')): Profile {
  return { id, userId, displayName: name, mode, ageBand: mode === 'child' ? '7-11' : mode === 'teen' ? '12-17' : '18+',
    difficulty: 'guided', avatar: mode === 'child' ? 'foxy' : mode === 'teen' ? 'byte' : 'nova', interests: [], pace: 'regular',
    accessibility: { ...defaultAccessibility }, onboarded: false, diagnosticScore: null, createdAt: now, updatedAt: now };
}
export function insertProfile(ctx: RequestContext, profile: Profile, ignore = false, maximum?: number) {
  return statement(ctx.options.db, `INSERT ${ignore ? 'OR IGNORE ' : ''}INTO profiles
    (id,user_id,display_name,age_band,mode,difficulty,avatar,interests_json,pace,accessibility_json,onboarded,diagnostic_score,created_at,updated_at)
    ${maximum ? 'SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM profiles WHERE user_id=?)<?' : 'VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)'}`,
  profile.id, profile.userId, profile.displayName, profile.ageBand, profile.mode, profile.difficulty, profile.avatar,
  JSON.stringify(profile.interests), profile.pace, JSON.stringify(profile.accessibility), Number(profile.onboarded), profile.diagnosticScore, profile.createdAt, profile.updatedAt,
  ...(maximum ? [profile.userId, maximum] : []));
}
export async function listProfiles(ctx: RequestContext): Promise<Profile[]> {
  const actor = requireActor(ctx);
  return (await all<ProfileRow>(ctx.options.db, "SELECT * FROM profiles WHERE user_id=? ORDER BY created_at,CASE mode WHEN 'child' THEN 0 WHEN 'teen' THEN 1 ELSE 2 END,id", actor.user.id)).map(profileFromRow);
}
export function requireActor(ctx: RequestContext) { if (!ctx.actor) return fail(401, 'AUTH_REQUIRED', 'Сначала войдите или откройте деморежим.'); return ctx.actor; }
export async function ownedProfile(ctx: RequestContext, id?: string | null): Promise<Profile> {
  const actor = requireActor(ctx);
  const selected = id ?? actor.activeProfileId;
  if (!selected) return fail(400, 'PROFILE_REQUIRED', 'Выберите профиль.');
  const row = await first<ProfileRow>(ctx.options.db, 'SELECT * FROM profiles WHERE id=? AND user_id=?', selected, actor.user.id);
  if (!row) return fail(404, 'PROFILE_NOT_FOUND', 'Профиль не найден.');
  return profileFromRow(row);
}
export async function createProfile(ctx: RequestContext, data: unknown): Promise<Profile> {
  const actor = requireActor(ctx); const body = parse(profileCreateSchema, data);
  const profile = { ...makeProfile(actor.user.id, body.displayName, body.mode, ctx.now.toISOString()), ...body };
  if (!(await insertProfile(ctx, profile, false, 10).run()).changes) return fail(409, 'PROFILE_LIMIT', 'В одной учётной записи можно создать до десяти профилей.');
  return profile;
}
export async function updateProfile(ctx: RequestContext, id: string, data: unknown): Promise<Profile> {
  const old = await ownedProfile(ctx, id); const body = parse(profilePatchSchema, data);
  const profile: Profile = { ...old, ...body, updatedAt: ctx.now.toISOString() };
  await statement(ctx.options.db, `UPDATE profiles SET display_name=?,age_band=?,mode=?,difficulty=?,avatar=?,interests_json=?,pace=?,accessibility_json=?,onboarded=?,diagnostic_score=?,updated_at=? WHERE id=? AND user_id=?`,
    profile.displayName, profile.ageBand, profile.mode, profile.difficulty, profile.avatar, JSON.stringify(profile.interests), profile.pace,
    JSON.stringify(profile.accessibility), Number(profile.onboarded), profile.diagnosticScore, profile.updatedAt, profile.id, profile.userId).run();
  return profile;
}
export async function deleteProfile(ctx: RequestContext, id: string): Promise<void> {
  const profile = await ownedProfile(ctx, id);
  const results = await ctx.options.db.batch([
    statement(ctx.options.db, `UPDATE sessions SET active_profile_id=(SELECT id FROM profiles WHERE user_id=? AND id<>? ORDER BY created_at,id LIMIT 1)
      WHERE user_id=? AND active_profile_id=? AND (SELECT COUNT(*) FROM profiles WHERE user_id=?)>1`, profile.userId, id, profile.userId, id, profile.userId),
    statement(ctx.options.db, 'DELETE FROM profiles WHERE id=? AND user_id=? AND (SELECT COUNT(*) FROM profiles WHERE user_id=?)>1', id, profile.userId, profile.userId),
  ]);
  if (!results[1].changes) return fail(409, 'LAST_PROFILE', 'Оставьте хотя бы один профиль.');
  if (ctx.actor?.activeProfileId === id) ctx.actor.activeProfileId = (await first<{ active_profile_id: string | null }>(ctx.options.db, 'SELECT active_profile_id FROM sessions WHERE token_hash=?', ctx.actor.tokenHash))?.active_profile_id ?? null;
}
