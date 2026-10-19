import { useState } from 'react';
import { useApp } from '../context';
import { Icon, Link } from './ui';
import { modeLabels } from '../lib/utils';
import type { LearningMode } from '../../packages/contracts';

const nav = [['/map', 'map', 'Мой путь'], ['/theory', 'book', 'Учебник'], ['/practice', 'code', 'Практика'], ['/missions', 'mission', 'Миссии'], ['/progress', 'trophy', 'Достижения']] as const;
export function Header() {
  const { path, profile, progress, setMode, auth, beginJourney } = useApp();
  const [modeOpen, setModeOpen] = useState(false);
  return <header className="site-header"><div className="header-inner">
    <Link href="/map" className="brand" aria-label="ПИТОН — главная"><img src="/assets/icons/piton-mark.svg" width="44" height="44" alt="" /><span><strong>ПИТОН</strong><small>КОД. ИГРА. РАЗВИТИЕ.</small></span></Link>
    <nav className="main-nav" aria-label="Основная навигация">{nav.map(([url, icon, label]) => <Link key={url} href={url} className={'nav-link ' + ((path === url || (url === '/map' && path === '/')) ? 'active' : '')} aria-current={path === url ? 'page' : undefined}><Icon name={icon} size={21} /><span>{label}</span></Link>)}</nav>
    <div className="header-actions"><div className="xp-counter" title="Очки за пройденные уроки"><Icon name="star" size={23} /><strong>{progress.xp} <span>XP</span></strong></div>
      {profile ? <><div className="mode-dropdown"><button className="mode-trigger" onClick={() => setModeOpen(!modeOpen)} aria-expanded={modeOpen}>{modeLabels[profile.mode]} <span>⌄</span></button>{modeOpen && <div className="dropdown-panel">{(['child', 'teen', 'adult'] as LearningMode[]).map(mode => <button key={mode} className={profile.mode === mode ? 'selected' : ''} onClick={() => { setModeOpen(false); void setMode(mode); }}>{modeLabels[mode]}{profile.mode === mode && <span>✓</span>}</button>)}<small>Один прогресс во всех режимах</small></div>}</div><Link className="profile-trigger" href="/profile"><img src={'/assets/characters/' + profile.avatar + '/avatar-64.webp'} width="42" height="42" alt="" /><span><strong>{profile.displayName}</strong><small>Уровень {progress.level}</small></span></Link></> : <button className="header-signin" onClick={() => auth.authMode === 'platform' ? beginJourney() : beginJourney('/auth')}>Войти <span>↗</span></button>}
    </div>
  </div></header>;
}
