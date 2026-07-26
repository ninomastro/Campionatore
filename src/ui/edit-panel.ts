import { audioNow, createMicAnalyser, decodeBlob, resumeAudioContext } from '../audio/engine.ts';
import { requestMicStream, startRecording, type ActiveRecording } from '../audio/recorder.ts';
import {
  assignPadSample,
  clearAllPadAssignments,
  clearAllPadSettings,
  clearAllSamples,
  clearPadAssignment,
  saveSample,
  type PadSettingsRecord,
  type PlaybackMode,
} from '../storage/db.ts';
import { drawPlayhead, drawWaveform } from './waveform.ts';

export interface PreviewTiming {
  startTime: number;
  duration: number;
  loop: boolean;
}

export interface EditPanelOptions {
  pads: HTMLButtonElement[];
  statusIndicator: HTMLElement;
  getBuffer: (padIndex: number) => AudioBuffer | undefined;
  getDisplayBuffer: (padIndex: number) => AudioBuffer | undefined;
  getSettings: (padIndex: number) => PadSettingsRecord;
  updateSettings: (padIndex: number, patch: Partial<Omit<PadSettingsRecord, 'padIndex'>>) => void;
  onSampleReady: (padIndex: number, buffer: AudioBuffer) => void;
  onPreview: (padIndex: number) => PreviewTiming | undefined;
  onCleared: (padIndex: number) => void;
  onKitReset: () => void;
}

export interface EditPanel {
  selectPad(index: number): void;
  setSampleName(padIndex: number, name: string): void;
  refresh(): void;
}

const MODE_CYCLE: PlaybackMode[] = ['oneshot', 'gate', 'loop'];
const MODE_LABELS: Record<PlaybackMode, string> = { oneshot: 'One', gate: 'Gate', loop: 'Loop' };
const CHOKE_CYCLE: Array<number | null> = [null, 1, 2, 3, 4];
const CHOKE_LABELS: Record<string, string> = { '1': 'A', '2': 'B', '3': 'C', '4': 'D' };

function describeMicError(error: unknown): string {
  if (error instanceof DOMException) {
    switch (error.name) {
      case 'NotAllowedError':
        return 'Permesso microfono negato. Controlla le impostazioni del browser (icona lucchetto nella barra indirizzi) e del sistema.';
      case 'NotFoundError':
        return 'Nessun microfono trovato.';
      case 'NotReadableError':
        return 'Il microfono è occupato da un\'altra app.';
      default:
        return `Errore microfono: ${error.name}`;
    }
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return 'Registrazione non supportata in questo browser/finestra (prova in una scheda del browser, non in un\'anteprima integrata).';
  }
  return 'Errore microfono sconosciuto.';
}

