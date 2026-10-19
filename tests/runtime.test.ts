import assert from 'node:assert/strict';
import test from 'node:test';
import { createNodePythonRunner } from '../packages/runtime/node';
import type { ExecutionCase, PythonRunner, RunRequest, RunResult, TestCase } from '../packages/runtime/contracts';

const context = { profileId: 'runtime-profile', lessonId: 'u5-l2', variantId: 'child', draftVersion: 1, testsVersion: 'v1' };
let sequence = 0;
const script: ExecutionCase = { fixtures: {}, probe: { kind: 'script' } };
function request(code: string, preview = script, tests: TestCase[] = []): RunRequest {
  return { protocolVersion: '1', runId: 'runtime-' + ++sequence, context, operation: tests.length ? 'check' : 'preview', code, preview, tests };
}
function childCase(steps: number): ExecutionCase {
  return { fixtures: { globals: { steps }, scene: { kind: 'robot', width: steps + 1, goal: { x: steps, y: 0 } } }, probe: { kind: 'script' } };
}
function childTests(): TestCase[] {
  return [0, 1, 5].map(steps => ({ ...childCase(steps), id: 'steps-' + steps, label: steps + ' шагов', assertions: [
    { kind: 'statusEquals', expected: 'ok' }, { kind: 'eventCountEquals', type: 'actor.move', expected: steps },
    { kind: 'robotPositionEquals', expected: { x: steps, y: 0 } },
  ] }));
}
async function run(input: RunRequest): Promise<RunResult> {
  const runner = createNodePythonRunner();
  try { return await runner.run(input); } finally { runner.dispose(); }
}
function passed(result: RunResult, count: number): void {
  assert.equal(result.status, 'ok', JSON.stringify(result.error));
  assert.equal(result.testResults.length, count);
  assert.ok(result.testResults.every(test => test.passed && test.status === 'ok'), JSON.stringify(result.testResults));
}

test('true Python for loop uses steps=0/1/5, emits sequential actions and line trace', async () => {
  const result = await run(request('for robot_step in range(steps):\n    game.move(1)\nprint("готово")', childCase(5), childTests()));
  passed(result, 3);
  assert.equal(result.stdout, 'готово\n');
  assert.equal(result.events.length, 5);
  assert.deepEqual(result.events.map(event => event.index), [1, 2, 3, 4, 5]);
  assert.ok(result.trace.some(frame => frame.line === 2 && frame.locals.robot_step === 4));
});

test('a different valid algorithm and variable name pass behavioral checks', async () => {
  const result = await run(request('remaining_distance = steps\nwhile remaining_distance > 0:\n    move()\n    remaining_distance -= 1', childCase(5), childTests()));
  passed(result, 3);
});

test('hardcoded five steps fails the zero and one input probes', async () => {
  const result = await run(request('for ignored in range(5):\n    game.move()', childCase(5), childTests()));
  assert.equal(result.status, 'error');
  assert.deepEqual(result.testResults.map(test => test.passed), [false, false, true]);
  assert.equal(result.events.length, 5, 'the preview alone looks correct; probes must still fail');
});

test('a sixth child step fails even after five valid move events', async () => {
  const result = await run(request('for step in range(steps + 1):\n    game.move()', childCase(5), childTests().slice(2)));
  assert.equal(result.status, 'error');
  assert.equal(result.error?.type, 'GameBlocked');
  assert.equal(result.events.length, 5);
  assert.equal(result.testResults[0].passed, false);
  assert.ok(result.testResults[0].diagnostics.some(item => item.category === 'blocked'));
});

test('teen spawn_wave(n) supports keyword coordinates and zero/one/five enemies', async () => {
  const caseFor = (n: number): ExecutionCase => ({
    fixtures: { scene: { kind: 'arena', width: 1000, height: 600, allowedEnemies: ['slime'] } },
    probe: { kind: 'call', functionName: 'spawn_wave', args: [n] },
  });
  const checks: TestCase[] = [0, 1, 5].map(n => ({ ...caseFor(n), id: 'wave-' + n, label: 'Волна ' + n, assertions: [
    { kind: 'statusEquals', expected: 'ok' }, { kind: 'eventCountEquals', type: 'enemy.spawn', expected: n },
  ] }));
  const result = await run(request("def spawn_wave(n):\n    for enemy_number in range(n):\n        game.spawn('slime', x=80 + enemy_number * 80, y=160)", caseFor(5), checks));
  passed(result, 3);
  assert.deepEqual(result.events.map(event => event.payload), [80, 160, 240, 320, 400].map(x => ({ kind: 'slime', x, y: 160 })));
});

test('adult build_report returns actual totals, count and rows for empty/normal/refund inputs', async () => {
  const datasets = [[], [{ name: 'Книга', amount: 120 }, { name: 'Курс', amount: 80 }], [{ name: 'Возврат', amount: -30 }, { name: 'Заказ', amount: 0 }]];
  const caseFor = (items: typeof datasets[number]): ExecutionCase => ({ fixtures: {}, probe: { kind: 'call', functionName: 'build_report', args: [items] } });
  const checks: TestCase[] = datasets.map((items, index) => ({ ...caseFor(items), id: 'report-' + index, label: 'Набор ' + index, assertions: [
    { kind: 'statusEquals', expected: 'ok' }, { kind: 'returnEquals', expected: { total: items.reduce((sum, item) => sum + item.amount, 0), count: items.length, rows: items } },
  ] }));
  const result = await run(request("def build_report(items):\n    copied_rows = [dict(record) for record in items]\n    return {'rows': copied_rows, 'count': len(copied_rows), 'total': sum(record['amount'] for record in copied_rows)}", caseFor(datasets[1]), checks));
  passed(result, 3);
  assert.deepEqual(result.returnValue, { rows: datasets[1], count: 2, total: 200 });
});

