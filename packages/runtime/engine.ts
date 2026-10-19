import { z } from 'zod';
import { jsonValueSchema, type JsonValue } from '../contracts/json';
import {
  defaultLimits, filePathSchema, gameEventSchema, resolveLimits, runRequestSchema, runtimeVersion,
  type Assertion, type CaseResult, type Diagnostic, type ExecutionCase, type PythonRunner,
  type RunLimits, type RunProgress, type RunRequest, type RunResult, type RunnerOptions,
  type RunStatus, type TestCase, type TestResult,
} from './contracts';

export class RuntimeStopped extends Error {
  constructor(public readonly status: 'cancelled' | 'timeout', message: string, public readonly category = status as string) {
    super(message); this.name = status === 'timeout' ? 'TimeoutError' : 'CancelledError';
  }
}
export interface CaseExecutor {
  execute(code: string, execution: ExecutionCase, limits: RunLimits, signal: AbortSignal, ready: () => void): Promise<CaseResult>;
  dispose(): void;
}
export function emptyCase(status: RunStatus = 'ok', type?: string, message?: string, category?: string): CaseResult {
  return {
    status, stdout: '', stderr: '', error: type ? { type, message: message ?? '', line: null, traceback: '', category: category ?? 'runtime' } : null,
    events: [], trace: [], dataFiles: [], elapsedMs: 0,
    truncated: { stdout: false, events: false, trace: false, files: false },
  };
}
const statusSchema = z.enum(['ok', 'error', 'timeout', 'cancelled']);
const caseResultSchema = z.object({
  status: statusSchema, stdout: z.string().max(65536), stderr: z.string().max(65536),
  error: z.object({ type: z.string().max(100), message: z.string().max(4000), line: z.number().int().min(1).nullable(), traceback: z.string().max(16000), category: z.string().max(80) }).strict().nullable(),
  events: z.array(gameEventSchema).max(512),
  trace: z.array(z.object({ line: z.number().int().min(1), locals: z.record(jsonValueSchema), eventIndex: z.number().int().nonnegative() }).strict()).max(300),
  returnValue: jsonValueSchema.optional(),
  dataFiles: z.array(z.object({ path: filePathSchema, content: z.string().max(524288), encoding: z.literal('utf8'), bytes: z.number().int().min(0).max(524288) }).strict()).max(32),
  robotPosition: z.object({ x: z.number().int().min(0).max(4096), y: z.number().int().min(0).max(4096) }).strict().optional(),
  elapsedMs: z.number().finite().min(0).max(1000000),
  truncated: z.object({ stdout: z.boolean(), events: z.boolean(), trace: z.boolean(), files: z.boolean() }).strict(),
}).strict();

export function validateCaseResult(value: unknown, limits: RunLimits = { ...defaultLimits }): CaseResult {
  if (typeof value === 'string') {
    if (value.length > 1024 * 1024) throw new Error('Исполнитель вернул слишком большой ответ.');
    value = JSON.parse(value);
  }
  const parsed = caseResultSchema.parse(value);
  const byteLength = (text: string) => new TextEncoder().encode(text).byteLength;
  if (byteLength(parsed.stdout) > limits.stdoutBytes || byteLength(parsed.stderr) > limits.stdoutBytes)
    throw new Error('Превышен лимит вывода.');
  if (parsed.events.some((event, index) => event.index !== index + 1)) throw new Error('Нарушена последовательность игровых событий.');
  if (parsed.events.length > limits.eventCount || parsed.trace.length > limits.traceSnapshots) throw new Error('Исполнитель превысил лимит результата.');
  if (parsed.trace.reduce((sum, frame) => sum + byteLength(JSON.stringify(frame)), 0) > limits.traceBytes)
    throw new Error('Превышен лимит трассировки.');
  if (new Set(parsed.dataFiles.map(file => file.path)).size !== parsed.dataFiles.length) throw new Error('Повторяющиеся пути результата.');
  if (parsed.dataFiles.some(file => byteLength(file.content) !== file.bytes)) throw new Error('Неверный размер файла результата.');
  if (parsed.dataFiles.reduce((sum, file) => sum + file.bytes, 0) > limits.filesBytes) throw new Error('Превышен лимит файлов.');
  if ((parsed.status === 'ok') !== (parsed.error === null)) throw new Error('Статус результата не соответствует ошибке.');
  return parsed;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical((value as Record<string, unknown>)[key])).join(',') + '}';
  return JSON.stringify(value) ?? 'undefined';
}
function equal(a: unknown, b: unknown): boolean { return canonical(a) === canonical(b); }
function printable(value: unknown): JsonValue { return value === undefined ? '[значение не возвращено]' : JSON.parse(JSON.stringify(value)) as JsonValue; }
export function checkAssertions(test: TestCase, result: CaseResult): TestResult {
  const diagnostics: Diagnostic[] = [];
  for (const assertion of test.assertions) {
    const checked = checkAssertion(assertion, result);
    if (checked) diagnostics.push(checked);
  }
  // Unrequested runtime errors can never pass even when an event count matches.
  if (result.status !== 'ok' && !test.assertions.some(a => a.kind === 'statusEquals' && a.expected === result.status)) {
    diagnostics.push({ category: result.error?.category ?? result.status, message: result.error?.message ?? 'Программа не завершилась успешно.' });
  }
  return { id: test.id, passed: diagnostics.length === 0, status: result.status, elapsedMs: result.elapsedMs, diagnostics };
}
function checkAssertion(assertion: Assertion, result: CaseResult): Diagnostic | undefined {
  let actual: unknown, expected: unknown, message = '', category = 'result';
  switch (assertion.kind) {
    case 'statusEquals':
      actual = result.status; expected = assertion.expected; category = result.error?.category ?? 'status';
      if (actual === expected && (!assertion.errorType || result.error?.type === assertion.errorType)) return;
      if (actual === expected && assertion.errorType) return {
        category, message: 'Тип ошибки отличается от ожидаемого.',
        expected: assertion.errorType, actual: result.error?.type ?? null,
      };
      message = result.error?.message ?? 'Программа должна завершиться без ошибки.';
      break;
    case 'returnEquals': actual = result.returnValue; expected = assertion.expected; message = 'Возвращаемое значение отличается от ожидаемого.'; break;
    case 'stdoutEquals':
      actual = assertion.trim ? result.stdout.trim() : result.stdout; expected = assertion.trim ? assertion.expected.trim() : assertion.expected;
      message = 'Вывод отличается от ожидаемого.'; category = 'stdout'; break;
    case 'eventsEqual': actual = result.events; expected = assertion.expected; message = 'Последовательность игровых действий отличается от ожидаемой.'; category = 'events'; break;
    case 'eventCountEquals':
      actual = result.events.filter(event => !assertion.type || event.type === assertion.type).length;
      expected = assertion.expected; message = `Ожидалось ${expected}, получено ${actual}.`; category = 'event-count'; break;
    case 'fileEquals': actual = result.dataFiles.find(file => file.path === assertion.path)?.content; expected = assertion.expected;
      message = `Содержимое файла ${assertion.path} отличается от ожидаемого.`; category = 'file'; break;
    case 'robotPositionEquals': actual = result.robotPosition; expected = assertion.expected;
      message = 'Робот не достиг нужной клетки.'; category = 'position'; break;
  }
  if (equal(actual, expected)) return;
  return { category, message, expected: printable(expected), actual: printable(actual) };
}

