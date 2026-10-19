import { useState } from 'react';
import type { AgeBand, AuthState, AvatarId, Difficulty, LearningMode, Profile } from '../../packages/contracts';
import { useApp } from '../context';
import { post, setCsrfToken } from '../lib/api';
import { avatarLabels, modeLabels } from '../lib/utils';
import { Arrow, Badge, Button, Link } from '../components/ui';

const diagnosis = [
  { question: 'Что напечатает print(2 + 3)?', choices: ['23', '5', '2 + 3'], answer: 1 },
  { question: 'Сколько чисел даёт range(3)?', choices: ['Два', 'Три', 'Четыре'], answer: 1 },
  { question: 'Как Python узнаёт, что команда находится внутри цикла?', choices: ['По отступу', 'По цвету текста', 'По имени переменной'], answer: 0 },
];
export function OnboardingPage() {
  const { auth, profile, refresh, selectProfile, navigate, onboardingNext, notify } = useApp();
  const [step, setStep] = useState(0); const [mode, setMode] = useState<LearningMode>(profile?.mode || 'child');
  const [avatar, setAvatar] = useState<AvatarId>(profile?.avatar || 'foxy'); const [name, setName] = useState(profile?.displayName || '');
  const [age, setAge] = useState<AgeBand>(profile?.ageBand || 'unspecified'); const [pace, setPace] = useState<Profile['pace']>('regular');
  const [difficulty, setDifficulty] = useState<Difficulty>('guided'); const [interest, setInterest] = useState('adventures');
  const [answers, setAnswers] = useState<(number | null)[]>([null, null, null]); const [busy, setBusy] = useState(false);
  async function finish(skip = false) {
    setBusy(true);
    try {
      let state = auth;
      if (!state.user) state = await post<AuthState>('/auth/demo', { mode });
      setCsrfToken(state.csrfToken);
      const target = profile || state.profiles.find(p => p.mode === mode) || state.profiles[0];
      if (!target) throw new Error('Не удалось создать профиль. Попробуйте ещё раз.');
      const score = skip || answers.some(a => a === null) ? null : answers.filter((a, i) => a === diagnosis[i].answer).length;
      await post<Profile>('/profiles/' + target.id, { displayName: name.trim() || ({ child: 'Аня', teen: 'Марк', adult: 'Лера' })[mode], mode, avatar, ageBand: age, pace, difficulty, interests: [interest], diagnosticScore: score, onboarded: true }, 'PATCH');
      await post<AuthState>('/profiles/' + target.id + '/activate', {});
      selectProfile(target.id); await refresh(); navigate(onboardingNext || '/lesson/u1-l1'); notify('Спутник выбран. Пора оживить первую идею!');
    } catch (error) { notify((error as Error).message, 'error'); } finally { setBusy(false); }
  }
  return <main id="main-content" className="onboarding-page"><div className="onboarding-progress" aria-label={'Шаг ' + (step + 1) + ' из 3'}>{['Твой формат', 'Твой герой', 'Твой старт'].map((title, i) => <span className={i <= step ? 'active' : ''} key={title}><b>{i < step ? '✓' : i + 1}</b>{title}</span>)}</div>
    {step === 0 && <><div className="onboarding-heading"><p className="eyebrow">ПРИВЕТ, БУДУЩИЙ АВТОР</p><h1 tabIndex={-1}>Один Python.<br /><em>Твоё приключение.</em></h1><p>Выбери, как тебе интереснее учиться. Формат можно менять — знания и достижения останутся с тобой.</p></div><div className="mode-choice-grid">{(['child', 'teen', 'adult'] as LearningMode[]).map((item, i) => <button key={item} className={'mode-choice ' + (mode === item ? 'selected' : '')} onClick={() => { setMode(item); setInterest(['adventures', 'games', 'data'][i]); }} aria-pressed={mode === item}><img src={'/assets/projects/thumb-' + item + '.webp'} width="480" height="270" alt="" /><span className="mode-choice-body"><span className="selection-check">{mode === item ? '✓' : ''}</span><small>{['ИССЛЕДУЙ', 'СОЗДАВАЙ', 'ПРИМЕНЯЙ'][i]}</small><strong>{modeLabels[item]}</strong><span>{['Пройди лесную тропу, помоги роботу и открой новые миры.', 'Построй свою игру. Герой, враги и правила — твои.', 'Решай полезные задачи: данные, файлы и автоматизация.'][i]}</span><em>{['Первое открытие за 5 минут', 'Первая механика за 8 минут', 'Первый отчёт за 10 минут'][i]}</em></span></button>)}</div><div className="onboarding-actions"><span className="muted">Возраст и сложность выбираются отдельно</span><Button onClick={() => setStep(1)}>Выбрать спутника <Arrow /></Button></div></>}
    {step === 1 && <><div className="onboarding-heading"><p className="eyebrow">ТЕБЯ ЖДЁТ ЦЕЛЫЙ МИР</p><h1 tabIndex={-1}>Кто пойдёт с тобой?</h1><p>У каждого героя свой характер. Выбирай того, с кем хочется начать.</p></div><div className="avatar-choice-grid">{(Object.keys(avatarLabels) as AvatarId[]).map(id => <button key={id} className={'avatar-choice ' + (avatar === id ? 'selected' : '')} aria-pressed={avatar === id} onClick={() => setAvatar(id)}><img src={'/assets/characters/' + id + '/front.webp'} width="160" height="160" alt="" /><strong>{avatarLabels[id]}</strong><span>{({ pix: 'Любит открытия', foxy: 'Придумывает новое', byte: 'Замечает детали', luna: 'Находит красоту', quasi: 'Не боится пробовать', nova: 'Создаёт будущее' })[id]}</span></button>)}</div><div className="onboarding-settings"><label>Как к тебе обращаться?<input maxLength={32} value={name} onChange={e => setName(e.target.value)} placeholder="Твоё имя или псевдоним" autoComplete="nickname" /></label><label>Возрастная группа<select value={age} onChange={e => setAge(e.target.value as AgeBand)}><option value="unspecified">Пока не указывать</option><option value="7-11">7–11 лет</option><option value="12-17">12–17 лет</option><option value="18+">18 лет и старше</option></select></label><label>Твой темп<select value={pace} onChange={e => setPace(e.target.value as Profile['pace'])}><option value="calm">Без спешки · 5 мин в день</option><option value="regular">Понемногу каждый день · 10 мин</option><option value="intensive">Хочу больше · 20 мин</option></select></label><label>Сколько опоры нужно?<select value={difficulty} onChange={e => setDifficulty(e.target.value as Difficulty)}><option value="guided">С подсказками и шаблоном</option><option value="independent">Хочу пробовать самостоятельно</option><option value="challenge">Готов к вызову</option></select></label></div><div className="onboarding-actions"><Button variant="ghost" onClick={() => setStep(0)}><Arrow direction="left" />Назад</Button><Button onClick={() => setStep(2)}>К старту <Arrow /></Button></div></>}
    {step === 2 && <div className="diagnostic-layout"><div className="diagnostic-intro"><img src="/assets/tutor/pix-bot-thinking.webp" width="220" height="220" alt="Пикс-Бот думает вместе с тобой" /><Badge tone="teal">МОЖНО ПРОПУСТИТЬ</Badge><h1 tabIndex={-1}>Уже знакомы?</h1><p>Три коротких вопроса помогут выбрать опору на старте. Это не экзамен: за ответы не начисляются очки, а теория всегда доступна.</p>{!auth.user && <p className="guest-note">Начнём в личном гостевом профиле. Он привязан к этому браузеру. Аккаунт для постоянного входа можно создать в профиле.</p>}</div><div className="diagnostic-questions">{diagnosis.map((question, index) => <section key={question.question}><h2><span>{index + 1}</span>{question.question}</h2><div className="answer-options">{question.choices.map((choice, n) => <button className={answers[index] === n ? 'selected' : ''} aria-pressed={answers[index] === n} key={choice} onClick={() => setAnswers(previous => previous.map((a, i) => i === index ? n : a))}>{choice}</button>)}</div></section>)}<div className="onboarding-actions"><Button variant="ghost" disabled={busy} onClick={() => void finish(true)}>Пропустить</Button><Button disabled={busy || answers.some(a => a === null)} onClick={() => void finish()}>{busy ? 'Готовим твой путь…' : 'Начать путешествие'}<Arrow /></Button></div></div></div>}
    {!auth.user && step === 0 && <p className="onboarding-login">Уже есть аккаунт? <Link href="/auth">Войти</Link></p>}
  </main>;
}
