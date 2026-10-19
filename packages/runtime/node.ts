/** Real Pyodide adapter for deterministic integration tests; never import into a client bundle. */
import { Worker } from 'node:worker_threads';
import { createRunnerWithExecutor, RuntimeStopped, type CaseExecutor } from './engine';
import type { CaseResult, ExecutionCase, PythonRunner, RunLimits, RunnerOptions } from './contracts';

class NodeCaseExecutor implements CaseExecutor {
  private stop?: () => void;

  execute(code: string, execution: ExecutionCase, limits: RunLimits, signal: AbortSignal, ready: () => void): Promise<CaseResult> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) { reject(new RuntimeStopped('cancelled', 'Выполнение остановлено.')); return; }
      const worker = new Worker(new URL('./worker-node.mjs', import.meta.url), {
        workerData: { code, case: { fixtures: execution.fixtures, probe: execution.probe }, limits },
        // Tests receive no application environment and never mount a host directory in Pyodide.
        env: {}, execArgv: [], resourceLimits: { maxOldGenerationSizeMb: 192, stackSizeMb: 4 },
      });
      let settled = false;
      let executing = false;
      let timer: ReturnType<typeof setTimeout>;
      const cleanup = () => {
        clearTimeout(timer); signal.removeEventListener('abort', cancelled);
        this.stop = undefined;
        worker.removeAllListeners();
        // Keep the error listener while termination finishes to avoid an unhandled worker error.
        worker.on('error', () => undefined);
        void worker.terminate().catch(() => undefined);
      };
      const finish = (error?: Error, result?: CaseResult) => {
        if (settled) return;
        settled = true; cleanup();
        if (error) reject(error); else resolve(result!);
      };
      const cancelled = () => finish(new RuntimeStopped('cancelled', 'Выполнение остановлено.'));
      this.stop = cancelled;
      signal.addEventListener('abort', cancelled, { once: true });
      timer = setTimeout(() => finish(new RuntimeStopped('timeout', 'Не удалось загрузить Python за отведённое время.', 'initialization-timeout')), limits.initializationMs);
      worker.on('message', (message: unknown) => {
        if (!message || typeof message !== 'object') { finish(new Error('Некорректное сообщение исполнителя.')); return; }
        const data = message as { type?: unknown; message?: unknown; result?: unknown };
        if (data.type === 'ready' && !executing) {
          executing = true; clearTimeout(timer);
          timer = setTimeout(() => finish(new RuntimeStopped('timeout', 'Время выполнения закончилось. Проверьте условие цикла.')), limits.executionMs + 50);
          ready();
        } else if (data.type === 'result' && executing) {
          // The engine applies the strict result and event schemas after the transport boundary.
          finish(undefined, data.result as CaseResult);
        } else if (data.type === 'fatal') finish(new Error(String(data.message ?? 'Не удалось запустить Python.')));
        else finish(new Error('Нарушен порядок сообщений исполнителя.'));
      });
      worker.once('error', error => finish(error));
      worker.once('exit', code => { if (!settled) finish(new Error(`Исполнитель завершился до результата (код ${code}).`)); });
    });
  }

  dispose(): void { this.stop?.(); }
}

export function createNodePythonRunner(options: RunnerOptions = {}): PythonRunner {
  return createRunnerWithExecutor(() => new NodeCaseExecutor(), options);
}
export * from './contracts';