test('successful execution is separate from passing a value assertion', async () => {
  const execution: ExecutionCase = { fixtures: {}, probe: { kind: 'call', functionName: 'answer', args: [] } };
  const result = await run(request('def answer():\n    return 41', execution, [{ ...execution, id: 'answer', label: 'Ответ', assertions: [{ kind: 'returnEquals', expected: 42 }] }]));
  assert.equal(result.status, 'ok');
  assert.equal(result.testResults[0].status, 'ok');
  assert.equal(result.testResults[0].passed, false);
  assert.equal(result.testResults[0].diagnostics[0].actual, 41);
});

test('input fixtures and actual UTF-8 files work, and the next case has clean state', async () => {
  const execution: ExecutionCase = {
    fixtures: { stdin: ['Мария'], files: [{ path: 'shopping.txt', content: ' хлеб\n\nчай \n', encoding: 'utf8' }] },
    probe: { kind: 'call', functionName: 'shopping_list', args: ['shopping.txt'] },
  };
  const code = "person = input('Имя: ')\ndef shopping_list(path):\n    with open(path, encoding='utf8') as source:\n        rows = [line.strip() for line in source if line.strip()]\n    with open('result.txt', 'w', encoding='utf8') as out:\n        out.write(person + ': ' + ', '.join(rows))\n    return rows";
  const result = await run(request(code, execution, [{ ...execution, id: 'file', label: 'Файлы', assertions: [
    { kind: 'returnEquals', expected: ['хлеб', 'чай'] }, { kind: 'fileEquals', path: 'result.txt', expected: 'Мария: хлеб, чай' },
  ] }]));
  passed(result, 1);
  assert.equal(result.stdout, 'Имя: ');
  const file = result.dataFiles.find(file => file.path === 'result.txt')!;
  assert.equal(file.bytes, Buffer.byteLength(file.content));
  const clean = await run(request("import os\nprint(os.path.exists('result.txt'))\nprint('person' in globals())"));
  assert.equal(clean.stdout, 'False\nFalse\n');
});

test('syntax and runtime errors have Python types and the actual student line', async () => {
  const syntax = await run(request('for step in range(3)\n    move()'));
  assert.equal(syntax.error?.type, 'SyntaxError');
  assert.equal(syntax.error?.line, 1);
  const unknownName = await run(request('total = 3\nprint(not_defined)'));
  assert.equal(unknownName.status, 'error');
  assert.equal(unknownName.error?.type, 'NameError');
  assert.equal(unknownName.error?.line, 2);
});

test('cancel, hard timeout with tracing disabled, then a fresh successful run', async () => {
  const runner: PythonRunner = createNodePythonRunner();
  try {
    const endless = request('import sys\nsys.settrace(None)\nwhile True:\n    pass');
    const cancelled = await runner.run(endless, progress => { if (progress.phase === 'executing') runner.cancel(); });
    assert.equal(cancelled.status, 'cancelled');
    assert.equal(cancelled.testResults.length, 0);
    const timedOut = await runner.run({ ...endless, runId: 'timeout', limits: { executionMs: 80 } });
    assert.equal(timedOut.status, 'timeout');
    assert.equal(timedOut.error?.category, 'timeout');
    const next = await runner.run(request('print(6 * 7)'));
    assert.equal(next.status, 'ok');
    assert.equal(next.stdout, '42\n');
  } finally { runner.dispose(); }
});

test('profile changes reject a result that finished under a stale context', async () => {
  let profileId = context.profileId;
  const runner = createNodePythonRunner({ isContextCurrent: runContext => runContext.profileId === profileId });
  try {
    const result = await runner.run(request('print("finished")'), progress => { if (progress.phase === 'executing') profileId = 'different-profile'; });
    assert.equal(result.status, 'cancelled');
    assert.equal(result.error?.category, 'stale-context');
  } finally { runner.dispose(); }
});

test('a newer run cancels the preceding worker without contaminating its output', async () => {
  const runner = createNodePythonRunner();
  try {
    let ready!: () => void;
    const executing = new Promise<void>(resolve => { ready = resolve; });
    const firstPromise = runner.run(request('while True:\n    pass'), progress => { if (progress.phase === 'executing') ready(); });
    await executing;
    const secondPromise = runner.run(request('print("new run")'));
    const [first, second] = await Promise.all([firstPromise, secondPromise]);
    assert.equal(first.status, 'cancelled');
    assert.equal(second.status, 'ok');
    assert.equal(second.stdout, 'new run\n');
  } finally { runner.dispose(); }
});

test('stdout and trace are bounded, trace redacts named secrets, and HTML events fail', async () => {
  const result = await run({ ...request("api_token = 'private'\nfor number in range(12):\n    print('я' * 100)"), limits: { stdoutBytes: 128, traceSnapshots: 6 } });
  assert.equal(result.status, 'ok');
  assert.ok(Buffer.byteLength(result.stdout) <= 128);
  assert.equal(result.truncated.stdout, true);
  assert.equal(result.trace.length, 6);
  assert.equal(result.truncated.trace, true);
  assert.ok(result.trace.some(frame => frame.locals.api_token === '[скрыто]'));
  const html = await run(request('game.say("<img src=x>")'));
  assert.equal(html.status, 'error');
  assert.equal(html.events.length, 0);
});

test('the default lesson namespace exposes neither the JS bridge nor host files', async () => {
  const bridge = await run(request('import js'));
  assert.equal(bridge.error?.type, 'ImportError');
  const file = await run(request("open('/etc/passwd').read()"));
  assert.equal(file.error?.type, 'PermissionError');
});
