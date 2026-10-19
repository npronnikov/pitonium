import type { Draft, LearningMode, Project, ProjectRevision } from '../contracts';
import type { RequestContext } from './context';
import { all, first, statement } from './db';
import { ownedProfile, requireActor } from './profiles';
import { canonicalWorkspaceSource } from './progress';
import { fail, newId, rateLimit } from './security';
import { draftPutSchema, modeSchema, parse, projectCreateSchema, projectPatchSchema, restoreSchema } from './validation';

interface DraftRow { profile_id: string; lesson_id: string; mode: LearningMode; code: string; revision: number; updated_at: string }
export const draftFromRow = (row: DraftRow): Draft => ({ profileId: row.profile_id, lessonId: row.lesson_id, mode: row.mode, code: row.code, revision: row.revision, updatedAt: row.updated_at });
export async function getDraft(ctx: RequestContext, lessonId: string, profileId?: string | null, mode?: string | null): Promise<Draft | null> {
  const profile = await ownedProfile(ctx, profileId); const sourceId = canonicalWorkspaceSource(lessonId); const selectedMode = parse(modeSchema, mode ?? profile.mode);
  const row = await first<DraftRow>(ctx.options.db, 'SELECT * FROM drafts WHERE profile_id=? AND lesson_id=? AND mode=?', profile.id, sourceId, selectedMode);
  return row ? draftFromRow(row) : null;
}
export async function putDraft(ctx: RequestContext, lessonId: string, data: unknown): Promise<Draft> {
  const body = parse(draftPutSchema, data); const profile = await ownedProfile(ctx, body.profileId); const sourceId = canonicalWorkspaceSource(lessonId);
  await rateLimit(ctx, 'draft-write', profile.id, 600, 3600);
  const now = ctx.now.toISOString();
  const result = body.expectedRevision === 0 ? await statement(ctx.options.db,
    'INSERT OR IGNORE INTO drafts (profile_id,lesson_id,mode,code,revision,updated_at) VALUES (?,?,?,?,1,?)', profile.id, sourceId, body.mode, body.code, now).run()
    : await statement(ctx.options.db, 'UPDATE drafts SET code=?,revision=revision+1,updated_at=? WHERE profile_id=? AND lesson_id=? AND mode=? AND revision=?', body.code, now, profile.id, sourceId, body.mode, body.expectedRevision).run();
  if (!result.changes) return fail(409, 'DRAFT_CONFLICT', 'Черновик изменён в другой вкладке. Сохраните свой текст отдельно и сравните версии.', { current: await getDraft(ctx, sourceId, profile.id, body.mode) });
  return { profileId: profile.id, lessonId: sourceId, mode: body.mode, code: body.code, revision: body.expectedRevision + 1, updatedAt: now };
}
interface ProjectRow {
  id: string; profile_id: string; lesson_id: string; title: string; mode: LearningMode; code: string;
  files_json: string; config_json: string; revision: number; created_at: string; updated_at: string;
}
interface RevisionRow extends ProjectRow { project_id: string }
export function projectFromRow(row: ProjectRow): Project {
  return { id: row.id, profileId: row.profile_id, lessonId: row.lesson_id, title: row.title, mode: row.mode, code: row.code,
    files: JSON.parse(row.files_json), config: JSON.parse(row.config_json), revision: row.revision, createdAt: row.created_at, updatedAt: row.updated_at };
}
export function revisionFromRow(row: RevisionRow): ProjectRevision { return { ...projectFromRow(row), id: row.project_id, revisionId: row.id }; }
export async function listProjects(ctx: RequestContext, profileId?: string | null): Promise<{ projects: Project[] }> {
  const profile = await ownedProfile(ctx, profileId);
  return { projects: (await all<ProjectRow>(ctx.options.db, 'SELECT * FROM projects WHERE profile_id=? ORDER BY updated_at DESC,id', profile.id)).map(projectFromRow) };
}
export async function getProject(ctx: RequestContext, id: string, profileId?: string | null): Promise<Project> {
  const actor = requireActor(ctx);
  const row = await first<ProjectRow>(ctx.options.db, 'SELECT p.* FROM projects p JOIN profiles f ON f.id=p.profile_id WHERE p.id=? AND f.user_id=?', id, actor.user.id);
  if (!row) return fail(404, 'PROJECT_NOT_FOUND', 'Проект не найден.');
  if (profileId && row.profile_id !== profileId) return fail(404, 'PROJECT_NOT_FOUND', 'Проект не найден в выбранном профиле.');
  return projectFromRow(row);
}
export async function createProject(ctx: RequestContext, data: unknown): Promise<Project> {
  const body = parse(projectCreateSchema, data); const profile = await ownedProfile(ctx, body.profileId); const sourceId = canonicalWorkspaceSource(body.lessonId);
  await rateLimit(ctx, 'project-create', profile.id, 30, 3600);
  const now = ctx.now.toISOString();
  const project: Project = { ...body, id: newId('project'), profileId: profile.id, lessonId: sourceId, revision: 1, createdAt: now, updatedAt: now };
  const results = await ctx.options.db.batch([
    statement(ctx.options.db, `INSERT INTO projects (id,profile_id,lesson_id,title,mode,code,files_json,config_json,revision,created_at,updated_at)
      SELECT ?,?,?,?,?,?,?,?,1,?,? WHERE (SELECT COUNT(*) FROM projects WHERE profile_id=?)<100`,
      project.id, profile.id, project.lessonId, project.title, project.mode, project.code, JSON.stringify(project.files), JSON.stringify(project.config), now, now, profile.id),
    statement(ctx.options.db, `INSERT INTO project_revisions (id,project_id,profile_id,revision,lesson_id,title,mode,code,files_json,config_json,created_at,updated_at)
      SELECT ?,id,profile_id,revision,lesson_id,title,mode,code,files_json,config_json,created_at,updated_at FROM projects WHERE id=?`, newId('revision'), project.id),
  ]);
  if (!results[0].changes) return fail(409, 'PROJECT_LIMIT', 'В профиле можно сохранить до ста проектов.');
  return project;
}
async function saveProject(ctx: RequestContext, current: Project, desired: Project, expectedRevision: number): Promise<Project> {
  const now = ctx.now.toISOString(); const db = ctx.options.db;
  const results = await db.batch([
    statement(db, `INSERT INTO project_revisions (id,project_id,profile_id,revision,lesson_id,title,mode,code,files_json,config_json,created_at,updated_at)
      SELECT ?,id,profile_id,revision+1,?,?,?,?,?,?,created_at,? FROM projects WHERE id=? AND revision=?`,
      newId('revision'), desired.lessonId, desired.title, desired.mode, desired.code, JSON.stringify(desired.files), JSON.stringify(desired.config), now, current.id, expectedRevision),
    statement(db, `UPDATE projects SET lesson_id=?,title=?,mode=?,code=?,files_json=?,config_json=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?`,
      desired.lessonId, desired.title, desired.mode, desired.code, JSON.stringify(desired.files), JSON.stringify(desired.config), now, current.id, expectedRevision),
    statement(db, 'DELETE FROM project_revisions WHERE project_id=? AND id NOT IN (SELECT id FROM project_revisions WHERE project_id=? ORDER BY revision DESC LIMIT 10)', current.id, current.id),
  ]);
  if (!results[0].changes || !results[1].changes) return fail(409, 'PROJECT_CONFLICT', 'Проект изменён в другой вкладке. Обновите данные перед сохранением.', { current: await getProject(ctx, current.id) });
  return { ...desired, id: current.id, profileId: current.profileId, createdAt: current.createdAt, updatedAt: now, revision: expectedRevision + 1 };
}
export async function updateProject(ctx: RequestContext, id: string, data: unknown): Promise<Project> {
  const current = await getProject(ctx, id); const body = parse(projectPatchSchema, data);
  await rateLimit(ctx, 'project-write', current.profileId, 180, 3600);
  const { expectedRevision, ...patch } = body;
  if (patch.lessonId) patch.lessonId = canonicalWorkspaceSource(patch.lessonId);
  return saveProject(ctx, current, { ...current, ...patch }, expectedRevision);
}
export async function projectRevisions(ctx: RequestContext, id: string): Promise<{ revisions: ProjectRevision[] }> {
  await getProject(ctx, id);
  return { revisions: (await all<RevisionRow>(ctx.options.db, 'SELECT * FROM project_revisions WHERE project_id=? ORDER BY revision DESC LIMIT 10', id)).map(revisionFromRow) };
}
export async function restoreProject(ctx: RequestContext, id: string, data: unknown): Promise<Project> {
  const current = await getProject(ctx, id); const body = parse(restoreSchema, data);
  await rateLimit(ctx, 'project-write', current.profileId, 180, 3600);
  const source = await first<RevisionRow>(ctx.options.db, 'SELECT * FROM project_revisions WHERE project_id=? AND revision=?', id, body.revision);
  if (!source) return fail(404, 'REVISION_NOT_FOUND', 'Эта версия не входит в последние десять сохранённых версий.');
  return saveProject(ctx, current, { ...projectFromRow(source), id }, body.expectedRevision);
}
export async function deleteProject(ctx: RequestContext, id: string): Promise<void> {
  const project = await getProject(ctx, id);
  await statement(ctx.options.db, 'DELETE FROM projects WHERE id=? AND profile_id=?', project.id, project.profileId).run();
}
