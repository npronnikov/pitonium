import { z } from 'zod';
import { jsonValueSchema, type JsonObject, type JsonValue } from '../contracts/json';

export const runtimeVersion = 'pyodide-314.0.7' as const;
export const pyodideVersion = '314.0.7' as const;
export const pyodideIndexURL = `https://cdn.jsdelivr.net/pyodide/v${pyodideVersion}/full/`;

export type RunStatus = 'ok' | 'error' | 'timeout' | 'cancelled';
export type RunPhase = 'loading' | 'executing' | 'checking' | 'complete';
export interface Point { x: number; y: number }
export type SceneFixture = {
  kind: 'robot'; width: number; height?: number; start?: Point;
  direction?: 'east' | 'south' | 'west' | 'north'; goal?: Point; blocked?: Point[];
} | {
  kind: 'arena'; width: number; height: number; allowedEnemies?: string[]; maxEnemies?: number;
};
export interface DataFile { path: string; content: string; encoding: 'utf8'; bytes: number }
export interface ExecutionCase {
  fixtures: {
    globals?: JsonObject; stdin?: string[];
    files?: { path: string; content: string; encoding: 'utf8' }[];
    scene?: SceneFixture;
  };
  probe: { kind: 'script' } | { kind: 'call'; functionName: string; args: JsonValue[] };
}
export type Assertion =
  | { kind: 'statusEquals'; expected: RunStatus; errorType?: string }
  | { kind: 'returnEquals'; expected: JsonValue }
  | { kind: 'stdoutEquals'; expected: string; trim?: boolean }
  | { kind: 'eventsEqual'; expected: GameEvent[] }
  | { kind: 'eventCountEquals'; type?: GameEvent['type']; expected: number }
  | { kind: 'fileEquals'; path: string; expected: string }
  | { kind: 'robotPositionEquals'; expected: Point };
export interface TestCase extends ExecutionCase { id: string; label: string; assertions: Assertion[] }
export interface RunContext {
  profileId: string; lessonId: string; variantId: string; draftVersion: number; testsVersion: string;
}
export interface RunLimits {
  executionMs: number; initializationMs: number; stdoutBytes: number; eventCount: number;
  traceSnapshots: number; traceBytes: number; filesBytes: number;
}
export const defaultLimits: Readonly<RunLimits> = Object.freeze({
  executionMs: 3000, initializationMs: 45000, stdoutBytes: 32768,
  eventCount: 512, traceSnapshots: 200, traceBytes: 131072, filesBytes: 262144,
});
export interface RunRequest {
  protocolVersion: '1'; runId: string; context: RunContext; operation: 'preview' | 'check';
  code: string; preview: ExecutionCase; tests: TestCase[]; limits?: Partial<RunLimits>;
}
export interface RuntimeError {
  type: string; message: string; line: number | null; traceback: string; category: string;
}
export interface TraceSnapshot { line: number; locals: JsonObject; eventIndex: number }
export interface Diagnostic { category: string; message: string; expected?: JsonValue; actual?: JsonValue }
export interface TestResult {
  id: string; passed: boolean; status: RunStatus; elapsedMs: number; diagnostics: Diagnostic[];
}
export interface RunResult {
  protocolVersion: '1'; runtimeVersion: typeof runtimeVersion; runId: string; context: RunContext;
  operation: 'preview' | 'check'; status: RunStatus; phase: 'complete';
  stdout: string; stderr: string; error: RuntimeError | null;
  events: GameEvent[]; trace: TraceSnapshot[]; returnValue?: JsonValue;
  testResults: TestResult[]; dataFiles: DataFile[]; elapsedMs: number;
  truncated: { stdout: boolean; events: boolean; trace: boolean; files: boolean };
  gradingAuthority: 'browser-preview';
}
export interface RunProgress {
  runId: string; phase: RunPhase; message: string; testIndex?: number; testCount?: number;
}
export interface PythonRunner {
  run(request: RunRequest, onProgress?: (progress: RunProgress) => void): Promise<RunResult>;
  cancel(): void;
  dispose(): void;
}
export interface RunnerOptions { isContextCurrent?: (context: RunContext) => boolean }

const identifier = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/);
const eventText = z.string().max(400).refine(
  value => !/[<>]|(?:https?:|javascript:|data:)/i.test(value),
  'Игровые сообщения содержат только обычный текст без HTML и внешних URL.',
);
const eventBase = { index: z.number().int().min(1).max(4096) };
export const gameEventSchema = z.discriminatedUnion('type', [
  z.object({ ...eventBase, type: z.literal('actor.move'), actorId: identifier,
    payload: z.object({ dx: z.number().int().min(-1).max(1), dy: z.number().int().min(-1).max(1) }).strict() }).strict(),
  z.object({ ...eventBase, type: z.literal('actor.turn'), actorId: identifier,
    payload: z.object({ direction: z.enum(['east', 'south', 'west', 'north']) }).strict() }).strict(),
  z.object({ ...eventBase, type: z.literal('actor.say'), actorId: identifier,
    payload: z.object({ text: eventText }).strict() }).strict(),
  z.object({ ...eventBase, type: z.literal('item.collect'), actorId: identifier,
    payload: z.object({ itemId: identifier }).strict() }).strict(),
  z.object({ ...eventBase, type: z.literal('enemy.spawn'),
    payload: z.object({ kind: identifier, x: z.number().finite().min(0).max(4096), y: z.number().finite().min(0).max(4096) }).strict() }).strict(),
  z.object({ ...eventBase, type: z.literal('score.update'),
    payload: z.object({ value: z.number().finite().min(-1000000000).max(1000000000) }).strict() }).strict(),
  z.object({ ...eventBase, type: z.literal('gate.open'), payload: z.object({ gateId: identifier }).strict() }).strict(),
  z.object({ ...eventBase, type: z.literal('scene.complete'), payload: z.object({ success: z.boolean() }).strict() }).strict(),
]);
export type GameEvent = z.infer<typeof gameEventSchema>;
const pointSchema = z.object({ x: z.number().int().min(0).max(4096), y: z.number().int().min(0).max(4096) }).strict();
export const filePathSchema = z.string().min(1).max(120)
  .regex(/^[a-zA-Z0-9_][a-zA-Z0-9_.\/-]*$/)
  .refine(path => !path.split('/').some(part => part === '..' || part === '.' || part === ''), 'Недопустимый путь файла.');
const sceneSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('robot'), width: z.number().int().min(1).max(64),
    height: z.number().int().min(1).max(64).optional(), start: pointSchema.optional(),
    direction: z.enum(['east', 'south', 'west', 'north']).optional(), goal: pointSchema.optional(),
    blocked: z.array(pointSchema).max(4096).optional() }).strict(),
  z.object({ kind: z.literal('arena'), width: z.number().int().min(1).max(4096), height: z.number().int().min(1).max(4096),
    allowedEnemies: z.array(identifier).max(32).optional(), maxEnemies: z.number().int().min(0).max(512).optional() }).strict(),
]);
const globalsSchema = z.record(jsonValueSchema).refine(globals => Object.keys(globals).every(key =>
  /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(key) && !['game', 'move', 'say', 'spawn_enemy', 'input', 'print'].includes(key)),
  'Некорректное имя входной переменной.',
);
export const executionCaseSchema = z.object({
  fixtures: z.object({
    globals: globalsSchema.optional(), stdin: z.array(z.string().max(8192)).max(100).optional(),
    files: z.array(z.object({ path: filePathSchema, content: z.string().max(262144), encoding: z.literal('utf8') }).strict()).max(32).optional(),
    scene: sceneSchema.optional(),
  }).strict(),
  probe: z.discriminatedUnion('kind', [z.object({ kind: z.literal('script') }).strict(),
    z.object({ kind: z.literal('call'), functionName: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/), args: z.array(jsonValueSchema).max(20) }).strict()]),
}).strict();
const runStatusSchema = z.enum(['ok', 'error', 'timeout', 'cancelled']);
export const assertionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('statusEquals'), expected: runStatusSchema, errorType: z.string().max(80).optional() }).strict(),
  z.object({ kind: z.literal('returnEquals'), expected: jsonValueSchema }).strict(),
  z.object({ kind: z.literal('stdoutEquals'), expected: z.string().max(32768), trim: z.boolean().optional() }).strict(),
  z.object({ kind: z.literal('eventsEqual'), expected: z.array(gameEventSchema).max(512) }).strict(),
  z.object({ kind: z.literal('eventCountEquals'), type: z.enum(['actor.move', 'actor.turn', 'actor.say', 'item.collect', 'enemy.spawn', 'score.update', 'gate.open', 'scene.complete']).optional(), expected: z.number().int().min(0).max(512) }).strict(),
  z.object({ kind: z.literal('fileEquals'), path: filePathSchema, expected: z.string().max(262144) }).strict(),
  z.object({ kind: z.literal('robotPositionEquals'), expected: pointSchema }).strict(),
]);
export const testCaseSchema = executionCaseSchema.extend({ id: z.string().min(1).max(100), label: z.string().min(1).max(200), assertions: z.array(assertionSchema).min(1).max(20) });
export const runContextSchema = z.object({
  profileId: z.string().min(1).max(120), lessonId: z.string().min(1).max(120), variantId: z.string().min(1).max(160),
  draftVersion: z.number().int().nonnegative(), testsVersion: z.string().min(1).max(80),
}).strict();
export const runRequestSchema = z.object({
  protocolVersion: z.literal('1'), runId: z.string().min(1).max(120), context: runContextSchema,
  operation: z.enum(['preview', 'check']), code: z.string().max(65536),
  preview: executionCaseSchema, tests: z.array(testCaseSchema).max(20),
  limits: z.object({
    executionMs: z.number().int().min(20).max(10000).optional(), initializationMs: z.number().int().min(1000).max(90000).optional(),
    stdoutBytes: z.number().int().min(128).max(65536).optional(), eventCount: z.number().int().min(1).max(512).optional(),
    traceSnapshots: z.number().int().min(0).max(300).optional(), traceBytes: z.number().int().min(0).max(262144).optional(),
    filesBytes: z.number().int().min(0).max(524288).optional(),
  }).strict().optional(),
}).strict().superRefine((request, ctx) => {
  if (new Set(request.tests.map(test => test.id)).size !== request.tests.length)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Идентификаторы тестов должны быть уникальны.', path: ['tests'] });
  if (request.operation === 'check' && request.tests.length === 0)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Проверка требует хотя бы один тест.', path: ['tests'] });
  if (JSON.stringify(request).length > 1024 * 1024)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Слишком большой запрос.' });
});

export function resolveLimits(input?: Partial<RunLimits>): RunLimits { return { ...defaultLimits, ...input }; }

export interface CaseResult {
  status: RunStatus; stdout: string; stderr: string; error: RuntimeError | null;
  events: GameEvent[]; trace: TraceSnapshot[]; returnValue?: JsonValue; dataFiles: DataFile[];
  robotPosition?: Point; elapsedMs: number; truncated: RunResult['truncated'];
}
