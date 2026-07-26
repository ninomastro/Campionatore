import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/jetbrains-mono/400.css';
import '../styles/main.css';

import { renderPadGrid } from './ui/pad-grid.ts';
import { setupDrawer, isPadSelectionTab } from './ui/drawer.ts';
import { createEditPanel } from './ui/edit-panel.ts';
import {
  audioNow,
  DEFAULT_ADSR,
  decodeBlob,
  loadSample,
  playVoice,
  resumeAudioContext,
  reverseBuffer,
  type Voice,
} from './audio/engine.ts';
import {
  getAllPadAssignments,
  getAllPadSettings,
  getAllSamples,
  savePadSettings,
  type PadSettingsRecord,
} from './storage/db.ts';

// Abilita il pseudo-stato :active al tocco su iOS Safari (altrimenti resta disattivato).
document.addEventListener('touchstart', () => {}, { passive: true });

const app = document.querySelector<HTMLDivElement>('#app')!;
const padGrid = app.querySelector<HTMLElement>('#pad-grid')!;
const statusIndicator = app.querySelector<HTMLElement>('#status-indicator')!;

const pads = renderPadGrid(padGrid, 16);
setupDrawer(app);

const padBuffers = new Map<number, AudioBuffer>();
const padSettingsMap = new Map<number, PadSettingsRecord>();
const activeVoicesByPad = new Map<number, Voice>();
const reversedBufferCache = new Map<number, AudioBuffer>();
const normalizeGainCache = new Map<number, number>();

const DEFAULT_PAD_SETTINGS: Omit<PadSettingsRecord, 'padIndex'> = {
  mode: 'oneshot',
  chokeGroup: null,
  adsr: { ...DEFAULT_ADSR },
  volume: 1,
  pitch: 0,
  trimStart: 0,
  trimEnd: 1,
  reversed: false,
  normalized: false,
};

function getPadSettings(index: number): PadSettingsRecord {
  return padSettingsMap.get(index) ?? { padIndex: index, ...DEFAULT_PAD_SETTINGS };
}

function updatePadSettings(index: number, patch: Partial<Omit<PadSettingsRecord, 'padIndex'>>): void {
  const next: PadSettingsRecord = { ...getPadSettings(index), ...patch, padIndex: index };
  padSettingsMap.set(index, next);
  if ('reversed' in patch) reversedBufferCache.delete(index);
  savePadSettings(next).catch((error) => console.error('Impossibile salvare le impostazioni del pad', index, error));
}

function markPadLoaded(index: number): void {
  const pad = pads[index];
  if (pad) pad.dataset.loaded = 'true';
}

function markPadEmpty(index: number): void {
  const pad = pads[index];
  if (pad) pad.dataset.loaded = 'false';
}

function getNormalizeGain(index: number, buffer: AudioBuffer): number {
  const cached = normalizeGainCache.get(index);
  if (cached !== undefined) return cached;
  let peak = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i]);
      if (abs > peak) peak = abs;
    }
  }
  const gain = peak > 0.0001 ? Math.min(4, 1 / peak) : 1;
  normalizeGainCache.set(index, gain);
  return gain;
}

function getEffectiveBuffer(index: number, buffer: AudioBuffer, settings: PadSettingsRecord): AudioBuffer {
  if (!settings.reversed) return buffer;
  const cached = reversedBufferCache.get(index);
  if (cached) return cached;
  const reversed = reverseBuffer(buffer);
  reversedBufferCache.set(index, reversed);
  return reversed;
}

function stopVoice(index: number): void {
  const voice = activeVoicesByPad.get(index);
  if (voice) {
    voice.stop();
    activeVoicesByPad.delete(index);
  }
}

function triggerPad(index: number, velocity: number): void {
  const buffer = padBuffers.get(index);
  if (!buffer) return;
  resumeAudioContext();

  const settings = getPadSettings(index);

  if (settings.chokeGroup !== null) {
    activeVoicesByPad.forEach((_voice, otherIndex) => {
      if (otherIndex === index) return;
      if (getPadSettings(otherIndex).chokeGroup === settings.chokeGroup) stopVoice(otherIndex);
    });
  }

  if (settings.mode === 'loop' && activeVoicesByPad.has(index)) {
    releasePad(index);
    return;
  }

  const effectiveBuffer = getEffectiveBuffer(index, buffer, settings);
  const normalizeGain = settings.normalized ? getNormalizeGain(index, effectiveBuffer) : 1;
  const gain = velocity * settings.volume * normalizeGain;
  const playbackRate = Math.pow(2, settings.pitch / 12);
  const trimStart = settings.trimStart * effectiveBuffer.duration;
  const trimEnd = settings.trimEnd * effectiveBuffer.duration;
  const duration = Math.max(0.005, trimEnd - trimStart);

  const voice = playVoice(effectiveBuffer, {
    gain,
    loop: settings.mode === 'loop',
    playbackRate,
    adsr: settings.adsr,
    offset: trimStart,
    duration,
    onEnded: () => {
      if (activeVoicesByPad.get(index) === voice) activeVoicesByPad.delete(index);
    },
  });
  activeVoicesByPad.set(index, voice);
}

