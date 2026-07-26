# Campionatore

PWA che replica le funzionalità di un campionatore hardware (tipo MPC/SP-404): pad grid touch, editor waveform, kit salvati offline in IndexedDB, installabile su home screen.

Stack: Vite + TypeScript vanilla, Web Audio API, IndexedDB, Service Worker.

## Sviluppo

```
npm install
npm run dev
```

## Build

```
npm run build
npm run preview
```

Il build usa `base: /Campionatore/` per il deploy su GitHub Pages (repo di progetto, non user/org page).

## Stato

In sviluppo secondo la roadmap: shell PWA → motore audio minimo → import campioni + IndexedDB → griglia pad completa → editor waveform → design pass → effetti/sequencer.
