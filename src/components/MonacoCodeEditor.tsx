import { useEffect, useRef } from 'react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js';
import 'monaco-editor/esm/vs/basic-languages/python/python.contribution.js';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker.js?worker';
import type { EditorProps } from './CodeEditor';

export default function MonacoCodeEditor({ value, onChange, readOnly, errorLine, activeLine, fontScale = 1, label = 'Редактор Python' }: EditorProps) {
  const container = useRef<HTMLDivElement>(null); const editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null); const change = useRef(onChange); change.current = onChange;
  const decorations = useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
  useEffect(() => {
    (globalThis as typeof globalThis & { MonacoEnvironment?: unknown }).MonacoEnvironment = { getWorker: () => new EditorWorker() };
    monaco.editor.defineTheme('piton-night', { base: 'vs-dark', inherit: true, rules: [{ token: 'keyword', foreground: 'BFA2F5' }, { token: 'string', foreground: '8DE0B8' }, { token: 'number', foreground: 'F5C86A' }, { token: 'comment', foreground: '71899D' }, { token: 'identifier', foreground: 'D8E6F5' }], colors: { 'editor.background': '#0B182B', 'editor.foreground': '#DDE8F5', 'editorLineNumber.foreground': '#53687F', 'editorLineNumber.activeForeground': '#F7C65D', 'editor.lineHighlightBackground': '#13243A', 'editorCursor.foreground': '#F7C65D', 'editor.selectionBackground': '#294869', 'editor.inactiveSelectionBackground': '#213751', 'editorIndentGuide.background1': '#20334B' } });
    const instance = monaco.editor.create(container.current!, { value, language: 'python', theme: 'piton-night', automaticLayout: true, minimap: { enabled: false }, scrollBeyondLastLine: false, fontSize: 15 * fontScale, fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace', lineHeight: 26, padding: { top: 18, bottom: 18 }, tabSize: 4, insertSpaces: true, readOnly, ariaLabel: label, wordWrap: 'on', roundedSelection: true, renderLineHighlight: 'all', overviewRulerLanes: 0, hideCursorInOverviewRuler: true, folding: true, bracketPairColorization: { enabled: true }, quickSuggestions: false, suggestOnTriggerCharacters: false, glyphMargin: false });
    editor.current = instance; decorations.current = instance.createDecorationsCollection(); const subscription = instance.onDidChangeModelContent(() => change.current(instance.getValue()));
    return () => { subscription.dispose(); const model = instance.getModel(); instance.dispose(); model?.dispose(); editor.current = null; };
  }, []);
  useEffect(() => { const instance = editor.current; if (instance && instance.getValue() !== value) instance.setValue(value); }, [value]);
  useEffect(() => { editor.current?.updateOptions({ readOnly, fontSize: 15 * fontScale }); }, [readOnly, fontScale]);
  useEffect(() => { const model = editor.current?.getModel(); if (!model) return; const line = errorLine && errorLine <= model.getLineCount() ? errorLine : null; monaco.editor.setModelMarkers(model, 'piton-runtime', line ? [{ startLineNumber: line, endLineNumber: line, startColumn: 1, endColumn: Math.max(2, model.getLineMaxColumn(line)), message: 'Python остановился на этой строке. Посмотри объяснение под редактором.', severity: monaco.MarkerSeverity.Error }] : []); }, [errorLine, value]);
  useEffect(() => { decorations.current?.set(activeLine ? [{ range: new monaco.Range(activeLine, 1, activeLine, 1), options: { isWholeLine: true, className: 'monaco-trace-line' } }] : []); if (activeLine) editor.current?.revealLineInCenterIfOutsideViewport(activeLine); }, [activeLine]);
  return <div className="monaco-container" ref={container} />;
}