export function createRunnerWithExecutor(factory: () => CaseExecutor, options: RunnerOptions = {}): PythonRunner {
  let active: { controller: AbortController; executor: CaseExecutor; token: number } | undefined;
  let token = 0;
  let disposed = false;
  function cancel(): void {
    if (active) { active.controller.abort(); active.executor.dispose(); active = undefined; }
  }
  async function run(input: RunRequest, onProgress?: (progress: RunProgress) => void): Promise<RunResult> {
    const request = runRequestSchema.parse(input) as RunRequest;
    cancel();
    const started = performance.now();
    const tests: TestResult[] = [];
    let preview = emptyCase();
    let operationError: CaseResult | undefined;
    const currentToken = ++token;
    const controller = new AbortController();
    const executor = factory();
    active = { controller, executor, token: currentToken };
    const limits = resolveLimits(request.limits);
    const notify = (phase: RunProgress['phase'], message: string, testIndex?: number) => {
      if (!controller.signal.aborted && currentToken === token)
        onProgress?.({ runId: request.runId, phase, message, testIndex, testCount: request.tests.length });
    };
    const assertCurrent = () => {
      if (disposed || controller.signal.aborted || currentToken !== token)
        throw new RuntimeStopped('cancelled', 'Выполнение остановлено.');
      if (options.isContextCurrent && !options.isContextCurrent(request.context))
        throw new RuntimeStopped('cancelled', 'Профиль или версия кода изменились. Запустите код ещё раз.', 'stale-context');
    };
    try {
      assertCurrent();
      notify('loading', 'Загружаем настоящий Python…');
      preview = validateCaseResult(await executor.execute(request.code, request.preview, limits, controller.signal, () => notify('executing', 'Выполняем ваш Python…')), limits);
      assertCurrent();
      if (request.operation === 'check') {
        for (let index = 0; index < request.tests.length; index++) {
          assertCurrent();
          const test = request.tests[index];
          notify('checking', `Проверка ${index + 1} из ${request.tests.length}: ${test.label}`, index);
          const result = validateCaseResult(await executor.execute(request.code, test, limits, controller.signal, () => undefined), limits);
          assertCurrent();
          tests.push(checkAssertions(test, result));
          if (result.status !== 'ok' && !operationError) operationError = result;
        }
      }
      assertCurrent();
    } catch (error) {
      if (error instanceof RuntimeStopped) operationError = emptyCase(error.status, error.name, error.message, error.category);
      else operationError = emptyCase('error', 'RuntimeUnavailable', error instanceof Error ? error.message : 'Исполнитель временно недоступен.', 'runtime-unavailable');
    } finally {
      executor.dispose();
      if (active?.token === currentToken) active = undefined;
    }
    const effective = operationError ?? preview;
    const result: RunResult = {
      protocolVersion: '1', runtimeVersion, runId: request.runId, context: request.context,
      operation: request.operation, status: effective.status, phase: 'complete',
      stdout: preview.stdout, stderr: preview.stderr, error: effective.error,
      events: preview.events, trace: preview.trace, testResults: tests, dataFiles: preview.dataFiles,
      elapsedMs: Math.round(performance.now() - started), truncated: preview.truncated,
      gradingAuthority: 'browser-preview',
    };
    if (preview.returnValue !== undefined) result.returnValue = preview.returnValue;
    notify('complete', result.status === 'cancelled' ? 'Запуск остановлен.' : 'Выполнение завершено.');
    return result;
  }
  return { run, cancel, dispose() { disposed = true; cancel(); } };
}
