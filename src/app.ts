// Controller: wires the audio engine to the DOM view, the lazy WASM workers,
// the spectrogram, and the install prompt.

import { createEngine, type Engine, CAPTURE_SECONDS } from './audio/engine.js';
import { clampSettings, type MirrorSettings, type CaptureMode } from './audio/transformations.js';
import type { StereoSnapshot } from './audio/shared-capture.js';
import { saveRecording, clearRecording, type RecordingMeta } from './storage/opfs.js';
import { loadSettings, saveSettings } from './storage/settings.js';
import { createVisualizer, type Visualizer } from './ui/visualizer.js';
import { mountView, type ViewRefs } from './ui/view.js';
import { formatDuration, relativeAgo } from './primitives/time.js';
import type { PyodideAnalysis } from './workers/pyodide-types.js';
import type { WhisperProgress } from './workers/whisper-types.js';

declare const __APP_VERSION__: string;
declare const __GIT_COMMIT__: string;
declare const __BUILT_AT__: string;

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface App {
  start(): void;
}

const SLIDER_KEYS = [
  'liveGain',
  'slowRate',
  'slowGain',
  'pitchSemitones',
  'pitchGain',
  'reverbDecay',
  'reverbWet',
  'reverbGain',
  'freezeGrainSize',
  'freezeSemitones',
  'freezeGain',
] as const satisfies readonly (keyof MirrorSettings)[];

type SliderKey = (typeof SLIDER_KEYS)[number];

