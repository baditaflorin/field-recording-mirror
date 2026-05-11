// Constructs the DOM once, returns references the controller wires up.
// The view is intentionally dumb — no state, no event handlers; the app
// module reads/writes via the returned refs.

import { WHISPER_MODELS, DEFAULT_WHISPER_MODEL } from '../workers/whisper-types.js';

export interface ViewRefs {
  root: HTMLElement;
  // States
  permissionGate: HTMLElement;
  consent: HTMLInputElement;
  start: HTMLButtonElement;
  stage: HTMLElement;
  // Live
  live: HTMLElement;
  canvas: HTMLCanvasElement;
  elapsed: HTMLElement;
  meterFill: HTMLElement;
  mirrorButton: HTMLButtonElement;
  lockButton: HTMLButtonElement;
  stopButton: HTMLButtonElement;
  status: HTMLElement;
  // Mode + display toggles
  captureModeRolling: HTMLInputElement;
  captureModeLocked: HTMLInputElement;
  channelsMono: HTMLInputElement;
  channelsStereo: HTMLInputElement;
  spectrogramToggle: HTMLInputElement;
  // Effect sliders
  liveGain: HTMLInputElement;
  slowRate: HTMLInputElement;
  slowGain: HTMLInputElement;
  pitchSemitones: HTMLInputElement;
  pitchGain: HTMLInputElement;
  reverbDecay: HTMLInputElement;
  reverbWet: HTMLInputElement;
  reverbGain: HTMLInputElement;
  freezeGrainSize: HTMLInputElement;
  freezeSemitones: HTMLInputElement;
  freezeGain: HTMLInputElement;
  // Side panels
  transcribeButton: HTMLButtonElement;
  whisperModel: HTMLSelectElement;
  transcript: HTMLElement;
  analyseButton: HTMLButtonElement;
  analysis: HTMLElement;
  // Install
  installButton: HTMLButtonElement;
  // Footer
  version: HTMLElement;
}

