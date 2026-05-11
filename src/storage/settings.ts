// Persisted UI settings live in localStorage — tiny, synchronous, survives
// reload. Mirror effect settings persist; consent flag persists; that's it.

import type { MirrorSettings } from '../audio/transformations.js';
import { DEFAULT_MIRROR_SETTINGS, clampSettings } from '../audio/transformations.js';

const KEY = 'field-recording-mirror/v1';

export interface PersistedSettings {
  mirror: MirrorSettings;
  consented: boolean;
}

export function loadSettings(): PersistedSettings {
  if (typeof localStorage === 'undefined') {
    return { mirror: DEFAULT_MIRROR_SETTINGS, consented: false };
  }
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { mirror: DEFAULT_MIRROR_SETTINGS, consented: false };
    const parsed = JSON.parse(raw) as Partial<PersistedSettings>;
    return {
      mirror: clampSettings({ ...DEFAULT_MIRROR_SETTINGS, ...(parsed.mirror ?? {}) }),
      consented: parsed.consented === true,
    };
  } catch {
    return { mirror: DEFAULT_MIRROR_SETTINGS, consented: false };
  }
}

export function saveSettings(settings: PersistedSettings): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* quota or private-mode failure — silent */
  }
}
