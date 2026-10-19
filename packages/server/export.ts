import type { RequestContext } from './context';
import { all } from './db';
import { ownedProfile } from './profiles';
import { getProgress } from './progress';
import { draftFromRow, listProjects, projectRevisions } from './projects';

/** Owner-only portability export. Credentials and bearer sessions are deliberately excluded. */
export async function exportProfile(ctx: RequestContext, id: string) {
  const profile = await ownedProfile(ctx, id);
  const [progress, projects, drafts, submissions, evidence, tutor] = await Promise.all([
    getProgress(ctx, id), listProjects(ctx, id),
    all<Parameters<typeof draftFromRow>[0]>(ctx.options.db, 'SELECT * FROM drafts WHERE profile_id=? ORDER BY lesson_id,mode', id),
    all<Record<string, unknown>>(ctx.options.db, 'SELECT id,lesson_id,mode,variant_id,content_version,assessment_version,runtime_version,run_id,code,result_json,hint_level,reflection_correct,accepted,created_at FROM submissions WHERE profile_id=? ORDER BY created_at', id),
    all<Record<string, unknown>>(ctx.options.db, 'SELECT * FROM skill_evidence WHERE profile_id=? ORDER BY recorded_at', id),
    all<Record<string, unknown>>(ctx.options.db, 'SELECT id,lesson_id,mode,hint_level,provider,message,shared_code,created_at FROM tutor_events WHERE profile_id=? ORDER BY created_at', id),
  ]);
  const revisions = (await Promise.all(projects.projects.map(project => projectRevisions(ctx, project.id)))).flatMap(value => value.revisions);
  return { format: 'piton-profile-export', version: 1, exportedAt: ctx.now.toISOString(), profile, progress,
    drafts: drafts.map(draftFromRow), projects: projects.projects, revisions, submissions: submissions.map(row => ({ ...row, result_json: undefined, result: JSON.parse(String(row.result_json)) })),
    skillEvidence: evidence, tutorMessages: tutor, gradingAuthority: 'browser-preview' };
}
