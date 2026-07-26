import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/jetbrains-mono/400.css';
import '../styles/main.css';

import { renderPadGrid } from './ui/pad-grid.ts';
import { setupDrawer } from './ui/drawer.ts';

const app = document.querySelector<HTMLDivElement>('#app')!;
const padGrid = app.querySelector<HTMLElement>('#pad-grid')!;

renderPadGrid(padGrid, 16);
setupDrawer(app);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((error) => {
      console.error('Registrazione service worker fallita', error);
    });
  });
}