export function bootstrap(): App {
  const maybeHost = document.getElementById('app');
  if (!maybeHost) throw new Error('#app element is missing from index.html');
  const host: HTMLElement = maybeHost;

  const refs = mountView(host);
  refs.version.textContent = `v${__APP_VERSION__} · ${__GIT_COMMIT__} · built ${relativeAgo(__BUILT_AT__)}`;

  const persisted = loadSettings();
  let settings: MirrorSettings = persisted.mirror;

  refs.consent.checked = persisted.consented;
  refs.start.disabled = !persisted.consented;
  reflectModeAndChannels(refs, settings);
  refs.spectrogramToggle.checked = settings.spectrogram;

  bindSlidersToSettings(refs, settings, (next) => {
    settings = next;
    engine.apply(settings);
    saveSettings({ mirror: settings, consented: refs.consent.checked });
  });

  refs.consent.addEventListener('change', () => {
    refs.start.disabled = !refs.consent.checked;
    saveSettings({ mirror: settings, consented: refs.consent.checked });
    if (!refs.consent.checked) void clearRecording();
  });

  refs.captureModeRolling.addEventListener('change', () => updateModeFromUI());
  refs.captureModeLocked.addEventListener('change', () => updateModeFromUI());
  refs.channelsMono.addEventListener('change', () => updateChannelsFromUI());
  refs.channelsStereo.addEventListener('change', () => updateChannelsFromUI());
  refs.spectrogramToggle.addEventListener('change', () => {
    settings = clampSettings({ ...settings, spectrogram: refs.spectrogramToggle.checked });
    visualizer?.setSpectrogramEnabled(settings.spectrogram);
    saveSettings({ mirror: settings, consented: refs.consent.checked });
  });

  const engine: Engine = createEngine({
    onElapsed: (seconds) => {
      const capped = Math.min(seconds, CAPTURE_SECONDS);
      refs.elapsed.textContent = `${formatDuration(capped)} / ${formatDuration(CAPTURE_SECONDS)}`;
      const ready = seconds >= CAPTURE_SECONDS || engine.isLocked();
      refs.mirrorButton.disabled = !ready;
      refs.transcribeButton.disabled = !ready;
      refs.analyseButton.disabled = !ready;
      if (ready && !engine.isMirroring()) {
        refs.status.textContent = engine.isLocked()
          ? 'moment locked — press Begin mirror'
          : 'ring is full — press Begin mirror';
      }
    },
    onLevel: (peak) => {
      const pct = Math.min(100, Math.round(peak * 120));
      refs.meterFill.style.width = `${pct.toString()}%`;
    },
    onMirrorStateChange: (mirroring) => {
      refs.mirrorButton.textContent = mirroring ? 'Refresh mirror' : 'Begin mirror';
      refs.status.textContent = mirroring
        ? 'mirror running — slow, pitch, reverb, freeze'
        : 'ready';
    },
    onLockStateChange: (locked) => {
      refs.lockButton.textContent = locked ? 'Release lock' : 'Lock moment';
      refs.lockButton.classList.toggle('active', locked);
    },
    onSpectrogramColumn: (column) => visualizer?.pushSpectrogramColumn(column),
    onError: (e) => {
      refs.status.textContent = `error: ${e.message}`;
    },
  });

  let visualizer: Visualizer | null = null;
  let renderHandle = 0;
  const handleResize = (): void => {
    visualizer?.resize();
  };

  refs.start.addEventListener('click', () => {
    void start();
  });

  refs.mirrorButton.addEventListener('click', () => {
    engine.beginMirror();
    void persistSnapshot();
  });

  refs.lockButton.addEventListener('click', () => {
    if (engine.isLocked()) engine.releaseLock();
    else engine.lockBuffer();
  });

  refs.stopButton.addEventListener('click', () => {
    void stop();
  });

  refs.transcribeButton.addEventListener('click', () => {
    void runTranscribe();
  });

  refs.analyseButton.addEventListener('click', () => {
    void runAnalyse();
  });

  // PWA install affordance.
  let deferredInstall: InstallPromptEvent | null = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstall = e as InstallPromptEvent;
    refs.installButton.hidden = false;
  });
  refs.installButton.addEventListener('click', () => {
    const prompt = deferredInstall;
    if (!prompt) return;
    void prompt.prompt().then(async () => {
      const choice = await prompt.userChoice;
      if (choice.outcome === 'accepted') refs.installButton.hidden = true;
      deferredInstall = null;
    });
  });
  window.addEventListener('appinstalled', () => {
    refs.installButton.hidden = true;
  });

  function updateModeFromUI(): void {
    const mode: CaptureMode = refs.captureModeLocked.checked ? 'locked' : 'rolling';
    settings = clampSettings({ ...settings, captureMode: mode });
    saveSettings({ mirror: settings, consented: refs.consent.checked });
    // If switching to rolling while locked, release the lock so the mirror
    // tracks again.
    if (mode === 'rolling' && engine.isLocked()) engine.releaseLock();
  }

  function updateChannelsFromUI(): void {
    const channels: 1 | 2 = refs.channelsMono.checked ? 1 : 2;
    settings = clampSettings({ ...settings, channels });
    saveSettings({ mirror: settings, consented: refs.consent.checked });
    if (engine.isRunning()) {
      refs.status.textContent = 'channel change applies after Stop + Listen';
    }
  }

  async function start(): Promise<void> {
    if (engine.isRunning()) return;
    refs.start.disabled = true;
    refs.status.textContent = 'requesting microphone…';
    try {
      await engine.start(settings);
    } catch (e) {
      refs.start.disabled = false;
      refs.status.textContent = `mic blocked: ${e instanceof Error ? e.message : String(e)}`;
      return;
    }
    refs.permissionGate.hidden = true;
    refs.live.hidden = false;

    visualizer = createVisualizer(refs.canvas);
    visualizer.setSpectrogramEnabled(settings.spectrogram);
    visualizer.resize();
    window.addEventListener('resize', handleResize);

    engine.apply(settings);
    refs.status.textContent = `filling ring buffer — ${CAPTURE_SECONDS}s`;

    const renderLoop = (): void => {
      if (visualizer) {
        const ring = engine.ringSnapshot();
        const live = ring ? tailOf(ring, 4096) : null;
        const visible = engine.visibleSnapshot();
        const mirror = engine.isMirroring() || engine.isLocked() ? visible : null;
        visualizer.render(live, mirror);
      }
      renderHandle = window.requestAnimationFrame(renderLoop);
    };
    renderHandle = window.requestAnimationFrame(renderLoop);
  }

  async function stop(): Promise<void> {
    if (renderHandle) {
      window.cancelAnimationFrame(renderHandle);
      renderHandle = 0;
    }
    if (visualizer) {
      window.removeEventListener('resize', handleResize);
      visualizer.dispose();
      visualizer = null;
    }
    await engine.stop();
    refs.permissionGate.hidden = false;
    refs.live.hidden = true;
    refs.start.disabled = !refs.consent.checked;
    refs.mirrorButton.disabled = true;
    refs.transcribeButton.disabled = true;
    refs.analyseButton.disabled = true;
    refs.status.textContent = 'stopped';
  }

  async function persistSnapshot(): Promise<void> {
    const snap = engine.visibleSnapshot();
    if (!snap || snap.left.length === 0) return;
    const meta: RecordingMeta = {
      sampleRate: engine.sampleRate(),
      channels: engine.channels(),
      capturedAt: new Date().toISOString(),
      durationSeconds: snap.left.length / engine.sampleRate(),
    };
    try {
      await saveRecording(snap, meta);
    } catch {
      /* OPFS unavailable — fine; the mirror still runs in-memory */
    }
  }

  async function runTranscribe(): Promise<void> {
    const snap = engine.visibleSnapshot();
    if (!snap || snap.left.length === 0) return;
    refs.transcribeButton.disabled = true;
    refs.transcript.textContent = 'loading Whisper… first run downloads weights, then caches them';
    const { createWhisperClient } = await import('./workers/whisper-client.js');
    const client = createWhisperClient();
    client.on('progress', (p: WhisperProgress) => {
      const pct = Math.round(p.progress * 100);
      const file = p.file || 'model';
      refs.transcript.textContent = `Whisper · ${p.stage} · ${file} · ${pct.toString()}%`;
    });
    try {
      // Downmix to mono for Whisper.
      const mono = downmix(snap);
      const text = await client.transcribe(mono, engine.sampleRate(), refs.whisperModel.value);
      refs.transcript.textContent = text || '(silence)';
    } catch (e) {
      refs.transcript.textContent = `transcription failed: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      refs.transcribeButton.disabled = false;
    }
  }

  async function runAnalyse(): Promise<void> {
    const snap = engine.visibleSnapshot();
    if (!snap || snap.left.length === 0) return;
    refs.analyseButton.disabled = true;
    refs.analysis.innerHTML = '<div class="row"><span>loading Pyodide + librosa…</span></div>';
    const { createPyodideClient } = await import('./workers/pyodide-client.js');
    const client = createPyodideClient();
    client.on('progress', ({ stage, detail }) => {
      refs.analysis.innerHTML = `<div class="row"><span class="label">${stage}</span><span class="value">${detail}</span></div>`;
    });
    try {
      const mono = downmix(snap);
      const a = await client.analyse(mono, engine.sampleRate());
      refs.analysis.innerHTML = renderAnalysis(a);
    } catch (e) {
      refs.analysis.innerHTML = `<div class="row"><span class="label">error</span><span class="value">${
        e instanceof Error ? e.message : String(e)
      }</span></div>`;
    } finally {
      refs.analyseButton.disabled = false;
    }
  }

  return {
    start(): void {
      bindSliderDisplays(refs, settings);
    },
  };
}

function reflectModeAndChannels(refs: ViewRefs, s: MirrorSettings): void {
  refs.captureModeRolling.checked = s.captureMode === 'rolling';
  refs.captureModeLocked.checked = s.captureMode === 'locked';
  refs.channelsMono.checked = s.channels === 1;
  refs.channelsStereo.checked = s.channels === 2;
}

function tailOf(snap: StereoSnapshot, tail: number): StereoSnapshot {
  const len = snap.left.length;
  if (len <= tail) return snap;
  return {
    left: snap.left.subarray(len - tail),
    right: snap.right.subarray(len - tail),
  };
}

function downmix(snap: StereoSnapshot): Float32Array {
  const n = snap.left.length;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = ((snap.left[i] ?? 0) + (snap.right[i] ?? 0)) * 0.5;
  }
  return out;
}

function bindSlidersToSettings(
  refs: ViewRefs,
  initial: MirrorSettings,
  onChange: (next: MirrorSettings) => void
): void {
  let current: MirrorSettings = { ...initial };
  for (const key of SLIDER_KEYS) {
    const input = refs[key];
    input.value = String(initial[key]);
    const output = refs.root.querySelector<HTMLOutputElement>(`output[data-for="${key}"]`);
    if (output) output.value = formatSliderValue(key, initial[key]);
    input.addEventListener('input', () => {
      const v = Number(input.value);
      const next = clampSettings({ ...current, [key]: v });
      current = next;
      if (output) output.value = formatSliderValue(key, next[key]);
      onChange(next);
    });
  }
}

function bindSliderDisplays(refs: ViewRefs, initial: MirrorSettings): void {
  for (const key of SLIDER_KEYS) {
    const output = refs.root.querySelector<HTMLOutputElement>(`output[data-for="${key}"]`);
    if (output) output.value = formatSliderValue(key, initial[key]);
  }
}

function formatSliderValue(key: SliderKey, value: number): string {
  switch (key) {
    case 'slowRate':
      return `${(value * 100).toFixed(1)}%`;
    case 'pitchSemitones':
    case 'freezeSemitones':
      return `${value >= 0 ? '+' : ''}${value.toFixed(0)} st`;
    case 'reverbDecay':
      return `${value.toFixed(1)} s`;
    case 'freezeGrainSize':
      return `${value.toFixed(2)} s`;
    default:
      return value.toFixed(2);
  }
}

function renderAnalysis(a: PyodideAnalysis): string {
  const row = (label: string, value: string): string =>
    `<div class="row"><span class="label">${label}</span><span class="value">${value}</span></div>`;
  return [
    row('duration', `${a.duration_seconds.toFixed(2)} s`),
    row('tempo (librosa)', `${a.tempo_bpm.toFixed(1)} bpm`),
    row('spectral centroid (mean)', `${a.centroid_mean.toFixed(0)} Hz`),
    row('centroid stdev', `${a.centroid_std.toFixed(0)} Hz`),
    row('spectral rolloff (mean)', `${a.rolloff_mean.toFixed(0)} Hz`),
    row('onsets sampled', String(a.onset_strength.length)),
    row(
      'MFCC[0..3]',
      a.mfcc_mean
        .slice(0, 4)
        .map((v) => v.toFixed(2))
        .join(' · ')
    ),
  ].join('');
}
