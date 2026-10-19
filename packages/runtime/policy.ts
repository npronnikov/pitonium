/** The origin boundary is the iframe sandbox. Import guards in Python are not a sandbox. */
export const sandboxFlags = 'allow-scripts';

export function sandboxCsp(nonce: string): string {
  if (!/^[a-f0-9]{32}$/.test(nonce)) throw new Error('Некорректный nonce исполнителя.');
  return [
    "default-src 'none'",
    `script-src 'nonce-${nonce}' blob: 'wasm-unsafe-eval'`,
    'worker-src blob:',
    'connect-src blob:',
    "img-src 'none'", "style-src 'none'", "font-src 'none'",
    "frame-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'",
  ].join('; ');
}

export function sandboxDocument(nonce: string, controllerSource: string): string {
  const csp = sandboxCsp(nonce);
  const source = controllerSource.replace(/<\/script/gi, '<\\/script');
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="referrer" content="no-referrer"></head><body><script nonce="${nonce}">${source}</script></body></html>`;
}
