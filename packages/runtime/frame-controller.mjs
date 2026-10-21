// Trusted controller only. Student code runs in a different realm, never as iframe JavaScript.
(() => {
  const nonce = document.currentScript.nonce;
  let port;
  let assets;
  let kernel;
  let workerSource;
  let active;
  function terminate() {
    if (!active) return;
    clearTimeout(active.timer);
    active.worker.terminate();
    URL.revokeObjectURL(active.url);
    active = undefined;
  }
  function finish(message) {
    if (!active) return;
    const id = active.id;
    terminate();
    port.postMessage({ ...message, id });
  }
  function execute(data) {
    if (active) { port.postMessage({ type: 'fatal', id: data.id, message: 'Исполнитель занят.' }); return; }
    try {
      const url = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
      // Blob module workers fail to start from Chromium's opaque-origin sandboxed iframes.
      // The worker uses dynamic import() for Pyodide, so it does not need module-worker mode.
      const worker = new Worker(url, { name: 'piton-python' });
      const job = { id: data.id, worker, url, ready: false, timer: undefined };
      active = job;
      job.timer = setTimeout(() => finish({ type: 'timeout', phase: 'loading' }), data.payload.limits.initializationMs);
      worker.onmessage = ({ data: message }) => {
        if (active !== job || !message || typeof message !== 'object') return;
        if (message.type === 'ready' && !job.ready) {
          job.ready = true;
          clearTimeout(job.timer);
          job.timer = setTimeout(() => finish({ type: 'timeout', phase: 'executing' }), data.payload.limits.executionMs + 50);
          port.postMessage({ type: 'ready', id: job.id });
        } else if (message.type === 'result' && job.ready && typeof message.result === 'string' && message.result.length <= 1048576) {
          finish({ type: 'result', result: message.result });
        } else if (message.type === 'fatal') {
          finish({ type: 'fatal', message: String(message.message).slice(0, 4000) });
        } else finish({ type: 'fatal', message: 'Нарушен протокол исполнителя.' });
      };
      worker.onerror = () => finish({ type: 'fatal', message: 'Не удалось запустить изолированный Python Worker.' });
      worker.onmessageerror = () => finish({ type: 'fatal', message: 'Не удалось прочитать ответ Python Worker.' });
      worker.postMessage({ assets, kernel, payload: data.payload });
    } catch (error) {
      if (active) finish({ type: 'fatal', message: String(error?.message ?? error).slice(0, 4000) });
      else port.postMessage({ type: 'fatal', id: data.id, message: String(error?.message ?? error).slice(0, 4000) });
    }
  }
  function connect(event) {
    // An opaque origin is "null", so source + unpredictable nonce authenticate the handshake.
    if (event.source !== parent || event.data?.type !== 'piton-connect' || event.data.nonce !== nonce || event.ports.length !== 1 || port) return;
    removeEventListener('message', connect);
    port = event.ports[0];
    ({ assets, kernel, workerSource } = event.data);
    port.onmessage = ({ data }) => {
      if (data?.type === 'execute') execute(data);
      else if (data?.type === 'dispose') { terminate(); port.close(); }
    };
    port.start();
    port.postMessage({ type: 'connected', nonce });
  }
  addEventListener('message', connect);
  parent.postMessage({ type: 'piton-frame-ready', nonce }, '*');
})();
