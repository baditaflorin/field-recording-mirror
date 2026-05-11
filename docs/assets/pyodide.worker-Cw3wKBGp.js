const l="0.27.5",n=`https://cdn.jsdelivr.net/pyodide/v${l}/full/`;let o=null;function a(e){self.postMessage(e)}async function p(){return o||(o=(async()=>{importScripts(`${n}pyodide.js`),a({type:"progress",stage:"loading-pyodide",detail:"core"});const e=self.loadPyodide,s=await e({indexURL:n});return a({type:"progress",stage:"loading-packages",detail:"numpy/scipy/librosa"}),await s.loadPackagesFromImports("import numpy, scipy, librosa"),a({type:"ready"}),s})().catch(e=>{throw o=null,e}),o)}const i=`
import numpy as np
import librosa
y = np.asarray(samples_js.to_py(), dtype=np.float32)
sr = int(sample_rate)
n_fft = 2048
hop = 512
S = np.abs(librosa.stft(y, n_fft=n_fft, hop_length=hop))
mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13, n_fft=n_fft, hop_length=hop)
centroid = librosa.feature.spectral_centroid(S=S, sr=sr, n_fft=n_fft, hop_length=hop)[0]
rolloff = librosa.feature.spectral_rolloff(S=S, sr=sr, n_fft=n_fft, hop_length=hop)[0]
onset = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
tempo = float(librosa.feature.tempo(onset_envelope=onset, sr=sr, hop_length=hop)[0])
result = {
    "mfcc_mean": mfcc.mean(axis=1).astype(np.float32).tolist(),
    "centroid_mean": float(centroid.mean()),
    "centroid_std": float(centroid.std()),
    "rolloff_mean": float(rolloff.mean()),
    "onset_strength": onset.astype(np.float32).tolist(),
    "tempo_bpm": tempo,
    "duration_seconds": float(len(y) / sr),
}
result
`;self.addEventListener("message",e=>{const s=e.data;s.type==="analyse"&&(async()=>{try{const t=await p();t.globals.set("samples_js",t.toPy(Array.from(s.samples))),t.globals.set("sample_rate",s.sampleRate);const r=(await t.runPythonAsync(i)).toJs({dict_converter:Object.fromEntries});a({type:"analysed",analysis:r})}catch(t){a({type:"error",message:t instanceof Error?t.message:String(t)})}})()});
//# sourceMappingURL=pyodide.worker-Cw3wKBGp.js.map
