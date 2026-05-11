// Main-thread client for the Pyodide worker. Constructs the worker lazily on
// first analyse call.

import type { PyodideRequest, PyodideResponse, PyodideAnalysis } from './pyodide-types.js';

export interface PyodideClient {
  analyse(samples: Float32Array, sampleRate: number): Promise<PyodideAnalysis>;
  on(event: 'progress', listener: (info: { stage: string; detail: string }) => void): void;
  dispose(): void;
}

export function createPyodideClient(): PyodideClient {
  let worker: Worker | null = null;
  const progressListeners: ((p: { stage: string; detail: string }) => void)[] = [];

  function ensureWorker(): Worker {
    if (worker) return worker;
    worker = new Worker(new URL('./pyodide.worker.ts', import.meta.url), {
      type: 'module',
      name: 'pyodide',
    });
    return worker;
  }

  return {
    async analyse(samples, sampleRate): Promise<PyodideAnalysis> {
      const w = ensureWorker();
      const buffer = samples.slice(0).buffer;
      return new Promise<PyodideAnalysis>((resolve, reject) => {
        const handle = (ev: MessageEvent<PyodideResponse>): void => {
          const msg = ev.data;
          if (msg.type === 'progress') {
            for (const l of progressListeners) l({ stage: msg.stage, detail: msg.detail });
            return;
          }
          if (msg.type === 'ready') return;
          w.removeEventListener('message', handle);
          if (msg.type === 'error') reject(new Error(msg.message));
          else resolve(msg.analysis);
        };
        w.addEventListener('message', handle);
        const req: PyodideRequest = {
          type: 'analyse',
          samples: new Float32Array(buffer),
          sampleRate,
        };
        w.postMessage(req, [buffer]);
      });
    },
    on(_event, listener): void {
      progressListeners.push(listener);
    },
    dispose(): void {
      worker?.terminate();
      worker = null;
      progressListeners.length = 0;
    },
  };
}
