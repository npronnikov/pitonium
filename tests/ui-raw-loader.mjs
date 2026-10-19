import { readFileSync } from 'node:fs';

// Compatibility for Node 22.13/22.14, before synchronous registerHooks existed.
// This reproduces Vite's local ?raw import; it does not replace the Python runner.
export async function load(url, context, nextLoad) {
  if (url.startsWith('file:') && url.endsWith('?raw')) {
    return {
      format: 'module',
      source: `export default ${JSON.stringify(readFileSync(new URL(url), 'utf8'))};`,
      shortCircuit: true,
    };
  }
  return nextLoad(url, context);
}
