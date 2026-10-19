import { useState } from 'react';
import { catalog, getLesson, missions, worlds } from '../../packages/curriculum';
import { useApp } from '../context';
import { Arrow, Badge, Button, Icon, Link, PageHeader } from '../components/ui';
import { modeLabels } from '../lib/utils';

export function TheoryPage() {
  const [search, setSearch] = useState(''); const [world, setWorld] = useState('all'); const [readyOnly, setReadyOnly] = useState(false);
  const filtered = catalog.filter(l => (world === 'all' || l.worldId === world) && (!readyOnly || l.available) && (l.title + l.unitTitle).toLowerCase().includes(search.toLowerCase()));
  return <main id="main-content" className="page-container"><PageHeader eyebrow="ЕДИНАЯ БАЗА ЗНАНИЙ" title="Python становится понятным" description="Одна программа, три способа исследовать её. Читай объяснения, проверяй догадки и пробуй в редакторе." />
    <div className="filter-bar"><label className="search-field"><Icon name="book" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Найти тему: циклы, строки, функции…" aria-label="Поиск по учебнику" /></label><select value={world} onChange={e => setWorld(e.target.value)} aria-label="Фильтр по миру"><option value="all">Все миры</option>{worlds.map(w => <option key={w.id} value={w.id}>{w.title}</option>)}</select><label className="checkbox-label"><input type="checkbox" checked={readyOnly} onChange={e => setReadyOnly(e.target.checked)} />С практикой</label></div>
    <p className="muted small">{filtered.length} тем · 10 полных практикумов в текущем наборе. Остальные темы показывают дальнейшую программу.</p>
    <div className="theory-grid">{filtered.map(item => { const lesson = getLesson(item.id); return <article className="theory-card" key={item.id}><span className="eyebrow">{item.unitTitle}</span><h2>{item.title}</h2><p>{lesson?.objective || 'Эта тема входит в следующий этап учебного маршрута.'}</p><div className="theory-card-footer"><Badge tone={item.available ? 'teal' : 'muted'}>{item.available ? 'Теория + практика' : 'В программе'}</Badge>{item.available && <Link href={'/lesson/' + item.id} aria-label={'Изучить ' + item.title}><Arrow /></Link>}</div><details className="source-details"><summary>Тематические источники</summary><p>{item.sourceText}</p><small>Ссылки перенесены из карты источников; сверка с полными изданиями ещё требуется. Объяснения и задания написаны для ПИТОНА.</small></details></article>; })}</div>
    {!filtered.length && <p className="empty-state">Ничего не нашлось. Попробуй другое слово или мир.</p>}
  </main>;
}

export function PracticePage() {
  const { profile, beginJourney, navigate } = useApp();
  return <main id="main-content" className="page-container"><PageHeader eyebrow="ОТ ИДЕИ К РЕЗУЛЬТАТУ" title="Какой мир создадим сегодня?" description="Один принцип Python можно увидеть, превратить в игру и применить к данным. Начни с цикла for — и попробуй все три истории." />
    <div className="mode-showcase">{(['child', 'teen', 'adult'] as const).map((mode, i) => <article className={'showcase-card showcase-' + mode} key={mode}><img src={'/assets/projects/thumb-' + mode + '.webp'} alt={['Робот на лесной тропе', 'Собственная арена со слаймами', 'Рабочий стол с данными и отчётом'][i]} width="600" height="338" /><div><Badge tone={(['teal', 'purple', 'gold'] as const)[i]}>{modeLabels[mode]}</Badge><h2>{['Пять шагов к открытию', 'Собери свою волну', 'Преврати данные в отчёт'][i]}</h2><p>{['Помоги роботу добраться до ворот. Каждый шаг — результат твоего Python.', 'Создай механизм появления врагов и настрой собственный уровень.', 'Подсчитай сумму заказов, проверь крайние случаи и выгрузи результат.'][i]}</p><Button onClick={() => profile ? navigate('/lesson/u5-l2?mode=' + mode) : beginJourney('/lesson/u5-l2?mode=' + mode)}>Попробовать<Arrow /></Button></div></article>)}</div>
    <div className="practice-note"><img src="/assets/tutor/pix-bot-hint.webp" width="96" height="96" alt="" /><div><h2>Ошибаться здесь — часть открытия</h2><p>Запускай код сколько нужно. Останови бесконечный цикл, изучи ошибку или попроси подсказку. Готовое решение открывается только на последней ступени помощи.</p></div><Link className="button button-secondary" href="/projects">Мои проекты <Arrow /></Link></div>
  </main>;
}

export function MissionsPage() {
  const [filter, setFilter] = useState('all'); const [showAll, setShowAll] = useState(false);
  const list = missions.filter(m => (showAll || m.available) && (filter === 'all' || m.difficulty === filter));
  return <main id="main-content" className="page-container"><PageHeader eyebrow="ПРОВЕРЬ СВОИ ИДЕИ" title="Маленькая миссия. Большой шаг." description="Самостоятельные задачи без готового сценария. У каждой — несколько проверок, включая неожиданные входные данные." />
    <div className="filter-bar"><div className="segmented" aria-label="Сложность миссий">{[['all', 'Все'], ['start', 'Старт'], ['practice', 'Практика'], ['challenge', 'Вызов']].map(([value, title]) => <button className={filter === value ? 'active' : ''} key={value} onClick={() => setFilter(value)}>{title}</button>)}</div><label className="checkbox-label"><input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} />Показать всю программу</label></div>
    <div className="missions-grid">{list.map((mission, i) => <article className={'mission-card ' + (!mission.available ? 'planned' : '')} key={mission.id}><div className="mission-card-top"><span className="mission-symbol"><Icon name={['code', 'terminal', 'test', 'mission', 'repeat', 'save'][i % 6]} size={26} /></span><Badge tone={mission.available ? 'gold' : 'muted'}>{mission.available ? ({ start: 'Старт', practice: 'Практика', challenge: 'Вызов' })[mission.difficulty] : 'В программе'}</Badge></div><h2>{mission.title}</h2><p>{mission.description}</p><div className="mission-card-bottom"><span className="muted small">{mission.available ? (mission.tests?.length || 5) + ' проверок' : 'Самостоятельная задача'}</span>{mission.available && <Link href={'/mission/' + mission.id} className="text-button">Принять миссию<Arrow /></Link>}</div></article>)}</div>
    {!list.length && <div className="empty-state"><h3>Здесь пока тихо</h3><p>Выбери другую сложность или посмотри всю программу.</p></div>}
  </main>;
}
