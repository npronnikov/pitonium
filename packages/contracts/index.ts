import type { ExecutionCase, TestCase } from '../runtime/contracts';
import type { JsonObject } from './json';
export type { JsonValue, JsonObject } from './json';

export type LearningMode = 'child' | 'teen' | 'adult';
export type AgeBand = '7-11' | '12-17' | '18+' | 'unspecified';
export type Difficulty = 'guided' | 'independent' | 'challenge';
export type AvatarId = 'pix' | 'foxy' | 'byte' | 'luna' | 'quasi' | 'nova';
export interface Profile {
  id: string; userId: string; displayName: string; ageBand: AgeBand; mode: LearningMode;
  difficulty: Difficulty; avatar: AvatarId; interests: string[]; pace: 'calm' | 'regular' | 'intensive';
  accessibility: { reducedMotion: boolean; sound: boolean; highContrast: boolean; fontScale: number };
  onboarded: boolean; diagnosticScore: number | null; createdAt: string; updatedAt: string;
}
export interface SourceRef {
  id: string; book: string; chapter: string; topic: string; pages?: string;
  edition: string; status: 'inherited-unverified' | 'verified' | 'supplemental';
}
export interface TheoryBlock { title: string; body: string; code?: string }
export interface Question {
  id: string; prompt: string; choices: string[]; correctIndex: number; explanation: string;
}
export interface LessonVariant {
  id: string; mode: LearningMode; title: string; story: string; task: string;
  resultLabel: string; scene: 'robot' | 'arena' | 'report';
  starterCode: string; exampleCode: string; solutionCode: string;
  theory: TheoryBlock[]; questions: Question[]; reflection: Question; hints: string[];
  transfer: string; preview: ExecutionCase; tests: TestCase[];
  files?: { path: string; content: string }[];
}
export interface LessonCore {
  id: string; title: string; worldId: string; unit: number; order: number;
  objective: string; skillIds: string[]; prerequisites: string[]; minutes: number; xp: number;
  contentVersion: string; assessmentVersion: string; sources: SourceRef[];
  variants: Record<LearningMode, LessonVariant>;
}
export interface CatalogLesson {
  id: string; title: string; worldId: string; unit: number; unitTitle: string; order: number;
  available: boolean; sourceText: string; minutes: number; skillIds: string[];
}
export interface Skill {
  id: string; title: string; description: string; prerequisites: string[];
  misconceptions: string[]; masteryCriteria: string[]; lessonIds: string[]; sources: SourceRef[];
}
export interface World {
  id: string; slug: string; order: number; title: string; subtitle: string; description: string;
  lessonIds: string[]; asset: string; accent: string; prerequisiteWorldId: string | null;
}
export interface WorldProgress extends World {
  status: 'locked' | 'current' | 'available' | 'completed';
  completedCount: number; availableCount: number; totalCount: number; reason: string | null;
}
export interface SkillMastery {
  skillId: string; level: number; evidenceCount: number; lastPracticed: string | null; nextReviewAt: string | null;
}
export interface ReviewItem { skillId: string; lessonId: string; dueAt: string; level: number }
export interface ProgressSummary {
  xp: number; level: number; completedLessonIds: string[]; mastery: SkillMastery[]; reviews: ReviewItem[];
  attempts: number; storyFlags: string[]; badges: string[]; streak: number; activeDays: string[];
}
export interface Mission {
  id: string; title: string; difficulty: 'start' | 'practice' | 'challenge'; sourceText: string;
  available: boolean; lessonId?: string; description: string; skillIds: string[];
  starterCode?: string; solutionCode?: string; preview?: ExecutionCase; tests?: TestCase[];
}
export interface Project {
  id: string; profileId: string; lessonId: string; title: string; mode: LearningMode;
  code: string; files: { path: string; content: string }[]; config: JsonObject;
  revision: number; createdAt: string; updatedAt: string;
}
export interface ProjectRevision extends Project { revisionId: string }
export interface Draft {
  profileId: string; lessonId: string; mode: LearningMode; code: string; revision: number; updatedAt: string;
}
export interface AuthState {
  user: null | { id: string; email: string | null; isDemo: boolean; authMethod: 'local' | 'platform' | 'demo' };
  profiles: Profile[]; activeProfileId: string | null; csrfToken: string | null;
  authMode: 'local' | 'platform';
}
export interface TutorReply {
  id: string; message: string; hintLevel: number; provider: 'static' | 'provider'; createdAt: string;
}
