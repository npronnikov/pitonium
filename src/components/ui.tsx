import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { useApp } from '../context';

export function Icon({ name, size = 22, className = '' }: { name: string; size?: number; className?: string }) {
  return <img className={'icon ' + className} src={'/assets/icons/' + name + '.svg'} width={size} height={size} alt="" aria-hidden="true" />;
}
export function Arrow({ direction = 'right' }: { direction?: 'right' | 'left' | 'down' }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ transform: direction === 'left' ? 'rotate(180deg)' : direction === 'down' ? 'rotate(90deg)' : undefined }}><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
export function Link({ href = '/', children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const { navigate } = useApp();
  return <a {...props} href={href} onClick={event => {
    props.onClick?.(event);
    if (!event.defaultPrevented && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0 && href.startsWith('/')) { event.preventDefault(); navigate(href); }
  }}>{children}</a>;
}
export function Button({ children, variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  return <button className={'button button-' + variant + ' ' + className} {...props}>{children}</button>;
}
export function Badge({ children, tone = 'muted' }: { children: ReactNode; tone?: 'gold' | 'teal' | 'purple' | 'muted' }) {
  return <span className={'badge badge-' + tone}>{children}</span>;
}
export function ProgressBar({ value, total, label }: { value: number; total: number; label: string }) {
  return <div className="progress-track" role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={total}><span style={{ width: Math.min(100, total ? value / total * 100 : 0) + '%' }} /></div>;
}
export function PageHeader({ eyebrow, title, description, children }: { eyebrow?: string; title: string; description?: string; children?: ReactNode }) {
  return <header className="page-heading"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1 tabIndex={-1}>{title}</h1>{description && <p className="page-description">{description}</p>}</div>{children}</header>;
}
export function EmptyState({ icon = 'book', title, children }: { icon?: string; title: string; children: ReactNode }) {
  return <div className="empty-state"><Icon name={icon} size={36} /><h3>{title}</h3><div>{children}</div></div>;
}
export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} className="modal" onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}><div className="modal-header"><h2>{title}</h2><button className="icon-button" aria-label="Закрыть" onClick={onClose}>×</button></div>{children}</dialog>;
}
