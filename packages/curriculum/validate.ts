import type { CatalogLesson, LessonCore, LearningMode, Mission, Question, Skill, World } from '../contracts';
import { executionCaseSchema, testCaseSchema } from '../runtime/contracts';
import { catalog, lessons, missions, skills, worlds } from './index';

export interface CurriculumData {
  catalog: CatalogLesson[];
  lessons: LessonCore[];
  missions: Mission[];
  skills: Skill[];
  worlds: World[];
}
export interface CurriculumIssue { path: string; message: string }
export const curriculumData: CurriculumData = { catalog, lessons, missions, skills, worlds };

/** Validate authoring invariants. Python execution is tested separately with the real runner. */
export function validateCurriculum(data: CurriculumData = curriculumData): CurriculumIssue[] {
  const issues: CurriculumIssue[] = [];
  const add = (path: string, message: string) => issues.push({ path, message });
  const unique = (ids: string[], path: string) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (!id || seen.has(id)) add(path, `Empty or duplicate identifier: ${id}`);
      seen.add(id);
    }
    return seen;
  };
  const catalogIds = unique(data.catalog.map(row => row.id), 'catalog');
  const lessonIds = unique(data.lessons.map(row => row.id), 'lessons');
  const skillIds = unique(data.skills.map(row => row.id), 'skills');
  const worldIds = unique(data.worlds.map(row => row.id), 'worlds');
  unique(data.missions.map(row => row.id), 'missions');
  unique(data.worlds.map(row => row.slug), 'worlds.slugs');
  const modes: LearningMode[] = ['child', 'teen', 'adult'];
  const sceneForMode = { child: 'robot', teen: 'arena', adult: 'report' } as const;
  const variantIds: string[] = [];
  const questionIds: string[] = [];

  function links(ids: string[], known: Set<string>, path: string) {
    for (const id of ids) if (!known.has(id)) add(path, `Unknown reference: ${id}`);
    unique(ids, path);
  }
  function acyclic(rows: { id: string; prerequisites: string[] }[], path: string) {
    const graph = new Map(rows.map(row => [row.id, row.prerequisites]));
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (id: string) => {
      if (visiting.has(id)) { add(path, `Prerequisite cycle through ${id}`); return; }
      if (visited.has(id) || !graph.has(id)) return;
      visiting.add(id);
      for (const next of graph.get(id)!) visit(next);
      visiting.delete(id);
      visited.add(id);
    };
    rows.forEach(row => visit(row.id));
  }
  function question(value: Question, path: string) {
    questionIds.push(value.id);
    if (!value.prompt.trim() || !value.explanation.trim()) add(path, 'Question and explanation are required.');
    if (value.choices.length < 2 || new Set(value.choices).size !== value.choices.length) add(path, 'At least two distinct choices are required.');
    if (!Number.isInteger(value.correctIndex) || value.correctIndex < 0 || value.correctIndex >= value.choices.length) add(path, 'Correct choice is outside the choices array.');
  }

  const worldOccurrences = new Map<string, number>();
  for (const world of data.worlds) {
    links(world.lessonIds, catalogIds, `${world.id}.lessonIds`);
    if (world.prerequisiteWorldId) links([world.prerequisiteWorldId], worldIds, `${world.id}.prerequisiteWorldId`);
    for (const id of world.lessonIds) {
      worldOccurrences.set(id, (worldOccurrences.get(id) ?? 0) + 1);
      if (data.catalog.find(row => row.id === id)?.worldId !== world.id) add(world.id, `Lesson ${id} belongs to another world.`);
    }
  }
  acyclic(data.worlds.map(world => ({ id: world.id, prerequisites: world.prerequisiteWorldId ? [world.prerequisiteWorldId] : [] })), 'worlds.prerequisites');
  for (const row of data.catalog) {
    if (!/^u[1-9]\d*-l[1-9]\d*$/.test(row.id)) add(row.id, 'Lesson identifier is not canonical.');
    if (!row.sourceText.trim()) add(row.id, 'Inherited source mapping is missing.');
    if (row.available !== lessonIds.has(row.id)) add(row.id, 'Availability must exactly match authored content.');
    if (worldOccurrences.get(row.id) !== 1) add(row.id, 'Every catalog lesson must occur in exactly one world.');
    links([row.worldId], worldIds, `${row.id}.worldId`);
    links(row.skillIds, skillIds, `${row.id}.skillIds`);
    if (!row.skillIds.length) add(row.id, 'At least one skill is required.');
  }
  for (const skill of data.skills) {
    links(skill.prerequisites, skillIds, `${skill.id}.prerequisites`);
    links(skill.lessonIds, catalogIds, `${skill.id}.lessonIds`);
    if (!skill.masteryCriteria.length || !skill.misconceptions.length || !skill.sources.length) add(skill.id, 'Skill needs mastery criteria, misconceptions and source metadata.');
    for (const id of skill.lessonIds) if (!data.catalog.find(row => row.id === id)?.skillIds.includes(skill.id)) add(skill.id, `Skill link to ${id} is not reciprocal.`);
  }
  acyclic(data.skills, 'skills.prerequisites');
  acyclic(data.lessons, 'lessons.prerequisites');
  for (const core of data.lessons) {
    links([core.id], catalogIds, `${core.id}.catalog`);
    links(core.skillIds, skillIds, `${core.id}.skillIds`);
    links(core.prerequisites, lessonIds, `${core.id}.prerequisites`);
    if (!core.contentVersion || !core.assessmentVersion || !core.sources.length) add(core.id, 'Version and source metadata are required.');
    for (const source of core.sources) if (!source.book || !source.topic || !source.edition || !source.status) add(core.id, 'Source metadata is incomplete.');
    for (const mode of modes) {
      const variant = core.variants[mode];
      const path = `${core.id}.${mode}`;
      if (!variant) { add(path, 'Required learning-mode variant is missing.'); continue; }
      variantIds.push(variant.id);
      if (variant.mode !== mode || variant.scene !== sceneForMode[mode]) add(path, 'Variant mode and scene disagree.');
      for (const field of ['title', 'story', 'task', 'starterCode', 'exampleCode', 'solutionCode', 'transfer'] as const) if (!variant[field].trim()) add(`${path}.${field}`, 'Required content is empty.');
      if (variant.theory.length < 2 || variant.theory.some(block => !block.title.trim() || !block.body.trim())) add(path, 'At least two complete theory blocks are required.');
      if (variant.questions.length !== 2) add(path, 'The guided example needs two prediction questions.');
      variant.questions.forEach((value, index) => question(value, `${path}.questions.${index}`));
      question(variant.reflection, `${path}.reflection`);
      if (variant.hints.length !== 4 || new Set(variant.hints).size !== 4 || variant.hints.some(hint => !hint.trim())) add(path, 'Four distinct progressive hints are required.');
      if (!executionCaseSchema.safeParse(variant.preview).success) add(path, 'Preview violates the runtime schema.');
      if (!variant.tests.length) add(path, 'A ready lesson needs executable checks.');
      unique(variant.tests.map(check => check.id), `${path}.tests`);
      for (const check of variant.tests) {
        if (!testCaseSchema.safeParse(check).success) add(`${path}.${check.id}`, 'Test violates the runtime schema.');
        if (!check.assertions.some(assertion => assertion.kind === 'statusEquals' && assertion.expected === 'ok')) add(`${path}.${check.id}`, 'Successful execution must be asserted.');
        if (!check.assertions.some(assertion => assertion.kind !== 'statusEquals')) add(`${path}.${check.id}`, 'A behavioral result must be asserted.');
      }
    }
    if (modes.every(mode => !!core.variants[mode]) && new Set(modes.map(mode => core.variants[mode].story)).size !== 3) add(core.id, 'The three contexts need distinct stories.');
  }
  unique(variantIds, 'variants');
  unique(questionIds, 'questions');
  for (const mission of data.missions) {
    links(mission.skillIds, skillIds, `${mission.id}.skillIds`);
    if (mission.lessonId) links([mission.lessonId], lessonIds, `${mission.id}.lessonId`);
    if (!mission.available) {
      if (mission.tests?.length || mission.solutionCode) add(mission.id, 'Unavailable mission must not pretend to contain a ready exercise.');
      continue;
    }
    if (!mission.starterCode?.trim() || !mission.solutionCode?.trim() || !mission.preview || !mission.tests?.length) { add(mission.id, 'Ready mission is missing code, preview or tests.'); continue; }
    if (!executionCaseSchema.safeParse(mission.preview).success) add(mission.id, 'Mission preview violates the runtime schema.');
    unique(mission.tests.map(check => check.id), `${mission.id}.tests`);
    for (const check of mission.tests) {
      if (!testCaseSchema.safeParse(check).success) add(mission.id, 'Mission test violates the runtime schema.');
      if (!check.assertions.some(assertion => assertion.kind !== 'statusEquals')) add(mission.id, 'Mission test needs a behavioral assertion.');
    }
  }
  return issues;
}
