// Wires up the audio graph for the field-recording mirror:
//
//      mic ─┬────────────────────────────► [live gain] ─┐
//           │                                            │
//           └──► shared ring (via capture-processor)     │
//                                                        │
//   ring snapshot ──► AudioBuffer ──┬─► [slow rate]    ──┤
//                                   ├─► [pitch shift]  ──┼─► master out
//                                   └─► [reverb wet]   ──┘
//
// The three mirror chains share a single AudioBuffer that is regenerated each
// time a snapshot is fetched. Tone.js runs the PitchShift (granular) and
// Reverb (ConvolverNode + generated IR) on a worklet thread, so the live
// monitor is unaffected.

import * as Tone from 'tone';

import type { MirrorSettings } from './transformations.js';
import { semitonesToRatio } from './transformations.js';

export interface MirrorGraph {
  /** Connect a source (the mic AudioNode) so the user hears live. */
  connectLive(source: AudioNode): void;
  /** Replace the buffer that the slow/pitch/reverb chains loop. */
  setBuffer(samples: Float32Array, sampleRate: number): void;
  /** Start the three mirror chains (idempotent). */
  startMirror(): void;
  /** Stop the three mirror chains; live monitor keeps running. */
  stopMirror(): void;
  /** Apply new effect settings. */
  apply(settings: MirrorSettings): void;
  /** True if the mirror chains are currently playing. */
  isMirroring(): boolean;
  /** Tear everything down. */
  dispose(): void;
}

export function createMirrorGraph(audioContext: AudioContext): MirrorGraph {
  Tone.setContext(audioContext);

  const liveGain = audioContext.createGain();
  liveGain.gain.value = 0;

  const masterGain = audioContext.createGain();
  masterGain.gain.value = 1;
  masterGain.connect(audioContext.destination);
  liveGain.connect(masterGain);

  // Each chain's source is recreated on each playback cycle so we can swap
  // the AudioBuffer. We keep the effect nodes persistent so settings changes
  // apply instantly.
  const slowGain = new Tone.Gain(0).connect(Tone.getDestination());
  const pitchShift = new Tone.PitchShift({ pitch: 1 }).connect(
    new Tone.Gain(0).connect(Tone.getDestination())
  );
  const pitchGain = pitchShift.output as unknown as Tone.Gain;
  const reverb = new Tone.Reverb({ decay: 3.5, wet: 0.55 });
  const reverbGain = new Tone.Gain(0);
  reverb.connect(reverbGain);
  reverbGain.toDestination();

  let toneBuffer: Tone.ToneAudioBuffer | null = null;
  let slowPlayer: Tone.Player | null = null;
  let pitchPlayer: Tone.Player | null = null;
  let reverbPlayer: Tone.Player | null = null;
  let mirroring = false;
  let currentSettings: MirrorSettings | null = null;

  function rebuildPlayers(): void {
    disposePlayers();
    if (!toneBuffer) return;
    slowPlayer = new Tone.Player(toneBuffer);
    slowPlayer.loop = true;
    slowPlayer.playbackRate = currentSettings?.slowRate ?? 0.95;
    slowPlayer.connect(slowGain);

    pitchPlayer = new Tone.Player(toneBuffer);
    pitchPlayer.loop = true;
    pitchPlayer.connect(pitchShift);

    reverbPlayer = new Tone.Player(toneBuffer);
    reverbPlayer.loop = true;
    reverbPlayer.connect(reverb);
  }

  function disposePlayers(): void {
    for (const p of [slowPlayer, pitchPlayer, reverbPlayer]) {
      if (!p) continue;
      try {
        p.stop();
      } catch {
        /* not started */
      }
      p.dispose();
    }
    slowPlayer = null;
    pitchPlayer = null;
    reverbPlayer = null;
  }

  return {
    connectLive(source: AudioNode): void {
      source.connect(liveGain);
    },
    setBuffer(samples: Float32Array, sampleRate: number): void {
      // Copy into a plain ArrayBuffer-backed Float32Array so the typed-array
      // generic narrows to <ArrayBuffer>, satisfying copyToChannel's signature
      // when the source originated in a SharedArrayBuffer ring.
      const copy = new Float32Array(samples.length);
      copy.set(samples);
      const audioBuffer = audioContext.createBuffer(1, copy.length, sampleRate);
      audioBuffer.copyToChannel(copy, 0);
      toneBuffer?.dispose();
      toneBuffer = new Tone.ToneAudioBuffer(audioBuffer);
      if (mirroring) {
        rebuildPlayers();
        startAllPlayers();
      }
    },
    startMirror(): void {
      if (mirroring) return;
      if (!toneBuffer) return;
      rebuildPlayers();
      startAllPlayers();
      mirroring = true;
    },
    stopMirror(): void {
      if (!mirroring) return;
      disposePlayers();
      mirroring = false;
    },
    apply(settings: MirrorSettings): void {
      currentSettings = settings;
      liveGain.gain.setTargetAtTime(settings.liveGain, audioContext.currentTime, 0.02);
      slowGain.gain.value = settings.slowGain;
      if (slowPlayer) slowPlayer.playbackRate = settings.slowRate;
      pitchShift.pitch = settings.pitchSemitones;
      // Tone.PitchShift uses semitones natively, but log for parity with the
      // pure-math helper in case we ever swap implementations.
      void semitonesToRatio(settings.pitchSemitones);
      pitchGain.gain.value = settings.pitchGain;
      reverb.decay = settings.reverbDecay;
      reverb.wet.value = settings.reverbWet;
      reverbGain.gain.value = settings.reverbGain;
    },
    isMirroring(): boolean {
      return mirroring;
    },
    dispose(): void {
      disposePlayers();
      toneBuffer?.dispose();
      toneBuffer = null;
      slowGain.dispose();
      pitchShift.dispose();
      pitchGain.dispose();
      reverb.dispose();
      reverbGain.dispose();
      try {
        liveGain.disconnect();
        masterGain.disconnect();
      } catch {
        /* already disconnected */
      }
    },
  };

  function startAllPlayers(): void {
    const now = Tone.now();
    slowPlayer?.start(now);
    pitchPlayer?.start(now);
    reverbPlayer?.start(now);
  }
}
