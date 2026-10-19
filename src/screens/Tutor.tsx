import { useEffect, useRef, useState } from 'react';
import { lessons } from '../../packages/curriculum';
import type { TutorReply } from '../../packages/contracts';
import { useApp } from '../context';
import { api, post, profileQuery } from '../lib/api';
import { Arrow, Badge, Button, PageHeader } from '../components/ui';
import { TutorText } from '../components/TutorText';

export function TutorPage() {
  const { profile, beginJourney, notify } = useApp();
  const [lessonId, setLessonId] = useState('u5-l2'); const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<{ role: 'user' | 'tutor'; text: string; provider?: string }[]>([]);
  const [level, setLevel] = useState(0); const [busy, setBusy] = useState(false); const [loadingHistory, setLoadingHistory] = useState(false);
  const scope = [profile?.id || 'guest', profile?.mode || 'child', lessonId].join(':');
  const activeScope = useRef(scope); activeScope.current = scope; const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let current = true; setMessages([]); setLevel(0); setQuestion(''); setBusy(false);
    if (!profile) return;
    setLoadingHistory(true);
    void api<{ messages: TutorReply[] }>('/tutor/messages' + profileQuery(profile.id) + '&lessonId=' + lessonId + '&mode=' + profile.mode)
      .then(data => { if (current) { setMessages(data.messages.map(reply => ({ role: 'tutor', text: reply.message, provider: reply.provider }))); setLevel(Math.max(0, ...data.messages.map(reply => reply.hintLevel))); } })
      .catch(error => { if (current) notify((error as Error).message, 'error'); })
      .finally(() => { if (current) setLoadingHistory(false); });
    return () => { current = false; };
  }, [scope, notify]);
  async function ask(text: string, requestedLevel?: number) {
    if (!profile) { beginJourney('/tutor'); return; }
    if (busy || loadingHistory) return;
    const requestScope = scope; const nextLevel = requestedLevel || Math.min(level + 1, 3);
    setBusy(true); setMessages(rows => [...rows, { role: 'user', text }]); setQuestion('');
    try {
      const reply = await post<TutorReply>('/tutor/messages', { profileId: profile.id, lessonId, mode: profile.mode,
        message: text, hintLevel: nextLevel, shareCode: false, revealSolution: requestedLevel === 4 });
      if (!mounted.current || activeScope.current !== requestScope) return;
      setMessages(rows => [...rows, { role: 'tutor', text: reply.message, provider: reply.provider }]); setLevel(Math.max(level, reply.hintLevel));
    } catch (error) { if (mounted.current && activeScope.current === requestScope) notify((error as Error).message, 'error'); }
    finally { if (mounted.current && activeScope.current === requestScope) setBusy(false); }
  }
  return <main id="main-content" className="page-container"><PageHeader eyebrow="ДУМАЕМ ВМЕСТЕ" title="Рядом — Пикс-Бот" description="Сначала наблюдение, потом идея и план. Готовое решение — только если ты сам попросишь последнюю подсказку." />
    <div className="tutor-page-layout"><aside className="tutor-about panel"><img src={'/assets/tutor/pix-bot-' + (busy ? 'thinking' : 'idle') + '.webp'} alt="Пикс-Бот" width="220" height="220" /><h2>Твой спутник в Python</h2><p>Выбери урок и расскажи, что хочется понять. Код из редактора не отправляется сюда автоматически.</p><label>Обсуждаем урок<select value={lessonId} onChange={event => setLessonId(event.target.value)}>{lessons.map(lesson => <option value={lesson.id} key={lesson.id}>{lesson.title}</option>)}</select></label><div className="hint-ladder">{['Наблюдение', 'Направление', 'План решения', 'Разбор решения'].map((title, index) => <span className={index < level ? 'active' : ''} key={title}><b>{index + 1}</b>{title}</span>)}</div>{level >= 3 && <Button variant="secondary" disabled={busy || loadingHistory} onClick={() => void ask('Покажи разбор решения этого урока.', 4)}>Показать разбор решения</Button>}</aside>
      <section className="tutor-conversation panel"><div className="conversation-title"><span className="status-dot" /><strong>Есть идея — давай проверим</strong><Badge>Пикс-Бот</Badge></div><div className="messages" aria-live="polite">{loadingHistory && <p className="muted">Открываем прошлые подсказки…</p>}{!loadingHistory && !messages.length && <div className="chat-message tutor"><p>Привет! Иногда достаточно посмотреть на задачу чуть внимательнее. С какой стороны начнём?</p><div className="suggestions">{['Что здесь самое важное?', 'Как найти ошибку?', 'С чего начать решение?'].map(text => <button key={text} onClick={() => void ask(text)}>{text}</button>)}</div></div>}{messages.map((message, index) => <div key={index} className={'chat-message ' + message.role}><span>{message.role === 'tutor' ? 'Пикс-Бот' : profile?.displayName || 'Ты'}{message.provider === 'static' ? ' · подсказка курса' : message.provider === 'provider' ? ' · AI-ответ' : ''}</span><TutorText text={message.text} /></div>)}{busy && <div className="chat-message tutor">Подбираю следующую идею…</div>}</div><form className="chat-composer" onSubmit={event => { event.preventDefault(); if (question.trim()) void ask(question); }}><textarea aria-label="Вопрос наставнику" placeholder="Что хочется понять?" maxLength={1000} value={question} onChange={event => setQuestion(event.target.value)} rows={2} /><Button disabled={busy || loadingHistory || !question.trim()} type="submit" aria-label="Отправить вопрос"><Arrow /></Button></form><p className="privacy-caption">Ответы наставника сохраняются в твоём профиле. Без подключённого AI Пикс показывает авторские подсказки по выбранному уроку.</p></section>
    </div>
  </main>;
}
