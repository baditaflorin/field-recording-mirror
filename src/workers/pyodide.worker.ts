/// <reference lib="WebWorker" />
// Pyodide worker. Real CPython + NumPy + SciPy + librosa in WASM, run only
// when the user opens the "Spectral analysis" panel.
//
// librosa is in pyodide-core's package index since 0.27; we load it at first
// use. If it ever drops out, the fallback is scipy.signal which is always
// present.

import type { PyodideRequest, PyodideResponse, PyodideAnalysis } from './pyodide-types.js';

export type {};
declare const self: DedicatedWorkerGlobalScope;
declare function importScripts(...urls: string[]): void;

interface PyodideAPI {
  loadPackagesFromImports: (code: string) => Promise<void>;
  runPythonAsync: (code: string) => Promise<unknown>;
  globals: { set: (name: string, value: unknown) => void };
  toPy: (value: unknown) => unknown;
}

const PYODIDE_VERSION = '0.27.5';
const PYODIDE_INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

let pyodidePromise: Promise<PyodideAPI> | null = null;

function send(msg: PyodideResponse): void {
  self.postMessage(msg);
}

async function ensurePyodide(): Promise<PyodideAPI> {
  if (pyodidePromise) return pyodidePromise;
  pyodidePromise = (async () => {
    importScripts(`${PYODIDE_INDEX_URL}pyodide.js`);
    send({ type: 'progress', stage: 'loading-pyodide', detail: 'core' });
    const loader = (
      self as unknown as { loadPyodide: (o: { indexURL: string }) => Promise<PyodideAPI> }
    ).loadPyodide;
    const pyodide = await loader({ indexURL: PYODIDE_INDEX_URL });
    send({ type: 'progress', stage: 'loading-packages', detail: 'numpy/scipy/librosa' });
    await pyodide.loadPackagesFromImports('import numpy, scipy, librosa');
    send({ type: 'ready' });
    return pyodide;
  })().catch((e) => {
    pyodidePromise = null;
    throw e;
  });
  return pyodidePromise;
}

const ANALYSIS_PY = `
import numpy as np
import librosa
y = np.asarray(samples_js.to_py(), dtype=np.float32)
sr = int(sample_rate)
n_fft = 2048
hop = 512
S = np.abs(librosa.stft(y, n_fft=n_fft, hop_length=hop))
mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13, n_fft=n_fft, hop_length=hop)
centroid = librosa.feature.spectral_centroid(S=S, sr=sr, n_fft=n_fft, hop_length=hop)[0]
rolloff = librosa.feature.spectral_rolloff(S=S, sr=sr, n_fft=n_fft, hop_length=hop)[0]
onset = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
tempo = float(librosa.feature.tempo(onset_envelope=onset, sr=sr, hop_length=hop)[0])
result = {
    "mfcc_mean": mfcc.mean(axis=1).astype(np.float32).tolist(),
    "centroid_mean": float(centroid.mean()),
    "centroid_std": float(centroid.std()),
    "rolloff_mean": float(rolloff.mean()),
    "onset_strength": onset.astype(np.float32).tolist(),
    "tempo_bpm": tempo,
    "duration_seconds": float(len(y) / sr),
}
result
`;

self.addEventListener('message', (ev: MessageEvent<PyodideRequest>) => {
  const req = ev.data;
  if (req.type !== 'analyse') return;

  void (async () => {
    try {
      const py = await ensurePyodide();
      py.globals.set('samples_js', py.toPy(Array.from(req.samples)));
      py.globals.set('sample_rate', req.sampleRate);
      const raw = (await py.runPythonAsync(ANALYSIS_PY)) as {
        toJs: (opts: { dict_converter: typeof Object.fromEntries }) => PyodideAnalysis;
      };
      const analysis = raw.toJs({ dict_converter: Object.fromEntries });
      send({ type: 'analysed', analysis });
    } catch (e) {
      send({ type: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  })();
});
