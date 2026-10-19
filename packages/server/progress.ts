import type { LessonCore, ProgressSummary, ReviewItem, SkillMastery, WorldProgress } from '../contracts';
import { catalog, getLesson, lessons, missions, skills, worlds } from '../curriculum';
import type { RequestContext } from './context';
import { all, first } from './db';
import { ownedProfile } from './profiles';
import { fail } from './security';
import { parse, reviewSchema } from './validation';

export const guidedDemoLessonId = 'u5-l2';
export function canonicalLesson(id: string): LessonCore {
  const lesson = getLesson(id);
  if (!lesson) return fail(404, 'LESSON_UNAVAILABLE', 'Этот урок пока находится в каталоге. Выберите опубликованный урок.');
  return lesson;
}
export function canonicalWorkspaceSource(id: string): string {
  const lesson = getLesson(id);
  if (lesson) return lesson.id;
  const mission = missions.find(item => item.id === id && item.available && item.preview && item.tests?.length);
  if (mission) return mission.id;
  return fail(404, 'WORKSPACE_SOURCE_UNAVAILABLE', 'Урок или самостоятельная миссия пока не опубликованы.');
}
export async function completedLessons(ctx: RequestContext, profileId: string): Promise<string[]> {
  return (await all<{ lesson_id: string }>(ctx.options.db, 'SELECT lesson_id FROM xp_ledger WHERE profile_id=? ORDER BY awarded_at,lesson_id', profileId)).map(row => row.lesson_id);
}
export function lessonAccess(lesson: LessonCore, completedIds: readonly string[]) {
  const completed = new Set(completedIds);
  const missingPrerequisites = lesson.prerequisites.filter(id => !completed.has(id));
  const locked = missingPrerequisites.length > 0 && lesson.id !== guidedDemoLessonId;
  return { locked, missingPrerequisites, recommendedPrerequisites: lesson.id === guidedDemoLessonId ? missingPrerequisites : [],
    reason: locked ? `Сначала завершите: ${missingPrerequisites.map(id => getLesson(id)?.title ?? id).join(', ')}.` : null };
}
export async function requireLessonAccess(ctx: RequestContext, profileId: string, lesson: LessonCore): Promise<void> {
  const access = lessonAccess(lesson, await completedLessons(ctx, profileId));
  if (access.locked) fail(409, 'LESSON_LOCKED', access.reason!, { missingPrerequisites: access.missingPrerequisites });
}
export function worldProgress(completedIds: readonly string[]): WorldProgress[] {
  const completed = new Set(completedIds);
  const nextLesson = lessons.find(lesson => !completed.has(lesson.id) && lesson.prerequisites.every(id => completed.has(id)));
  return worlds.map(world => {
    const authored = lessons.filter(lesson => lesson.worldId === world.id);
    const completedCount = authored.filter(lesson => completed.has(lesson.id)).length;
    const availableCount = authored.length;
    const totalCount = catalog.filter(lesson => lesson.worldId === world.id).length;
    const accessible = authored.some(lesson => !lessonAccess(lesson, completedIds).locked);
    const status = availableCount > 0 && completedCount === availableCount ? 'completed' : !accessible ? 'locked'
      : world.id === nextLesson?.worldId ? 'current' : 'available';
    const firstLocked = authored.find(lesson => !completed.has(lesson.id));
    const reason = status === 'locked' ? firstLocked ? lessonAccess(firstLocked, completedIds).reason : 'Уроки этого мира готовятся.' : null;
    return { ...world, status, completedCount, availableCount, totalCount, reason };
  });
}
export function calendarDay(date: Date, timeZone = 'UTC'): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  return `${parts.find(part => part.type === 'year')!.value}-${parts.find(part => part.type === 'month')!.value}-${parts.find(part => part.type === 'day')!.value}`;
}
function streakFor(days: readonly string[], today: string): number {
  const set = new Set(days); let day = new Date(`${today}T12:00:00Z`);
  if (!set.has(today)) day = new Date(day.getTime() - 86400000);
  let streak = 0;
  while (set.has(day.toISOString().slice(0, 10))) { streak++; day = new Date(day.getTime() - 86400000); }
  return streak;
}
export async function getProgress(ctx: RequestContext, profileId?: string | null): Promise<ProgressSummary> {
  const profile = await ownedProfile(ctx, profileId);
  const [ledger, masteryRows, reviews, attempts, flagRows, dayRows, projectFacts, attemptFacts] = await Promise.all([
    all<{ lesson_id: string; points: number }>(ctx.options.db, 'SELECT lesson_id,points FROM xp_ledger WHERE profile_id=? ORDER BY awarded_at,lesson_id', profile.id),
    all<{ skill_id: string; level: number; evidence_count: number; last_practiced: string | null; next_review_at: string | null }>(ctx.options.db, 'SELECT * FROM skill_mastery WHERE profile_id=?', profile.id),
    all<{ skill_id: string; lesson_id: string; due_at: string; level: number }>(ctx.options.db, 'SELECT * FROM review_queue WHERE profile_id=? AND due_at<=? ORDER BY due_at,skill_id', profile.id, ctx.now.toISOString()),
    first<{ count: number }>(ctx.options.db, 'SELECT COUNT(*) AS count FROM submissions WHERE profile_id=?', profile.id),
    all<{ flag: string }>(ctx.options.db, 'SELECT flag FROM story_flags WHERE profile_id=? ORDER BY flag', profile.id),
    all<{ day: string }>(ctx.options.db, 'SELECT day FROM practice_days WHERE profile_id=? ORDER BY day', profile.id),
    first<{ total: number; teen: number | null }>(ctx.options.db, "SELECT COUNT(*) AS total,SUM(CASE WHEN mode='teen' THEN 1 ELSE 0 END) AS teen FROM projects WHERE profile_id=?", profile.id),
    first<{ adult: number; fixed_bug: number }>(ctx.options.db, `SELECT
      EXISTS(SELECT 1 FROM submissions WHERE profile_id=? AND mode='adult' AND accepted=1) AS adult,
      EXISTS(SELECT 1 FROM submissions success JOIN submissions failure ON failure.profile_id=success.profile_id AND failure.lesson_id=success.lesson_id
        WHERE success.profile_id=? AND success.accepted=1 AND failure.accepted=0
        AND (failure.created_at<success.created_at OR (failure.created_at=success.created_at AND failure.rowid<success.rowid))) AS fixed_bug`, profile.id, profile.id),
  ]);
  const xp = ledger.reduce((sum, row) => sum + row.points, 0); const completedLessonIds = ledger.map(row => row.lesson_id);
  const mastery: SkillMastery[] = skills.map(skill => {
    const row = masteryRows.find(item => item.skill_id === skill.id);
    return { skillId: skill.id, level: row?.level ?? 0, evidenceCount: row?.evidence_count ?? 0, lastPracticed: row?.last_practiced ?? null, nextReviewAt: row?.next_review_at ?? null };
  });
  const activeDays = dayRows.map(row => row.day);
  const streak = streakFor(activeDays, calendarDay(ctx.now, ctx.options.timeZone));
  const badges: string[] = [];
  if (completedLessonIds.length) badges.push('first-code');
  if (streak >= 3) badges.push('practice-streak');
  if (completedLessonIds.length >= 10) badges.push('ten-lessons');
  if (completedLessonIds.includes(guidedDemoLessonId)) badges.push('loop-mastery');
  if (completedLessonIds.includes('u8-l1')) badges.push('function-mastery');
  if (attemptFacts?.fixed_bug) badges.push('first-bug-fixed');
  if (completedLessonIds.length) badges.push('first-test');
  if (projectFacts?.teen) badges.push('first-mechanic');
  if (attemptFacts?.adult) badges.push('first-report');
  if (worldProgress(completedLessonIds).some(world => world.id === 'starter-village' && world.status === 'completed')) badges.push('first-world');
  if (mastery.some(skill => skill.level >= 3)) badges.push('independent-solution');
  if (projectFacts?.total) badges.push('creator');
  return { xp, level: Math.floor(xp / 100) + 1, completedLessonIds, mastery,
    reviews: reviews.map(row => ({ skillId: row.skill_id, lessonId: row.lesson_id, dueAt: row.due_at, level: row.level })),
    attempts: attempts?.count ?? 0, storyFlags: flagRows.map(row => row.flag), badges, streak, activeDays };
}
export async function getReviewQueue(ctx: RequestContext, profileId?: string | null): Promise<{ reviews: ReviewItem[]; scheduled: ReviewItem[] }> {
  const profile = await ownedProfile(ctx, profileId);
  const rows = await all<{ skill_id: string; lesson_id: string; due_at: string; level: number }>(ctx.options.db, 'SELECT * FROM review_queue WHERE profile_id=? ORDER BY due_at,skill_id', profile.id);
  const scheduled = rows.map(row => ({ skillId: row.skill_id, lessonId: row.lesson_id, dueAt: row.due_at, level: row.level }));
  return { reviews: scheduled.filter(row => row.dueAt <= ctx.now.toISOString()), scheduled };
}
/** Acknowledges an actual checked run; this endpoint does not synthesize evidence or award XP. */
export async function completeReview(ctx: RequestContext, data: unknown) {
  const body = parse(reviewSchema, data); const profile = await ownedProfile(ctx, body.profileId);
  const evidence = await first<{ accepted: number; was_review_due: number; recorded_at: string }>(ctx.options.db,
    'SELECT accepted,was_review_due,recorded_at FROM skill_evidence WHERE profile_id=? AND skill_id=? AND submission_id=?', profile.id, body.skillId, body.submissionId);
  if (!evidence || !evidence.accepted || !evidence.was_review_due) return fail(409, 'REVIEW_EVIDENCE_REQUIRED', 'Сначала выполните новую проверку урока после наступления срока повторения.');
  if (ctx.now.getTime() - Date.parse(evidence.recorded_at) > 86400000) return fail(409, 'REVIEW_EVIDENCE_EXPIRED', 'Эта проверка была выполнена более суток назад. Запустите новую.');
  return { reviewed: true, skillId: body.skillId, submissionId: body.submissionId, progress: await getProgress(ctx, profile.id) };
}
