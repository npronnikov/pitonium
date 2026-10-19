import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { LearningMode } from '../../packages/contracts';

export interface EditorProps { value: string; onChange: (value: string) => void; readOnly?: boolean; errorLine?: number | null; activeLine?: number | null; fontScale?: number; label?: string }
const MonacoEditor = lazy(() => import('./MonacoCodeEditor'));
export function CodeEditor(props: EditorProps & { mode: LearningMode }) {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => { const media = window.matchMedia('(min-width: 769px) and (pointer: fine)'); const update = () => setDesktop(media.matches); update(); media.addEventListener('change', update); return () => media.removeEventListener('change', update); }, []);
  if (props.mode !== 'child' && desktop) return <Suspense fallback={<SimpleEditor {...props} />}><MonacoEditor {...props} /></Suspense>;
  return <SimpleEditor {...props} />;
}
export function SimpleEditor({ value, onChange, readOnly, errorLine, activeLine, fontScale = 1, label = 'Редактор Python' }: EditorProps) {
  const lines = Math.max(10, value.split('\n').length);
  const tabMayLeave = useRef(false);
  return <div className="simple-editor" style={{ fontSize: 15 * fontScale }}><div className="line-gutter" aria-hidden="true">{Array.from({ length: lines }, (_, i) => <span key={i} className={i + 1 === errorLine ? 'error-line' : i + 1 === activeLine ? 'trace-line' : ''}>{i + 1}</span>)}</div><textarea aria-label={label + '. Tab — отступ. Escape, затем Tab — перейти к следующей кнопке.'} value={value} onChange={e => onChange(e.target.value)} readOnly={readOnly} spellCheck={false} autoCorrect="off" autoCapitalize="off" wrap="off" onKeyDown={event => {
    if (event.key === 'Escape') { tabMayLeave.current = true; return; }
    if (event.key === 'Tab' && (event.shiftKey || tabMayLeave.current)) { tabMayLeave.current = false; return; }
    tabMayLeave.current = false;
    if (readOnly || (event.key !== 'Tab' && event.key !== 'Enter')) return;
    if (event.ctrlKey || event.metaKey) return;
    const textarea = event.currentTarget; const start = textarea.selectionStart; const end = textarea.selectionEnd;
    if (event.key === 'Tab') { event.preventDefault(); const insertion = '    '; onChange(value.slice(0, start) + insertion + value.slice(end)); requestAnimationFrame(() => { textarea.selectionStart = textarea.selectionEnd = start + 4; }); }
    else { event.preventDefault(); const previousLine = value.slice(0, start).split('\n').at(-1) || ''; const indentation = previousLine.match(/^\s*/)?.[0] || ''; const insertion = '\n' + indentation + (previousLine.trimEnd().endsWith(':') ? '    ' : ''); onChange(value.slice(0, start) + insertion + value.slice(end)); requestAnimationFrame(() => { textarea.selectionStart = textarea.selectionEnd = start + insertion.length; }); }
  }} /></div>;
}
