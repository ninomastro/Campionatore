let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
}

/** Da chiamare dentro un gesture handler (tap/click) per rispettare le policy autoplay di iOS Safari. */
export function resumeAudioContext(): void {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') {
    void ctx.resume();
  }
}

export async function decodeBlob(blob: Blob): Promise<AudioBuffer> {
  const ctx = getAudioContext();
  const arrayBuffer = await blob.arrayBuffer();
  return ctx.decodeAudioData(arrayBuffer);
}

export async function loadSample(url: string): Promise<AudioBuffer> {
  const response = await fetch(url);
  return decodeBlob(await response.blob());
}

/** Analyser non connesso a destination: legge il livello del microfono senza generare feedback in cassa. */
export function createMicAnalyser(stream: MediaStream): AnalyserNode {
  const ctx = getAudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  source.connect(analyser);
  return analyser;
}

export function triggerSample(buffer: AudioBuffer, { gain = 1 } = {}): void {
  const ctx = getAudioContext();
  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const gainNode = ctx.createGain();
  gainNode.gain.value = gain;

  source.connect(gainNode).connect(ctx.destination);
  source.start();
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && audioContext?.state === 'suspended') {
    void audioContext.resume();
  }
});
