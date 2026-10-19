import { createContext, useContext } from 'react';
import type { AuthState, LearningMode, Profile, ProgressSummary, WorldProgress } from '../packages/contracts';

export interface AppContextValue {
  path: string; navigate: (path: string) => void;
  auth: AuthState; profile: Profile | null; progress: ProgressSummary; worldStates: WorldProgress[];
  loading: boolean; refresh: () => Promise<void>; refreshProgress: () => Promise<void>;
  selectProfile: (id: string) => void; updateProfile: (patch: Partial<Profile>) => Promise<Profile>;
  setMode: (mode: LearningMode) => Promise<void>; notify: (message: string, kind?: 'success' | 'error') => void;
  beginJourney: (next?: string) => void; onboardingNext: string;
}
export const AppContext = createContext<AppContextValue | null>(null);
export function useApp() { const context = useContext(AppContext); if (!context) throw new Error('App context is required'); return context; }
