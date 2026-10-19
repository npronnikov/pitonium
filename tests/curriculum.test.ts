import assert from 'node:assert/strict';
import test from 'node:test';
import { catalog, getLesson, getWorld, lessons, missions, skills, worlds } from '../packages/curriculum';
import { missionSourceRefs } from '../packages/curriculum/missions';
import { curriculumData, validateCurriculum } from '../packages/curriculum/validate';
import { createNodePythonRunner } from '../packages/runtime/node';

test('catalog preserves 80 lessons, 30 missions and the approved six-world distribution', () => {
  assert.equal(catalog.length, 80);
  assert.equal(missions.length, 30);
  assert.deepEqual(worlds.map(world => world.lessonIds.length), [4, 8, 4, 12, 28, 24]);
  assert.equal(lessons.length, 10);
  assert.equal(lessons.flatMap(core => Object.values(core.variants)).length, 30);
  assert.equal(missions.filter(mission => mission.available).length, 6);
  assert.deepEqual(validateCurriculum(), []);
});

test('stable pilot identifiers normalize padding without making unavailable content playable', () => {
  assert.equal(getLesson(' u01-l01 ')?.id, 'u1-l1');
  assert.equal(getLesson('U05-L02')?.id, 'u5-l2');
  assert.equal(getLesson('u5-l1'), undefined);
  assert.equal(getLesson('u99-l99'), undefined);
  assert.equal(getWorld('w4')?.id, 'forest-loops');
  assert.equal(catalog.filter(row => row.available).length, lessons.length);
  for (const core of lessons) for (const prerequisite of core.prerequisites) assert.ok(getLesson(prerequisite), `${core.id}: locked behind unpublished ${prerequisite}`);
});

test('book references remain explicitly inherited and unverified while original prose is usable', () => {
  const references = [...lessons.flatMap(core => core.sources), ...skills.flatMap(skill => skill.sources), ...Object.values(missionSourceRefs).flat()];
  assert.ok(references.length > 80);
  assert.ok(references.every(reference => reference.status === 'inherited-unverified'));
  assert.ok(references.every(reference => reference.edition.length > 0 && reference.book.length > 0 && reference.topic.length > 0));
  for (const core of lessons) {
    assert.deepEqual(Object.keys(core.variants).sort(), ['adult', 'child', 'teen']);
    assert.equal(new Set(Object.values(core.variants).map(variant => variant.scene)).size, 3);
  }
});

test('authoring validator rejects missing variants, dangling skills and prerequisite cycles', () => {
  const missing = structuredClone(curriculumData);
  delete (missing.lessons[0].variants as Partial<typeof missing.lessons[0]['variants']>).teen;
  assert.ok(validateCurriculum(missing).some(issue => issue.message.includes('variant is missing')));
  const dangling = structuredClone(curriculumData);
  dangling.catalog[0].skillIds.push('py.missing.skill');
  assert.ok(validateCurriculum(dangling).some(issue => issue.message.includes('py.missing.skill')));
  const cycle = structuredClone(curriculumData);
  cycle.skills[0].prerequisites.push(cycle.skills[1].id);
  assert.ok(validateCurriculum(cycle).some(issue => issue.message.includes('cycle')));
  const duplicate = structuredClone(curriculumData);
  duplicate.lessons[0].variants.child.tests.push(duplicate.lessons[0].variants.child.tests[0]);
  assert.ok(validateCurriculum(duplicate).some(issue => issue.message.includes('duplicate identifier')));
});

test('all authored starter, example and solution strings compile as actual Python', { timeout: 60000 }, async () => {
  const snippets: { id: string; code: string }[] = [];
  for (const core of lessons) for (const variant of Object.values(core.variants)) {
    for (const field of ['starterCode', 'exampleCode', 'solutionCode'] as const) snippets.push({ id: `${variant.id}/${field}`, code: variant[field] });
  }
  for (const mission of missions.filter(row => row.available)) {
    snippets.push({ id: `${mission.id}/starterCode`, code: mission.starterCode! });
    snippets.push({ id: `${mission.id}/solutionCode`, code: mission.solutionCode! });
  }
  assert.equal(snippets.length, 102);
  const runner = createNodePythonRunner();
  try {
    const result = await runner.run({
      protocolVersion: '1', runId: 'curriculum-syntax-audit',
      context: { profileId: 'curriculum-audit', lessonId: 'all', variantId: 'syntax', draftVersion: 1, testsVersion: '1' },
      operation: 'preview', preview: { fixtures: { globals: { snippets } }, probe: { kind: 'script' } }, tests: [],
      limits: { traceSnapshots: 0, traceBytes: 0 },
      code: [
        'import json',
        'failures = []',
        'for item in snippets:',
        '    try: compile(item["code"], item["id"], "exec")',
        '    except SyntaxError as error: failures.append({"id": item["id"], "line": error.lineno, "message": error.msg})',
        'print(json.dumps(failures, ensure_ascii=False))',
      ].join('\n'),
    });
    assert.equal(result.status, 'ok', JSON.stringify(result.error));
    assert.deepEqual(JSON.parse(result.stdout), []);
  } finally { runner.dispose(); }
});
