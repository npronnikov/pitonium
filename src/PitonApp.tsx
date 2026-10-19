'use client';

import { Component, useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { AuthState, LearningMode, Profile, ProgressSummary, WorldProgress } from '../packages/contracts';
import { AppContext } from './context';
import { api, post, profileQuery, setCsrfToken } from './lib/api';
import { emptyProgress, modeLabels } from './lib/utils';
import { Header } from './components/Header';
import { Button, Icon, Link } from './components/ui';
import { JourneyPage, WorldPage } from './screens/Journey';
import { TheoryPage, PracticePage, MissionsPage } from './screens/Browse';
import { OnboardingPage } from './screens/Onboarding';
import { AuthPage, ProfilePage } from './screens/Account';
import { LessonPage } from './screens/Lesson';
import { ProgressPage } from './screens/Progress';
import { ProjectsPage } from './screens/Projects';
import { TutorPage } from './screens/Tutor';

const initialAuth: AuthState = { user: null, profiles: [], activeProfileId: null, csrfToken: null, authMode: 'local' };
class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <main className="fatal-error"><img src="/assets/tutor/pix-bot-error.webp" width="140" height="140" alt="" /><h1>Кажется, мы сбились с тропы</h1><p>Сохранённый прогресс остаётся в профиле. Обнови страницу, чтобы вернуться.</p><button className="button button-primary" onClick={() => window.location.reload()}>Вернуться в ПИТОН</button></main> : this.props.children; }
}
export default function PitonApp({ initialPath = '/' }: { initialPath?: string }) { return <AppErrorBoundary><Application initialPath={initialPath} /></AppErrorBoundary>; }
function Application({ initialPath }: { initialPath: string }) {
  const [path, setPath] = useState(initialPath); const [auth, setAuth] = useState<AuthState>(initialAuth); const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressSummary>(emptyProgress); const [worldStates, setWorldStates] = useState<WorldProgress[]>([]); const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; kind: 'success' | 'error' } | null>(null); const [onboardingNext, setOnboardingNext] = useState('/lesson/u1-l1');
  const activeRef = useRef<string | null>(null); const authRef = useRef<AuthState>(initialAuth); const requestGeneration = useRef(0);
  const profile = auth.profiles.find(p => p.id === activeProfileId) || null;
  const notify = useCallback((message: string, kind: 'success' | 'error' = 'success') => setToast({ message, kind }), []);
  const navigate = useCallback((next: string) => { if (!next.startsWith('/')) return; window.history.pushState({}, '', next); setPath(next); window.scrollTo({ top: 0, behavior: 'instant' }); setTimeout(() => document.querySelector<HTMLElement>('main h1')?.focus({ preventScroll: true }), 80); }, []);
  const loadProgress = useCallback(async (id: string | null) => {
    const generation = ++requestGeneration.current;
    if (!id) { setProgress(emptyProgress); setWorldStates([]); return; }
    const [nextProgress, nextWorlds] = await Promise.all([api<ProgressSummary>('/progress' + profileQuery(id)), api<{ worlds: WorldProgress[] }>('/worlds' + profileQuery(id))]);
    if (generation === requestGeneration.current && activeRef.current === id) { setProgress(nextProgress); setWorldStates(nextWorlds.worlds); }
  }, []);
  const refreshProgress = useCallback(async () => { await loadProgress(activeRef.current); }, [loadProgress]);
  const refresh = useCallback(async () => {
    const state = await api<AuthState>('/auth/me'); setCsrfToken(state.csrfToken); authRef.current = state; setAuth(state);
    let remembered: string | null = null; try { remembered = localStorage.getItem('piton.active-profile'); } catch { /* preferences work without storage */ }
    const id = state.profiles.some(p => p.id === remembered) ? remembered : state.activeProfileId || state.profiles[0]?.id || null;
    activeRef.current = id; setActiveProfileId(id); await loadProgress(id);
  }, [loadProgress]);
  useEffect(() => {
    setPath(window.location.pathname + window.location.search);
    const pop = () => setPath(window.location.pathname + window.location.search); window.addEventListener('popstate', pop);
    void refresh().catch(() => notify('Не удалось связаться с сервером. Можно изучить карту и попробовать подключиться снова.', 'error')).finally(() => setLoading(false));
    return () => window.removeEventListener('popstate', pop);
  }, [refresh, notify]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), 6500); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    document.documentElement.dataset.motion = profile?.accessibility.reducedMotion || media.matches ? 'reduced' : 'full';
    document.documentElement.dataset.contrast = profile?.accessibility.highContrast ? 'high' : 'normal';
    document.documentElement.style.setProperty('--font-scale', String(profile?.accessibility.fontScale || 1));
  }, [profile?.accessibility]);
  const selectProfile = useCallback((id: string) => {
    activeRef.current = id; setActiveProfileId(id); setProgress(emptyProgress); setWorldStates([]);
    try { localStorage.setItem('piton.active-profile', id); } catch { /* server session remains authoritative */ }
    if (authRef.current.profiles.some(p => p.id === id)) void post<AuthState>('/profiles/' + id + '/activate', {}).then(state => { authRef.current = state; setAuth(state); setCsrfToken(state.csrfToken); return loadProgress(id); }).catch(error => notify((error as Error).message, 'error'));
  }, [loadProgress, notify]);
  const updateProfile = useCallback(async (patch: Partial<Profile>) => {
    const id = activeRef.current; if (!id) throw new Error('Сначала выбери профиль.');
    const next = await post<Profile>('/profiles/' + id, patch, 'PATCH');
    const state = { ...authRef.current, profiles: authRef.current.profiles.map(p => p.id === id ? next : p) }; authRef.current = state; setAuth(state); return next;
  }, []);
  const setMode = useCallback(async (mode: LearningMode) => { try { await updateProfile({ mode }); notify('Режим «' + modeLabels[mode] + '». Твой прогресс сохранён.'); } catch (error) { notify((error as Error).message, 'error'); } }, [updateProfile, notify]);
  function beginJourney(next = '/lesson/u1-l1') { if (next === '/auth') { navigate('/auth'); return; } setOnboardingNext(next); navigate('/onboarding'); }
  const pathname = path.split('?')[0].replace(/\/$/, '') || '/'; const segments = pathname.split('/').filter(Boolean);
  let content: ReactNode;
  if (pathname === '/' || pathname === '/map') content = <JourneyPage />;
  else if (segments[0] === 'world') content = <WorldPage slug={segments[1] || ''} />;
  else if (pathname === '/theory') content = <TheoryPage />;
  else if (pathname === '/practice') content = <PracticePage />;
  else if (pathname === '/missions') content = <MissionsPage />;
  else if (pathname === '/onboarding') content = <OnboardingPage key={profile?.id || 'new'} />;
  else if (pathname === '/auth') content = <AuthPage />;
  else if (pathname === '/profile') content = <ProfilePage />;
  else if (pathname === '/progress') content = <ProgressPage key={profile?.id || 'guest'} />;
  else if (pathname === '/projects') content = <ProjectsPage key={profile?.id || 'guest'} />;
  else if (pathname === '/tutor') content = <TutorPage key={(profile?.id || 'guest') + ':' + (profile?.mode || 'child')} />;
  else if (['lesson', 'play', 'mission', 'builder', 'workbench'].includes(segments[0])) content = <LessonPage key={pathname + ':' + (profile?.id || 'guest')} lessonId={segments[0] === 'mission' ? undefined : segments[0] === 'builder' || segments[0] === 'workbench' ? 'u5-l2' : segments[1]} missionId={segments[0] === 'mission' ? segments[1] : undefined} projectId={segments[0] === 'builder' || segments[0] === 'workbench' ? segments[1] : undefined} />;
  else content = <main id="main-content" className="page-container empty-state"><h1>Такой тропы пока нет</h1><Link className="button button-primary" href="/map">Вернуться на карту</Link></main>;
  return <AppContext.Provider value={{ path, navigate, auth, profile, progress, worldStates, loading, refresh, refreshProgress, selectProfile, updateProfile, setMode, notify, beginJourney, onboardingNext }}><a className="skip-link" href="#main-content">Перейти к содержимому</a><Header />{content}<footer className="site-footer"><span><Icon name="accessibility" size={16} />Учись в своём темпе · Создавай с Python</span><span>ПИТОН · интерактивная образовательная платформа <b>V5</b></span></footer>{toast && <div className={'toast ' + toast.kind} role={toast.kind === 'error' ? 'alert' : 'status'}><span>{toast.kind === 'success' ? '✓' : '!'}</span><p>{toast.message}</p><button aria-label="Закрыть уведомление" onClick={() => setToast(null)}>×</button></div>}</AppContext.Provider>;
}
