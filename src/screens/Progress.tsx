import { useEffect, useState } from 'react';
import type { ReviewItem } from '../../packages/contracts';
import { skills, catalog, getLesson } from '../../packages/curriculum';
import { useApp } from '../context';
import { Arrow, Badge, Button, Icon, Link, PageHeader, ProgressBar } from '../components/ui';
import { formatDate } from '../lib/utils';
import { api, profileQuery } from '../lib/api';

const badgeDefinitions = [
  ['first-code', 'Первая строка', 'Первый пройденный урок'], ['practice-streak', 'Три дня практики', 'Три дня занятий подряд'], ['ten-lessons', 'Десять открытий', 'Пройти десять уроков'], ['loop-mastery', 'Мастер циклов', 'Решить урок о цикле for'], ['function-mastery', 'Сила функций', 'Пройти практикум о функциях'], ['first-bug-fixed', 'Баг исправлен', 'Успешная проверка после ошибки'], ['first-test', 'Всё зелёное', 'Первый полный набор пройденных тестов'], ['first-mechanic', 'Моя механика', 'Создать игровой проект'], ['first-report', 'Первый отчёт', 'Выполнить практическое задание с данными'], ['first-world', 'Первый мир', 'Пройти все доступные задания деревни'], ['independent-solution', 'Своими силами', 'Решить задачу без подсказок'], ['creator', 'Создатель', 'Сохранить собственный проект'],
] as const;
const masteryLabels = ['Не начато', 'Знакомство', 'С опорой', 'Самостоятельно', 'Устойчивый навык'];
export function ProgressPage() {
  const { profile, progress, beginJourney } = useApp(); const [selectedSkill, setSelectedSkill] = useState<string | null>(null);
  const [scheduled, setScheduled] = useState<ReviewItem[]>(progress.reviews); const [scheduleLoading, setScheduleLoading] = useState(false);
  useEffect(() => {
    let current = true; if (!profile) { setScheduled([]); return; }
    setScheduleLoading(true);
    void api<{ reviews: ReviewItem[]; scheduled: ReviewItem[] }>('/progress/review' + profileQuery(profile.id))
      .then(data => { if (current) setScheduled(data.scheduled); }).catch(() => { if (current) setScheduled(progress.reviews); })
      .finally(() => { if (current) setScheduleLoading(false); });
    return () => { current = false; };
  }, [profile?.id, progress.attempts]);
  const selected = skills.find(s => s.id === selectedSkill);
  const readyCount = catalog.filter(l => l.available).length;
  const practiced = progress.mastery.filter(s => s.level >= 1).length;
  const due = scheduled.filter(review => new Date(review.dueAt) <= new Date());
  const selectedLessonId = selected?.lessonIds.find(id => getLesson(id));
  return <main id="main-content" className="page-container"><PageHeader eyebrow="КАЖДОЕ ОТКРЫТИЕ СЧИТАЕТСЯ" title={profile ? profile.displayName + ', смотри, как далеко ты идёшь' : 'Здесь будет твоя история'} description="XP отмечает выполненную работу. Навыки показывают, что получается самостоятельно. Повторение помогает знаниям остаться с тобой." />
    {!profile && <div className="notice-row"><p>Начни личное путешествие, чтобы сохранять открытия.</p><Button onClick={() => beginJourney()}>Начать <Arrow /></Button></div>}
    <div className="stats-grid"><section className="stat-card"><span className="stat-icon gold"><Icon name="star" size={28} /></span><div><strong>{progress.xp}<small> XP</small></strong><span>Уровень {progress.level}</span></div><ProgressBar value={progress.xp % 100} total={100} label="До следующего уровня" /></section><section className="stat-card"><span className="stat-icon teal"><Icon name="book" size={28} /></span><div><strong>{progress.completedLessonIds.length}<small> / {readyCount}</small></strong><span>Практикумов пройдено</span></div></section><section className="stat-card"><span className="stat-icon purple"><Icon name="code" size={28} /></span><div><strong>{practiced}</strong><span>Навыков в работе</span></div></section><section className="stat-card"><span className="stat-icon gold"><Icon name="repeat" size={28} /></span><div><strong>{progress.streak}<small> дн.</small></strong><span>Текущая серия занятий</span></div></section></div>
    <div className="progress-columns"><section className="panel skill-panel"><div className="section-heading"><h2>Карта твоих навыков</h2><Badge tone="teal">ЗНАНИЯ ≠ XP</Badge></div><div className="skill-list">{skills.map(skill => { const item = progress.mastery.find(m => m.skillId === skill.id); const level = item?.level || 0; return <button className={'skill-row ' + (selectedSkill === skill.id ? 'selected' : '')} key={skill.id} onClick={() => setSelectedSkill(selectedSkill === skill.id ? null : skill.id)} aria-expanded={selectedSkill === skill.id}><span><strong>{skill.title}</strong><small>{masteryLabels[level]}</small></span><span className="mastery-dots" aria-label={'Мастерство ' + level + ' из 4'}>{[0, 1, 2, 3, 4].map(n => <i key={n} className={n <= level && item ? 'filled' : ''} />)}</span><Arrow direction="down" /></button>; })}</div>{selected && <div className="skill-details"><h3>{selected.title}</h3><p>{selected.description}</p><p className="muted small">Рекомендуемая опора: {selected.prerequisites.length ? selected.prerequisites.map(id => skills.find(s => s.id === id)?.title || id).join(', ') : 'Можно начинать с нуля'}</p><h4>Что показывает мастерство</h4><ul>{selected.masteryCriteria.map(criterion => <li key={criterion}>{criterion}</li>)}</ul>{selectedLessonId && <Link className="text-button" href={'/lesson/' + selectedLessonId}>Перейти к практике<Arrow /></Link>}</div>}</section>
    <aside className="panel review-panel"><img src="/assets/tutor/pix-bot-hint.webp" width="110" height="110" alt="" /><h2>Вернёмся к знакомому?</h2><p>Короткий повтор укрепляет навык. Чтобы завершить его, нужно снова пройти проверку кода.</p>{!scheduled.length ? <div className="review-empty">{scheduleLoading ? 'Открываем расписание повторений…' : progress.completedLessonIds.length ? 'Сейчас нет назначенных повторений. Можно выбрать знакомый навык самому.' : 'Первое повторение появится после пройденного урока.'}</div> : scheduled.slice(0, 5).map(review => <Link className="review-item" key={review.skillId} href={'/lesson/' + review.lessonId + '?review=' + encodeURIComponent(review.skillId)}><Icon name="repeat" size={22} /><span><strong>{skills.find(s => s.id === review.skillId)?.title || getLesson(review.lessonId)?.title}</strong><small>{new Date(review.dueAt) <= new Date() ? 'Готово к повторению' : 'Следующий шаг: ' + formatDate(review.dueAt)}</small></span><Arrow /></Link>)}<p className="muted small">{due.length ? due.length + ' навыков ждут повторения' : 'Никакой спешки. У тебя свой темп.'}</p></aside></div>
    <div className="section-heading"><h2>Коллекция открытий</h2><span>{progress.badges.length} наград</span></div><div className="badges-grid">{badgeDefinitions.map(([id, title, description]) => { const earned = progress.badges.includes(id) || progress.badges.includes('reward.' + id); return <article className={'reward-card ' + (earned ? 'earned' : 'unearned')} key={id}><img src={'/assets/rewards/badges/' + id + '.webp'} width="112" height="112" alt="" loading="lazy" /><h3>{title}</h3><p>{description}</p><span>{earned ? '✓ Получено' : 'Ещё впереди'}</span></article>; })}</div>
  </main>;
}
