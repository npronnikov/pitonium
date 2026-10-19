import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { getLesson, lessons, missions } from '../../packages/curriculum';
import type { JsonObject, JsonValue, LearningMode, LessonCore, LessonVariant, Profile, ProgressSummary, Project, Question, TutorReply } from '../../packages/contracts';
import { createPythonRunner, runtimeVersion } from '../../packages/runtime';
import type { ExecutionCase, PythonRunner, RunContext, RunProgress, RunResult, TestCase } from '../../packages/runtime';
import { useApp } from '../context';
import { api, post, profileQuery } from '../lib/api';
import { useDraft } from '../lib/useDraft';
import { downloadFile, modeLabels } from '../lib/utils';
import { Arrow, Badge, Button, EmptyState, Icon, Link, Modal } from '../components/ui';
import { CodeEditor } from '../components/CodeEditor';
import { TutorText } from '../components/TutorText';
import { ArenaScene, builderPalette, ReportScene, RobotScene, SceneTimeline, type SceneItem } from '../components/Scene';

type Stage = 'idea' | 'example' | 'quiz' | 'practice' | 'reflection';
type ConsoleTab = 'output' | 'tests' | 'trace';
interface SubmissionResponse {
  submissionId: string; accepted: boolean; xpAwarded: number; duplicate: boolean;
  progress: ProgressSummary; gradingAuthority: 'browser-preview';
}
const stages: { id: Stage; title: string }[] = [
  { id: 'idea', title: 'Идея' }, { id: 'example', title: 'Пример' },
  { id: 'quiz', title: 'Проверь себя' }, { id: 'practice', title: 'Твой код' }, { id: 'reflection', title: 'Почему работает' },
];
const fallbackPreview: ExecutionCase = { fixtures: {}, probe: { kind: 'script' } };
const initialItems: SceneItem[] = [
  { id: 'start-flag', type: 'flag', x: 8, y: 69 }, { id: 'coin-a', type: 'coin', x: 29, y: 64 },
  { id: 'coin-b', type: 'coin', x: 57, y: 64 }, { id: 'finish-gate', type: 'gate', x: 90, y: 66 },
];
const inputsFor = (preview: ExecutionCase) => JSON.stringify(preview.probe.kind === 'call' ? preview.probe.args : preview.fixtures.globals || {}, null, 2);
const sameContext = (a: RunContext | null, b: RunContext) => !!a && a.profileId === b.profileId && a.lessonId === b.lessonId && a.variantId === b.variantId && a.draftVersion === b.draftVersion && a.testsVersion === b.testsVersion;
function validItems(value: JsonValue | undefined): SceneItem[] {
  if (!Array.isArray(value)) return initialItems.map(item => ({ ...item }));
  return value.flatMap(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item) || typeof item.id !== 'string' || typeof item.type !== 'string' || typeof item.x !== 'number' || typeof item.y !== 'number' || !builderPalette.some(([type]) => type === item.type)) return [];
    return [{ id: item.id.slice(0, 100), type: item.type, x: Math.max(5, Math.min(95, item.x)), y: Math.max(15, Math.min(86, item.y)) }];
  }).slice(0, 30);
}

