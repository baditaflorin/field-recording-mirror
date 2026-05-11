// Wires up the audio graph for the field-recording mirror:
//
//      mic ─┬───────────────────────────────────► [live gain] ─┐
//           │                                                   │
//           └──► shared ring (via capture-processor)            │
//                                                               │
//   stereo snapshot ──► AudioBuffer ──┬─► [slow rate]         ──┤
//                                     ├─► [pitch shift]       ──┤
//                                     ├─► [granular freeze]   ──┤
//                                     └─► [reverb wet]        ──┘ ─► master
//
// All chains share a single stereo AudioBuffer that is regenerated each time
// the snapshot is taken (rolling) or when the user explicitly locks one.
// Tone.js owns the AudioWorklets for PitchShift, Reverb, and GrainPlayer.

import * as Tone from 'tone';

import type { StereoSnapshot } from './shared-capture.js';
import type { MirrorSettings } from './transformations.js';
import { semitonesToRatio } from './transformations.js';

export interface MirrorGraph {
  /** Connect the mic source so the user hears live. */
  connectLive(source: AudioNode): void;
  /** Replace the buffer that the chains loop. Stereo. */
  setBuffer(snapshot: StereoSnapshot, sampleRate: number): void;
  /** Start the mirror chains (idempotent). */
  startMirror(): void;
  /** Stop the mirror chains; live monitor keeps running. */
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
  liveGain.connect(audioContext.destination);

  // Effect chains. Each chain's source player is recreated when the buffer
  // is swapped; the effect nodes are persistent so settings changes apply
  // instantly without re-allocating worklets.
  const slowGain = new Tone.Gain(0).toDestination();
  const pitchShift = new Tone.PitchShift({ pitch: 1 });
  const pitchOut = new Tone.Gain(0).toDestination();
  pitchShift.connect(pitchOut);
  const reverb = new Tone.Reverb({ decay: 3.5, wet: 0.55 });
  const reverbOut = new Tone.Gain(0).toDestination();
  reverb.connect(reverbOut);
  // Freeze chain has its own pitch + gain so the grain pitch is independent
  // of the main "Pitch" chain.
  const freezePitch = new Tone.PitchShift({ pitch: 0 });
  const freezeOut = new Tone.Gain(0).toDestination();
  freezePitch.connect(freezeOut);

  let toneBuffer: Tone.ToneAudioBuffer | null = null;
  let slowPlayer: Tone.Player | null = null;
  let pitchPlayer: Tone.Player | null = null;
  let reverbPlayer: Tone.Player | null = null;
  let freezePlayer: Tone.GrainPlayer | null = null;
  let mirroring = false;
  let currentSettings: MirrorSettings | null = null;

  function rebuildPlayers(): void {
    disposePlayers();
    if (!toneBuffer) return;
    const slow = new Tone.Player(toneBuffer);
    slow.loop = true;
    slow.playbackRate = currentSettings?.slowRate ?? 0.95;
    slow.connect(slowGain);
    slowPlayer = slow;

    const pitch = new Tone.Player(toneBuffer);
    pitch.loop = true;
    pitch.connect(pitchShift);
    pitchPlayer = pitch;

    const rev = new Tone.Player(toneBuffer);
    rev.loop = true;
    rev.connect(reverb);
    reverbPlayer = rev;

    const freeze = new Tone.GrainPlayer({
      url: toneBuffer,
      loop: true,
      grainSize: currentSettings?.freezeGrainSize ?? 0.2,
      overlap: 0.1,
      playbackRate: 1,
      detune: (currentSettings?.freezeSemitones ?? 0) * 100,
    });
    freeze.connect(freezePitch);
    freezePlayer = freeze;
  }

  function disposePlayers(): void {
    for (const p of [slowPlayer, pitchPlayer, reverbPlayer, freezePlayer]) {
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
    freezePlayer = null;
  }

  function startAllPlayers(): void {
    const now = Tone.now();
    slowPlayer?.start(now);
    pitchPlayer?.start(now);
    reverbPlayer?.start(now);
    freezePlayer?.start(now);
  }

  return {
    connectLive(source: AudioNode): void {
      source.connect(liveGain);
    },
    setBuffer(snapshot: StereoSnapshot, sampleRate: number): void {
      const frames = snapshot.left.length;
      const audioBuffer = audioContext.createBuffer(2, frames, sampleRate);
      // Copy through fresh ArrayBuffer-backed views to satisfy strict typing
      // when the snapshot came from a SharedArrayBuffer.
      const left = new Float32Array(frames);
      left.set(snapshot.left);
      const right = new Float32Array(frames);
      right.set(snapshot.right);
      audioBuffer.copyToChannel(left, 0);
      audioBuffer.copyToChannel(right, 1);
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
      // semitonesToRatio kept as a parity check for the math; not used at
      // runtime because Tone.PitchShift takes semitones natively.
      void semitonesToRatio(settings.pitchSemitones);
      pitchOut.gain.value = settings.pitchGain;
      reverb.decay = settings.reverbDecay;
      reverb.wet.value = settings.reverbWet;
      reverbOut.gain.value = settings.reverbGain;
      if (freezePlayer) {
        freezePlayer.grainSize = settings.freezeGrainSize;
        freezePlayer.detune = settings.freezeSemitones * 100;
      }
      freezeOut.gain.value = settings.freezeGain;
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
      pitchOut.dispose();
      reverb.dispose();
      reverbOut.dispose();
      freezePitch.dispose();
      freezeOut.dispose();
      try {
        liveGain.disconnect();
      } catch {
        /* already disconnected */
      }
    },
  };
}
