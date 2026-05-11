// Controller: wires the audio engine to the DOM view and the lazy WASM
// workers. The view itself has no behaviour; this module owns it.

import { createEngine, type Engine, CAPTURE_SECONDS } from './audio/engine.js';
import { clampSettings, type MirrorSettings } from './audio/transformations.js';
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

export interface App {
  start(): void;
}

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

  bindSlidersToSettings(refs, settings, (next) => {
    settings = next;
    engine.apply(settings);
    saveSettings({ mirror: settings, consented: refs.consent.checked });
  });

  refs.consent.addEventListener('change', () => {
    refs.start.disabled = !refs.consent.checked;
    saveSettings({ mirror: settings, consented: refs.consent.checked });
  });

  const engine: Engine = createEngine({
    onElapsed: (seconds) => {
      const capped = Math.min(seconds, CAPTURE_SECONDS);
      refs.elapsed.textContent = `${formatDuration(capped)} / ${formatDuration(CAPTURE_SECONDS)}`;
      if (seconds >= CAPTURE_SECONDS) {
        refs.mirrorButton.disabled = false;
        refs.transcribeButton.disabled = false;
        refs.analyseButton.disabled = false;
        if (!engine.isMirroring()) {
          refs.status.textContent = 'ring is full — press Begin mirror';
        }
      } else {
        refs.mirrorButton.disabled = true;
      }
    },
    onLevel: (level) => {
      const pct = Math.min(100, Math.round(level * 240));
      refs.meterFill.style.width = `${pct.toString()}%`;
    },
    onMirrorStateChange: (mirroring) => {
      refs.mirrorButton.textContent = mirroring ? 'Refresh mirror' : 'Begin mirror';
      refs.status.textContent = mirroring ? 'mirror running — slowed, pitched, reverbed' : 'ready';
    },
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

  refs.stopButton.addEventListener('click', () => {
    void stop();
  });

  refs.transcribeButton.addEventListener('click', () => {
    void runTranscribe();
  });

  refs.analyseButton.addEventListener('click', () => {
    void runAnalyse();
  });

  async function start(): Promise<void> {
    if (engine.isRunning()) return;
    refs.start.disabled = true;
    refs.status.textContent = 'requesting microphone…';
    try {
      await engine.start();
    } catch (e) {
      refs.start.disabled = false;
      refs.status.textContent = `mic blocked: ${e instanceof Error ? e.message : String(e)}`;
      return;
    }
    refs.permissionGate.hidden = true;
    const live = host.querySelector<HTMLElement>('[data-role="live"]');
    if (live) live.hidden = false;

    visualizer = createVisualizer(refs.canvas);
    visualizer.resize();
    window.addEventListener('resize', handleResize);

    engine.apply(settings);
    refs.status.textContent = `filling ring buffer — ${CAPTURE_SECONDS}s`;

    const renderLoop = (): void => {
      const snap = engine.snapshot();
      if (snap && visualizer) {
        const tail = snap.length > 4096 ? snap.subarray(snap.length - 4096) : snap;
        visualizer.render(tail, engine.isMirroring() ? snap : null);
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
    const live = host.querySelector<HTMLElement>('[data-role="live"]');
    if (live) live.hidden = true;
    refs.start.disabled = !refs.consent.checked;
    refs.mirrorButton.disabled = true;
    refs.transcribeButton.disabled = true;
    refs.analyseButton.disabled = true;
    refs.status.textContent = 'stopped';
  }

  async function persistSnapshot(): Promise<void> {
    const samples = engine.snapshot();
    if (!samples || samples.length === 0) return;
    const meta: RecordingMeta = {
      sampleRate: engine.sampleRate(),
      capturedAt: new Date().toISOString(),
      durationSeconds: samples.length / engine.sampleRate(),
    };
    try {
      await saveRecording(samples, meta);
    } catch {
      /* OPFS unavailable — fine; the mirror still runs in-memory */
    }
  }

  async function runTranscribe(): Promise<void> {
    const samples = engine.snapshot();
    if (!samples || samples.length === 0) return;
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
      const text = await client.transcribe(samples, engine.sampleRate(), refs.whisperModel.value);
      refs.transcript.textContent = text || '(silence)';
    } catch (e) {
      refs.transcript.textContent = `transcription failed: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      refs.transcribeButton.disabled = false;
    }
  }

  async function runAnalyse(): Promise<void> {
    const samples = engine.snapshot();
    if (!samples || samples.length === 0) return;
    refs.analyseButton.disabled = true;
    refs.analysis.innerHTML = '<div class="row"><span>loading Pyodide + librosa…</span></div>';
    const { createPyodideClient } = await import('./workers/pyodide-client.js');
    const client = createPyodideClient();
    client.on('progress', ({ stage, detail }) => {
      refs.analysis.innerHTML = `<div class="row"><span class="label">${stage}</span><span class="value">${detail}</span></div>`;
    });
    try {
      const a = await client.analyse(samples, engine.sampleRate());
      refs.analysis.innerHTML = renderAnalysis(a);
    } catch (e) {
      refs.analysis.innerHTML = `<div class="row"><span class="label">error</span><span class="value">${
        e instanceof Error ? e.message : String(e)
      }</span></div>`;
    } finally {
      refs.analyseButton.disabled = false;
    }
  }

  // Reset OPFS state if the user revokes consent.
  refs.consent.addEventListener('change', () => {
    if (!refs.consent.checked) {
      void clearRecording();
    }
  });

  return {
    start(): void {
      // Initial render of slider values.
      bindSliderDisplays(refs, settings);
    },
  };
}

function bindSlidersToSettings(
  refs: ViewRefs,
  initial: MirrorSettings,
  onChange: (next: MirrorSettings) => void
): void {
  const pairs: { input: HTMLInputElement; key: keyof MirrorSettings }[] = [
    { input: refs.liveGain, key: 'liveGain' },
    { input: refs.slowRate, key: 'slowRate' },
    { input: refs.slowGain, key: 'slowGain' },
    { input: refs.pitchSemitones, key: 'pitchSemitones' },
    { input: refs.pitchGain, key: 'pitchGain' },
    { input: refs.reverbDecay, key: 'reverbDecay' },
    { input: refs.reverbWet, key: 'reverbWet' },
    { input: refs.reverbGain, key: 'reverbGain' },
  ];

  let current: MirrorSettings = { ...initial };
  for (const { input, key } of pairs) {
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
  for (const key of Object.keys(initial) as (keyof MirrorSettings)[]) {
    const output = refs.root.querySelector<HTMLOutputElement>(`output[data-for="${key}"]`);
    if (output) output.value = formatSliderValue(key, initial[key]);
  }
}

function formatSliderValue(key: keyof MirrorSettings, value: number): string {
  switch (key) {
    case 'slowRate':
      return `${(value * 100).toFixed(1)}%`;
    case 'pitchSemitones':
      return `${value >= 0 ? '+' : ''}${value.toFixed(0)} st`;
    case 'reverbDecay':
      return `${value.toFixed(1)} s`;
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