export function LessonPage({ lessonId = 'u5-l2', missionId, projectId }: { lessonId?: string; missionId?: string; projectId?: string }) {
  const app = useApp(); const { profile, path, notify, setMode, refreshProgress, navigate, beginJourney } = app;
  const isProject = path.startsWith('/builder') || path.startsWith('/workbench');
  const [project, setProject] = useState<Project | null>(null); const [projectReady, setProjectReady] = useState(!projectId || projectId === 'new'); const [projectError, setProjectError] = useState('');
  const [newProjectMode] = useState<LearningMode>(path.startsWith('/workbench') ? 'adult' : profile?.mode || 'teen');
  const mode: LearningMode = isProject ? project?.mode || newProjectMode : profile?.mode || 'child'; const contentId = project?.lessonId || missionId || lessonId;
  const mission = missions.find(item => item.id === contentId); const lesson = getLesson(contentId);
  const variant = lesson?.variants[mode]; const basePreview = mission?.preview || variant?.preview || fallbackPreview;
  const tests = mission?.tests || variant?.tests || []; const sceneKind = mission ? 'report' : variant?.scene || 'report';
  const starter = project?.code ?? mission?.starterCode ?? variant?.starterCode ?? '';
  const namespace = [profile?.id || 'guest', contentId, mode, projectId || 'lesson', String(projectReady)].join(':');
  const draft = useDraft({ profileId: profile?.id, lessonId: contentId, mode, seed: starter,
    enabled: !!profile && !isProject && (!!lesson || !!mission?.available), instanceKey: isProject ? String(projectReady) + ':' + (projectId || 'new') : '' });
  const [stage, setStage] = useState<Stage>(isProject || missionId ? 'practice' : 'idea');
  const [exampleCode, setExampleCode] = useState(variant?.exampleCode || ''); const [exampleVersion, setExampleVersion] = useState(0);
  const [inputs, setInputs] = useState(inputsFor(basePreview)); const [files, setFiles] = useState<{ path: string; content: string }[]>([]); const [inputVersion, setInputVersion] = useState(0);
  const [items, setItems] = useState<SceneItem[]>(initialItems); const [projectTitle, setProjectTitle] = useState(''); const [savingProject, setSavingProject] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null); const [resultIsExample, setResultIsExample] = useState(false);
  const [busy, setBusy] = useState(false); const [runProgress, setRunProgress] = useState<RunProgress | null>(null); const [executionNotice, setExecutionNotice] = useState('');
  const [consoleTab, setConsoleTab] = useState<ConsoleTab>('output'); const [eventCursor, setEventCursor] = useState(0); const [traceCursor, setTraceCursor] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({}); const [reflection, setReflection] = useState<number | null>(null); const [transfer, setTransfer] = useState('');
  const [hintLevel, setHintLevel] = useState(0); const [hints, setHints] = useState<TutorReply[]>([]); const [hintHistory, setHintHistory] = useState<TutorReply[]>([]); const [tutorBusy, setTutorBusy] = useState(false); const [shareCode, setShareCode] = useState(false); const [tutorQuestion, setTutorQuestion] = useState('');
  const [access, setAccess] = useState<{ locked: boolean; reason: string | null } | null>(null); const [accessError, setAccessError] = useState(''); const [retryAccess, setRetryAccess] = useState(0);
  const [submitting, setSubmitting] = useState(false); const [reward, setReward] = useState<SubmissionResponse | null>(null); const [showReset, setShowReset] = useState(false);
  const runner = useRef<PythonRunner | null>(null); const generation = useRef(0); const currentContext = useRef<RunContext | null>(null); const scopeRef = useRef(namespace); scopeRef.current = namespace;
  const mounted = useRef(true);
  const isActiveScope = (scope: string) => mounted.current && scopeRef.current === scope;
  const appliedMode = useRef(''); const codeRef = useRef(draft.code); codeRef.current = draft.code;
  const version = draft.version + exampleVersion + inputVersion;
  currentContext.current = profile ? { profileId: profile.id, lessonId: contentId, variantId: mission ? mission.id + ':mission' : variant?.id || '', draftVersion: version, testsVersion: mission ? '1.0.0' : lesson?.assessmentVersion || '1.0.0' } : null;

  useEffect(() => {
    if (!profile || appliedMode.current === (projectId || path.split('?')[0])) return;
    const queryMode = new URLSearchParams(path.split('?')[1] || '').get('mode');
    const preferred = ['child', 'teen', 'adult'].includes(queryMode || '') ? queryMode as LearningMode : projectId === 'new' && path.startsWith('/workbench') ? 'adult' : null;
    appliedMode.current = projectId || path.split('?')[0]; if (preferred && mode !== preferred) void setMode(preferred);
  }, [profile?.id, path, projectId, mode, setMode]);

  useEffect(() => {
    if (!profile || !isProject || !projectId || projectId === 'new') return;
    let current = true; setProjectReady(false); setProjectError('');
    void api<Project>('/projects/' + encodeURIComponent(projectId) + profileQuery(profile.id)).then(async saved => {
      if (!current) return;
      if (saved.profileId !== profile.id) throw new Error('Этот проект принадлежит другому профилю. Выбери его в настройках.');
      if (current) { setProject(saved); setProjectReady(true); }
    }).catch(error => { if (current) setProjectError((error as Error).message); });
    return () => { current = false; };
  // Loading a saved project happens once; subsequent mode changes are the learner's choice.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, isProject, projectId]);

  const invalidate = useCallback(() => { generation.current++; runner.current?.cancel(); setBusy(false); setRunProgress(null); setResult(null); setExecutionNotice(''); setReward(null); }, []);
  useEffect(() => {
    invalidate(); setStage(isProject || mission || profile?.difficulty !== 'guided' ? 'practice' : 'idea'); setExampleCode(variant?.exampleCode || ''); setExampleVersion(0); setInputVersion(0);
    setInputs(typeof project?.config.inputs === 'string' ? project.config.inputs : inputsFor(basePreview));
    setFiles(project?.files || variant?.files || (basePreview.fixtures.files || []).map(file => ({ path: file.path, content: file.content })));
    setItems(validItems(project?.config.items)); setProjectTitle(project?.title || (mission ? 'Миссия: ' + mission.title : mode === 'adult' ? 'Мой первый отчёт' : mode === 'teen' ? 'Моя тренировочная арена' : 'Приключение моего робота'));
    setAnswers({}); setReflection(null); setTransfer(''); setHints([]); setHintHistory([]); setHintLevel(0); setTutorQuestion(''); setShareCode(false); setAccess(null); setAccessError('');
    setTutorBusy(false); setSubmitting(false); setSavingProject(false);
    return () => { generation.current++; runner.current?.cancel(); };
  // Reset only at a real namespace boundary, never when a server save changes revision.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [namespace, invalidate]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++; runner.current?.dispose(); runner.current = null; }; }, []);

  useEffect(() => {
    if (!profile || !lesson || isProject) return;
    let current = true; setAccess(null); setAccessError('');
    void api<{ lesson: LessonCore; variant: LessonVariant; locked: boolean; reason: string | null }>('/lessons/' + lesson.id + profileQuery(profile.id) + '&mode=' + mode)
      .then(data => { if (current) setAccess({ locked: data.locked, reason: data.reason }); })
      .catch(error => { if (current) setAccessError((error as Error).message); });
    void api<{ messages: TutorReply[] }>('/tutor/messages' + profileQuery(profile.id) + '&lessonId=' + lesson.id + '&mode=' + mode)
      .then(data => { if (current) setHintHistory(data.messages); }).catch(() => { /* A tutor history outage must not block the lesson. */ });
    return () => { current = false; };
  }, [profile?.id, lesson?.id, mode, isProject, retryAccess]);

  function updateCode(value: string) { invalidate(); draft.change(value); }
  function updateExample(value: string) { invalidate(); setExampleCode(value); setExampleVersion(v => v + 1); }
  function updateInputs(value: string) { invalidate(); setInputs(value); setInputVersion(v => v + 1); }
  function updateFiles(value: { path: string; content: string }[]) { invalidate(); setFiles(value); setInputVersion(v => v + 1); }
  function preparePreview(example = false): ExecutionCase {
    const preview: ExecutionCase = structuredClone(basePreview);
    if (example) { preview.probe = { kind: 'script' }; return preview; }
    const value: unknown = JSON.parse(inputs || (preview.probe.kind === 'call' ? '[]' : '{}'));
    if (preview.probe.kind === 'call') {
      if (!Array.isArray(value)) throw new Error('Аргументы функции должны быть массивом JSON, например [5].');
      preview.probe.args = value as JsonValue[];
    } else {
      if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('Входные переменные должны быть объектом JSON.');
      preview.fixtures.globals = value as JsonObject;
    }
    // Reuse a published scene only when its input exactly matches this preview input.
    // Expected results and grading assertions remain in the independent test cases.
    const matchingScene = tests.find(test => test.fixtures.scene && test.probe.kind === preview.probe.kind &&
      (test.probe.kind === 'call' && preview.probe.kind === 'call'
        ? JSON.stringify(test.probe.args) === JSON.stringify(preview.probe.args)
        : JSON.stringify(test.fixtures.globals || {}) === JSON.stringify(preview.fixtures.globals || {})))?.fixtures.scene;
    if (matchingScene) preview.fixtures.scene = structuredClone(matchingScene);
    preview.fixtures.files = files.map(file => ({ ...file, encoding: 'utf8' as const })); return preview;
  }
  const previewForScene = useMemo(() => {
    try { return preparePreview(resultIsExample); } catch { return basePreview; }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputs, files, basePreview, resultIsExample]);

  async function runCode(operation: 'preview' | 'check', example = false) {
    if (!profile || busy || !draft.loaded || (!isProject && lesson && (!access || access.locked))) return;
    const runScope = namespace; const runGeneration = ++generation.current; const context = currentContext.current!;
    let preview: ExecutionCase;
    try { preview = preparePreview(example); } catch (error) { setExecutionNotice('Проверь входные данные: ' + (error as Error).message); return; }
    if (!runner.current) runner.current = createPythonRunner({ isContextCurrent: context => sameContext(currentContext.current, context) });
    setBusy(true); setExecutionNotice(''); setResult(null); setResultIsExample(example); setConsoleTab(operation === 'check' ? 'tests' : 'output'); setTraceCursor(0);
    try {
      const next = await runner.current.run({ protocolVersion: '1', runId: crypto.randomUUID(), context,
        operation, code: example ? exampleCode : codeRef.current, preview, tests: operation === 'check' ? tests : [] },
      progress => { if (generation.current === runGeneration && scopeRef.current === runScope) setRunProgress(progress); });
      if (generation.current !== runGeneration || scopeRef.current !== runScope || !sameContext(currentContext.current, next.context)) return;
      setResult(next); setEventCursor(profile.accessibility.reducedMotion ? next.events.length : 0);
      if (next.status === 'cancelled') setExecutionNotice('Выполнение остановлено. Можно изменить код и запустить снова.');
      const passed = next.status === 'ok' && next.error === null && next.testResults.length === tests.length && tests.length > 0 && next.testResults.every(test => test.passed && test.status === 'ok') && !next.truncated.events && !next.truncated.files && !next.truncated.stdout;
      if (operation === 'check' && passed) notify('Все проверки пройдены! ' + (mission || isProject ? 'Сохрани свою работу в мастерской.' : 'Остался один вопрос о том, как работает код.'));
      if (operation === 'check' && !passed && !isProject && !mission && lesson && variant && next.testResults.length === tests.length) {
        void post<SubmissionResponse>('/submissions', { profileId: profile.id, lessonId: lesson.id, mode, variantId: variant.id,
          contentVersion: lesson.contentVersion, assessmentVersion: lesson.assessmentVersion, runtimeVersion, idempotencyKey: next.runId + ':attempt',
          code: codeRef.current, result: next, hintLevel, reflectionCorrect: false }).then(() => { if (isActiveScope(runScope)) void refreshProgress(); })
          .catch(error => { if (isActiveScope(runScope)) notify('Код проверен, но попытка не сохранилась: ' + (error as Error).message, 'error'); });
      }
    } catch (error) {
      if (generation.current === runGeneration && scopeRef.current === runScope) setExecutionNotice('Python не удалось запустить. ' + (error as Error).message + ' Проверь подключение и повтори запуск.');
    } finally { if (generation.current === runGeneration && scopeRef.current === runScope) { setBusy(false); setRunProgress(null); } }
  }
  function stop() { generation.current++; runner.current?.cancel(); setBusy(false); setRunProgress(null); setExecutionNotice('Выполнение остановлено. Следующий запуск начнётся в чистом окружении.'); }
  const runAction = useRef<() => void>(() => {}); runAction.current = () => { void runCode('preview', stage === 'example'); };
  const stopAction = useRef(stop); stopAction.current = () => { if (busy) stop(); };
  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); runAction.current(); }
      if (event.key === 'Escape' && !document.querySelector('dialog[open]')) stopAction.current();
    };
    window.addEventListener('keydown', keys); return () => window.removeEventListener('keydown', keys);
  }, []);

  const allPassed = !!result && !resultIsExample && result.operation === 'check' && result.status === 'ok' && result.error === null && tests.length > 0 && result.testResults.length === tests.length && result.testResults.every(test => test.passed && test.status === 'ok') && !result.truncated.events && !result.truncated.files && !result.truncated.stdout;
  const reflectionCorrect = !!variant && reflection === variant.reflection.correctIndex;
  async function completeLesson() {
    if (!profile || !lesson || !result || !allPassed || !reflectionCorrect || submitting || isProject || mission) return;
    const scope = namespace; setSubmitting(true);
    try {
      await draft.flush();
      const saved = await post<SubmissionResponse>('/submissions', { profileId: profile.id, lessonId: lesson.id, mode, variantId: variant!.id,
        contentVersion: lesson.contentVersion, assessmentVersion: lesson.assessmentVersion, runtimeVersion, idempotencyKey: result.runId + ':complete', code: draft.code, result, hintLevel, reflectionCorrect });
      if (!saved.accepted) throw new Error('Проверка не принята. Запусти все тесты ещё раз.');
      const reviewSkill = new URLSearchParams(path.split('?')[1] || '').get('review');
      if (reviewSkill) {
        try { await post('/progress/review', { profileId: profile.id, skillId: reviewSkill, submissionId: saved.submissionId }); }
        catch (error) { if (isActiveScope(scope)) notify('Урок сохранён. ' + (error as Error).message, 'error'); }
      }
      await refreshProgress();
      if (isActiveScope(scope)) { setReward(saved); if (profile.accessibility.sound) playSuccessTone(); }
    } catch (error) { if (isActiveScope(scope)) notify((error as Error).message, 'error'); }
    finally { if (isActiveScope(scope)) setSubmitting(false); }
  }
  async function saveProject() {
    if (!profile || savingProject) return;
    const scope = namespace; setSavingProject(true);
    try {
      const config: JsonObject = { inputs, items: items.map(item => ({ id: item.id, type: item.type, x: item.x, y: item.y })), ...(mission ? { missionId: mission.id } : {}) };
      const fields = { lessonId: contentId, title: projectTitle.trim() || 'Мой проект', mode, code: draft.code, files, config };
      const saved = project ? await post<Project>('/projects/' + project.id, { ...fields, expectedRevision: project.revision }, 'PATCH')
        : await post<Project>('/projects', { ...fields, profileId: profile.id });
      if (!isActiveScope(scope)) return;
      setProject(saved); notify('Проект сохранён · версия ' + saved.revision);
      if (!isProject || !projectId || projectId === 'new') navigate((mode === 'adult' || mission ? '/workbench/' : '/builder/') + saved.id);
    } catch (error) { if (isActiveScope(scope)) notify((error as Error).message, 'error'); }
    finally { if (isActiveScope(scope)) setSavingProject(false); }
  }
  async function askTutor(level = Math.min(4, hintLevel + 1)) {
    if (!profile || !lesson || tutorBusy || level < 1) return;
    const scope = namespace; setTutorBusy(true);
    try {
      const reply = await post<TutorReply>('/tutor/messages', { profileId: profile.id, lessonId: lesson.id, mode, hintLevel: level,
        message: tutorQuestion, shareCode, ...(shareCode ? { code: draft.code, error: result?.error?.message || '' } : {}), revealSolution: level === 4 });
      if (isActiveScope(scope)) { setHints(rows => [...rows, reply]); setHintLevel(Math.max(hintLevel, reply.hintLevel)); setTutorQuestion(''); }
    } catch (error) { if (isActiveScope(scope)) notify((error as Error).message, 'error'); }
    finally { if (isActiveScope(scope)) setTutorBusy(false); }
  }
  async function uploadFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    if (file.size > 262144) { notify('Выбери текстовый файл до 256 КиБ.', 'error'); return; }
    const safeName = file.name.replace(/[^a-zA-Z0-9_.-]/g, '_').replace(/^[^a-zA-Z0-9_]+/, '') || 'input.txt';
    const scope = namespace; const element = event.target;
    try { const content = await file.text(); if (isActiveScope(scope)) updateFiles([...files.filter(item => item.path !== safeName), { path: safeName, content }].slice(0, 16)); }
    catch { if (isActiveScope(scope)) notify('Не удалось прочитать файл. Попробуй выбрать его ещё раз.', 'error'); }
    finally { if (isActiveScope(scope)) element.value = ''; }
  }

  if (!lesson && !mission?.available) return <main id="main-content" className="page-container"><EmptyState title={mission || lessons.some(item => item.id === contentId) ? 'Задание готовится' : 'Этот урок пока не открыт'}><p>Выбери одно из доступных заданий в практикуме.</p><Link className="button button-primary" href="/practice">Открыть практикум <Arrow /></Link></EmptyState></main>;
  if (!profile) return <main id="main-content" className="page-container"><div className="lesson-welcome panel"><img src="/assets/tutor/pix-bot-idle.webp" width="200" height="200" alt="Пикс-Бот" /><p className="eyebrow">ОДНА ИДЕЯ · ТРИ СПОСОБА УЧИТЬСЯ</p><h1 tabIndex={-1}>{mission?.title || variant?.title}</h1><p>{mission?.description || variant?.story}</p><Button onClick={() => beginJourney(path)}>Выбрать героя и начать <Arrow /></Button><small>Черновики и результаты сохранятся в твоём профиле.</small></div></main>;
  if (projectError) return <main id="main-content" className="page-container"><EmptyState title="Не удалось открыть проект"><p>{projectError}</p><Link className="button button-primary" href="/projects">В мастерскую</Link></EmptyState></main>;
  if (!projectReady) return <main id="main-content" className="page-container"><div className="loading-panel"><img src="/assets/fx/loading/violet-swirl.webp" width="80" height="80" alt="" /><p>Открываем проект и его файлы…</p></div></main>;
  const locked = !isProject && !!access?.locked; const readyToRun = draft.loaded && !locked && (isProject || !!mission || !!access);
  const actualStage = isProject || mission ? 'practice' : stage;
  const completedIds = reward?.progress.completedLessonIds || app.progress.completedLessonIds;
  const lessonIndex = lesson ? lessons.indexOf(lesson) : -1;
  const nextLesson = lesson ? [...lessons.slice(lessonIndex + 1), ...lessons.slice(0, lessonIndex)].find(item => !completedIds.includes(item.id) && item.prerequisites.every(id => completedIds.includes(id) || id === lesson.id)) : undefined;
  const title = isProject ? projectTitle : mission?.title || variant!.title;
  const saveLabels: Record<typeof draft.status, string> = { loading: 'Открываем черновик…', saved: 'Черновик сохранён', dirty: 'Есть изменения', saving: 'Сохраняем…', error: 'Не сохранено', conflict: 'Конфликт версий', manual: project ? 'Проект · версия ' + project.revision : 'Новый проект' };

  return <main id="main-content" className={'page-container lesson-page mode-' + mode}>
    <div className="lesson-breadcrumb"><Link href={isProject ? '/projects' : mission ? '/missions' : '/map'}><Arrow direction="left" />{isProject ? 'Мастерская' : mission ? 'Миссии' : 'Карта миров'}</Link><span>/</span><span>{mission ? 'Практическая миссия' : lesson!.title}</span></div>
    <header className="lesson-heading"><div><div className="lesson-eyebrow"><Badge tone={mode === 'child' ? 'teal' : mode === 'teen' ? 'purple' : 'gold'}>{mission ? 'МИССИЯ ' + mission.id.slice(1) : isProject ? 'МАСТЕРСКАЯ' : 'УРОК ' + lesson!.id.replace('u', '').replace('-l', '.')}</Badge><span>{mission ? tests.length + ' проверок' : lesson!.minutes + ' минут'}</span>{!isProject && !mission && <span>+{lesson!.xp} XP</span>}</div><h1 tabIndex={-1}>{title}</h1></div>{isProject ? <Badge tone="purple">Формат проекта: {modeLabels[mode]}</Badge> : <div className="lesson-mode-picker" aria-label="Формат обучения">{(['child', 'teen', 'adult'] as const).map(value => <button key={value} className={value === mode ? 'active' : ''} aria-pressed={value === mode} onClick={() => { if (value !== mode) void setMode(value); }}><Icon name={value === 'child' ? 'play' : value === 'teen' ? 'code' : 'terminal'} size={17} /><span>{modeLabels[value]}</span></button>)}</div>}</header>
    {accessError && <div className="inline-alert" role="alert"><p>{accessError}</p><Button variant="secondary" onClick={() => setRetryAccess(value => value + 1)}>Повторить</Button></div>}
    {locked && <div className="lesson-lock panel"><Icon name="lock" size={36} /><h2>Сначала соберём основу</h2><p>{access?.reason}</p><Link className="button button-primary" href={'/lesson/' + (lesson?.prerequisites.find(id => !app.progress.completedLessonIds.includes(id)) || 'u1-l1')}>К предыдущему уроку <Arrow /></Link></div>}
    {!locked && <>
      {!isProject && !mission && <nav className="lesson-steps" aria-label="Шаги урока">{stages.map((item, index) => <button key={item.id} className={stage === item.id ? 'active' : ''} aria-current={stage === item.id ? 'step' : undefined} onClick={() => setStage(item.id)}><b>{index + 1}</b><span>{item.title}</span>{item.id === 'practice' && allPassed && <i>✓</i>}</button>)}</nav>}
      {actualStage === 'idea' && variant && <section className="lesson-idea-layout"><article className="theory-content panel"><p className="eyebrow">СЕГОДНЯ ТЫ СМОЖЕШЬ</p><h2>{lesson!.objective}</h2><p className="lesson-story">{variant.story}</p>{variant.theory.map((block, i) => <section className="theory-block" key={block.title}><span className="block-number">0{i + 1}</span><div><h3>{block.title}</h3><p>{block.body}</p>{block.code && <pre className="python-example"><code>{block.code}</code></pre>}</div></section>)}<Button onClick={() => setStage('example')}>Посмотреть на живом примере <Arrow /></Button></article><aside className="lesson-companion panel"><img src={'/assets/characters/' + profile.avatar + '/happy.webp'} width="260" height="260" alt={profile.displayName + ', твой спутник'} /><Badge tone="gold">Маленький шаг — большое открытие</Badge><h3>Мы разберёмся вместе</h3><p>Сначала предскажи результат. Потом запусти код и сравни своё предположение с тем, что произошло.</p><div className="objective-chips">{lesson!.skillIds.map(id => <span key={id}>{id.replaceAll('-', ' ')}</span>)}</div><button className="text-button" onClick={() => setStage('practice')}>Я готов попробовать <Arrow /></button></aside></section>}
      {actualStage === 'quiz' && variant && <section className="quiz-stage"><div className="section-intro"><p className="eyebrow">ДВЕ МАЛЕНЬКИЕ ПРОВЕРКИ</p><h2>Предскажи, прежде чем запускать</h2><p>Ошибиться здесь — тоже способ заметить новую деталь.</p></div>{variant.questions.map((question, i) => <QuestionCard key={question.id} question={question} number={i + 1} selected={answers[question.id] ?? null} onSelect={value => setAnswers(rows => ({ ...rows, [question.id]: value }))} />)}<div className="stage-actions"><Button onClick={() => setStage('practice')}>Теперь напишем свой код <Arrow /></Button><span className="muted">{variant.questions.filter(q => answers[q.id] === q.correctIndex).length} из {variant.questions.length} идей разобрано</span></div></section>}
      {(actualStage === 'practice' || actualStage === 'example') && <>
        <div className="task-banner"><div className="task-banner-icon"><Icon name={actualStage === 'example' ? 'book' : mission ? 'mission' : 'code'} size={26} /></div><div><p className="eyebrow">{actualStage === 'example' ? 'ЭКСПЕРИМЕНТ БЕЗ ОЦЕНКИ' : mission ? 'ТВОЯ МИССИЯ' : 'ТВОЯ ЗАДАЧА'}</p><p>{actualStage === 'example' ? 'Запусти пример. Измени одно значение и снова предскажи результат. Твой учебный черновик остаётся в шаге «Твой код».' : mission?.description || variant!.task}</p></div></div>
        {isProject && <div className="project-edit-bar"><label>Название проекта<input value={projectTitle} maxLength={120} onChange={event => setProjectTitle(event.target.value)} /></label><Button variant="secondary" disabled={savingProject || !draft.loaded} onClick={() => void saveProject()}><Icon name="save" size={18} />{savingProject ? 'Сохраняем…' : 'Сохранить версию'}</Button><Link href="/projects" className="text-button">Все проекты <Arrow /></Link></div>}
        <div className="workspace-grid"><section className="code-panel panel"><div className="code-toolbar"><div><span className="code-file-dot" />{actualStage === 'example' ? 'example.py' : mission ? mission.id + '.py' : 'main.py'}<Badge>Python</Badge></div><span className={'draft-state ' + draft.status} aria-live="polite">{actualStage === 'example' ? 'Учебный пример' : saveLabels[draft.status]}</span></div>
          {draft.error && <div className="draft-conflict" role="alert"><p>{draft.error}</p><div><button onClick={() => downloadFile('my-draft.py', draft.code, 'text/x-python')}>Скачать свой код</button><button onClick={() => draft.reload()}>{draft.status === 'conflict' ? 'Открыть серверную версию' : 'Повторить загрузку'}</button></div></div>}
          <CodeEditor value={actualStage === 'example' ? exampleCode : draft.code} onChange={actualStage === 'example' ? updateExample : updateCode} readOnly={!draft.loaded} errorLine={result?.error?.line || null} activeLine={consoleTab === 'trace' && result?.trace[traceCursor] ? result.trace[traceCursor].line : null} fontScale={profile.accessibility.fontScale} label={actualStage === 'example' ? 'Редактор примера Python' : 'Редактор твоего Python-кода'} mode={mode} />
          {mode === 'child' && profile.difficulty === 'guided' && actualStage === 'practice' && !mission && <div className="command-chips" aria-label="Вставить команду">{[{ label: 'Шаг', code: 'game.move(1)' }, { label: 'Сказать', code: 'print("Привет!")' }, { label: 'Цикл', code: 'for i in range(steps):\n    pass' }].map(command => <button key={command.label} disabled={!draft.loaded} onClick={() => updateCode(draft.code.trimEnd() + '\n' + command.code + '\n')}>{command.label}<span>+</span></button>)}</div>}
          <div className="run-toolbar"><Button disabled={!readyToRun || busy} onClick={() => void runCode('preview', actualStage === 'example')}><Icon name="play" size={19} />{busy ? 'Выполняется…' : 'Запустить'}</Button>{actualStage === 'practice' && <Button variant="secondary" disabled={!readyToRun || busy} onClick={() => void runCode('check')}><Icon name="test" size={18} />Проверить</Button>}<button className="icon-button" disabled={!busy} aria-label="Остановить Python" title="Остановить · Esc" onClick={stop}><Icon name="stop" /></button><span className="keyboard-hint">Ctrl ↵</span><button className="icon-button" title="Вернуть начальный код" aria-label="Вернуть начальный код" onClick={() => setShowReset(true)}><Icon name="repeat" size={19} /></button></div>
          <div className="execution-status" role="status">{busy ? <><img src="/assets/fx/loading/violet-swirl.webp" width="22" height="22" alt="" />{runProgress?.message || 'Готовим Python…'}{runProgress?.testCount ? ' · ' + (runProgress.testIndex || 0) + '/' + runProgress.testCount : ''}</> : result ? <><span className={result.status === 'ok' ? 'status-dot' : 'status-dot error'} />{result.status === 'ok' ? 'Python выполнил программу' : result.status === 'timeout' ? 'Лимит времени: проверь условие выхода' : result.status === 'cancelled' ? 'Выполнение остановлено' : 'Нашлась ошибка — исследуем её'}<span>{(result.elapsedMs / 1000).toFixed(1)} с</span></> : 'Первый запуск загружает Python. Следующие используют сохранённые файлы движка.'}</div>
        </section><section className={'preview-panel panel scene-' + sceneKind}><div className="preview-heading"><div><Icon name={sceneKind === 'report' ? 'terminal' : 'play'} size={19} /><strong>{mission ? 'Результат миссии' : variant!.resultLabel}</strong></div><span>Живое превью</span></div>{sceneKind === 'robot' ? <RobotScene result={result} preview={previewForScene} cursor={eventCursor} onCursorChange={setEventCursor} busy={busy} /> : sceneKind === 'arena' ? <ArenaScene result={result} preview={previewForScene} cursor={eventCursor} onCursorChange={setEventCursor} busy={busy} items={items} onItemsChange={setItems} /> : <ReportScene result={result} />}{sceneKind !== 'report' && <SceneTimeline result={result} cursor={eventCursor} onCursorChange={setEventCursor} />}
          {actualStage === 'practice' && lesson?.id === 'u5-l2' && mode === 'teen' && <label className="wave-control"><span>Размер волны <strong>{(() => { try { return JSON.parse(inputs)[0]; } catch { return '—'; } })()}</strong></span><input aria-label="Количество противников в пробном запуске" type="range" min="0" max="5" value={(() => { try { return Number(JSON.parse(inputs)[0]) || 0; } catch { return 5; } })()} onChange={event => updateInputs(JSON.stringify([Number(event.target.value)]))} /><small>Попробуй 0, 1 и 5. После изменения запусти код снова.</small></label>}
          {allPassed && <div className="practice-success"><span>✓</span><div><strong>Работает на всех {tests.length} примерах</strong><p>{mission || isProject ? 'Программа готова стать твоим проектом.' : 'Теперь объясни, почему получился такой результат.'}</p></div><Button variant="secondary" onClick={() => mission || isProject ? void saveProject() : setStage('reflection')}>{mission || isProject ? 'Сохранить' : 'Дальше'} <Arrow /></Button></div>}
        </section></div>
        {executionNotice && <div className="inline-alert" role="alert"><Icon name="bug" /><p>{executionNotice}</p></div>}
        <div className="workspace-bottom"><section className="console-panel panel"><div className="console-tabs" role="tablist" aria-label="Результаты запуска">{([{ id: 'output', title: 'Консоль', icon: 'terminal' }, { id: 'tests', title: 'Проверки', icon: 'test' }, { id: 'trace', title: 'По шагам', icon: 'bug' }] as const).map(tab => <button id={'console-tab-' + tab.id} aria-controls={'console-' + tab.id} role="tab" aria-selected={consoleTab === tab.id} key={tab.id} className={consoleTab === tab.id ? 'active' : ''} onClick={() => setConsoleTab(tab.id)}><Icon name={tab.icon} size={17} />{tab.title}{tab.id === 'tests' && result?.operation === 'check' && <b>{result.testResults.filter(test => test.passed).length}/{tests.length}</b>}</button>)}</div>
          <div className="console-content" id={'console-' + consoleTab} role="tabpanel" aria-labelledby={'console-tab-' + consoleTab}>
            {consoleTab === 'output' && <><div className="console-prompt"><span>›</span>{result ? (resultIsExample ? 'example.py' : 'main.py') : 'Запусти код, чтобы увидеть вывод'}</div>{result?.stdout && <pre className="stdout">{result.stdout}</pre>}{result?.stderr && <pre className="stderr">{result.stderr}</pre>}{result?.error && <div className="python-error"><strong><Icon name="bug" size={19} />{result.error.type}{result.error.line ? ' · строка ' + result.error.line : ''}</strong><p>{result.error.message}</p><ErrorHelp type={result.error.type} category={result.error.category} /><details><summary>Подробности Python</summary><pre>{result.error.traceback}</pre></details></div>}{result && !result.stdout && !result.error && <p className="console-muted">{result.returnValue !== undefined ? 'Функция вернула значение. Оно показано в превью.' : 'Нет печатного вывода. Добавь print(...), если хочешь увидеть значение.'}</p>}{result?.truncated.stdout && <p className="console-warning">Вывод сокращён до лимита. Уменьши количество печатаемых строк.</p>}</>}
            {consoleTab === 'tests' && <TestResults tests={tests} result={resultIsExample ? null : result} onRun={() => void runCode('check')} canRun={readyToRun && !busy} />}
            {consoleTab === 'trace' && <TraceView result={result} cursor={traceCursor} onChange={value => { setTraceCursor(value); setEventCursor(result?.trace[value]?.eventIndex || 0); }} />}
          </div>
        </section>{lesson && <aside className="tutor-inline panel"><div className="tutor-inline-header"><img src={'/assets/tutor/pix-bot-' + (tutorBusy ? 'thinking' : result?.error ? 'error' : allPassed ? 'success' : 'hint') + '.webp'} alt="Пикс-Бот" width="86" height="86" /><div><h3>Есть вопрос?</h3><p>Давай найдём следующий шаг.</p></div><Badge>Пикс</Badge></div>{hints.length > 0 ? <div className="inline-hint" aria-live="polite"><span>{hints.at(-1)?.provider === 'provider' ? 'AI-ответ' : 'Подсказка курса'} · шаг {hints.at(-1)?.hintLevel}</span><TutorText text={hints.at(-1)!.message} /></div> : <p className="tutor-first-hint">Что ты ожидаешь увидеть после запуска? Если результат другой, начни с первой строки, где ваши пути разошлись.</p>}<div className="hint-controls">{[1, 2, 3, 4].map(level => <button key={level} title={level === 4 ? 'Показать разбор решения' : 'Подсказка ' + level} className={level <= hintLevel ? 'used' : ''} disabled={tutorBusy || level > hintLevel + 1} onClick={() => void askTutor(level)}>{level === 4 ? 'Разбор' : level}</button>)}</div><form onSubmit={event => { event.preventDefault(); void askTutor(); }}><label className="sr-only" htmlFor="inline-tutor-question">Вопрос Пикс-Боту</label><textarea id="inline-tutor-question" value={tutorQuestion} maxLength={1000} onChange={event => setTutorQuestion(event.target.value)} placeholder="Что хочется понять?" rows={2} /><label className="checkbox-label"><input type="checkbox" checked={shareCode} onChange={event => setShareCode(event.target.checked)} />Передать мой код и ошибку наставнику</label><Button variant="secondary" type="submit" disabled={tutorBusy}>{tutorBusy ? 'Думаем…' : hintLevel >= 3 ? 'Показать разбор решения' : 'Дай следующую подсказку'} <Arrow /></Button></form><small className="privacy-caption">Без AI-провайдера Пикс показывает подготовленные подсказки курса.</small>{hintHistory.length > 0 && <details className="tutor-history"><summary>Прошлые подсказки · {hintHistory.length}</summary>{hintHistory.map(reply => <div className="inline-hint" key={reply.id}><span>Подсказка {reply.hintLevel}</span><TutorText text={reply.message} /></div>)}</details>}</aside>}</div>
        {actualStage === 'practice' && <div className="workspace-extras">{sceneKind === 'arena' && <section className="palette-panel panel"><div className="section-mini-heading"><Icon name="code" /><h3>Построй свою арену</h3><Badge>{items.length}/30</Badge></div><p>Перетащи предмет в сцену или нажми на него. Затем запусти Python и испытай свой уровень.</p><div className="object-palette">{builderPalette.map(([type, title]) => <button key={type} draggable onDragStart={event => event.dataTransfer.setData('piton/palette', type)} disabled={items.length >= 30} onClick={() => setItems(rows => [...rows, { id: crypto.randomUUID(), type, x: 15 + (rows.length * 13) % 70, y: 63 }])}><img src={'/assets/game/arena/items/' + type + '-128.webp'} width="62" height="62" alt="" /><span>{title}</span></button>)}</div><div className="placed-items">{items.map(item => <button key={item.id} title="Убрать предмет" onClick={() => setItems(rows => rows.filter(row => row.id !== item.id))}>{builderPalette.find(([type]) => type === item.type)?.[1]} <span>×</span></button>)}</div></section>}
          <section className="input-data-panel panel"><div className="section-mini-heading"><Icon name="settings" /><h3>Входные данные</h3><Badge>JSON</Badge></div><p>{basePreview.probe.kind === 'call' ? 'Аргументы вызова ' + basePreview.probe.functionName + ', записанные массивом.' : 'Переменные, которые программа получает перед запуском.'} Здесь меняется пробный запуск; кнопка «Проверить» использует отдельные тестовые данные.</p><textarea spellCheck={false} aria-label="Входные данные JSON" value={inputs} maxLength={30000} onChange={event => updateInputs(event.target.value)} rows={Math.min(10, Math.max(3, inputs.split('\n').length))} /><button className="text-button" onClick={() => updateInputs(inputsFor(basePreview))}>Вернуть исходные данные</button></section>
          {(mode === 'adult' || mission || files.length > 0) && <section className="file-panel panel"><div className="section-mini-heading"><Icon name="book" /><h3>Файлы проекта</h3><label className="file-upload button button-ghost">+ Добавить<input type="file" accept=".txt,.csv,.json,.md" onChange={event => void uploadFile(event)} /></label></div>{!files.length && <p>Добавь CSV, JSON или текстовый файл до 256 КиБ. Python сможет открыть его по имени через open(...).</p>}{files.map((file, index) => <details className="input-file" key={file.path} open={files.length === 1}><summary><code>{file.path}</code><span>{new TextEncoder().encode(file.content).length} байт</span></summary><textarea value={file.content} spellCheck={false} aria-label={'Содержимое файла ' + file.path} maxLength={262144} onChange={event => updateFiles(files.map((row, i) => i === index ? { ...row, content: event.target.value } : row))} rows={6} /><div><button className="text-button" onClick={() => downloadFile(file.path, file.content)}>Скачать</button><button className="text-button" onClick={() => updateFiles(files.filter((_, i) => i !== index))}>Убрать файл</button></div></details>)}</section>}
        </div>}
        <div className="workspace-bottom-actions"><div><Button variant="secondary" disabled={!draft.loaded || savingProject} onClick={() => void saveProject()}><Icon name="save" size={18} />{isProject ? 'Сохранить версию' : 'Сохранить как проект'}</Button><Button variant="ghost" onClick={() => downloadFile((mission?.id || 'main') + '.py', draft.code, 'text/x-python')}><Icon name="export" size={18} />Скачать .py</Button>{isProject && <Button variant="ghost" onClick={() => downloadFile('piton-project.json', JSON.stringify({ format: 'piton-project-v1', title: projectTitle, lessonId: contentId, mode, code: draft.code, files, config: { items, inputs } }, null, 2), 'application/json')}>Проект JSON ↓</Button>}</div>{actualStage === 'example' && <Button onClick={() => setStage('quiz')}>Проверить свою догадку <Arrow /></Button>}</div>
      </>}
      {actualStage === 'reflection' && variant && <section className="reflection-stage"><div className="reflection-intro"><img src={'/assets/tutor/pix-bot-' + (allPassed ? 'success' : 'thinking') + '.webp'} width="170" height="170" alt="Пикс-Бот" /><div><p className="eyebrow">НЕ ТОЛЬКО «ПОЛУЧИЛОСЬ»</p><h2>Ты понимаешь, почему это работает?</h2><p>Одна мысль своими словами помогает превратить удачный запуск в навык.</p></div></div>{!allPassed && <div className="inline-alert"><p>Сначала вернись к своему коду и пройди все проверки.</p><Button variant="secondary" onClick={() => setStage('practice')}>К коду <Arrow /></Button></div>}<QuestionCard question={variant.reflection} selected={reflection} onSelect={setReflection} number={1} /><div className="transfer-card panel"><Badge tone="purple">Попробуй перенести идею</Badge><h3>А если задача немного другая?</h3><p>{variant.transfer}</p><textarea value={transfer} onChange={event => setTransfer(event.target.value)} maxLength={2000} rows={3} aria-label="Твоя идея переноса навыка" placeholder="Запиши свою идею. Она останется здесь до выхода из урока." /><small>Этот свободный ответ — заметка для размышления. Автоматическая проверка оценивает код и вопрос выше.</small></div><div className="stage-actions"><Button disabled={!allPassed || !reflectionCorrect || submitting} onClick={() => void completeLesson()}><Icon name="trophy" />{submitting ? 'Сохраняем результат…' : 'Завершить урок'}</Button><span className="muted">{app.progress.completedLessonIds.includes(lesson!.id) ? 'Повторение укрепит навык. XP за этот урок уже получены.' : '+' + lesson!.xp + ' XP за первый успешный результат'}</span></div></section>}
      {lesson && actualStage === 'idea' && <details className="lesson-sources"><summary>Откуда темы и как устроен урок</summary><p>Теория и задания написаны для этой версии курса. Привязки к главам перенесены из предоставленной карты источников; тексты книг и их конкретные издания не были предоставлены для сверки.</p>{lesson.sources.map(source => <p key={source.id}><strong>{source.book}</strong> · {source.chapter} · {source.topic}{source.pages ? ' · ' + source.pages : ''}</p>)}</details>}
    </>}
    {showReset && <Modal title="Вернуть начало задания?" onClose={() => setShowReset(false)}><p>Текущий текст в этом редакторе заменится начальным кодом. Перед заменой можно скачать свою версию.</p><div className="modal-actions"><Button variant="secondary" onClick={() => downloadFile('my-code.py', actualStage === 'example' ? exampleCode : draft.code)}>Скачать свой код</Button><Button onClick={() => { if (actualStage === 'example') updateExample(variant?.exampleCode || ''); else updateCode(mission?.starterCode || variant?.starterCode || ''); setShowReset(false); }}>Вернуть начало</Button></div></Modal>}
    {reward && <Modal title={reward.xpAwarded ? 'Ещё одно открытие!' : 'Навык становится крепче'} onClose={() => setReward(null)}><div className="reward-content"><img className="reward-art" src="/assets/rewards/lesson-complete-art.webp" width="500" height="280" alt="Открытая книга, кристаллы и сияющая награда" /><Badge tone="gold">{reward.xpAwarded ? '+' + reward.xpAwarded + ' XP' : 'Успешное повторение'}</Badge><h3>{profile.displayName}, у тебя получилось</h3><p>Код прошёл {tests.length} проверок, а ты объяснил его поведение. Результат сохранён в твоём профиле.</p><div className="reward-stats"><span><strong>{reward.progress.completedLessonIds.length}</strong>уроков пройдено</span><span><strong>{reward.progress.xp}</strong>всего XP</span></div><div className="modal-actions"><Button variant="secondary" onClick={() => { setReward(null); navigate('/map'); }}>На карту</Button>{nextLesson ? <Button onClick={() => { setReward(null); navigate('/lesson/' + nextLesson.id); }}>Следующее открытие <Arrow /></Button> : <Button onClick={() => { setReward(null); navigate('/missions'); }}>Попробовать миссии <Arrow /></Button>}</div></div></Modal>}
  </main>;
}

