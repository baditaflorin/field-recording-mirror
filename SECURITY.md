# Security policy

## Reporting

Email `baditaflorin@gmail.com` with details. Please do not open a public issue for vulnerabilities.

## Threat model

This is a fully client-side static site. The privacy-relevant boundaries are:

- **Microphone audio never leaves the browser.** No `fetch`, no `WebSocket`, no `WebRTC` upload paths exist in the code. Verifiable from `package.json` and the network panel.
- **Model weights** (Whisper, Pyodide) are fetched from public CDNs (HuggingFace, jsdelivr) and cached in OPFS. These requests are GET-only and contain no audio.
- **Service worker** (`coi-serviceworker`) is used solely to inject COOP/COEP headers. It does not cache or transmit user data.

If any of the above is violated by a future change, that is a security bug — please report.
