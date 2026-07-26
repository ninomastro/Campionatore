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

let unlocked = false;

/**
 * Safari iOS a volte ignora resume() da solo: serve far passare audio reale nello
 * stesso gesto per sbloccare davvero l'uscita. Va chiamata una sola volta, al primo
 * tocco sulla pagina (qualsiasi tocco, non necessariamente su un pad).
 */
export function unlockAudioContext(): void {
  if (unlocked) return;
  unlocked = true;
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') {
    void ctx.resume();
  }
  const silence = ctx.createBuffer(1, 1, ctx.sampleRate);
  const source = ctx.createBufferSource();
  source.buffer = silence;
  source.connect(ctx.destination);
  source.start(0);
}

export function audioNow(): number {
  return getAudioContext().currentTime;
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

export function reverseBuffer(buffer: AudioBuffer): AudioBuffer {
  const ctx = getAudioContext();
  const reversed = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const source = buffer.getChannelData(channel);
    const dest = reversed.getChannelData(channel);
    for (let i = 0; i < source.length; i++) {
      dest[i] = source[source.length - 1 - i];
    }
  }
  return reversed;
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

export interface AdsrSettings {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

export const DEFAULT_ADSR: AdsrSettings = { attack: 0.002, decay: 0.05, sustain: 1, release: 0.05 };

export interface PlayVoiceOptions {
  gain?: number;
  loop?: boolean;
  playbackRate?: number;
  adsr?: AdsrSettings;
  /** Regione riprodotta, in secondi sul buffer originale (trim / loop point). */
  offset?: number;
  duration?: number;
  onEnded?: () => void;
}

export interface Voice {
  /** Note-off "morbido": applica il release dell'ADSR poi ferma la sorgente. */
  release(): void;
  /** Stop immediato con breve fade anti-click (choke). */
  stop(fadeSeconds?: number): void;
}

export function triggerSample(buffer: AudioBuffer, { gain = 1 } = {}): void {
  playVoice(buffer, { gain });
}

export function playVoice(buffer: AudioBuffer, options: PlayVoiceOptions = {}): Voice {
  const ctx = getAudioContext();
  const { gain = 1, loop = false, playbackRate = 1, adsr = DEFAULT_ADSR, offset = 0, duration, onEnded } = options;

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = playbackRate;
  source.loop = loop;
  if (loop) {
    source.loopStart = offset;
    source.loopEnd = duration !== undefined ? offset + duration : buffer.duration;
  }

  const gainNode = ctx.createGain();
  const now = ctx.currentTime;
  const sustainLevel = gain * adsr.sustain;

  gainNode.gain.setValueAtTime(0, now);
  gainNode.gain.linearRampToValueAtTime(gain, now + adsr.attack);
  gainNode.gain.linearRampToValueAtTime(sustainLevel, now + adsr.attack + adsr.decay);

  source.connect(gainNode).connect(ctx.destination);

  if (loop) {
    source.start(now, offset);
  } else {
    source.start(now, offset, duration);
  }

  let stopped = false;

  source.onended = () => {
    if (stopped) return;
    stopped = true;
    onEnded?.();
  };

  const fadeAndStop = (fadeSeconds: number) => {
    if (stopped) return;
    stopped = true;
    const t = ctx.currentTime;
    gainNode.gain.cancelScheduledValues(t);
    gainNode.gain.setValueAtTime(gainNode.gain.value, t);
    gainNode.gain.linearRampToValueAtTime(0, t + fadeSeconds);
    try {
      source.stop(t + fadeSeconds + 0.005);
    } catch {
      // già fermata
    }
    onEnded?.();
  };

  return {
    release: () => fadeAndStop(adsr.release),
    stop: (fadeSeconds = 0.01) => fadeAndStop(fadeSeconds),
  };
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && audioContext?.state === 'suspended') {
    void audioContext.resume();
  }
});
