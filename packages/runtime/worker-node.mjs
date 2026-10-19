// Test adapter only. A Node worker is NOT a production boundary for untrusted code.
import { parentPort, workerData } from 'node:worker_threads';
import { readFile } from 'node:fs/promises';
import { loadPyodide } from 'pyodide';

try {
  const kernel = await readFile(new URL('./kernel.py', import.meta.url), 'utf8');
  const pyodide = await loadPyodide({
    jsglobals: Object.create(null), env: {},
    stdout: () => undefined, stderr: () => undefined,
  });
  if (pyodide.version !== '314.0.7') throw new Error('Unexpected Pyodide version: ' + pyodide.version);
  pyodide.runPython(kernel);
  pyodide.globals.set('_piton_payload_json', JSON.stringify(workerData));
  parentPort.postMessage({ type: 'ready' });
  const result = pyodide.runPython('_piton_run(_json.loads(_piton_payload_json))');
  if (typeof result !== 'string') throw new Error('Runtime returned a non-JSON value.');
  parentPort.postMessage({ type: 'result', result });
} catch (error) {
  parentPort.postMessage({ type: 'fatal', message: String(error?.message ?? error).slice(0, 4000) });
}
