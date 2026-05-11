/// <reference lib="WebWorker" />
// Whisper transcription worker. Loaded lazily on first "Transcribe" click via
// `new Worker(new URL('./whisper.worker.ts', import.meta.url), { type: 'module' })`.
//
// transformers.js handles model download + IndexedDB caching. We resample
// the 30-second buffer to 16 kHz mono (Whisper's native rate) before feeding.

import type { WhisperRequest, WhisperResponse, WhisperProgress } from './whisper-types.js';

export type {};
declare const self: DedicatedWorkerGlobalScope;

interface TransformersProgressEvent {
  status?: string;
  file?: string;
  progress?: number;
  loaded?: number;
  total?: number;
}

interface TransformersChunk {
  text: string;
  timestamp: [number, number];
}

interface TransformersResult {
  text: string;
  chunks?: TransformersChunk[];
}

type Transcriber = (
  input: Float32Array,
  opts: { chunk_length_s: number; stride_length_s: number; return_timestamps: boolean }
) => Promise<TransformersResult>;

let transcriberPromise: Promise<Transcriber> | null = null;
let loadedModel = '';

function send(msg: WhisperResponse): void {
  self.postMessage(msg);
}

function progress(p: WhisperProgress): void {
  self.postMessage({ type: 'progress', ...p });
}

async function ensureTranscriber(model: string): Promise<Transcriber> {
  if (transcriberPromise && loadedModel === model) return transcriberPromise;
  loadedModel = model;
  transcriberPromise = (async () => {
    const mod = await import('@xenova/transformers');
    mod.env.allowLocalModels = false;
    return (await mod.pipeline('automatic-speech-recognition', model, {
      quantized: true,
      progress_callback: (e: TransformersProgressEvent) => {
        progress({
          stage: e.status ?? 'loading',
          file: e.file ?? '',
          progress: typeof e.progress === 'number' ? e.progress / 100 : 0,
          loaded: e.loaded ?? 0,
          total: e.total ?? 0,
        });
      },
    })) as unknown as Transcriber;
  })();
  return transcriberPromise;
}

// Linear resampler — good enough for Whisper's 16 kHz input.
function resampleTo16k(samples: Float32Array, fromRate: number): Float32Array {
  if (fromRate === 16000) return samples;
  const ratio = fromRate / 16000;
  const outLength = Math.floor(samples.length / ratio);
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const srcIndex = i * ratio;
    const i0 = Math.floor(srcIndex);
    const i1 = Math.min(i0 + 1, samples.length - 1);
    const frac = srcIndex - i0;
    out[i] = (samples[i0] ?? 0) * (1 - frac) + (samples[i1] ?? 0) * frac;
  }
  return out;
}

self.addEventListener('message', (ev: MessageEvent<WhisperRequest>) => {
  const req = ev.data;
  if (req.type !== 'transcribe') return;

  void (async () => {
    try {
      const transcriber = await ensureTranscriber(req.model);
      const sixteenK = resampleTo16k(req.samples, req.sampleRate);
      const result = await transcriber(sixteenK, {
        chunk_length_s: 30,
        stride_length_s: 5,
        return_timestamps: true,
      });
      send({
        type: 'transcribed',
        text: result.text.trim(),
        chunks:
          result.chunks?.map((c) => ({
            text: c.text,
            start: c.timestamp[0],
            end: c.timestamp[1],
          })) ?? [],
      });
    } catch (e) {
      send({ type: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  })();
});
