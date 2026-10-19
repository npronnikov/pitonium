import { catalog, lessons, missions, skills } from '../curriculum';
import { runtimeVersion } from '../runtime/contracts';
import type { ApiOptions, RequestContext } from './context';
import { first } from './db';
import { activateProfile, authState, demo, login, logout, register, resolveActor } from './auth';
import { createProfile, deleteProfile, listProfiles, ownedProfile, requireActor, updateProfile } from './profiles';
import { canonicalLesson, completedLessons, completeReview, getProgress, getReviewQueue, lessonAccess, worldProgress } from './progress';
import { createProject, deleteProject, getDraft, getProject, listProjects, projectRevisions, putDraft, restoreProject, updateProject } from './projects';
import { listSubmissions, submit } from './submissions';
import { tutorHistory, tutorMessage } from './tutor';
import { exportProfile } from './export';
import { ApiError, fail, newId, readJson, verifyCsrf, verifyOrigin } from './security';
import { modeSchema, parse } from './validation';

async function dispatch(ctx: RequestContext): Promise<{ data?: unknown; status?: number }> {
  const url = new URL(ctx.request.url); const method = ctx.request.method.toUpperCase();
  const path = url.pathname.replace(/^\/api\/v1(?=\/|$)/, '').replace(/\/+$/, '') || '/';
  if (!url.pathname.startsWith('/api/v1/') && url.pathname !== '/api/v1') return fail(404, 'NOT_FOUND', 'Адрес API не найден.');
  if (method === 'GET' && ['/health', '/health/live', '/health/ready'].includes(path)) {
    if (path !== '/health/live') await first(ctx.options.db, 'SELECT id FROM users LIMIT 1');
    return { data: { status: 'ok', service: 'piton-api', version: '5.0.0', database: path === '/health/live' ? 'unchecked' : 'ready', authMode: ctx.options.authMode, runtimeVersion, gradingAuthority: 'browser-preview' } };
  }
  await resolveActor(ctx);
  const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(method);
  if (unsafe) {
    verifyOrigin(ctx);
    if (!['/auth/demo', '/auth/login', '/auth/register'].includes(path)) await verifyCsrf(ctx);
  }
  if (method === 'GET' && path === '/auth/me') return { data: await authState(ctx) };
  if (method === 'POST' && path === '/auth/demo') return { data: await demo(ctx) };
  if (method === 'POST' && path === '/auth/login') return { data: await login(ctx, await readJson(ctx)) };
  if (method === 'POST' && path === '/auth/register') return { data: await register(ctx, await readJson(ctx)), status: 201 };
  if (method === 'POST' && path === '/auth/logout') return { data: await logout(ctx) };
  requireActor(ctx);
  const queryProfile = url.searchParams.get('profileId');
  if (path === '/profiles') {
    if (method === 'GET') return { data: { profiles: await listProfiles(ctx), activeProfileId: ctx.actor!.activeProfileId } };
    if (method === 'POST') return { data: await createProfile(ctx, await readJson(ctx)), status: 201 };
  }
  let match = path.match(/^\/profiles\/([^/]+)(?:\/(activate|export))?$/);
  if (match) {
    if (method === 'POST' && match[2] === 'activate') return { data: await activateProfile(ctx, match[1]) };
    if (method === 'GET' && match[2] === 'export') {
      const data = await exportProfile(ctx, match[1]);
      ctx.responseHeaders.set('Content-Disposition', `attachment; filename="piton-profile-${data.profile.id}.json"`);
      return { data };
    }
    if (!match[2]) {
      if (method === 'GET') return { data: await ownedProfile(ctx, match[1]) };
      if (method === 'PATCH') return { data: await updateProfile(ctx, match[1], await readJson(ctx)) };
      if (method === 'DELETE') { await deleteProfile(ctx, match[1]); return { status: 204 }; }
    }
  }
  if (method === 'GET' && path === '/worlds') {
    const profile = await ownedProfile(ctx, queryProfile);
    return { data: { worlds: worldProgress(await completedLessons(ctx, profile.id)) } };
  }
  match = path.match(/^\/worlds\/([^/]+)$/);
  if (method === 'GET' && match) {
    const profile = await ownedProfile(ctx, queryProfile); const completed = await completedLessons(ctx, profile.id);
    const world = worldProgress(completed).find(item => item.id === match![1]);
    if (!world) return fail(404, 'WORLD_NOT_FOUND', 'Мир не найден.');
    const nodes = catalog.filter(item => item.worldId === world.id).map(row => {
      const lesson = lessons.find(item => item.id === row.id);
      return { ...row, completed: completed.includes(row.id), ...(lesson ? lessonAccess(lesson, completed) : { locked: true, reason: 'Урок находится в каталоге и пока не опубликован.' }) };
    });
    return { data: { world, nodes } };
  }
  if (method === 'GET' && path === '/lessons') {
    const profile = await ownedProfile(ctx, queryProfile); const completed = await completedLessons(ctx, profile.id);
    return { data: { catalog: catalog.map(row => { const core = lessons.find(lesson => lesson.id === row.id); return { ...row,
      completed: completed.includes(row.id), ...(core ? lessonAccess(core, completed) : { locked: true, reason: 'Урок находится в каталоге и пока не опубликован.' }) }; }) } };
  }
  match = path.match(/^\/lessons\/([^/]+)$/);
  if (method === 'GET' && match) {
    const profile = await ownedProfile(ctx, queryProfile); const lesson = canonicalLesson(match[1]); const mode = parse(modeSchema, url.searchParams.get('mode') ?? profile.mode);
    return { data: { lesson, variant: lesson.variants[mode], ...lessonAccess(lesson, await completedLessons(ctx, profile.id)) } };
  }
  if (method === 'GET' && path === '/missions') { await ownedProfile(ctx, queryProfile); return { data: { missions } }; }
  if (method === 'GET' && path === '/skills') { const progress = await getProgress(ctx, queryProfile); return { data: { skills, mastery: progress.mastery } }; }
  match = path.match(/^\/skills\/([^/]+)$/);
  if (method === 'GET' && match) {
    const progress = await getProgress(ctx, queryProfile); const skill = skills.find(item => item.id === match![1]);
    if (!skill) return fail(404, 'SKILL_NOT_FOUND', 'Навык не найден.');
    return { data: { skill, mastery: progress.mastery.find(item => item.skillId === skill.id) } };
  }
  if (method === 'GET' && path === '/progress') return { data: await getProgress(ctx, queryProfile) };
  if (['/progress/review', '/review'].includes(path)) {
    if (method === 'GET') return { data: await getReviewQueue(ctx, queryProfile) };
    if (method === 'POST') return { data: await completeReview(ctx, await readJson(ctx)) };
  }
  if (path === '/submissions') {
    if (method === 'GET') return { data: await listSubmissions(ctx, queryProfile) };
    if (method === 'POST') return { data: await submit(ctx, await readJson(ctx)), status: 201 };
  }
  match = path.match(/^\/drafts(?:\/([^/]+))?$/);
  if (match) {
    const lessonId = match[1] ?? url.searchParams.get('lessonId');
    if (!lessonId) return fail(400, 'LESSON_REQUIRED', 'Укажите lessonId.');
    if (method === 'GET') return { data: await getDraft(ctx, lessonId, queryProfile, url.searchParams.get('mode')) };
    if (method === 'PUT') return { data: await putDraft(ctx, lessonId, await readJson(ctx)) };
  }
  if (path === '/projects') {
    if (method === 'GET') return { data: await listProjects(ctx, queryProfile) };
    if (method === 'POST') return { data: await createProject(ctx, await readJson(ctx)), status: 201 };
  }
  match = path.match(/^\/projects\/([^/]+)(?:\/(revisions|restore))?$/);
  if (match) {
    if (method === 'GET' && match[2] === 'revisions') return { data: await projectRevisions(ctx, match[1]) };
    if (method === 'POST' && match[2] === 'restore') return { data: await restoreProject(ctx, match[1], await readJson(ctx)) };
    if (!match[2]) {
      if (method === 'GET') return { data: await getProject(ctx, match[1], queryProfile) };
      if (method === 'PATCH' || method === 'PUT') return { data: await updateProject(ctx, match[1], await readJson(ctx)) };
      if (method === 'DELETE') { await deleteProject(ctx, match[1]); return { status: 204 }; }
    }
  }
  if (['/tutor/messages', '/tutor'].includes(path)) {
    if (method === 'POST') return { data: await tutorMessage(ctx, await readJson(ctx)), status: 201 };
    if (method === 'GET') return { data: await tutorHistory(ctx, queryProfile, url.searchParams.get('lessonId'), url.searchParams.get('mode')) };
  }
  return fail(404, 'NOT_FOUND', 'Адрес API или метод не найден.');
}

/** Portable domain entry point: Web Request/Response only, no Node imports in this graph. */
export async function handleApi(request: Request, options: ApiOptions): Promise<Response> {
  const ctx: RequestContext = { request, options, requestId: newId('request'), responseHeaders: new Headers({
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
  }), actor: null, now: (options.now ?? (() => new Date()))() };
  ctx.responseHeaders.set('X-Request-Id', ctx.requestId);
  try {
    const { data, status = 200 } = await dispatch(ctx);
    if (status === 204) { ctx.responseHeaders.delete('Content-Type'); return new Response(null, { status, headers: ctx.responseHeaders }); }
    return new Response(JSON.stringify(data), { status, headers: ctx.responseHeaders });
  } catch (error) {
    const known = error instanceof ApiError;
    if (!known) options.onError?.(error, ctx.requestId);
    return new Response(JSON.stringify({ error: { code: known ? error.code : 'INTERNAL_ERROR', message: known ? error.message : 'Не удалось выполнить запрос. Повторите немного позже.',
      ...(known && error.details !== undefined ? { details: error.details } : {}), requestId: ctx.requestId } }),
    { status: known ? error.status : 500, headers: ctx.responseHeaders });
  }
}
