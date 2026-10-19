/** A deliberately small renderer: paragraphs and fenced code, never raw HTML. */
export function TutorText({ text }: { text: string }) {
  const parts = text.split(/(```(?:python)?\n[\s\S]*?```)/g);
  return <div className="tutor-text">{parts.map((part, index) => part.startsWith('```') ? <pre key={index}><code>{part.replace(/^```(?:python)?\n/, '').replace(/```$/, '').trimEnd()}</code></pre> : <p key={index}>{part}</p>)}</div>;
}
