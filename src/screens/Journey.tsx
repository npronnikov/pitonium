import { useApp } from '../context';
import { worlds, catalog, getLesson } from '../../packages/curriculum';
import { Arrow, Badge, Button, Icon, Link, ProgressBar } from '../components/ui';
import type { WorldProgress } from '../../packages/contracts';

export function JourneyPage() {
  const { profile, progress, worldStates, beginJourney, navigate } = useApp();
  const ready = catalog.filter(lesson => lesson.available);
  const nextLesson = ready.find(lesson => !progress.completedLessonIds.includes(lesson.id)) || ready[0];
  const states: WorldProgress[] = worldStates.length ? worldStates : worlds.map((world, i) => ({ ...world, status: i === 0 ? 'current' : 'locked', completedCount: 0, availableCount: catalog.filter(l => l.worldId === world.id && l.available).length, totalCount: world.lessonIds.length, reason: i ? 'Следующий этап путешествия' : null }));
  function start() { if (profile?.onboarded) navigate('/lesson/' + (nextLesson?.id || 'u1-l1')); else beginJourney('/lesson/u1-l1'); }
  return <main id="main-content" className="journey-layout">
    <aside className="journey-intro"><p className="eyebrow"><span className="status-dot" />{profile?.onboarded ? 'ТВОЯ ИСТОРИЯ ПРОДОЛЖАЕТСЯ' : 'ТВОЁ ПУТЕШЕСТВИЕ НАЧИНАЕТСЯ ЗДЕСЬ'}</p>
      <h1 tabIndex={-1}>Изучай Python<br />как в игре.<em>Открывай<br />большие<br className="wide-only" /> горизонты.</em></h1>
      <p className="intro-copy">Понятные шаги, увлекательные задачи и настоящий код. От первой строки до собственных проектов — в твоём темпе.</p>
      <Button className="journey-cta" onClick={start}>{profile?.onboarded ? 'Продолжить путь' : 'Начать приключение'}<Arrow /></Button>
      <button className="text-button intro-try" onClick={() => profile ? navigate('/lesson/u5-l2') : beginJourney('/lesson/u5-l2')}>Попробовать один урок <span>↗</span></button>
      <section className="intro-progress"><div><strong>Твой прогресс</strong><span>{progress.completedLessonIds.length} / {ready.length} <small>практикумов</small></span></div><ProgressBar label="Пройденные практикумы" value={progress.completedLessonIds.length} total={ready.length} /><p>{progress.completedLessonIds.length ? 'Каждая новая идея открывает следующий шаг.' : '«Даже самое большое путешествие начинается с первого шага»'}</p></section>
      <div className="intro-character"><div className="character-glow" /><img src={'/assets/characters/' + (profile?.avatar || 'pix') + '/front.webp'} alt="Твой спутник готов к приключению" width="240" height="240" /><div className="intro-quote">Большие идеи<br /><strong>начинаются здесь.</strong></div></div>
    </aside>
    <div className="journey-main"><section className="journey-map" aria-label="Карта шести учебных миров"><div className="map-caption"><Icon name="map" size={18} /><span><strong>КАРТА ЗНАНИЙ</strong><small>6 МИРОВ · 80 ТЕМ · ТВОЯ ИСТОРИЯ</small></span></div><div className="map-motto">Исследуй. Учись. Создавай. <span>✧</span></div>
      <img className="map-route" src="/assets/map/glowing-route.svg" alt="" aria-hidden="true" />
      <div className="world-grid">{states.map(world => <Link key={world.id} href={'/world/' + world.slug} className={'world-node world-' + world.status} aria-label={world.title + '. ' + world.completedCount + ' пройдено. ' + (world.status === 'locked' ? 'Открыть описание следующего мира' : 'Исследовать мир')}>
        <div className="island-art"><img className="island-base" src={world.asset} alt="" width="1024" height="683" loading={world.order > 3 ? 'lazy' : 'eager'} /><img className="island-state" src={'/assets/worlds/' + world.slug + '/overlays/' + (world.status === 'completed' ? 'completed' : world.status !== 'locked' ? 'current' : 'locked') + '.svg'} alt="" aria-hidden="true" /></div>
        <div className="world-label">{world.status === 'current' && <span className="you-are-here">ТЫ ЗДЕСЬ</span>}<span><strong>{world.order}. {world.title}</strong><small>{world.status === 'completed' ? 'Практикумы пройдены' : world.totalCount + ' тем · ' + world.availableCount + ' практикумов'}</small></span><span className="world-arrow">{world.status === 'completed' ? '✓' : <Arrow />}</span></div>
      </Link>)}</div>
      <img className="map-tutor" src="/assets/tutor/pix-bot-idle.webp" alt="" aria-hidden="true" width="100" height="100" />
      <div className="map-compass" aria-hidden="true"><span>N</span>✧</div>
    </section>
    <div className="feature-heading"><h2>Знания, которые меняют тебя</h2><span>Больше, чем обучение — твоё приключение <b>♥</b></span></div>
    <div className="feature-grid">{[
      { icon: 'book', title: 'Понятная теория', text: 'Сложные темы — простыми словами. С примерами и маленькими открытиями.', href: '/theory', tone: 'teal' },
      { icon: 'code', title: 'Практика в браузере', text: 'Пиши Python и сразу смотри, как оживает твоя идея.', href: '/practice', tone: 'purple' },
      { icon: 'trophy', title: 'Настоящие достижения', text: 'Проходи миссии, собирай награды и замечай свой рост.', href: '/progress', tone: 'gold' },
    ].map(card => <Link className="feature-card" href={card.href} key={card.title}><span className={'feature-icon ' + card.tone}><Icon name={card.icon} size={28} /></span><div><h3>{card.title}</h3><p>{card.text}</p></div><Arrow /></Link>)}</div>
    </div>
  </main>;
}

