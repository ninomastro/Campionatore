import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/jetbrains-mono/400.css';
import '../styles/main.css';

import { renderPadGrid } from './ui/pad-grid.ts';
import { setupDrawer } from './ui/drawer.ts';
import { loadSample, resumeAudioContext, triggerSample } from './audio/engine.ts';

// Abilita il pseudo-stato :active al tocco su iOS Safari (altrimenti resta disattivato).
document.addEventListener('touchstart', () => {}, { passive: true });

const app = document.querySelector<HTMLDivElement>('#app')!;
const padGrid = app.querySelector<HTMLElement>('#pad-grid')!;

const pads = renderPadGrid(padGrid, 16);
setupDrawer(app);

const kickBuffer = loadSample(`${import.meta.env.BASE_URL}assets/samples/kick.wav`);
const hardcodedPad = pads[0];
if (hardcodedPad) {
  hardcodedPad.dataset.loaded = 'true';
  hardcodedPad.addEventListener('pointerdown', () => {
    resumeAudioContext();
    kickBuffer
      .then((buffer) => triggerSample(buffer))
      .catch((error) => console.error('Impossibile riprodurre il campione', error));
  });
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((error) => {
      console.error('Registrazione service worker fallita', error);
    });
  });
}
