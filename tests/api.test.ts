import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { mkdtemp, rm, readFile, writeFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { AuthState, LearningMode, ProgressSummary, Project, TutorReply } from '../packages/contracts';
import type { ApiOptions, TutorContext } from '../packages/server/context';
import type { RunResult } from '../packages/runtime/contracts';
import { runtimeVersion } from '../packages/runtime/contracts';
import { getLesson, missions, lessons } from '../packages/curriculum';
import { handleApi } from '../packages/server/handler';
import { createGenericTutorProvider } from '../packages/server/tutor';
import { createNodeAdapter, openNodeDatabase, type NodeDatabase } from '../packages/server/adapters/node-sqlite';
import { createD1Adapter, type D1LikeDatabase, type D1LikeStatement } from '../packages/server/adapters/d1';
import { createScryptHasher } from '../packages/server/adapters/password-scrypt';
import { backupDatabase, migrateDatabase, restoreDatabase, validateDatabaseFile, acquireDatabaseLock } from '../apps/api/database';

const origin = 'https://piton.test';
type Reply<T = unknown> = { response: Response; data: T };
async function fixture(t: TestContext, overrides: Partial<ApiOptions> = {}) {
  const db = openNodeDatabase(); await migrateDatabase(db); t.after(() => db.close());
  const clock = { value: new Date('2026-10-01T12:00:00.000Z') };
  const errors: unknown[] = [];
  const options: ApiOptions = { db, authMode: 'local', passwordHasher: createScryptHasher(), now: () => clock.value, allowedOrigins: [origin], clientAddress: '127.0.0.1', onError: error => errors.push(error), ...overrides };
  function client() {
    let cookie = ''; let csrf = '';
    return {
      get cookie() { return cookie; }, get csrf() { return csrf; },
      async call<T = unknown>(path: string, method = 'GET', body?: unknown, extra: { cookie?: string; csrf?: string; origin?: string | null; headers?: Record<string, string> } = {}): Promise<Reply<T>> {
        const headers = new Headers(extra.headers);
        const selectedCookie = extra.cookie ?? cookie; if (selectedCookie) headers.set('Cookie', selectedCookie);
        if (!['GET', 'HEAD'].includes(method)) {
          if (extra.origin !== null) headers.set('Origin', extra.origin ?? origin);
          headers.set('Content-Type', 'application/json'); headers.set('X-CSRF-Token', extra.csrf ?? csrf);
        }
        const response = await handleApi(new Request(`${origin}/api/v1${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), options);
        const setCookie = response.headers.get('set-cookie'); if (setCookie) cookie = setCookie.split(';')[0];
        const data = response.status === 204 ? undefined : await response.json() as T;
        if (data && typeof data === 'object' && 'csrfToken' in data) csrf = String(data.csrfToken ?? '');
        return { response, data: data as T };
      },
      async demo() { const reply = await this.call<AuthState>('/auth/demo', 'POST', {}); assert.equal(reply.response.status, 200, JSON.stringify(reply.data)); return reply.data; },
    };
  }
  return { db, clock, options, errors, client };
}
function evidence(profileId: string, lessonId = 'u1-l1', mode: LearningMode = 'child') {
  const lesson = getLesson(lessonId)!; assert.ok(lesson); const variant = lesson.variants[mode];
  const result: RunResult = { protocolVersion: '1', runtimeVersion, runId: crypto.randomUUID(),
    context: { profileId, lessonId: lesson.id, variantId: variant.id, draftVersion: 1, testsVersion: lesson.assessmentVersion },
    operation: 'check', status: 'ok', phase: 'complete', stdout: '', stderr: '', error: null, events: [], trace: [], dataFiles: [],
    testResults: variant.tests.map(item => ({ id: item.id, passed: true, status: 'ok', elapsedMs: 1, diagnostics: [] })),
    elapsedMs: 2, truncated: { stdout: false, events: false, trace: false, files: false }, gradingAuthority: 'browser-preview' };
  return { profileId, lessonId: lesson.id, mode, variantId: variant.id, contentVersion: lesson.contentVersion, assessmentVersion: lesson.assessmentVersion,
    runtimeVersion, idempotencyKey: crypto.randomUUID(), code: variant.solutionCode, hintLevel: 0, reflectionCorrect: true, result };
}
interface SubmissionReply { submissionId: string; accepted: boolean; xpAwarded: number; duplicate: boolean; gradingAuthority: 'browser-preview'; progress: ProgressSummary }
const profileId = (state: AuthState) => state.activeProfileId!;

test('local identity ignores platform headers; demo owners and three profiles are isolated', async t => {
  const app = await fixture(t, { trustedUser: { id: 'forged-subject', email: 'attacker@example.test' } });
  const one = app.client(); const two = app.client();
  const initial = await one.call<AuthState>('/auth/me', 'GET', undefined, { headers: { 'oai-authenticated-user-id': 'forged-subject', 'oai-authenticated-user-email': 'attacker@example.test' } });
  assert.equal(initial.data.user, null);
  const a = await one.demo(); const b = await two.demo();
  assert.equal(a.profiles.length, 3); assert.deepEqual(new Set(a.profiles.map(profile => profile.displayName)), new Set(['Аня', 'Марк', 'Лера']));
  assert.notEqual(a.user!.id, b.user!.id); assert.equal(a.profiles.some(profile => b.profiles.some(other => profile.id === other.id)), false);
  assert.equal((await one.call(`/profiles/${profileId(b)}`)).response.status, 404);
  assert.equal((await one.call(`/progress?profileId=${profileId(b)}`)).response.status, 404);
  assert.equal((await one.call(`/profiles/${profileId(b)}`, 'PATCH', { displayName: 'Взлом' })).response.status, 404);
  const me = await one.call<AuthState>('/auth/me'); assert.equal(me.data.user?.authMethod, 'demo');
  const token = one.cookie.split('=')[1]; const saved = app.db.native.prepare('SELECT token_hash FROM sessions WHERE user_id=?').get(a.user!.id) as { token_hash: string };
  assert.notEqual(saved.token_hash, token); assert.match(saved.token_hash, /^[a-f0-9]{64}$/);
  const activated = await one.call<AuthState>(`/profiles/${a.profiles[1].id}/activate`, 'POST', {}); assert.equal(activated.data.activeProfileId, a.profiles[1].id);
  assert.deepEqual(app.errors, []);
});

test('mutations enforce Origin and CSRF, cookies are HttpOnly/Secure, and session expiry is real', async t => {
  const app = await fixture(t); const client = app.client();
  assert.equal((await client.call('/auth/demo', 'POST', {}, { origin: null })).response.status, 403);
  assert.equal((await client.call('/auth/demo', 'POST', {}, { origin: 'https://evil.test' })).response.status, 403);
  const login = await client.call<AuthState>('/auth/demo', 'POST', {}); const pid = profileId(login.data);
  assert.match(login.response.headers.get('set-cookie')!, /HttpOnly/); assert.match(login.response.headers.get('set-cookie')!, /SameSite=Lax/); assert.match(login.response.headers.get('set-cookie')!, /Secure/);
  assert.equal((await client.call(`/profiles/${pid}`, 'PATCH', { displayName: 'Новое имя' }, { csrf: 'incorrect' })).response.status, 403);
  assert.equal((await client.call(`/profiles/${pid}`, 'PATCH', { displayName: 'Новое имя' }, { origin: 'https://evil.test' })).response.status, 403);
  assert.equal((await client.call(`/profiles/${pid}`, 'PATCH', { displayName: 'Новое имя' })).response.status, 200);
  app.clock.value = new Date('2026-11-05T12:00:00Z');
  assert.equal((await client.call<AuthState>('/auth/me')).data.user, null);
  assert.equal((await client.call(`/progress?profileId=${pid}`)).response.status, 401);
});

test('registration upgrades a demo account, retains XP/profile IDs, rotates sessions, and login uses scrypt', async t => {
  const app = await fixture(t); const client = app.client(); const guest = await client.demo(); const pid = profileId(guest);
  const checked = await client.call<SubmissionReply>('/submissions', 'POST', evidence(pid)); assert.equal(checked.response.status, 201, JSON.stringify(checked.data));
  const oldCookie = client.cookie;
  const registered = await client.call<AuthState>('/auth/register', 'POST', { email: 'Learner@example.test', password: 'long-enough-12345' });
  assert.equal(registered.response.status, 201, JSON.stringify(registered.data)); assert.equal(registered.data.user!.id, guest.user!.id); assert.equal(registered.data.user!.isDemo, false);
  assert.deepEqual(registered.data.profiles.map(profile => profile.id), guest.profiles.map(profile => profile.id));
  assert.equal((await client.call<ProgressSummary>(`/progress?profileId=${pid}`)).data.xp, getLesson('u1-l1')!.xp);
  assert.equal((await app.client().call<AuthState>('/auth/me', 'GET', undefined, { cookie: oldCookie })).data.user, null);
  const user = app.db.native.prepare('SELECT password_hash FROM users WHERE id=?').get(guest.user!.id) as { password_hash: string };
  assert.match(user.password_hash, /^scrypt\$32768\$8\$1\$/); assert.equal(user.password_hash.includes('long-enough'), false);
  await client.call('/auth/logout', 'POST', {});
  assert.equal((await client.call('/auth/login', 'POST', { email: 'learner@example.test', password: 'incorrect-password' })).response.status, 401);
  const login = await client.call<AuthState>('/auth/login', 'POST', { email: 'learner@example.test', password: 'long-enough-12345' });
  assert.equal(login.response.status, 200); assert.equal(login.data.user?.id, guest.user?.id);
  assert.equal((await client.call<ProgressSummary>(`/progress?profileId=${pid}`)).data.xp, checked.data.progress.xp);
  assert.deepEqual(app.errors, []);
});

test('failed login attempts are rate limited without exposing a password or exception', async t => {
  const app = await fixture(t); const client = app.client();
  for (let index = 0; index < 8; index++) assert.equal((await client.call('/auth/login', 'POST', { email: 'missing@example.test', password: 'not-a-real-password' })).response.status, 401);
  const blocked = await client.call<{ error: { code: string } }>('/auth/login', 'POST', { email: 'missing@example.test', password: 'not-a-real-password' });
  assert.equal(blocked.response.status, 429); assert.equal(blocked.data.error.code, 'RATE_LIMITED'); assert.ok(blocked.response.headers.get('retry-after'));
});

test('concurrent guest registrations cannot attach two local identities to the same owner', async t => {
  const app = await fixture(t); const client = app.client(); const guest = await client.demo();
  const results = await Promise.all(['one@example.test', 'two@example.test'].map(email => client.call<AuthState>('/auth/register', 'POST', { email, password: 'registered-password-123' })));
  assert.deepEqual(results.map(reply => reply.response.status).sort(), [201, 409]);
  assert.equal(app.db.native.prepare("SELECT COUNT(*) AS count FROM auth_identities WHERE user_id=? AND provider='local'").get(guest.user!.id)?.count, 1);
  assert.equal(app.db.native.prepare('SELECT COUNT(*) AS count FROM profiles WHERE user_id=?').get(guest.user!.id)?.count, 3);
  assert.deepEqual(app.errors, []);
});

test('hosted accounts require trusted identity on every request and never merge by email', async t => {
  const app = await fixture(t, { authMode: 'platform', trustedUser: { id: 'platform-one', email: 'same@example.test' } }); const first = app.client(); const second = app.client();
  const simultaneous = await Promise.all([first.call<AuthState>('/auth/me'), second.call<AuthState>('/auth/me')]);
  assert.equal(simultaneous[0].data.user!.id, simultaneous[1].data.user!.id); assert.equal(simultaneous[0].data.profiles.length, 3);
  assert.equal(simultaneous[0].data.authMode, 'platform'); assert.equal(simultaneous[0].data.user!.authMethod, 'platform');
  assert.equal((await first.call('/auth/login', 'POST', { email: 'same@example.test', password: 'arbitrary' })).response.status, 403);
  app.options.trustedUser = null;
  assert.equal((await first.call<AuthState>('/auth/me')).data.user, null);
  app.options.trustedUser = { id: 'platform-two', email: 'same@example.test' };
  const changed = await first.call<AuthState>('/auth/me'); assert.notEqual(changed.data.user!.id, simultaneous[0].data.user!.id);
  assert.equal((await first.call(`/progress?profileId=${simultaneous[0].data.activeProfileId}`)).response.status, 404);
});

test('submissions reject stale versions, wrong contexts, previews, altered and duplicate test IDs', async t => {
  const app = await fixture(t); const client = app.client(); const auth = await client.demo(); const pid = profileId(auth);
  const mutations: ((body: ReturnType<typeof evidence>) => void)[] = [
    body => { body.contentVersion = 'old'; }, body => { body.assessmentVersion = 'old'; },
    body => { body.runtimeVersion = 'fake-runtime' as typeof runtimeVersion; }, body => { body.result.context.testsVersion = 'old'; },
    body => { body.result.context.profileId = auth.profiles.find(profile => profile.id !== pid)!.id; },
    body => { body.result.context.variantId = 'wrong'; }, body => { body.result.operation = 'preview'; },
    body => { body.result.testResults.pop(); }, body => { body.result.testResults.push({ ...body.result.testResults[0] }); },
    body => { body.result.testResults[0].id = 'forged-test'; },
  ];
  for (const mutate of mutations) { const body = evidence(pid); mutate(body); const response = await client.call('/submissions', 'POST', body); assert.ok([409, 422].includes(response.response.status), JSON.stringify(response.data)); }
  const summary = (await client.call<ProgressSummary>(`/progress?profileId=${pid}`)).data;
  assert.equal(summary.xp, 0); assert.equal(summary.attempts, 0);
  const other = app.client(); const foreign = await other.demo(); assert.equal((await other.call('/submissions', 'POST', evidence(pid))).response.status, 404);
  assert.notEqual(profileId(foreign), pid); assert.deepEqual(app.errors, []);
});

test('world and skill detail endpoints return honest nodes/mastery only for an owned profile', async t => {
  const app = await fixture(t); const client = app.client(); const auth = await client.demo(); const pid = profileId(auth);
  const world = await client.call<{ world: { id: string; totalCount: number; availableCount: number }; nodes: { available: boolean; locked: boolean }[] }>(`/worlds/starter-village?profileId=${pid}`);
  assert.equal(world.response.status, 200); assert.equal(world.data.world.id, 'starter-village'); assert.equal(world.data.nodes.length, world.data.world.totalCount);
  assert.equal(world.data.nodes.filter(node => node.available).length, world.data.world.availableCount);
  const planned = await client.call<{ nodes: { available: boolean; locked: boolean }[] }>(`/worlds/maker-city?profileId=${pid}`);
  assert.ok(planned.data.nodes.some(node => !node.available && node.locked));
  const sid = getLesson('u1-l1')!.skillIds[0]; const skill = await client.call<{ skill: { id: string }; mastery: { level: number } }>(`/skills/${sid}?profileId=${pid}`);
  assert.equal(skill.response.status, 200); assert.equal(skill.data.skill.id, sid); assert.equal(skill.data.mastery.level, 0);
  for (const path of ['/worlds/missing', '/skills/missing']) assert.equal((await client.call(path)).response.status, 404);
  const other = app.client(); await other.demo();
  for (const path of [`/worlds/starter-village?profileId=${pid}`, `/skills/${sid}?profileId=${pid}`]) assert.equal((await other.call(path)).response.status, 404);
  assert.deepEqual(app.errors, []);
});

test('status ok alone is not a pass; real attempt evidence and review scheduling are separate from XP', async t => {
  const app = await fixture(t); const client = app.client(); const auth = await client.demo(); const pid = profileId(auth); const failed = evidence(pid);
  failed.result.testResults[0].passed = false;
  const response = await client.call<SubmissionReply>('/submissions', 'POST', failed);
  assert.equal(response.response.status, 201, JSON.stringify(response.data)); assert.equal(response.data.accepted, false); assert.equal(response.data.xpAwarded, 0);
  assert.equal(response.data.progress.attempts, 1); assert.equal(response.data.progress.mastery.find(skill => skill.skillId === getLesson('u1-l1')!.skillIds[0])!.level, 1);
  const scheduled = await client.call<{ scheduled: { dueAt: string }[]; reviews: unknown[] }>('/progress/review'); assert.equal(scheduled.data.reviews.length, 0); assert.equal(scheduled.data.scheduled[0].dueAt, '2026-10-02T12:00:00.000Z');
  assert.deepEqual(app.errors, []);
});

test('XP is idempotent across racing submissions and mode changes; guided for slice bypasses prerequisites', async t => {
  const app = await fixture(t); const client = app.client(); const auth = await client.demo(); const pid = profileId(auth);
  const locked = await client.call<{ locked: boolean }>('/lessons/u1-l2'); assert.equal(locked.data.locked, true);
  assert.equal((await client.call('/submissions', 'POST', evidence(pid, 'u1-l2'))).response.status, 409);
  assert.equal((await client.call<{ locked: boolean }>('/lessons/u05-l02')).data.locked, false);
  const body = evidence(pid, 'u5-l2'); const simultaneous = await Promise.all([client.call<SubmissionReply>('/submissions', 'POST', body), client.call<SubmissionReply>('/submissions', 'POST', body)]);
  assert.deepEqual(simultaneous.map(reply => reply.response.status), [201, 201], JSON.stringify(simultaneous.map(reply => reply.data)));
  assert.equal(simultaneous.reduce((sum, reply) => sum + reply.data.xpAwarded, 0), getLesson('u5-l2')!.xp);
  assert.equal(simultaneous.filter(reply => reply.data.duplicate).length, 1);
  const changed = structuredClone(body); changed.code += '\n# changed'; assert.equal((await client.call('/submissions', 'POST', changed)).response.status, 409);
  const mode = await client.call<SubmissionReply>('/submissions', 'POST', evidence(pid, 'u5-l2', 'teen'));
  assert.equal(mode.data.accepted, true); assert.equal(mode.data.xpAwarded, 0); assert.equal(mode.data.progress.attempts, 2);
  assert.equal(mode.data.progress.xp, getLesson('u5-l2')!.xp); assert.equal(mode.data.gradingAuthority, 'browser-preview');
  assert.equal(app.db.native.prepare('SELECT COUNT(*) AS count FROM xp_ledger WHERE profile_id=?').get(pid)?.count, 1);
  assert.deepEqual(app.errors, []);
});

test('mastery needs reflection and unassisted evidence; level four needs transfer plus a due repeated Python check', async t => {
  const app = await fixture(t); const client = app.client(); const auth = await client.demo(); const pid = profileId(auth); const sid = getLesson('u1-l1')!.skillIds[0];
  const initial = await client.call<SubmissionReply>('/submissions', 'POST', evidence(pid));
  assert.equal(initial.data.progress.mastery.find(skill => skill.skillId === sid)!.level, 3);
  const early = await client.call<SubmissionReply>('/submissions', 'POST', evidence(pid, 'u1-l1', 'teen'));
  assert.equal(early.data.progress.mastery.find(skill => skill.skillId === sid)!.level, 3);
  assert.equal((await client.call('/progress/review', 'POST', { profileId: pid, skillId: sid, submissionId: early.data.submissionId })).response.status, 409);
  app.clock.value = new Date('2026-10-08T12:00:01.000Z');
  assert.ok((await client.call<ProgressSummary>('/progress')).data.reviews.some(review => review.skillId === sid));
  const reviewed = await client.call<SubmissionReply>('/submissions', 'POST', evidence(pid, 'u1-l1', 'adult'));
  assert.equal(reviewed.data.xpAwarded, 0); assert.equal(reviewed.data.progress.mastery.find(skill => skill.skillId === sid)!.level, 4);
  const acknowledgment = await client.call<{ reviewed: boolean; progress: ProgressSummary }>('/progress/review', 'POST', { profileId: pid, skillId: sid, submissionId: reviewed.data.submissionId });
  assert.equal(acknowledgment.response.status, 200); assert.equal(acknowledgment.data.reviewed, true); assert.equal(acknowledgment.data.progress.xp, initial.data.progress.xp);
  const again = await client.call('/progress/review', 'POST', { profileId: pid, skillId: sid, submissionId: reviewed.data.submissionId }); assert.equal(again.response.status, 200);
  assert.equal(app.db.native.prepare('SELECT COUNT(*) AS count FROM submissions WHERE profile_id=?').get(pid)?.count, 3);
  assert.deepEqual(app.errors, []);
});

test('all twelve graphic badge IDs derive from actual owned attempts, projects, skill evidence and active days', async t => {
  const app = await fixture(t); const client = app.client(); const auth = await client.demo(); const pid = profileId(auth);
  const broken = evidence(pid, 'u5-l2', 'adult'); broken.result.testResults[0].passed = false; broken.reflectionCorrect = false;
  await client.call('/submissions', 'POST', broken);
  const fixed = await client.call<SubmissionReply>('/submissions', 'POST', evidence(pid, 'u5-l2', 'adult'));
  for (const badge of ['first-code', 'first-test', 'loop-mastery', 'first-bug-fixed', 'first-report', 'independent-solution']) assert.ok(fixed.data.progress.badges.includes(badge), badge);
  await client.call('/projects', 'POST', { profileId: pid, lessonId: 'u5-l2', mode: 'teen', title: 'Первая механика', code: 'print(5)' });
  for (const lesson of lessons) assert.equal((await client.call('/submissions', 'POST', evidence(pid, lesson.id))).response.status, 201);
  for (const day of [2, 3]) { app.clock.value = new Date(`2026-10-0${day}T12:00:00.000Z`); await client.call('/submissions', 'POST', evidence(pid, 'u5-l2')); }
  const progress = (await client.call<ProgressSummary>('/progress')).data;
  assert.deepEqual(new Set(progress.badges), new Set(['first-code', 'practice-streak', 'ten-lessons', 'loop-mastery', 'function-mastery', 'first-bug-fixed', 'first-test', 'first-mechanic', 'first-report', 'first-world', 'independent-solution', 'creator']));
  const otherPid = auth.profiles.find(profile => profile.id !== pid)!.id;
  assert.deepEqual((await client.call<ProgressSummary>(`/progress?profileId=${otherPid}`)).data.badges, []); assert.deepEqual(app.errors, []);
});

test('drafts are isolated by profile and mode and reject stale CAS writes', async t => {
  const app = await fixture(t); const client = app.client(); const auth = await client.demo(); const pid = profileId(auth);
  assert.equal((await client.call('/drafts/u1-l1')).data, null);
  const one = await client.call<{ revision: number }>('/drafts/u1-l1', 'PUT', { profileId: pid, mode: 'child', code: 'print(1)', expectedRevision: 0 }); assert.equal(one.data.revision, 1);
  assert.equal((await client.call('/drafts/u1-l1', 'PUT', { profileId: pid, mode: 'child', code: 'lost', expectedRevision: 0 })).response.status, 409);
  assert.equal((await client.call('/drafts/u1-l1?mode=teen')).data, null);
  const two = await client.call<{ revision: number }>('/drafts/u1-l1', 'PUT', { profileId: pid, mode: 'child', code: 'print(2)', expectedRevision: 1 }); assert.equal(two.data.revision, 2);
  const other = app.client(); await other.demo(); assert.equal((await other.call(`/drafts/u1-l1?profileId=${pid}`)).response.status, 404);
  assert.equal((await other.call('/drafts/u1-l1', 'PUT', { profileId: pid, mode: 'child', code: 'x', expectedRevision: 2 })).response.status, 404);
  const readyMission = missions.find(mission => mission.available && !mission.lessonId && mission.preview && mission.tests?.length)!;
  assert.ok(readyMission); assert.equal((await client.call(`/drafts/${readyMission.id}`, 'PUT', { profileId: pid, mode: 'adult', code: readyMission.starterCode ?? '', expectedRevision: 0 })).response.status, 200);
});

test('projects retain ten actual revisions, restore creates a new head, and every path checks ownership', async t => {
  const app = await fixture(t); const client = app.client(); const auth = await client.demo(); const pid = profileId(auth);
  const created = await client.call<Project>('/projects', 'POST', { profileId: pid, lessonId: 'u1-l1', mode: 'child', title: "Мой проект ' OR 1=1", code: 'print(1)', files: [{ path: 'data/input.txt', content: 'hello' }], config: { speed: 1 } });
  assert.equal(created.response.status, 201, JSON.stringify(created.data)); let project = created.data;
  for (let revision = 2; revision <= 12; revision++) { const saved = await client.call<Project>(`/projects/${project.id}`, 'PATCH', { expectedRevision: project.revision, code: `print(${revision})` }); assert.equal(saved.response.status, 200, JSON.stringify(saved.data)); project = saved.data; }
  const history = await client.call<{ revisions: Project[] }>(`/projects/${project.id}/revisions`); assert.equal(history.data.revisions.length, 10); assert.deepEqual(history.data.revisions.map(item => item.revision), [12, 11, 10, 9, 8, 7, 6, 5, 4, 3]);
  assert.equal((await client.call(`/projects/${project.id}`, 'PATCH', { expectedRevision: 1, code: 'stale' })).response.status, 409);
  const restored = await client.call<Project>(`/projects/${project.id}/restore`, 'POST', { revision: 3, expectedRevision: 12 }); assert.equal(restored.data.revision, 13); assert.equal(restored.data.code, 'print(3)');
  assert.equal((await client.call(`/projects/${project.id}/restore`, 'POST', { revision: 1, expectedRevision: 13 })).response.status, 404);
  assert.equal((await client.call(`/projects/${project.id}?profileId=${auth.profiles.find(profile => profile.id !== pid)!.id}`)).response.status, 404);
  const other = app.client(); await other.demo();
  for (const path of [`/projects/${project.id}`, `/projects/${project.id}/revisions`]) assert.equal((await other.call(path)).response.status, 404);
  assert.equal((await other.call(`/projects/${project.id}/restore`, 'POST', { revision: 3, expectedRevision: 13 })).response.status, 404);
  assert.equal((await other.call(`/projects/${project.id}`, 'DELETE')).response.status, 404);
  assert.equal((await client.call(`/projects/${project.id}`, 'PATCH', { expectedRevision: 13, files: [{ path: '../secret', content: 'bad' }] })).response.status, 422);
  const exported = await client.call<{ projects: Project[]; revisions: Project[]; profile: { id: string } }>(`/profiles/${pid}/export`); assert.equal(exported.data.profile.id, pid); assert.equal(exported.data.projects[0].revision, 13); assert.equal(exported.data.revisions.length, 10);
  const serialized = JSON.stringify(exported.data); assert.equal(serialized.includes(client.cookie.split('=')[1]), false); assert.equal(serialized.includes('password_hash'), false);
  assert.equal((await client.call(`/projects/${project.id}`, 'DELETE')).response.status, 204); assert.equal((await client.call(`/projects/${project.id}`)).response.status, 404);
  assert.equal(app.db.native.prepare('SELECT COUNT(*) AS count FROM project_revisions WHERE project_id=?').get(project.id)?.count, 0); assert.deepEqual(app.errors, []);
});

test('tutor has four explicit levels, private persisted replies, provider fallback, and opt-in code sharing', async t => {
  const sent: TutorContext[] = []; const app = await fixture(t, { tutorProvider: { async reply(context) { sent.push(context); return { message: 'Посмотри на число повторений.', usage: { total_tokens: 20 } }; } } });
  const client = app.client(); const auth = await client.demo(); const pid = profileId(auth);
  const base = { profileId: pid, lessonId: 'u5-l2', mode: 'child', hintLevel: 1, message: 'Как начать?', code: 'private_source = 42', error: 'private_trace' };
  const one = await client.call<TutorReply>('/tutor/messages', 'POST', base); assert.equal(one.data.provider, 'provider'); assert.equal('code' in sent[0], false); assert.equal('error' in sent[0], false);
  await client.call('/tutor/messages', 'POST', { ...base, shareCode: true }); assert.equal(sent[1].code, base.code);
  assert.equal((await client.call('/tutor/messages', 'POST', { ...base, hintLevel: 4 })).response.status, 422);
  app.options.tutorProvider = { async reply() { throw new Error('offline'); } };
  const final = await client.call<TutorReply>('/tutor/messages', 'POST', { ...base, hintLevel: 4, revealSolution: true }); assert.equal(final.data.provider, 'static'); assert.ok(final.data.message.includes(getLesson('u5-l2')!.variants.child.solutionCode));
  const history = await client.call<{ messages: TutorReply[] }>(`/tutor/messages?profileId=${pid}&lessonId=u5-l2&mode=child`); assert.equal(history.data.messages.length, 3); assert.equal(JSON.stringify(history.data).includes('private_source'), false);
  const checked = await client.call<SubmissionReply>('/submissions', 'POST', evidence(pid, 'u5-l2'));
  assert.ok(checked.data.progress.mastery.filter(item => getLesson('u5-l2')!.skillIds.includes(item.skillId)).every(item => item.level === 2));
  const other = app.client(); await other.demo(); assert.equal((await other.call(`/tutor/messages?profileId=${pid}`)).response.status, 404);
  assert.deepEqual(app.errors, []);
});

test('generic provider uses configured credentials server side and rejects oversized/invalid replies', async () => {
  let requestBody = ''; let authorization = '';
  const provider = createGenericTutorProvider({ endpoint: 'https://provider.example.test/v1/chat/completions', apiKey: 'server-only-key', model: 'configured-model',
    fetch: async (_url, init) => { requestBody = String(init?.body); authorization = new Headers(init?.headers).get('Authorization') ?? ''; return Response.json({ choices: [{ message: { content: 'Подсказка' } }], usage: { total_tokens: 12, unknown_secret: 'discard' } }); } });
  const reply = await provider.reply({ mode: 'adult', lessonTitle: 'For', objective: 'Loop', task: 'Repeat', hintLevel: 1, approvedHint: 'range', theory: [], learnerMessage: 'help' });
  assert.equal(reply.message, 'Подсказка'); assert.equal(authorization, 'Bearer server-only-key'); assert.equal(requestBody.includes('server-only-key'), false); assert.deepEqual(reply.usage, { total_tokens: 12 });
  const oversized = createGenericTutorProvider({ endpoint: 'https://provider.example.test/api', apiKey: 'k', model: 'm', fetch: async () => new Response('x'.repeat(70000)) });
  await assert.rejects(() => oversized.reply({ mode: 'child', lessonTitle: '', objective: '', task: '', hintLevel: 1, approvedHint: '', theory: [], learnerMessage: '' }), /too large/);
});

test('deleting an owned profile cascades private state, keeps another profile, and cannot delete the final one', async t => {
  const app = await fixture(t); const client = app.client(); const auth = await client.demo(); const pid = profileId(auth);
  await client.call('/submissions', 'POST', evidence(pid));
  await client.call('/projects', 'POST', { profileId: pid, lessonId: 'u1-l1', mode: 'child', title: 'Cascade', code: 'print(1)' });
  assert.equal((await client.call(`/profiles/${pid}`, 'DELETE')).response.status, 204);
  for (const table of ['submissions', 'xp_ledger', 'skill_evidence', 'skill_mastery', 'projects', 'project_revisions']) assert.equal(app.db.native.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE profile_id=?`).get(pid)?.count, 0);
  const remaining = (await client.call<AuthState>('/auth/me')).data.profiles;
  assert.equal((await client.call(`/profiles/${remaining[0].id}`, 'DELETE')).response.status, 204);
  assert.equal((await client.call(`/profiles/${remaining[1].id}`, 'DELETE')).response.status, 409);
  assert.deepEqual(app.errors, []);
});

test('simultaneous profile deletions still preserve one usable owned profile', async t => {
  const app = await fixture(t); const client = app.client(); const auth = await client.demo();
  const responses = await Promise.all(auth.profiles.map(profile => client.call(`/profiles/${profile.id}`, 'DELETE')));
  assert.deepEqual(responses.map(reply => reply.response.status).sort(), [204, 204, 409]);
  const state = (await client.call<AuthState>('/auth/me')).data;
  assert.equal(state.profiles.length, 1); assert.equal(state.activeProfileId, state.profiles[0].id); assert.deepEqual(app.errors, []);
});

test('the D1 adapter and Node adapter honor atomic batch rollback through the same SQL port', async t => {
  const app = await fixture(t); const base = app.db;
  class FakeD1Statement implements D1LikeStatement {
    constructor(readonly sql: string, readonly values: (string | number | null)[] = []) {}
    bind(...values: (string | number | null)[]) { return new FakeD1Statement(this.sql, values); }
    first<T>() { return base.prepare(this.sql).bind(...this.values).first<T>(); }
    async all<T>() { return { success: true, results: await base.prepare(this.sql).bind(...this.values).all<T>() }; }
    async run() { const result = await base.prepare(this.sql).bind(...this.values).run(); return { success: true, meta: { changes: result.changes, last_row_id: result.lastInsertRowId } }; }
  }
  const d1: D1LikeDatabase = { prepare: sql => new FakeD1Statement(sql), async batch(statements) { return (await base.batch(statements.map(item => { const row = item as FakeD1Statement; return base.prepare(row.sql).bind(...row.values); }))).map(result => ({ success: true, meta: { changes: result.changes } })); } };
  const adapter = createD1Adapter(d1); const first = adapter.prepare('INSERT INTO rate_limits (key,count,expires_at) VALUES (?,?,?)').bind('atomic-test', 1, '2100-01-01');
  await assert.rejects(() => adapter.batch([first, adapter.prepare('INSERT INTO missing_table (key) VALUES (?)').bind('bad')]));
  assert.equal(await adapter.prepare('SELECT * FROM rate_limits WHERE key=?').bind('atomic-test').first(), null);
  const response = await handleApi(new Request(`${origin}/api/v1/auth/demo`, { method: 'POST', headers: { Origin: origin } }), { ...app.options, db: adapter });
  assert.equal(response.status, 200);
});

test('SQLite migrations repeat safely, online backup retains committed WAL data, and recovery protects active/existing databases', async t => {
  const directory = await mkdtemp(resolve(process.cwd(), '.api-backup-test-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const source = resolve(directory, 'source.sqlite'); const snapshot = resolve(directory, 'snapshot.sqlite'); const restored = resolve(directory, 'restored.sqlite');
  const db = openNodeDatabase(source); let closed = false; t.after(() => { if (!closed) db.close(); });
  assert.ok((await migrateDatabase(db)).length >= 1); assert.equal((await migrateDatabase(db)).length, 0);
  const response = await handleApi(new Request(`${origin}/api/v1/auth/demo`, { method: 'POST', headers: { Origin: origin } }), { db, authMode: 'local' });
  assert.equal(response.status, 200); const auth = await response.json() as AuthState;
  await backupDatabase(source, snapshot); validateDatabaseFile(snapshot); assert.equal((await stat(snapshot)).mode & 0o777, 0o600);
  await assert.rejects(() => backupDatabase(source, snapshot), /already exists/);
  await restoreDatabase(snapshot, restored); const recovered = openNodeDatabase(restored);
  try { assert.equal(recovered.native.prepare('SELECT COUNT(*) AS count FROM profiles WHERE user_id=?').get(auth.user!.id)?.count, 3); }
  finally { recovered.close(); }
  await assert.rejects(() => restoreDatabase(snapshot, restored), /exists/);
  const release = await acquireDatabaseLock(restored); await assert.rejects(() => restoreDatabase(snapshot, restored, { force: true }), /in use|stale lock/); await release();
  await restoreDatabase(snapshot, restored, { force: true }); validateDatabaseFile(restored);
  const invalid = resolve(directory, 'invalid.sqlite'); await writeFile(invalid, 'not sqlite'); await assert.rejects(() => restoreDatabase(invalid, resolve(directory, 'bad.sqlite')));
  db.close(); closed = true;
  assert.equal((await readFile(snapshot)).subarray(0, 15).toString(), 'SQLite format 3');
});
