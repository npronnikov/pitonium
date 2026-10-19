// Test utility: verifies the real browser module bootstrap in a JS VM with no HTTP fetch.
// This is not a browser, does not emulate CSP/origin rules, and is not a security sandbox.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { parentPort } from 'node:worker_threads';

const require = createRequire(import.meta.url);
const distribution = new URL('./', 'file://' + require.resolve('pyodide'));
const bytes = async name => new Uint8Array(await readFile(new URL(name, distribution))).buffer;
const source = async name => readFile(new URL(name, distribution), 'utf8');
const [moduleSource, assemblySource, wasm, stdlib, lockFileContents, kernel, workerSource] = await Promise.all([
  source('pyodide.mjs'), source('pyodide.asm.mjs'), bytes('pyodide.asm.wasm'), bytes('python_stdlib.zip'), source('pyodide-lock.json'),
  readFile(new URL('./kernel.py', import.meta.url), 'utf8'), readFile(new URL('./worker-browser.mjs', import.meta.url), 'utf8'),
]);
const blobs = new Map();
let nextBlob = 0;
class LocalURL extends URL {
  static createObjectURL(blob) { const id = 'blob:piton/' + ++nextBlob; blobs.set(id, blob); return id; }
  static revokeObjectURL(url) { blobs.delete(url); }
}
const messages = [];
const nativeFetchRequests = [];
const context = vm.createContext({
  Blob, URL: LocalURL, Response, Request, Headers, TextEncoder, TextDecoder, WebAssembly,
  setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask,
  MessageChannel, AbortController, performance, crypto: globalThis.crypto,
  console, WorkerGlobalScope: class WorkerGlobalScope { static [Symbol.hasInstance]() { return true; } },
  location: new LocalURL('blob:piton/worker'),
  navigator: { userAgent: 'Piton Node VM bootstrap verification' },
  postMessage: message => messages.push(message),
  fetch: async input => {
    const url = typeof input === 'string' ? input : String(input.url ?? input);
    nativeFetchRequests.push(url);
    if (!blobs.has(url)) throw new Error('Forbidden external fetch during preloaded bootstrap: ' + url);
    return new Response(blobs.get(url));
  },
}, { codeGeneration: { strings: false, wasm: true } });
context.self = context;
const modules = new Map();
async function loadModule(url) {
  if (modules.has(url)) return modules.get(url);
  const blob = blobs.get(url);
  if (!blob) throw new Error('Forbidden module URL: ' + url);
  const module = new vm.SourceTextModule(await blob.text(), {
    context, identifier: url, initializeImportMeta: meta => { meta.url = url; },
    importModuleDynamically: loadModule,
  });
  modules.set(url, module);
  await module.link(loadModule);
  await module.evaluate();
  return module;
}
try {
  const script = new vm.Script(workerSource, { filename: 'worker-browser.mjs', importModuleDynamically: loadModule });
  script.runInContext(context);
  await context.self.onmessage({ data: {
    assets: { moduleSource, assemblySource, wasm, stdlib, lockFileContents }, kernel,
    payload: {
      code: 'for index in range(steps):\n    game.move()\nprint(6 * 7)',
      case: { fixtures: { globals: { steps: 5 }, scene: { kind: 'robot', width: 6 } }, probe: { kind: 'script' } },
      limits: { executionMs: 3000, initializationMs: 45000, stdoutBytes: 32768, eventCount: 512, traceSnapshots: 200, traceBytes: 131072, filesBytes: 262144 },
    },
  } });
  const fatal = messages.find(message => message.type === 'fatal');
  assert.equal(fatal, undefined, JSON.stringify(fatal));
  assert.equal(messages[0]?.type, 'ready');
  const result = JSON.parse(messages[1].result);
  assert.equal(result.status, 'ok', JSON.stringify(result.error));
  assert.equal(result.stdout, '42\n');
  assert.equal(result.events.length, 5);
  assert.ok(nativeFetchRequests.every(url => url.startsWith('blob:')));
  const report = { passed: true, runtime: '314.0.7', events: result.events.length, stdout: result.stdout, externalFetches: 0, verification: 'Node VM; not browser CSP QA' };
  if (parentPort) parentPort.postMessage(report);
  else await new Promise((resolve, reject) => process.stdout.write(JSON.stringify(report) + '\n', error => error ? reject(error) : resolve()));
  process.exit(0);
} catch (error) {
  if (parentPort) parentPort.postMessage({ passed: false, message: String(error) });
  console.error(error);
  process.exit(1);
}
