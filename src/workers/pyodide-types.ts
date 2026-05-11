// Message shapes shared by the main thread and the Pyodide worker.

export interface PyodideRequest {
  type: 'analyse';
  samples: Float32Array;
  sampleRate: number;
}

export interface PyodideAnalysis {
  mfcc_mean: number[];
  centroid_mean: number;
  centroid_std: number;
  rolloff_mean: number;
  onset_strength: number[];
  tempo_bpm: number;
  duration_seconds: number;
}

export type PyodideResponse =
  | { type: 'progress'; stage: string; detail: string }
  | { type: 'ready' }
  | { type: 'analysed'; analysis: PyodideAnalysis }
  | { type: 'error'; message: string };