export function createEditPanel(root: HTMLElement, options: EditPanelOptions): EditPanel {
  const {
    pads,
    statusIndicator,
    getBuffer,
    getDisplayBuffer,
    getSettings,
    updateSettings,
    onSampleReady,
    onPreview,
    onCleared,
    onKitReset,
  } = options;

  const padTarget = root.querySelector<HTMLElement>('#edit-pad-target')!;
  const sampleNameLabel = root.querySelector<HTMLElement>('#edit-sample-name')!;
  const loadButton = root.querySelector<HTMLButtonElement>('#load-button')!;
  const recordButton = root.querySelector<HTMLButtonElement>('#record-button')!;
  const previewButton = root.querySelector<HTMLButtonElement>('#preview-button')!;
  const fileInput = root.querySelector<HTMLInputElement>('#file-input')!;
  const statusLabel = root.querySelector<HTMLElement>('#edit-status')!;
  const meter = root.querySelector<HTMLElement>('#edit-meter')!;
  const meterFill = root.querySelector<HTMLElement>('#edit-meter-fill')!;
  const modeButton = root.querySelector<HTMLButtonElement>('#mode-button')!;
  const chokeButton = root.querySelector<HTMLButtonElement>('#choke-button')!;
  const adsrAttack = root.querySelector<HTMLInputElement>('#adsr-attack')!;
  const adsrDecay = root.querySelector<HTMLInputElement>('#adsr-decay')!;
  const adsrSustain = root.querySelector<HTMLInputElement>('#adsr-sustain')!;
  const adsrRelease = root.querySelector<HTMLInputElement>('#adsr-release')!;
  const clearPadButton = root.querySelector<HTMLButtonElement>('#clear-pad-button')!;
  const resetKitButton = root.querySelector<HTMLButtonElement>('#reset-kit-button')!;
  const mixPadTarget = root.querySelector<HTMLElement>('#mix-pad-target')!;
  const mixVolume = root.querySelector<HTMLInputElement>('#mix-volume')!;
  const mixPitch = root.querySelector<HTMLInputElement>('#mix-pitch')!;
  const waveformCanvas = root.querySelector<HTMLCanvasElement>('#edit-waveform')!;
  const trimStartInput = root.querySelector<HTMLInputElement>('#trim-start')!;
  const trimEndInput = root.querySelector<HTMLInputElement>('#trim-end')!;
  const revButton = root.querySelector<HTMLButtonElement>('#rev-button')!;
  const normButton = root.querySelector<HTMLButtonElement>('#norm-button')!;

  const padNames = new Map<number, string>();
  let selectedPad = 0;
  let activeRecording: ActiveRecording | null = null;
  let meterFrame: number | null = null;
  let scanlineFrame: number | null = null;

  function stopScanline() {
    if (scanlineFrame !== null) {
      cancelAnimationFrame(scanlineFrame);
      scanlineFrame = null;
    }
    renderWaveform();
  }

  function startScanline(padIndex: number, timing: PreviewTiming) {
    stopScanline();
    const settings = getSettings(padIndex);
    const tick = () => {
      const elapsed = audioNow() - timing.startTime;
      let progress = timing.duration > 0 ? elapsed / timing.duration : 1;
      if (timing.loop) {
        progress = progress % 1;
      } else if (progress >= 1) {
        stopScanline();
        return;
      }
      renderWaveform();
      drawPlayhead(waveformCanvas, settings.trimStart + progress * (settings.trimEnd - settings.trimStart));
      scanlineFrame = requestAnimationFrame(tick);
    };
    scanlineFrame = requestAnimationFrame(tick);
  }

  function renderWaveform() {
    const settings = getSettings(selectedPad);
    drawWaveform(waveformCanvas, getDisplayBuffer(selectedPad), {
      trimStart: settings.trimStart,
      trimEnd: settings.trimEnd,
    });
  }

  function render() {
    pads.forEach((pad, index) => {
      pad.dataset.selected = String(index === selectedPad);
    });
    const label = `Pad ${String(selectedPad + 1).padStart(2, '0')}`;
    padTarget.textContent = label;
    mixPadTarget.textContent = label;
    sampleNameLabel.textContent = padNames.get(selectedPad) ?? 'Vuoto';

    const hasBuffer = !!getBuffer(selectedPad);
    previewButton.disabled = !hasBuffer;
    clearPadButton.disabled = !hasBuffer;

    const settings = getSettings(selectedPad);
    modeButton.textContent = `Mode: ${MODE_LABELS[settings.mode]}`;
    chokeButton.textContent = `Choke: ${settings.chokeGroup === null ? 'Off' : CHOKE_LABELS[String(settings.chokeGroup)]}`;
    adsrAttack.value = String(settings.adsr.attack);
    adsrDecay.value = String(settings.adsr.decay);
    adsrSustain.value = String(settings.adsr.sustain);
    adsrRelease.value = String(settings.adsr.release);
    mixVolume.value = String(settings.volume);
    mixPitch.value = String(settings.pitch);
    trimStartInput.value = String(settings.trimStart);
    trimEndInput.value = String(settings.trimEnd);
    revButton.textContent = `Rev: ${settings.reversed ? 'On' : 'Off'}`;
    normButton.textContent = `Norm: ${settings.normalized ? 'On' : 'Off'}`;

    renderWaveform();
  }

  function setStatus(message: string, tone: 'error' | 'info' | 'idle' = 'idle') {
    statusLabel.textContent = message;
    statusLabel.dataset.tone = tone;
  }

  function startMeter(stream: MediaStream) {
    const analyser = createMicAnalyser(stream);
    const data = new Uint8Array(analyser.frequencyBinCount);
    meter.hidden = false;

    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let peak = 0;
      for (let i = 0; i < data.length; i++) {
        const value = Math.abs(data[i] - 128) / 128;
        if (value > peak) peak = value;
      }
      meterFill.style.transform = `scaleX(${Math.min(1, peak * 1.4)})`;
      meterFrame = requestAnimationFrame(tick);
    };
    tick();
  }

  function stopMeter() {
    if (meterFrame !== null) {
      cancelAnimationFrame(meterFrame);
      meterFrame = null;
    }
    meter.hidden = true;
    meterFill.style.transform = 'scaleX(0)';
  }

  async function assignBlob(blob: Blob, name: string): Promise<void> {
    const buffer = await decodeBlob(blob);
    const id = crypto.randomUUID();
    await saveSample({ id, name, blob, createdAt: Date.now() });
    await assignPadSample(selectedPad, id);
    onSampleReady(selectedPad, buffer);
    padNames.set(selectedPad, name);
    render();
    setStatus(`Salvato su Pad ${String(selectedPad + 1).padStart(2, '0')}`, 'info');
  }

  loadButton.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    setStatus('Importazione…', 'info');
    assignBlob(file, file.name).catch((error) => {
      console.error('Import campione fallito', error);
      setStatus('Impossibile importare questo file audio.', 'error');
    });
  });

  previewButton.addEventListener('click', () => {
    if (!getBuffer(selectedPad)) return;
    resumeAudioContext();
    stopScanline();
    const timing = onPreview(selectedPad);
    if (timing) startScanline(selectedPad, timing);
  });

  modeButton.addEventListener('click', () => {
    const current = getSettings(selectedPad).mode;
    const next = MODE_CYCLE[(MODE_CYCLE.indexOf(current) + 1) % MODE_CYCLE.length];
    updateSettings(selectedPad, { mode: next });
    render();
  });

  chokeButton.addEventListener('click', () => {
    const current = getSettings(selectedPad).chokeGroup;
    const next = CHOKE_CYCLE[(CHOKE_CYCLE.indexOf(current) + 1) % CHOKE_CYCLE.length];
    updateSettings(selectedPad, { chokeGroup: next });
    render();
  });

  adsrAttack.addEventListener('input', () => {
    updateSettings(selectedPad, { adsr: { ...getSettings(selectedPad).adsr, attack: Number(adsrAttack.value) } });
  });
  adsrDecay.addEventListener('input', () => {
    updateSettings(selectedPad, { adsr: { ...getSettings(selectedPad).adsr, decay: Number(adsrDecay.value) } });
  });
  adsrSustain.addEventListener('input', () => {
    updateSettings(selectedPad, { adsr: { ...getSettings(selectedPad).adsr, sustain: Number(adsrSustain.value) } });
  });
  adsrRelease.addEventListener('input', () => {
    updateSettings(selectedPad, { adsr: { ...getSettings(selectedPad).adsr, release: Number(adsrRelease.value) } });
  });

  mixVolume.addEventListener('input', () => {
    updateSettings(selectedPad, { volume: Number(mixVolume.value) });
  });
  mixPitch.addEventListener('input', () => {
    updateSettings(selectedPad, { pitch: Number(mixPitch.value) });
  });

  trimStartInput.addEventListener('input', () => {
    const end = getSettings(selectedPad).trimEnd;
    const start = Math.min(Number(trimStartInput.value), Math.max(0, end - 0.01));
    trimStartInput.value = String(start);
    updateSettings(selectedPad, { trimStart: start });
    renderWaveform();
  });

  trimEndInput.addEventListener('input', () => {
    const start = getSettings(selectedPad).trimStart;
    const end = Math.max(Number(trimEndInput.value), Math.min(1, start + 0.01));
    trimEndInput.value = String(end);
    updateSettings(selectedPad, { trimEnd: end });
    renderWaveform();
  });

  revButton.addEventListener('click', () => {
    const next = !getSettings(selectedPad).reversed;
    updateSettings(selectedPad, { reversed: next });
    render();
  });

  normButton.addEventListener('click', () => {
    const next = !getSettings(selectedPad).normalized;
    updateSettings(selectedPad, { normalized: next });
    render();
  });

  clearPadButton.addEventListener('click', () => {
    if (!getBuffer(selectedPad)) return;
    const label = String(selectedPad + 1).padStart(2, '0');
    const confirmed = window.confirm(
      `Svuotare il Pad ${label}? Il campione resta disponibile se assegnato ad altri pad.`
    );
    if (!confirmed) return;
    clearPadAssignment(selectedPad)
      .then(() => {
        padNames.delete(selectedPad);
        onCleared(selectedPad);
        render();
        setStatus(`Pad ${label} svuotato.`, 'info');
      })
      .catch((error) => {
        console.error('Impossibile svuotare il pad', error);
        setStatus('Impossibile svuotare il pad.', 'error');
      });
  });

  resetKitButton.addEventListener('click', () => {
    const confirmed = window.confirm(
      'Reset completo del kit: elimina TUTTI i campioni e le impostazioni di tutti i pad. Azione irreversibile. Continuare?'
    );
    if (!confirmed) return;
    Promise.all([clearAllPadAssignments(), clearAllSamples(), clearAllPadSettings()])
      .then(() => {
        padNames.clear();
        onKitReset();
        render();
        setStatus('Kit resettato.', 'info');
      })
      .catch((error) => {
        console.error('Impossibile resettare il kit', error);
        setStatus('Impossibile resettare il kit.', 'error');
      });
  });

  recordButton.addEventListener('click', () => {
    if (activeRecording) {
      const recording = activeRecording;
      activeRecording = null;
      recordButton.textContent = 'Rec';
      recordButton.dataset.recording = 'false';
      statusIndicator.dataset.state = 'idle';
      stopMeter();
      setStatus('Salvataggio registrazione…', 'info');
      recording
        .stop()
        .then((blob) => {
          const name = `Registrazione ${new Date().toLocaleTimeString('it-IT')}`;
          return assignBlob(blob, name);
        })
        .catch((error) => {
          console.error('Salvataggio registrazione fallito', error);
          setStatus('Impossibile salvare la registrazione.', 'error');
        });
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus(describeMicError(undefined), 'error');
      return;
    }

    resumeAudioContext();
    setStatus('Richiesta permesso microfono…', 'info');
    requestMicStream()
      .then((stream) => {
        activeRecording = startRecording(stream);
        recordButton.textContent = 'Stop';
        recordButton.dataset.recording = 'true';
        statusIndicator.dataset.state = 'recording';
        setStatus('Registrazione in corso…', 'info');
        startMeter(stream);
      })
      .catch((error) => {
        console.error('Accesso al microfono negato', error);
        setStatus(describeMicError(error), 'error');
      });
  });

  // Ridisegna la waveform quando il canvas cambia dimensione (es. apertura del drawer,
  // che porta il canvas da display:none a una larghezza reale).
  new ResizeObserver(() => renderWaveform()).observe(waveformCanvas);

  render();

  return {
    selectPad(index: number) {
      selectedPad = index;
      setStatus('', 'idle');
      stopScanline();
      render();
    },
    setSampleName(padIndex: number, name: string) {
      if (name) padNames.set(padIndex, name);
      else padNames.delete(padIndex);
      if (padIndex === selectedPad) render();
    },
    refresh() {
      render();
    },
  };
}