export function mountView(host: HTMLElement): ViewRefs {
  host.innerHTML = `
    <header class="chrome" role="banner">
      <div class="brand">
        <span class="brand-dot" aria-hidden="true"></span>
        <h1>Field Recording Mirror</h1>
      </div>
      <p class="strap">two slightly different versions of now</p>
      <button class="install" type="button" data-role="install" hidden>Install as app</button>
    </header>

    <main class="stage" data-stage="pre">
      <section class="gate" data-role="gate" aria-live="polite">
        <p class="gate-intro">
          This page asks for your microphone, records 30 seconds of your
          environment, and plays it back through four layered chains over the
          live feed: slowed 5%, pitched +1 semitone, bathed in reverb, and a
          granular freeze. Audio never leaves your device.
        </p>
        <fieldset class="row-group">
          <legend>Capture mode</legend>
          <label>
            <input type="radio" name="capture-mode" value="rolling" data-role="mode-rolling" checked />
            Rolling (mirror always reflects the last 30 s)
          </label>
          <label>
            <input type="radio" name="capture-mode" value="locked" data-role="mode-locked" />
            Locked (one-shot — press <strong>Lock</strong> to freeze a moment)
          </label>
        </fieldset>
        <fieldset class="row-group">
          <legend>Channels</legend>
          <label>
            <input type="radio" name="channels" value="2" data-role="channels-stereo" checked />
            Stereo
          </label>
          <label>
            <input type="radio" name="channels" value="1" data-role="channels-mono" />
            Mono
          </label>
        </fieldset>
        <label class="consent">
          <input type="checkbox" data-role="consent" />
          I understand the page will use my microphone locally and nothing is
          uploaded.
        </label>
        <button class="primary" type="button" data-role="start" disabled>Listen</button>
        <p class="muted">Best with headphones. Without them, the live monitor can feed back.</p>
      </section>

      <section class="live" data-role="live" hidden>
        <div class="meters">
          <div class="elapsed" data-role="elapsed">0:00 / 0:30</div>
          <div class="meter" role="meter" aria-label="Input level">
            <div class="meter-fill" data-role="meter-fill"></div>
          </div>
        </div>
        <canvas class="viz" data-role="canvas" aria-label="Stereo waveforms and spectrogram"></canvas>
        <div class="status" data-role="status" aria-live="polite"></div>
        <div class="controls">
          <button class="primary" type="button" data-role="mirror" disabled>Begin mirror</button>
          <button class="ghost" type="button" data-role="lock">Lock moment</button>
          <button class="ghost" type="button" data-role="stop">Stop</button>
          <label class="toggle">
            <input type="checkbox" data-role="spectrogram" checked />
            Spectrogram overlay
          </label>
        </div>

        <details class="sliders" open>
          <summary>Mirror controls</summary>
          <div class="grid">
            ${slider('liveGain', 'Live monitor', 0, 1, 0.01)}
            ${slider('slowRate', 'Slow chain rate', 0.5, 1, 0.005)}
            ${slider('slowGain', 'Slow gain', 0, 1, 0.01)}
            ${slider('pitchSemitones', 'Pitch (semitones)', -12, 12, 1)}
            ${slider('pitchGain', 'Pitch gain', 0, 1, 0.01)}
            ${slider('reverbDecay', 'Reverb decay (s)', 0.5, 8, 0.1)}
            ${slider('reverbWet', 'Reverb wet', 0, 1, 0.01)}
            ${slider('reverbGain', 'Reverb gain', 0, 1, 0.01)}
            ${slider('freezeGrainSize', 'Freeze grain (s)', 0.05, 2, 0.01)}
            ${slider('freezeSemitones', 'Freeze pitch (st)', -12, 12, 1)}
            ${slider('freezeGain', 'Freeze gain', 0, 1, 0.01)}
          </div>
        </details>

        <details class="panel">
          <summary>Transcribe with Whisper (opt-in, downloads model)</summary>
          <div class="panel-body">
            <label class="muted small">Model
              <select data-role="whisper-model">
                ${WHISPER_MODELS.map(
                  (m) =>
                    `<option value="${m.id}"${m.id === DEFAULT_WHISPER_MODEL ? ' selected' : ''}>${m.label}</option>`
                ).join('')}
              </select>
            </label>
            <button class="ghost" type="button" data-role="transcribe" disabled>
              Transcribe the visible 30 s
            </button>
            <pre class="transcript" data-role="transcript" aria-live="polite"></pre>
          </div>
        </details>

        <details class="panel">
          <summary>Spectral analysis with librosa (Pyodide, opt-in)</summary>
          <div class="panel-body">
            <button class="ghost" type="button" data-role="analyse" disabled>
              Analyse the visible 30 s
            </button>
            <div class="analysis" data-role="analysis" aria-live="polite"></div>
          </div>
        </details>
      </section>
    </main>

    <footer class="foot">
      <span>Audio stays in this tab. Source:
        <a href="https://github.com/baditaflorin/field-recording-mirror">github.com/baditaflorin/field-recording-mirror</a>
      </span>
      <span class="version" data-role="version"></span>
    </footer>
  `;

  function $<T extends HTMLElement = HTMLElement>(role: string): T {
    const el = host.querySelector(`[data-role="${role}"]`);
    if (!el) throw new Error(`view: missing element for role="${role}"`);
    return el as T;
  }

  const stage = host.querySelector('.stage');
  if (!(stage instanceof HTMLElement)) throw new Error('view: .stage element missing');

  return {
    root: host,
    permissionGate: $('gate'),
    consent: $('consent'),
    start: $('start'),
    stage,
    live: $('live'),
    canvas: $('canvas'),
    elapsed: $('elapsed'),
    meterFill: $('meter-fill'),
    mirrorButton: $('mirror'),
    lockButton: $('lock'),
    stopButton: $('stop'),
    status: $('status'),
    captureModeRolling: $('mode-rolling'),
    captureModeLocked: $('mode-locked'),
    channelsMono: $('channels-mono'),
    channelsStereo: $('channels-stereo'),
    spectrogramToggle: $('spectrogram'),
    liveGain: $('liveGain'),
    slowRate: $('slowRate'),
    slowGain: $('slowGain'),
    pitchSemitones: $('pitchSemitones'),
    pitchGain: $('pitchGain'),
    reverbDecay: $('reverbDecay'),
    reverbWet: $('reverbWet'),
    reverbGain: $('reverbGain'),
    freezeGrainSize: $('freezeGrainSize'),
    freezeSemitones: $('freezeSemitones'),
    freezeGain: $('freezeGain'),
    transcribeButton: $('transcribe'),
    whisperModel: $('whisper-model'),
    transcript: $('transcript'),
    analyseButton: $('analyse'),
    analysis: $('analysis'),
    installButton: $('install'),
    version: $('version'),
  };
}

function slider(role: string, label: string, min: number, max: number, step: number): string {
  return `
    <label class="slider">
      <span class="slider-label">${label}</span>
      <input type="range" data-role="${role}" min="${min}" max="${max}" step="${step}" />
      <output class="slider-value" data-for="${role}"></output>
    </label>
  `;
}
