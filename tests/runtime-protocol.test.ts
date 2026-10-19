import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { gameEventSchema, runRequestSchema, type TestCase } from '../packages/runtime/contracts';
import { checkAssertions, emptyCase, validateCaseResult } from '../packages/runtime/engine';
import { sandboxCsp, sandboxDocument, sandboxFlags } from '../packages/runtime/policy';

test('scene events are a strict whitelist without arbitrary DOM, URLs or extra payloads', () => {
  const valid = { index: 1, type: 'actor.say', actorId: 'robot_1', payload: { text: 'Привет!' } };
  assert.equal(gameEventSchema.safeParse(valid).success, true);
  for (const value of [
    { ...valid, type: 'dom.execute' }, { ...valid, html: '<p>bad</p>' },
    { ...valid, payload: { text: 'https://example.com' } },
    { ...valid, payload: { text: 'JAVASCRIPT:alert(1)' } },
    { ...valid, payload: { text: '<script>' } },
    { ...valid, payload: { text: 'plain', onclick: 'anything' } },
  ]) assert.equal(gameEventSchema.safeParse(value).success, false);
  assert.throws(() => validateCaseResult({ ...emptyCase(), events: [{ ...valid, index: 2 }] }), /последовательность/);
});

test('a matching event count can never hide an unexpected runtime error', () => {
  const broken = emptyCase('error', 'GameBlocked', 'blocked', 'blocked');
  const check: TestCase = { id: 'blocked', label: 'Заблокировано', fixtures: {}, probe: { kind: 'script' }, assertions: [{ kind: 'eventCountEquals', expected: 0 }] };
  assert.equal(checkAssertions(check, broken).passed, false);
  assert.equal(checkAssertions({ ...check, assertions: [{ kind: 'statusEquals', expected: 'error', errorType: 'DifferentError' }] }, broken).passed, false);
  assert.equal(checkAssertions({ ...check, assertions: [{ kind: 'statusEquals', expected: 'error', errorType: 'GameBlocked' }] }, broken).passed, true);
});

test('malformed requests reject duplicate tests and file traversal before worker creation', () => {
  const check = { id: 'one', label: 'Один', fixtures: {}, probe: { kind: 'script' }, assertions: [{ kind: 'statusEquals', expected: 'ok' }] };
  const request = { protocolVersion: '1', runId: 'one', context: { profileId: 'p', lessonId: 'l', variantId: 'v', draftVersion: 1, testsVersion: '1' }, operation: 'check', code: '', preview: { fixtures: {}, probe: { kind: 'script' } }, tests: [check] };
  assert.equal(runRequestSchema.safeParse(request).success, true);
  assert.equal(runRequestSchema.safeParse({ ...request, tests: [check, check] }).success, false);
  assert.equal(runRequestSchema.safeParse({ ...request, tests: [] }).success, false);
  assert.equal(runRequestSchema.safeParse({ ...request, preview: { ...request.preview, fixtures: { files: [{ path: '../token', content: '', encoding: 'utf8' }] } } }).success, false);
  assert.equal(runRequestSchema.safeParse({ ...request, limits: { executionMs: 1000000 } }).success, false);
});

test('generated iframe has an opaque origin and an offline blob-only CSP', async () => {
  const nonce = '0123456789abcdef0123456789abcdef';
  const csp = sandboxCsp(nonce);
  assert.equal(sandboxFlags, 'allow-scripts');
  assert.match(csp, /connect-src blob:/);
  assert.match(csp, /worker-src blob:/);
  assert.match(csp, /'wasm-unsafe-eval'/);
  assert.doesNotMatch(csp, /https?:|\*|'unsafe-eval'|'unsafe-inline'|'self'/);
  assert.throws(() => sandboxCsp('" onload="bad'));
  const source = await readFile(new URL('../packages/runtime/frame-controller.mjs', import.meta.url), 'utf8');
  const document = sandboxDocument(nonce, source);
  assert.ok(document.indexOf('Content-Security-Policy') < document.indexOf('<script'));
  assert.match(source, /event\.source !== parent/);
  assert.match(source, /event\.data\.nonce !== nonce/);
  assert.match(source, /new Worker\(url, \{ type: 'module'/);
  // These static assertions guard configuration regressions; they are not browser CSP verification.
});
