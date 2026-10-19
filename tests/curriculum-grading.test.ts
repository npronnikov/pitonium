import assert from 'node:assert/strict';
import test from 'node:test';
import type { LearningMode } from '../packages/contracts';
import { getLesson } from '../packages/curriculum';
import { createNodePythonRunner } from '../packages/runtime/node';

async function checkWrongSolution(mode: LearningMode, code: string, suffixes: string[]) {
  const core = getLesson('u5-l2')!;
  const variant = core.variants[mode];
  const tests = suffixes.map(suffix => {
    const check = variant.tests.find(item => item.id.endsWith(`:${suffix}`));
    assert.ok(check, `Published case ${mode}/${suffix} is missing.`);
    return check;
  });
  const runner = createNodePythonRunner();
  try {
    return await runner.run({
      protocolVersion: '1', runId: `published-contract-${mode}-${suffixes.join('-')}`,
      context: { profileId: 'curriculum-audit', lessonId: core.id, variantId: variant.id, draftVersion: 1, testsVersion: core.assessmentVersion },
      operation: 'check', code, preview: variant.preview, tests,
    });
  } finally { runner.dispose(); }
}

test('published child checks reject a constant five but accept its one matching input', { timeout: 60000 }, async () => {
  const result = await checkWrongSolution('child', 'for step in range(5):\n    game.move(1)', ['steps-0', 'steps-1', 'steps-5']);
  assert.deepEqual(result.testResults.map(check => check.passed), [false, false, true]);
});

test('published child check rejects the sixth step after five valid events', { timeout: 60000 }, async () => {
  const result = await checkWrongSolution('child', 'for step in range(steps + 1):\n    game.move(1)', ['steps-5']);
  assert.equal(result.events.filter(event => event.type === 'actor.move').length, 5);
  assert.equal(result.status, 'error');
  assert.equal(result.testResults[0].passed, false);
  assert.ok(result.testResults[0].diagnostics.some(diagnostic => diagnostic.category === 'blocked'));
});

test('published teen check catches correct enemy count at incorrect coordinates', { timeout: 60000 }, async () => {
  const result = await checkWrongSolution('teen', 'def spawn_wave(n):\n    for i in range(n):\n        game.spawn("slime", x=80, y=160)\n    return n', ['wave-5']);
  assert.equal(result.status, 'ok');
  assert.equal(result.events.length, 5);
  assert.equal(result.testResults[0].passed, false);
});

test('published adult check catches a refund counted with the wrong sign', { timeout: 60000 }, async () => {
  const code = 'def build_report(items):\n    total = sum(abs(item["amount"]) for item in items)\n    return {"total": total, "count": len(items), "rows": items}';
  const result = await checkWrongSolution('adult', code, ['refunds']);
  assert.equal(result.status, 'ok');
  assert.equal(result.testResults[0].passed, false);
});
