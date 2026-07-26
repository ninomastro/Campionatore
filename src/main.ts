import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/jetbrains-mono/400.css';
import '../styles/main.css';

import { renderPadGrid } from './ui/pad-grid.ts';
import { setupDrawer, isDrawerOpen, isEditTabActive } from './ui/drawer.ts';
import { createEditPanel } from './ui/edit-panel.ts';
import { decodeBlob, loadSample, resumeAudioContext, triggerSample } from './audio/engine.ts';
import { getAllPadAssignments, getAllSamples } from './storage/db.ts';

// Abilita il pseudo-stato :active al tocco su iOS Safari (altrimenti resta disattivato).
document.addEventListener('touchstart', () => {}, { passive: true });

const app = document.querySelector<HTMLDivElement>('#app')!;
const padGrid = app.querySelector<HTMLElement>('#pad-grid')!;
const statusIndicator = app.querySelector<HTMLElement>('#status-indicator')!;

const pads = renderPadGrid(padGrid, 16);
setupDrawer(app);

const padBuffers = new Map<number, AudioBuffer>();

function markPadLoaded(index: number): void {
  const pad = pads[index];
  if (pad) pad.dataset.loaded = 'true';
}

const editPanel = createEditPanel(app, {
  pads,
  statusIndicator,
  getBuffer: (padIndex) => padBuffers.get(padIndex),
  onSampleReady: (padIndex, buffer) => {
    padBuffers.set(padIndex, buffer);
    markPadLoaded(padIndex);
  },
});

pads.forEach((pad, index) => {
  pad.addEventListener('pointerdown', () => {
    if (isDrawerOpen(app) && isEditTabActive(app)) {
      editPanel.selectPad(index);
      return;
    }
    resumeAudioContext();
    const buffer = padBuffers.get(index);
    if (buffer) triggerSample(buffer);
  });
});

async function restorePersistedKit(): Promise<void> {
  const [samples, assignments] = await Promise.all([getAllSamples(), getAllPadAssignments()]);
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
}

restorePersistedKit()
  .then(() => {
    if (padBuffers.has(0)) return;
    return loadSample(`${import.meta.env.BASE_URL}assets/samples/kick.wav`).then((buffer) => {
      padBuffers.set(0, buffer);
      markPadLoaded(0);
      editPanel.setSampleName(0, 'Kick (demo)');
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
