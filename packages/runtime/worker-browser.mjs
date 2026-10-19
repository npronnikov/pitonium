// This module is instantiated as a blob worker inside the opaque, CSP-constrained iframe.
// It receives runtime bytes and one educational case; never a profile, cookie, token, or API client.
let started = false;
self.onmessage = async ({ data }) => {
  if (started) return;
  started = true;
  const urls = [];
  const blobUrl = (contents, type) => {
    const url = URL.createObjectURL(new Blob([contents], { type }));
    urls.push(url); return url;
  };
  try {
    const { assets, kernel, payload } = data;
    // Pyodide prepares a WASM fetch before calling createPyodideModule. Serve only
    // pinned, preloaded runtime bytes here; this function never forwards an HTTP request.
    const localFetch = self.fetch.bind(self);
    const base = 'https://cdn.jsdelivr.net/pyodide/v314.0.7/full/';
    const runtimeFiles = new Map([
      [base + 'pyodide.asm.wasm', [assets.wasm, 'application/wasm']],
      [base + 'python_stdlib.zip', [assets.stdlib, 'application/zip']],
      [base + 'pyodide-lock.json', [assets.lockFileContents, 'application/json']],
    ]);
    Object.defineProperty(self, 'fetch', { configurable: false, writable: false, value: async (input, init) => {
      const url = typeof input === 'string' ? input : String(input.url ?? input);
      const method = init?.method ?? input?.method ?? 'GET';
      if (method !== 'GET') throw new TypeError('Network access is disabled.');
      const file = runtimeFiles.get(url);
      if (file) return new Response(file[0], { headers: { 'Content-Type': file[1] } });
      if (url.startsWith('blob:')) return localFetch(input, init);
      throw new TypeError('Network access is disabled.');
    } });
    const moduleUrl = blobUrl(assets.moduleSource, 'text/javascript');
    const assemblyUrl = blobUrl(assets.assemblySource, 'text/javascript');
    const stdLibURL = blobUrl(assets.stdlib, 'application/zip');
    const [{ loadPyodide }, { default: makeModule }] = await Promise.all([
      import(moduleUrl), import(assemblyUrl),
    ]);
    const pyodide = await loadPyodide({
      // All bytes are preloaded by the trusted parent. The iframe and worker cannot contact this URL.
      indexURL: base,
      stdLibURL, lockFileContents: assets.lockFileContents,
      createPyodideModule: settings => makeModule({ ...settings, wasmBinary: new Uint8Array(assets.wasm) }),
      jsglobals: Object.create(null), env: {}, packages: [],
      stdout: () => undefined, stderr: () => undefined,
    });
    if (pyodide.version !== '314.0.7') throw new Error('Unexpected Pyodide version: ' + pyodide.version);
    for (const url of urls) URL.revokeObjectURL(url);
    urls.length = 0;
    pyodide.runPython(kernel);
    pyodide.globals.set('_piton_payload_json', JSON.stringify(payload));
    self.postMessage({ type: 'ready' });
    const result = pyodide.runPython('_piton_run(_json.loads(_piton_payload_json))');
    if (typeof result !== 'string') throw new Error('Runtime returned a non-JSON value.');
    self.postMessage({ type: 'result', result });
  } catch (error) {
    self.postMessage({ type: 'fatal', message: String(error?.message ?? error).slice(0, 4000) });
  } finally {
    for (const url of urls) URL.revokeObjectURL(url);
  }
};
