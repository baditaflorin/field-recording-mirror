// Message shapes shared by the main thread and the Whisper worker.

export interface WhisperRequest {
  type: 'transcribe';
  samples: Float32Array;
  sampleRate: number;
  model: string;
}

export interface WhisperProgress {
  stage: string;
  file: string;
  progress: number;
  loaded: number;
  total: number;
}

export type WhisperResponse =
  | ({ type: 'progress' } & WhisperProgress)
  | {
      type: 'transcribed';
      text: string;
      chunks: { text: string; start: number; end: number }[];
    }
  | { type: 'error'; message: string };

export const WHISPER_MODELS = [
  { id: 'Xenova/whisper-base.en', label: 'Base (~74 MB)' },
  { id: 'Xenova/whisper-small.en', label: 'Small (~244 MB)' },
  { id: 'Xenova/whisper-medium.en', label: 'Medium (~769 MB)' },
] as const;
export const DEFAULT_WHISPER_MODEL = 'Xenova/whisper-small.en';
