// OPFS (Origin Private File System) helpers. Persists:
//   - last-recording.f32   stereo interleaved Float32, [L, R, L, R, ...]
//   - last-recording.meta  { sampleRate, channels, capturedAt, durationSeconds }
//
// Model weights for Whisper / Pyodide are cached by their own libraries; we
// don't manage those here.

import type { StereoSnapshot } from '../audio/shared-capture.js';

export interface RecordingMeta {
  sampleRate: number;
  channels: number;
  capturedAt: string;
  durationSeconds: number;
}

const AUDIO_FILE = 'last-recording.f32';
const META_FILE = 'last-recording.meta.json';

async function rootDir(): Promise<FileSystemDirectoryHandle> {
  if (!('storage' in navigator) || !('getDirectory' in navigator.storage)) {
    throw new Error('OPFS is unavailable in this browser');
  }
  return navigator.storage.getDirectory();
}

export async function saveRecording(snapshot: StereoSnapshot, meta: RecordingMeta): Promise<void> {
  const root = await rootDir();
  const audioHandle = await root.getFileHandle(AUDIO_FILE, { create: true });
  const audioWriter = await audioHandle.createWritable();
  const frames = snapshot.left.length;
  // Interleave L/R into a fresh ArrayBuffer so the OPFS writable accepts it
  // even when the source originated in a SharedArrayBuffer ring.
  const interleaved = new ArrayBuffer(frames * 2 * Float32Array.BYTES_PER_ELEMENT);
  const view = new Float32Array(interleaved);
  for (let i = 0; i < frames; i++) {
    view[i * 2] = snapshot.left[i] ?? 0;
    view[i * 2 + 1] = snapshot.right[i] ?? 0;
  }
  await audioWriter.write(interleaved);
  await audioWriter.close();

  const metaHandle = await root.getFileHandle(META_FILE, { create: true });
  const metaWriter = await metaHandle.createWritable();
  await metaWriter.write(JSON.stringify(meta));
  await metaWriter.close();
}

export interface LoadedRecording {
  snapshot: StereoSnapshot;
  meta: RecordingMeta;
}

export async function loadRecording(): Promise<LoadedRecording | null> {
  const root = await rootDir();
  let audioHandle: FileSystemFileHandle;
  let metaHandle: FileSystemFileHandle;
  try {
    audioHandle = await root.getFileHandle(AUDIO_FILE);
    metaHandle = await root.getFileHandle(META_FILE);
  } catch {
    return null;
  }
  const audioFile = await audioHandle.getFile();
  const metaFile = await metaHandle.getFile();
  const meta = JSON.parse(await metaFile.text()) as RecordingMeta;
  const interleaved = new Float32Array(await audioFile.arrayBuffer());
  const frames = interleaved.length / 2;
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    left[i] = interleaved[i * 2] ?? 0;
    right[i] = interleaved[i * 2 + 1] ?? 0;
  }
  return { snapshot: { left, right }, meta };
}

export async function clearRecording(): Promise<void> {
  const root = await rootDir();
  for (const name of [AUDIO_FILE, META_FILE]) {
    try {
      await root.removeEntry(name);
    } catch {
      /* not present */
    }
  }
}
