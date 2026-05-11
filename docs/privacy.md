# Privacy

## What this page does

Reads your microphone, holds the last 30 seconds in memory, and plays it back through three modified chains layered over the live feed.

## What this page sends

Nothing about your audio. The repository can be audited for this property — search for any of `fetch(`, `XMLHttpRequest`, `WebSocket`, `RTCPeerConnection`, `sendBeacon`, `navigator.sendBeacon`. The only `fetch` calls in production are:

- the page's own static assets (HTML, JS, CSS) from GitHub Pages
- the `coi-serviceworker` interception layer (does not transmit anything; only rewrites response headers)
- on opt-in: Whisper model weights from `huggingface.co` (via `@xenova/transformers`)
- on opt-in: Pyodide core + library wheels from `cdn.jsdelivr.net`

Audio samples never appear in any outgoing request body.

## What this page stores

| Store                                      | Contents                                                                  | Cleared when                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------------ |
| OPFS `last-recording.f32` + `.meta.json`   | The most recent 30-second snapshot, only after you press **Begin mirror** | You uncheck consent, or use your browser's "clear site data" |
| OPFS / IndexedDB (`@xenova/transformers`)  | Whisper model weights (~74 MB to ~769 MB depending on chosen model)       | Same as above                                                |
| OPFS (`pyodide`)                           | Pyodide runtime + librosa / numpy / scipy wheels (~50 MB)                 | Same as above                                                |
| `localStorage` `field-recording-mirror/v1` | Your slider positions and the consent flag                                | Same as above                                                |

## Why it's structured this way

The whole instrument is a static site on GitHub Pages. There is no server in the loop. There is no account to create. There is no "share" button. The piece is about _now_, in the room you are in — sharing a clip would defeat it.

## If you want to be sure

1. Open DevTools → Network → record from page load.
2. Use the page. Press **Begin mirror**.
3. Inspect every request. Confirm: only static assets and (if you opted in) model weights. No POST. No upload-shaped GET.
