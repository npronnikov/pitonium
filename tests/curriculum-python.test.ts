import assert from 'node:assert/strict';
import test from 'node:test';
import { lessons, missions } from '../packages/curriculum';
import { createNodePythonRunner, type RunRequest } from '../packages/runtime/node';

const requests: RunRequest[] = lessons.flatMap(core => Object.values(core.variants).map(variant => ({
  protocolVersion: '1' as const,
  runId: `corpus-${core.id}-${variant.mode}`,
  context: { profileId: 'curriculum-audit', lessonId: core.id, variantId: variant.id, draftVersion: 1, testsVersion: core.assessmentVersion },
  operation: 'check' as const,
  code: variant.solutionCode,
  preview: variant.preview,
  tests: variant.tests,
})));
for (const mission of missions.filter(row => row.available)) requests.push({
  protocolVersion: '1', runId: `corpus-${mission.id}`,
  context: { profileId: 'curriculum-audit', lessonId: mission.id, variantId: `${mission.id}:v1`, draftVersion: 1, testsVersion: '1.0.0' },
  operation: 'check', code: mission.solutionCode!, preview: mission.preview!, tests: mission.tests!,
});

test('the complete authored corpus passes actual fresh Pyodide executions', { timeout: 900000 }, async t => {
  assert.equal(requests.length, 36);
  assert.equal(requests.reduce((count, request) => count + request.tests.length, 0), 134);
  let next = 0;
  let verified = 0;
  const failures: object[] = [];
  async function consume() {
    const runner = createNodePythonRunner();
    try {
      while (next < requests.length) {
        const request = requests[next++];
        const result = await runner.run(request);
        const failedTests = result.testResults.filter(check => !check.passed || check.status !== 'ok');
        if (result.status !== 'ok' || result.testResults.length !== request.tests.length || failedTests.length) {
          failures.push({ id: request.runId, status: result.status, error: result.error, actualCount: result.testResults.length, expectedCount: request.tests.length, failedTests });
        } else verified += result.testResults.length;
        t.diagnostic(`${request.runId}: ${result.testResults.filter(check => check.passed).length}/${request.tests.length}`);
      }
    } finally { runner.dispose(); }
  }
  await Promise.all([consume(), consume()]);
  assert.deepEqual(failures, []);
  assert.equal(verified, 134);
});