export function WorldPage({ slug }: { slug: string }) {
  const { profile, progress, worldStates, navigate, beginJourney } = useApp();
  const world = worlds.find(w => w.slug === slug);
  if (!world) return <main className="page-container"><h1>Мир не найден</h1><Link href="/map">Вернуться на карту</Link></main>;
  const state = worldStates.find(w => w.id === world.id);
  const nodes = catalog.filter(l => l.worldId === world.id);
  const available = nodes.filter(l => l.available);
  const next = available.find(l => !progress.completedLessonIds.includes(l.id)) || available[0];
  return <main id="main-content" className="page-container"><Link className="back-link" href="/map"><Arrow direction="left" />На карту миров</Link><section className="world-hero"><div><p className="eyebrow">МИР {world.order} ИЗ 6</p><h1 tabIndex={-1}>{world.title}</h1><p className="world-subtitle">{world.subtitle}</p><p className="page-description">{world.description}</p><div className="inline-stats"><Badge tone="teal">{available.length} практикумов</Badge><Badge>{nodes.length} тем в программе</Badge>{state?.completedCount ? <Badge tone="gold">{state.completedCount} пройдено</Badge> : null}</div>{next && <Button onClick={() => profile ? navigate('/lesson/' + next.id) : beginJourney('/lesson/' + next.id)}>К практике<Arrow /></Button>}</div><img className="world-hero-art" src={world.asset} alt={world.description} width="600" height="400" /></section>
    <div className="section-heading"><h2>Твой маршрут</h2><span>Сначала идея. Затем — собственный код.</span></div>
    <div className="lesson-list">{nodes.map((node, index) => { const completed = progress.completedLessonIds.includes(node.id); const core = getLesson(node.id); return <div key={node.id} className={'lesson-card ' + (node.available ? 'ready' : 'planned')}><span className={'lesson-number ' + (completed ? 'done' : '')}>{completed ? '✓' : String(index + 1).padStart(2, '0')}</span><div><span className="muted small">{node.unitTitle}</span><h3>{node.title}</h3><p>{core?.objective || node.sourceText.split(';')[0]}</p></div><div className="lesson-card-end"><Badge tone={completed ? 'teal' : node.available ? 'gold' : 'muted'}>{completed ? 'Пройдено' : node.available ? node.minutes + ' мин' : 'В программе'}</Badge>{node.available ? <Link className="round-link" href={'/lesson/' + node.id} aria-label={'Открыть ' + node.title}><Arrow /></Link> : <Icon name="lock" size={18} />}</div></div>; })}</div>
  </main>;
}
