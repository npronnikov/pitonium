import type { AuthState, LearningMode, JsonObject } from '../contracts';
import type { SqlDatabase } from './db';

export interface TrustedUser { id: string; email: string | null; displayName?: string }
export interface PasswordHasher { hash(password: string): Promise<string>; verify(password: string, encoded: string): Promise<boolean> }
export interface TutorContext {
  mode: LearningMode; lessonTitle: string; objective: string; task: string; hintLevel: number;
  approvedHint: string; theory: { title: string; body: string }[]; learnerMessage: string;
  code?: string; error?: string;
}
export interface TutorProvider {
  reply(context: TutorContext): Promise<{ message: string; usage?: JsonObject }>;
}
export interface ApiOptions {
  db: SqlDatabase; authMode: 'local' | 'platform'; trustedUser?: TrustedUser | null;
  passwordHasher?: PasswordHasher; tutorProvider?: TutorProvider; now?: () => Date;
  allowedOrigins?: string[]; clientAddress?: string; cookieSecure?: boolean;
  sessionDays?: number; timeZone?: string; onError?: (error: unknown, requestId: string) => void;
}
export interface Actor {
  user: NonNullable<AuthState['user']>; token: string; tokenHash: string; activeProfileId: string | null;
}
export interface RequestContext {
  request: Request; options: ApiOptions; requestId: string; responseHeaders: Headers;
  actor: Actor | null; now: Date;
}
