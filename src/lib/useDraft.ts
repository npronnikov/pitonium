import { useCallback, useEffect, useRef, useState } from 'react';
import type { Draft, LearningMode } from '../../packages/contracts';
import { api, post, profileQuery } from './api';

type SaveStatus = 'loading' | 'saved' | 'dirty' | 'saving' | 'error' | 'conflict' | 'manual';
interface DraftSession {
  key: string; profileId: string; lessonId: string; mode: LearningMode;
  revision: number; code: string; savedCode: string; ready: boolean; blocked: boolean;
  chain: Promise<void>; timer?: ReturnType<typeof setTimeout>;
}

/** Each namespace owns its revision and write queue, even while a mode switch is in flight. */
export function useDraft({ profileId, lessonId, mode, seed, enabled, instanceKey = '' }: {
  profileId?: string; lessonId: string; mode: LearningMode; seed: string; enabled: boolean; instanceKey?: string;
}) {
  const key = [profileId || 'guest', lessonId, mode, enabled ? 'draft' : 'project', instanceKey].join(':');
  const [code, setCode] = useState(seed); const [status, setStatus] = useState<SaveStatus>('loading');
  const [loaded, setLoaded] = useState(false); const [error, setError] = useState('');
  const [version, setVersion] = useState(0); const [reloadCount, setReloadCount] = useState(0);
  const sessionRef = useRef<DraftSession | null>(null); const mounted = useRef(true);
  const isCurrent = (session: DraftSession) => mounted.current && sessionRef.current === session;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const persist = useCallback((session: DraftSession): Promise<void> => {
    session.chain = session.chain.then(async () => {
      if (!session.ready || session.blocked || session.code === session.savedCode) return;
      const text = session.code;
      if (isCurrent(session)) setStatus('saving');
      try {
        const next = await post<Draft>('/drafts/' + encodeURIComponent(session.lessonId), {
          profileId: session.profileId, mode: session.mode, code: text, expectedRevision: session.revision,
        }, 'PUT');
        session.revision = next.revision; session.savedCode = text;
        if (isCurrent(session)) { setStatus(session.code === text ? 'saved' : 'dirty'); setError(''); }
      } catch (reason) {
        const conflict = typeof reason === 'object' && reason !== null && 'status' in reason && reason.status === 409;
        session.blocked = conflict;
        if (isCurrent(session)) { setStatus(conflict ? 'conflict' : 'error'); setError((reason as Error).message); }
      }
    });
    return session.chain;
  }, []);

  useEffect(() => {
    const session: DraftSession = { key, profileId: profileId || '', lessonId, mode, revision: 0,
      code: seed, savedCode: seed, ready: !enabled, blocked: false, chain: Promise.resolve() };
    sessionRef.current = session; setCode(seed); setVersion(v => v + 1); setError('');
    setLoaded(!enabled); setStatus(enabled ? 'loading' : 'manual');
    if (enabled && profileId) void api<Draft | null>('/drafts/' + encodeURIComponent(lessonId) + profileQuery(profileId) + '&mode=' + mode)
      .then(draft => {
        if (!isCurrent(session)) return;
        session.revision = draft?.revision || 0; session.code = draft?.code ?? seed;
        session.savedCode = session.code; session.ready = true;
        setCode(session.code); setVersion(v => v + 1); setLoaded(true); setStatus('saved');
      }).catch(reason => {
        if (!isCurrent(session)) return;
        setStatus('error'); setError('Не удалось открыть черновик. ' + (reason as Error).message);
      });
    return () => {
      if (session.timer) clearTimeout(session.timer);
      if (enabled && session.ready && session.code !== session.savedCode) void persist(session);
    };
  // The seed is stable for a namespace. Remote project revisions must not reset an edited buffer.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, reloadCount, persist]);

  const change = useCallback((value: string) => {
    const session = sessionRef.current; if (!session || !session.ready || value.length > 65536) return;
    session.code = value; setCode(value); setVersion(v => v + 1);
    if (enabled) {
      if (!session.blocked) setStatus(value === session.savedCode ? 'saved' : 'dirty');
      if (session.timer) clearTimeout(session.timer);
      session.timer = setTimeout(() => { void persist(session); }, 900);
    } else setStatus('manual');
  }, [enabled, persist]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      const session = sessionRef.current;
      if (enabled && session?.ready && session.code !== session.savedCode) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', beforeUnload); return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [enabled]);

  return { code, change, status, loaded, error, version,
    reload: () => setReloadCount(value => value + 1),
    flush: async () => { const session = sessionRef.current; if (session && enabled) await persist(session); },
  };
}
