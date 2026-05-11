// Main-thread client for the Whisper worker. Constructs the worker lazily on
// first use so the page never pays the transcription cost unless asked.

import type { WhisperRequest, WhisperResponse, WhisperProgress } from './whisper-types.js';

export interface WhisperClient {
  transcribe(samples: Float32Array, sampleRate: number, model: string): Promise<string>;
  on(event: 'progress', listener: (p: WhisperProgress) => void): void;
  dispose(): void;
}

export function createWhisperClient(): WhisperClient {
  let worker: Worker | null = null;
  const progressListeners: ((p: WhisperProgress) => void)[] = [];

  function ensureWorker(): Worker {
    if (worker) return worker;
    worker = new Worker(new URL('./whisper.worker.ts', import.meta.url), {
      type: 'module',
      name: 'whisper',
    });
    return worker;
  }

  return {
    async transcribe(samples, sampleRate, model): Promise<string> {
      const w = ensureWorker();
      const buffer = samples.slice(0).buffer;
      return new Promise<string>((resolve, reject) => {
        const handle = (ev: MessageEvent<WhisperResponse>): void => {
          const msg = ev.data;
          if (msg.type === 'progress') {
            for (const l of progressListeners) l(msg);
            return;
          }
          w.removeEventListener('message', handle);
          if (msg.type === 'error') reject(new Error(msg.message));
          else resolve(msg.text);
        };
        w.addEventListener('message', handle);
        const req: WhisperRequest = {
          type: 'transcribe',
          samples: new Float32Array(buffer),
          sampleRate,
          model,
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