function releasePad(index: number): void {
  const settings = getPadSettings(index);
  if (settings.mode !== 'gate' && settings.mode !== 'loop') return;
  const voice = activeVoicesByPad.get(index);
  if (voice) {
    voice.release();
    activeVoicesByPad.delete(index);
  }
}

const editPanel = createEditPanel(app, {
  pads,
  statusIndicator,
  getBuffer: (padIndex) => padBuffers.get(padIndex),
  getDisplayBuffer: (padIndex) => {
    const buffer = padBuffers.get(padIndex);
    if (!buffer) return undefined;
    return getEffectiveBuffer(padIndex, buffer, getPadSettings(padIndex));
  },
  getSettings: getPadSettings,
  updateSettings: updatePadSettings,
  onSampleReady: (padIndex, buffer) => {
    padBuffers.set(padIndex, buffer);
    reversedBufferCache.delete(padIndex);
    normalizeGainCache.delete(padIndex);
    markPadLoaded(padIndex);
  },
  onPreview: (padIndex) => {
    const buffer = padBuffers.get(padIndex);
    if (!buffer) return undefined;
    const settings = getPadSettings(padIndex);
    const willStop = settings.mode === 'loop' && activeVoicesByPad.has(padIndex);

    if (willStop) {
      triggerPad(padIndex, 1);
      return undefined;
    }

    const effectiveBuffer = getEffectiveBuffer(padIndex, buffer, settings);
    const trimStart = settings.trimStart * effectiveBuffer.duration;
    const trimEnd = settings.trimEnd * effectiveBuffer.duration;
    const regionDuration = Math.max(0.005, trimEnd - trimStart);
    const playbackRate = Math.pow(2, settings.pitch / 12);
    const startTime = audioNow();
    triggerPad(padIndex, 1);
    return { startTime, duration: regionDuration / playbackRate, loop: settings.mode === 'loop' };
  },
  onCleared: (padIndex) => {
    stopVoice(padIndex);
    padBuffers.delete(padIndex);
    reversedBufferCache.delete(padIndex);
    normalizeGainCache.delete(padIndex);
    markPadEmpty(padIndex);
  },
  onKitReset: () => {
    activeVoicesByPad.forEach((_voice, index) => stopVoice(index));
    padBuffers.clear();
    reversedBufferCache.clear();
    normalizeGainCache.clear();
    padSettingsMap.clear();
    pads.forEach((_pad, index) => markPadEmpty(index));
  },
});

pads.forEach((pad, index) => {
  pad.addEventListener('pointerdown', (event) => {
    if (isPadSelectionTab(app)) {
      editPanel.selectPad(index);
      return;
    }
    try {
      pad.setPointerCapture(event.pointerId);
    } catch {
      // non supportato: ininfluente, il gate/one-shot funziona comunque
    }
    const velocity = event.pointerType === 'mouse' ? 1 : event.pressure > 0 ? event.pressure : 1;
    triggerPad(index, velocity);
  });

  const release = () => releasePad(index);
  pad.addEventListener('pointerup', release);
  pad.addEventListener('pointercancel', release);
});

async function restorePersistedKit(): Promise<void> {
  const [samples, assignments, settingsRecords] = await Promise.all([
    getAllSamples(),
    getAllPadAssignments(),
    getAllPadSettings(),
  ]);

  settingsRecords.forEach((record) => padSettingsMap.set(record.padIndex, record));

  const samplesById = new Map(samples.map((sample) => [sample.id, sample]));

  await Promise.all(
    assignments.map(async ({ padIndex, sampleId }) => {
      const sample = samplesById.get(sampleId);
      if (!sample) return;
      try {
        const buffer = await decodeBlob(sample.blob);
        padBuffers.set(padIndex, buffer);
        markPadLoaded(padIndex);
        editPanel.setSampleName(padIndex, sample.name);
      } catch (error) {
        console.error('Impossibile decodificare il campione salvato', padIndex, error);
      }
    })
  );

  editPanel.refresh();
}

restorePersistedKit()
  .then(() => {
    if (padBuffers.has(0)) return;
    return loadSample(`${import.meta.env.BASE_URL}assets/samples/kick.wav`).then((buffer) => {
      padBuffers.set(0, buffer);
      markPadLoaded(0);
      editPanel.setSampleName(0, 'Kick (demo)');
      editPanel.refresh();
    });
  })
  .catch((error) => console.error('Impossibile ripristinare il kit', error));

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((error) => {
      console.error('Registrazione service worker fallita', error);
    });
  });
}
