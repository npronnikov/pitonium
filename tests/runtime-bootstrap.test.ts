import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import test from 'node:test';

test('the actual browser worker module loads pinned WASM bytes without an external fetch', async () => {
  const worker = new Worker(new URL('../packages/runtime/verify-preloaded-runtime.mjs', import.meta.url), {
    execArgv: ['--experimental-vm-modules'], env: {},
  });
  const report = await new Promise<{ passed: boolean; externalFetches: number; events: number; runtime: string; message?: string }>((resolve, reject) => {
    const timer = setTimeout(() => { void worker.terminate(); reject(new Error('Preloaded runtime bootstrap timed out.')); }, 45000);
    worker.once('message', message => { clearTimeout(timer); resolve(message); void worker.terminate(); });
    worker.once('error', error => { clearTimeout(timer); reject(error); });
    worker.once('exit', code => { clearTimeout(timer); if (code !== 0) reject(new Error('Bootstrap worker exited: ' + code)); });
  });
  assert.equal(report.passed, true, report.message);
  assert.equal(report.externalFetches, 0);
  assert.equal(report.events, 5);
  assert.equal(report.runtime, '314.0.7');
});
