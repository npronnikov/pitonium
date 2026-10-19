'use client';

import kernel from './kernel.py?raw';
import workerSource from './worker-browser.mjs?raw';
import controllerSource from './frame-controller.mjs?raw';
import { createRunnerWithExecutor, RuntimeStopped, type CaseExecutor } from './engine';
import { pyodideIndexURL, type CaseResult, type ExecutionCase, type PythonRunner, type RunLimits, type RunnerOptions } from './contracts';
import { sandboxDocument, sandboxFlags } from './policy';

interface RuntimeAssets {
  moduleSource: string; assemblySource: string; wasm: ArrayBuffer; stdlib: ArrayBuffer; lockFileContents: string;
}
let loadedAssets: RuntimeAssets | undefined;
async function preloadAssets(signal: AbortSignal): Promise<RuntimeAssets> {
  if (loadedAssets) return loadedAssets;
  const files = [
    ['pyodide.mjs', 5 * 1024 * 1024], ['pyodide.asm.mjs', 5 * 1024 * 1024],
    ['pyodide.asm.wasm', 32 * 1024 * 1024], ['python_stdlib.zip', 16 * 1024 * 1024],
    ['pyodide-lock.json', 2 * 1024 * 1024],
  ] as const;
  const bytes = await Promise.all(files.map(async ([name, maxBytes]) => {
    const response = await fetch(pyodideIndexURL + name, {
      signal, mode: 'cors', credentials: 'omit', redirect: 'error', cache: 'force-cache', referrerPolicy: 'no-referrer',
    });
    if (!response.ok) throw new Error(`Не удалось загрузить Python: ${name} (${response.status}).`);
    const result = await response.arrayBuffer();
    if (!result.byteLength || result.byteLength > maxBytes) throw new Error('Некорректный размер компонента Python.');
    return result;
  }));
  if (signal.aborted) throw new RuntimeStopped('cancelled', 'Загрузка остановлена.');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  loadedAssets = {
    moduleSource: decoder.decode(bytes[0]), assemblySource: decoder.decode(bytes[1]),
    wasm: bytes[2], stdlib: bytes[3], lockFileContents: decoder.decode(bytes[4]),
  };
  return loadedAssets;
}

class BrowserCaseExecutor implements CaseExecutor {
  private frame?: HTMLIFrameElement;
  private port?: MessagePort;
  private bootstrap = new AbortController();
  private initialization?: Promise<void>;
  private handshakeCancel?: () => void;
  private stop?: () => void;
  private receiver?: (data: unknown) => void;
  private closed = false;

  private async initialize(): Promise<void> {
    if (typeof document === 'undefined' || typeof Worker === 'undefined' || typeof MessageChannel === 'undefined')
      throw new Error('Для выполнения Python нужен браузер с поддержкой Web Workers.');
    const assets = await preloadAssets(this.bootstrap.signal);
    if (this.closed) throw new RuntimeStopped('cancelled', 'Выполнение остановлено.');
    const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
    const frame = document.createElement('iframe');
    this.frame = frame;
    frame.hidden = true; frame.title = 'Изолированный исполнитель Python';
    frame.setAttribute('sandbox', sandboxFlags);
    frame.setAttribute('referrerpolicy', 'no-referrer');
    frame.srcdoc = sandboxDocument(nonce, controllerSource);
    await new Promise<void>((resolve, reject) => {
      let connected = false;
      const cleanup = () => { window.removeEventListener('message', onWindowMessage); this.handshakeCancel = undefined; };
      this.handshakeCancel = () => { cleanup(); reject(new RuntimeStopped('cancelled', 'Выполнение остановлено.')); };
      const onWindowMessage = (event: MessageEvent) => {
        if (event.source !== frame.contentWindow || event.data?.type !== 'piton-frame-ready' || event.data.nonce !== nonce || connected) return;
        connected = true;
        window.removeEventListener('message', onWindowMessage);
        const channel = new MessageChannel();
        this.port = channel.port1;
        this.port.onmessage = ({ data }: MessageEvent) => {
          if (data?.type === 'connected' && data.nonce === nonce) { cleanup(); resolve(); }
          else this.receiver?.(data);
        };
        this.port.onmessageerror = () => this.receiver?.({ type: 'fatal', message: 'Не удалось прочитать ответ исполнителя.' });
        this.port.start();
        frame.contentWindow!.postMessage({ type: 'piton-connect', nonce, assets, kernel, workerSource }, '*', [channel.port2]);
      };
      window.addEventListener('message', onWindowMessage);
      document.body.appendChild(frame);
    });
  }

  execute(code: string, execution: ExecutionCase, limits: RunLimits, signal: AbortSignal, ready: () => void): Promise<CaseResult> {
    return new Promise((resolve, reject) => {
      if (signal.aborted || this.closed) { reject(new RuntimeStopped('cancelled', 'Выполнение остановлено.')); return; }
      const id = crypto.randomUUID();
      let settled = false;
      let executing = false;
      let timer: ReturnType<typeof setTimeout>;
      const finish = (error?: Error, result?: unknown) => {
        if (settled) return;
        settled = true; clearTimeout(timer); signal.removeEventListener('abort', cancelled);
        this.receiver = undefined; this.stop = undefined;
        if (error) reject(error); else resolve(result as CaseResult);
      };
      const cancelled = () => finish(new RuntimeStopped('cancelled', 'Выполнение остановлено.'));
      this.stop = cancelled;
      signal.addEventListener('abort', cancelled, { once: true });
      timer = setTimeout(() => {
        finish(new RuntimeStopped('timeout', 'Не удалось загрузить Python за отведённое время.', 'initialization-timeout'));
        this.dispose();
      }, limits.initializationMs);
      this.receiver = (message: unknown) => {
        if (!message || typeof message !== 'object') return;
        const data = message as { id?: unknown; type?: unknown; result?: unknown; message?: unknown; phase?: unknown };
        if (data.id !== id) return;
        if (data.type === 'ready' && !executing) {
          executing = true; clearTimeout(timer);
          timer = setTimeout(() => {
            finish(new RuntimeStopped('timeout', 'Время выполнения закончилось. Проверьте условие цикла.'));
            this.dispose();
          }, limits.executionMs + 250);
          ready();
        } else if (data.type === 'result' && executing && typeof data.result === 'string') finish(undefined, data.result);
        else if (data.type === 'timeout') finish(new RuntimeStopped('timeout', data.phase === 'loading' ? 'Не удалось загрузить Python за отведённое время.' : 'Время выполнения закончилось. Проверьте условие цикла.', data.phase === 'loading' ? 'initialization-timeout' : 'timeout'));
        else if (data.type === 'fatal') finish(new Error(String(data.message ?? 'Исполнитель недоступен.')));
        else finish(new Error('Нарушен протокол исполнителя.'));
      };
      this.initialization ??= this.initialize();
      void this.initialization.then(() => {
        if (settled || this.closed || signal.aborted) return;
        this.port!.postMessage({ type: 'execute', id, payload: { code, case: { fixtures: execution.fixtures, probe: execution.probe }, limits } });
      }).catch(error => finish(error instanceof Error ? error : new Error(String(error))));
    });
  }

  dispose(): void {
    if (this.closed) return;
    this.closed = true; this.stop?.(); this.handshakeCancel?.(); this.bootstrap.abort();
    this.port?.postMessage({ type: 'dispose' }); this.port?.close(); this.port = undefined;
    this.frame?.remove(); this.frame = undefined;
  }
}

export function createPythonRunner(options: RunnerOptions = {}): PythonRunner {
  return createRunnerWithExecutor(() => new BrowserCaseExecutor(), options);
}