function QuestionCard({ question, selected, onSelect, number }: { question: Question; selected: number | null; onSelect: (value: number) => void; number: number }) {
  const correct = selected === question.correctIndex;
  return <fieldset className="question-card panel"><legend><span>{number.toString().padStart(2, '0')}</span>{question.prompt}</legend><div className="question-choices">{question.choices.map((choice, index) => <label key={choice} className={(selected === index ? 'selected ' + (correct ? 'correct' : 'try-again') : '')}><input type="radio" name={question.id} checked={selected === index} onChange={() => onSelect(index)} /><span className="choice-marker">{selected === index && correct ? '✓' : String.fromCharCode(65 + index)}</span><span>{choice}</span></label>)}</div>{selected !== null && <p className={'question-feedback ' + (correct ? 'correct' : '')} role="status"><strong>{correct ? 'Да, именно так. ' : 'Посмотрим внимательнее. '}</strong>{question.explanation}</p>}</fieldset>;
}
function TestResults({ tests, result, onRun, canRun }: { tests: TestCase[]; result: RunResult | null; onRun: () => void; canRun: boolean }) {
  const checked = result?.operation === 'check';
  return <div className="test-results">{!checked && <p className="console-muted">Проверим поведение на {tests.length} разных входах. Каждая проверка запускает программу заново.</p>}{tests.map((test, index) => { const outcome = checked ? result.testResults.find(row => row.id === test.id) : undefined; return <details key={test.id} className={'test-result ' + (outcome ? outcome.passed ? 'passed' : 'failed' : 'pending')} open={outcome ? !outcome.passed : false}><summary><span className="test-indicator">{outcome ? outcome.passed ? '✓' : '!' : index + 1}</span><span>{test.label}</span><b>{outcome ? outcome.passed ? 'Пройден' : 'Проверим' : 'Ожидает'}</b></summary>{outcome?.diagnostics.map((diagnostic, i) => <div className="test-diagnostic" key={i}><p>{diagnostic.message}</p>{diagnostic.expected !== undefined && <dl><dt>Ожидается</dt><dd><code>{JSON.stringify(diagnostic.expected)}</code></dd></dl>}{diagnostic.actual !== undefined && <dl><dt>Получилось</dt><dd><code>{JSON.stringify(diagnostic.actual)}</code></dd></dl>}</div>)}{!outcome && <p>Вход: <code>{JSON.stringify(test.probe.kind === 'call' ? test.probe.args : test.fixtures.globals || test.fixtures.stdin || {})}</code></p>}</details>; })}{!checked && <Button variant="secondary" disabled={!canRun} onClick={onRun}><Icon name="test" size={18} />Запустить все проверки</Button>}</div>;
}
function TraceView({ result, cursor, onChange }: { result: RunResult | null; cursor: number; onChange: (value: number) => void }) {
  const trace = result?.trace || []; const current = trace[cursor];
  if (!current) return <div className="trace-empty"><Icon name="bug" size={30} /><p>После запуска здесь появятся строки программы и реальные значения переменных перед их выполнением.</p></div>;
  return <div className="trace-view"><div className="trace-navigation"><button className="icon-button" aria-label="Предыдущий шаг" disabled={cursor === 0} onClick={() => onChange(cursor - 1)}><Arrow direction="left" /></button><label><span>Шаг {cursor + 1} из {trace.length} · строка <b>{current.line}</b></span><input type="range" min="0" max={trace.length - 1} value={cursor} onChange={event => onChange(Number(event.target.value))} aria-label="Шаг исполнения Python" /></label><button className="icon-button" aria-label="Следующий шаг" disabled={cursor >= trace.length - 1} onClick={() => onChange(cursor + 1)}><Arrow /></button></div><p className="console-muted">Состояние перед выполнением выделенной строки.</p><div className="variables-table"><table><thead><tr><th>Переменная</th><th>Значение</th></tr></thead><tbody>{Object.entries(current.locals).map(([name, value]) => <tr key={name}><td><code>{name}</code></td><td><code>{JSON.stringify(value)}</code></td></tr>)}{!Object.keys(current.locals).length && <tr><td colSpan={2}>Переменные пока не созданы.</td></tr>}</tbody></table></div>{result?.truncated.trace && <p className="console-warning">Показана ограниченная часть длинной трассы.</p>}</div>;
}
function ErrorHelp({ type, category }: { type: string; category: string }) {
  const help = type === 'IndentationError' || type === 'TabError' ? 'Проверь отступы: строки внутри for, if и def начинаются с четырёх пробелов.'
    : type === 'NameError' ? 'Python не нашёл это имя. Сравни написание и убедись, что значение создано до использования.'
      : type === 'TypeError' ? 'Операция получила неподходящий тип или число аргументов. Посмотри на входные данные и вызов функции.'
        : type === 'SyntaxError' ? 'Проверь двоеточие, скобки и кавычки рядом с отмеченной строкой.'
          : type === 'IndexError' ? 'Индекс вышел за границу списка. Нумерация начинается с нуля; пустой список требует отдельного внимания.'
            : category.includes('boundary') || type.includes('Boundary') ? 'Робот дошёл до границы. Проверь, нет ли лишней команды или повторения.'
              : type === 'FileNotFoundError' ? 'Сравни имя в open(...) с файлом в разделе «Файлы проекта».'
                : 'Начни с отмеченной строки. Сравни то, что ожидалось, с настоящими значениями на вкладке «По шагам».';
  return <p className="error-help">{help}</p>;
}
function playSuccessTone() {
  try { const context = new AudioContext(); const gain = context.createGain(); gain.connect(context.destination); gain.gain.setValueAtTime(0.055, context.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.55); const oscillator = context.createOscillator(); oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(523.25, context.currentTime); oscillator.frequency.setValueAtTime(783.99, context.currentTime + 0.18); oscillator.connect(gain); oscillator.start(); oscillator.stop(context.currentTime + 0.55); oscillator.onended = () => { void context.close(); }; } catch { /* Sound is optional and never part of grading. */ }
}
