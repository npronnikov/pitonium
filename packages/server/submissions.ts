import { lessons, worlds } from '../curriculum';
import { runtimeVersion } from '../runtime/contracts';
import type { RequestContext } from './context';
import { all, first, statement } from './db';
import { ownedProfile } from './profiles';
import { calendarDay, canonicalLesson, getProgress, requireLessonAccess } from './progress';
import { fail, newId, rateLimit, sha256 } from './security';
import { parse, submissionSchema } from './validation';

interface SubmissionRow { id: string; request_hash: string; accepted: number }
export async function submit(ctx: RequestContext, data: unknown) {
  const body = parse(submissionSchema, data); const profile = await ownedProfile(ctx, body.profileId);
  const lesson = canonicalLesson(body.lessonId); const variant = lesson.variants[body.mode]; const result = body.result;
  const context = result.context;
  if (body.lessonId !== lesson.id || body.variantId !== variant.id || context.profileId !== profile.id || context.lessonId !== lesson.id || context.variantId !== variant.id) {
    return fail(409, 'STALE_RUN_CONTEXT', 'Результат относится к другому профилю, уроку или режиму. Запустите проверку ещё раз.');
  }
  if (body.contentVersion !== lesson.contentVersion || body.assessmentVersion !== lesson.assessmentVersion || context.testsVersion !== lesson.assessmentVersion
    || body.runtimeVersion !== runtimeVersion || result.runtimeVersion !== runtimeVersion) {
    return fail(409, 'STALE_ASSESSMENT', 'Содержимое урока или среда обновились. Обновите урок и запустите проверку.');
  }
  if (result.operation !== 'check') return fail(422, 'CHECK_REQUIRED', 'Предпросмотр не засчитывается. Нажмите «Проверить».');
  const expectedIds = variant.tests.map(test => test.id); const submittedIds = result.testResults.map(test => test.id);
  if (!expectedIds.length || new Set(submittedIds).size !== submittedIds.length || submittedIds.length !== expectedIds.length || submittedIds.some(id => !expectedIds.includes(id))) {
    return fail(422, 'TEST_SET_MISMATCH', 'Нужен полный набор актуальных проверок урока без пропусков и повторов.');
  }
  // No client-provided XP amount or pass count is trusted. These checks validate browser evidence, not Python execution on this server.
  const accepted = result.status === 'ok' && result.error === null && result.testResults.every(test => test.passed === true && test.status === 'ok')
    && !result.truncated.events && !result.truncated.files && !result.truncated.stdout;
  const requestHash = await sha256(JSON.stringify(body));
  const duplicate = await first<SubmissionRow>(ctx.options.db, 'SELECT id,request_hash,accepted FROM submissions WHERE profile_id=? AND idempotency_key=?', profile.id, body.idempotencyKey);
  if (duplicate) {
    if (duplicate.request_hash !== requestHash) return fail(409, 'IDEMPOTENCY_CONFLICT', 'Этот ключ уже использован для другой проверки.');
    return { submissionId: duplicate.id, accepted: !!duplicate.accepted, xpAwarded: 0, duplicate: true, gradingAuthority: 'browser-preview' as const, progress: await getProgress(ctx, profile.id) };
  }
  const previousRun = await first<{ id: string }>(ctx.options.db, 'SELECT id FROM submissions WHERE profile_id=? AND run_id=?', profile.id, result.runId);
  if (previousRun) return fail(409, 'RUN_ALREADY_SUBMITTED', 'Этот запуск уже сохранён. Для новой попытки выполните новую проверку.');
  await requireLessonAccess(ctx, profile.id, lesson);
  await rateLimit(ctx, 'submissions', profile.id, 120, 3600);
  const recentHint = await first<{ level: number | null }>(ctx.options.db, 'SELECT MAX(hint_level) AS level FROM tutor_events WHERE profile_id=? AND lesson_id=? AND mode=? AND created_at>=?', profile.id, lesson.id, body.mode, new Date(ctx.now.getTime() - 3600000).toISOString());
  const hintLevel = Math.max(body.hintLevel ?? 0, recentHint?.level ?? 0);
  const assisted = hintLevel > 0;
  const independent = accepted && !assisted && body.reflectionCorrect === true && typeof body.code === 'string' && body.code.trim() !== variant.starterCode.trim();
  const level = accepted ? independent ? 3 : 2 : 1;
  const id = newId('submission'); const now = ctx.now.toISOString(); const db = ctx.options.db;
  const statements = [statement(db, `INSERT INTO submissions
    (id,profile_id,lesson_id,mode,variant_id,content_version,assessment_version,runtime_version,run_id,idempotency_key,request_hash,code,result_json,hint_level,reflection_correct,accepted,review_skills_json,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    id, profile.id, lesson.id, body.mode, variant.id, lesson.contentVersion, lesson.assessmentVersion, runtimeVersion, result.runId,
    body.idempotencyKey, requestHash, body.code ?? '', JSON.stringify(result), hintLevel, body.reflectionCorrect === undefined ? null : Number(body.reflectionCorrect), Number(accepted), '[]', now),
  statement(db, `INSERT OR IGNORE INTO xp_ledger (id,profile_id,lesson_id,submission_id,points,awarded_at) SELECT ?,?,?,?,?,? WHERE ?=1`, newId('xp'), profile.id, lesson.id, id, lesson.xp, now, Number(accepted)),
  statement(db, 'INSERT OR IGNORE INTO practice_days (profile_id,day) VALUES (?,?)', profile.id, calendarDay(ctx.now, ctx.options.timeZone)),
  ];
  for (const skillId of lesson.skillIds) {
    const evidenceId = newId('evidence');
    statements.push(statement(db, `INSERT INTO skill_evidence
      (id,profile_id,skill_id,lesson_id,mode,submission_id,accepted,assisted,independent,was_review_due,recorded_at)
      VALUES (?,?,?,?,?,?,?,?,?,CASE WHEN EXISTS (SELECT 1 FROM review_queue WHERE profile_id=? AND skill_id=? AND due_at<=?) THEN 1 ELSE 0 END,?)`,
      evidenceId, profile.id, skillId, lesson.id, body.mode, id, Number(accepted), Number(assisted), Number(independent), profile.id, skillId, now, now));
    statements.push(statement(db, `INSERT INTO skill_mastery (profile_id,skill_id,level,evidence_count,last_practiced,next_review_at)
      VALUES (?,?,CASE WHEN ?=1 AND EXISTS(SELECT 1 FROM skill_evidence WHERE id=? AND was_review_due=1)
        AND EXISTS(SELECT 1 FROM skill_evidence WHERE profile_id=? AND skill_id=? AND independent=1 AND recorded_at<? AND (lesson_id<>? OR mode<>?)) THEN 4 ELSE ? END,
        (SELECT COUNT(*) FROM skill_evidence WHERE profile_id=? AND skill_id=?),?,NULL)
      ON CONFLICT(profile_id,skill_id) DO UPDATE SET level=MAX(skill_mastery.level,excluded.level),evidence_count=excluded.evidence_count,last_practiced=excluded.last_practiced`,
      profile.id, skillId, Number(independent), evidenceId, profile.id, skillId, now, lesson.id, body.mode, level, profile.id, skillId, now));
    const plus = (days: number) => new Date(ctx.now.getTime() + days * 86400000).toISOString();
    statements.push(statement(db, `INSERT INTO review_queue (profile_id,skill_id,lesson_id,due_at,level)
      SELECT profile_id,skill_id,?,CASE WHEN ?=0 THEN ? WHEN level>=4 THEN ? WHEN level>=3 THEN ? ELSE ? END,level FROM skill_mastery WHERE profile_id=? AND skill_id=?
      ON CONFLICT(profile_id,skill_id) DO UPDATE SET lesson_id=CASE WHEN review_queue.due_at<=? THEN excluded.lesson_id ELSE review_queue.lesson_id END,
      due_at=CASE WHEN review_queue.due_at<=? THEN excluded.due_at ELSE MIN(review_queue.due_at,excluded.due_at) END,level=excluded.level`,
      lesson.id, Number(accepted), plus(1), plus(14), plus(7), plus(3), profile.id, skillId, now, now));
    statements.push(statement(db, `UPDATE skill_mastery SET next_review_at=(SELECT due_at FROM review_queue WHERE profile_id=? AND skill_id=?) WHERE profile_id=? AND skill_id=?`, profile.id, skillId, profile.id, skillId));
  }
  statements.push(statement(db, `INSERT OR IGNORE INTO story_flags (profile_id,flag,created_at) SELECT ?,?,? WHERE ?=1`, profile.id, `lesson:${lesson.id}:complete`, now, Number(accepted)));
  for (const world of worlds) {
    const authored = lessons.filter(item => item.worldId === world.id);
    if (!authored.length) continue;
    const placeholders = authored.map(() => '?').join(',');
    statements.push(statement(db, `INSERT OR IGNORE INTO story_flags (profile_id,flag,created_at)
      SELECT ?,?,? WHERE (SELECT COUNT(*) FROM xp_ledger WHERE profile_id=? AND lesson_id IN (${placeholders}))=?`,
      profile.id, `world:${world.id}:completed`, now, profile.id, ...authored.map(item => item.id), authored.length));
    const unlock = authored.map(item => item.id === 'u5-l2' || !item.prerequisites.length ? '1=1'
      : `(SELECT COUNT(*) FROM xp_ledger WHERE profile_id=? AND lesson_id IN (${item.prerequisites.map(() => '?').join(',')}))=${item.prerequisites.length}`).join(' OR ');
    const unlockValues = authored.flatMap(item => item.id === 'u5-l2' || !item.prerequisites.length ? [] : [profile.id, ...item.prerequisites]);
    statements.push(statement(db, `INSERT OR IGNORE INTO story_flags (profile_id,flag,created_at) SELECT ?,?,? WHERE ${unlock}`, profile.id, `world:${world.id}:unlocked`, now, ...unlockValues));
  }
  let xpAwarded = 0;
  try { const results = await db.batch(statements); xpAwarded = results[1].changes ? lesson.xp : 0; }
  catch (error) {
    // Native batches are atomic. A racing identical retry can therefore safely return the committed result.
    const raced = await first<SubmissionRow>(db, 'SELECT id,request_hash,accepted FROM submissions WHERE profile_id=? AND idempotency_key=?', profile.id, body.idempotencyKey);
    if (raced) {
      if (raced.request_hash !== requestHash) return fail(409, 'IDEMPOTENCY_CONFLICT', 'Этот ключ уже использован для другой проверки.');
      return { submissionId: raced.id, accepted: !!raced.accepted, xpAwarded: 0, duplicate: true, gradingAuthority: 'browser-preview' as const, progress: await getProgress(ctx, profile.id) };
    }
    if (await first(db, 'SELECT id FROM submissions WHERE profile_id=? AND run_id=?', profile.id, result.runId)) return fail(409, 'RUN_ALREADY_SUBMITTED', 'Этот запуск уже сохранён.');
    throw error;
  }
  return { submissionId: id, accepted, xpAwarded, duplicate: false, gradingAuthority: 'browser-preview' as const, progress: await getProgress(ctx, profile.id) };
}
export async function listSubmissions(ctx: RequestContext, profileId?: string | null) {
  const profile = await ownedProfile(ctx, profileId);
  return { submissions: (await all<{ id: string; lesson_id: string; mode: string; accepted: number; created_at: string }>(ctx.options.db,
    'SELECT id,lesson_id,mode,accepted,created_at FROM submissions WHERE profile_id=? ORDER BY created_at DESC,id DESC LIMIT 100', profile.id))
    .map(row => ({ id: row.id, lessonId: row.lesson_id, mode: row.mode, accepted: !!row.accepted, createdAt: row.created_at, gradingAuthority: 'browser-preview' })) };
}
