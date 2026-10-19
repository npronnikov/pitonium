import { z } from 'zod';
import { jsonValueSchema } from '../contracts/json';
import { filePathSchema, gameEventSchema, runContextSchema } from '../runtime/contracts';
import { fail } from './security';

export const idSchema = z.string().min(1).max(120).regex(/^[a-zA-Z0-9_.:-]+$/);
export const modeSchema = z.enum(['child', 'teen', 'adult']);
export const profileFields = z.object({
  displayName: z.string().trim().min(1).max(60),
  ageBand: z.enum(['7-11', '12-17', '18+', 'unspecified']),
  mode: modeSchema,
  difficulty: z.enum(['guided', 'independent', 'challenge']),
  avatar: z.enum(['pix', 'foxy', 'byte', 'luna', 'quasi', 'nova']),
  interests: z.array(z.string().trim().min(1).max(60)).max(10),
  pace: z.enum(['calm', 'regular', 'intensive']),
  accessibility: z.object({ reducedMotion: z.boolean(), sound: z.boolean(), highContrast: z.boolean(), fontScale: z.number().min(0.9).max(1.5) }).strict(),
  onboarded: z.boolean(), diagnosticScore: z.number().int().min(0).max(100).nullable(),
}).strict();
export const profilePatchSchema = profileFields.partial().refine(value => Object.keys(value).length > 0, 'Укажите хотя бы одно изменение.');
export const profileCreateSchema = profileFields.partial().required({ displayName: true, mode: true });
export const emailSchema = z.string().trim().email().max(254).transform(value => value.toLowerCase());
export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(256) }).strict();
export const registerSchema = loginSchema.extend({ password: z.string().min(10).max(256), displayName: z.string().trim().min(1).max(60).optional(), mode: modeSchema.optional() });
export const draftPutSchema = z.object({ profileId: idSchema, mode: modeSchema, code: z.string().max(65536), expectedRevision: z.number().int().nonnegative().max(2147483646) }).strict();
export const projectFileSchema = z.object({ path: filePathSchema, content: z.string().max(262144) }).strict();
const filesSchema = z.array(projectFileSchema).max(32).superRefine((files, ctx) => {
  if (new Set(files.map(file => file.path)).size !== files.length) ctx.addIssue({ code: 'custom', message: 'Пути файлов должны быть уникальны.' });
  if (new TextEncoder().encode(files.map(file => file.content).join('')).byteLength > 524288) ctx.addIssue({ code: 'custom', message: 'Файлы проекта превышают 512 КиБ.' });
});
export const projectCreateSchema = z.object({
  profileId: idSchema, lessonId: idSchema, title: z.string().trim().min(1).max(120), mode: modeSchema,
  code: z.string().max(65536), files: filesSchema.default([]), config: z.record(jsonValueSchema).default({}),
}).strict();
export const projectPatchSchema = projectCreateSchema.omit({ profileId: true }).partial().extend({ expectedRevision: z.number().int().min(1).max(2147483646) }).strict();
export const restoreSchema = z.object({ revision: z.number().int().min(1), expectedRevision: z.number().int().min(1).max(2147483646) }).strict();
const statusSchema = z.enum(['ok', 'error', 'timeout', 'cancelled']);
export const runResultSchema = z.object({
  protocolVersion: z.literal('1'), runtimeVersion: z.string().min(1).max(80), runId: idSchema,
  context: runContextSchema, operation: z.enum(['preview', 'check']), status: statusSchema, phase: z.literal('complete'),
  stdout: z.string().max(65536), stderr: z.string().max(65536),
  error: z.object({ type: z.string().max(120), message: z.string().max(8192), line: z.number().int().nonnegative().nullable(), traceback: z.string().max(32768), category: z.string().max(120) }).strict().nullable(),
  events: z.array(gameEventSchema).max(512),
  trace: z.array(z.object({ line: z.number().int().nonnegative(), locals: z.record(jsonValueSchema), eventIndex: z.number().int().nonnegative() }).strict()).max(300),
  returnValue: jsonValueSchema.optional(),
  testResults: z.array(z.object({
    id: z.string().min(1).max(100), passed: z.boolean(), status: statusSchema, elapsedMs: z.number().finite().nonnegative().max(600000),
    diagnostics: z.array(z.object({ category: z.string().max(120), message: z.string().max(8192), expected: jsonValueSchema.optional(), actual: jsonValueSchema.optional() }).strict()).max(40),
  }).strict()).max(20),
  dataFiles: z.array(z.object({ path: filePathSchema, content: z.string().max(524288), encoding: z.literal('utf8'), bytes: z.number().int().nonnegative().max(524288) }).strict()).max(32),
  elapsedMs: z.number().finite().nonnegative().max(600000),
  truncated: z.object({ stdout: z.boolean(), events: z.boolean(), trace: z.boolean(), files: z.boolean() }).strict(),
  gradingAuthority: z.literal('browser-preview'),
}).strict();
export const submissionSchema = z.object({
  profileId: idSchema, lessonId: idSchema, mode: modeSchema, variantId: z.string().min(1).max(160),
  contentVersion: z.string().min(1).max(80), assessmentVersion: z.string().min(1).max(80), runtimeVersion: z.string().min(1).max(80),
  idempotencyKey: z.string().min(8).max(120).regex(/^[a-zA-Z0-9_:-]+$/), code: z.string().max(65536).optional(), result: runResultSchema,
  hintLevel: z.number().int().min(0).max(4).optional(), reflectionCorrect: z.boolean().optional(),
}).strict();
export const tutorSchema = z.object({
  profileId: idSchema, lessonId: idSchema, mode: modeSchema, hintLevel: z.number().int().min(1).max(4),
  message: z.string().trim().max(4000).default(''), shareCode: z.boolean().default(false),
  code: z.string().max(65536).optional(), error: z.string().max(8192).optional(), revealSolution: z.boolean().default(false),
}).strict();
export const reviewSchema = z.object({ profileId: idSchema, skillId: idSchema, submissionId: idSchema }).strict();

export function parse<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) return fail(422, 'VALIDATION_ERROR', 'Проверьте поля запроса.', result.error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message })));
  return result.data;
}
