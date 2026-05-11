// OPFS (Origin Private File System) helpers. Used to persist:
//   - last-recording.f32   raw Float32Array of the most recent snapshot
//   - last-recording.meta  { sampleRate, capturedAt, durationSeconds }
//
// Model weights for Whisper / Pyodide are cached by their own libraries; we
// don't manage those here.

export interface RecordingMeta {
  sampleRate: number;
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

export async function saveRecording(samples: Float32Array, meta: RecordingMeta): Promise<void> {
  const root = await rootDir();
  const audioHandle = await root.getFileHandle(AUDIO_FILE, { create: true });
  const audioWriter = await audioHandle.createWritable();
  // Normalise to a plain ArrayBuffer — snapshots that originated in a
  // SharedArrayBuffer ring widen the typed-array generic and the OPFS
  // writable stream's signature only accepts ArrayBuffer.
  const buffer = new ArrayBuffer(samples.byteLength);
  new Float32Array(buffer).set(samples);
  await audioWriter.write(buffer);
  await audioWriter.close();

  const metaHandle = await root.getFileHandle(META_FILE, { create: true });
  const metaWriter = await metaHandle.createWritable();
  await metaWriter.write(JSON.stringify(meta));
  await metaWriter.close();
}

export interface LoadedRecording {
  samples: Float32Array;
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
  const samples = new Float32Array(await audioFile.arrayBuffer());
  const meta = JSON.parse(await metaFile.text()) as RecordingMeta;
  return { samples, meta };
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
