import { createMicAnalyser, decodeBlob, resumeAudioContext, triggerSample } from '../audio/engine.ts';
import { requestMicStream, startRecording, type ActiveRecording } from '../audio/recorder.ts';
import { assignPadSample, saveSample } from '../storage/db.ts';

export interface EditPanelOptions {
  pads: HTMLButtonElement[];
  statusIndicator: HTMLElement;
  onSampleReady: (padIndex: number, buffer: AudioBuffer) => void;
  getBuffer: (padIndex: number) => AudioBuffer | undefined;
}

export interface EditPanel {
  selectPad(index: number): void;
  setSampleName(padIndex: number, name: string): void;
}

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
  const { pads, statusIndicator, onSampleReady, getBuffer } = options;
  const padTarget = root.querySelector<HTMLElement>('#edit-pad-target')!;
  const sampleNameLabel = root.querySelector<HTMLElement>('#edit-sample-name')!;
  const loadButton = root.querySelector<HTMLButtonElement>('#load-button')!;
  const recordButton = root.querySelector<HTMLButtonElement>('#record-button')!;
  const previewButton = root.querySelector<HTMLButtonElement>('#preview-button')!;
  const fileInput = root.querySelector<HTMLInputElement>('#file-input')!;
  const statusLabel = root.querySelector<HTMLElement>('#edit-status')!;
  const meter = root.querySelector<HTMLElement>('#edit-meter')!;
  const meterFill = root.querySelector<HTMLElement>('#edit-meter-fill')!;

  const padNames = new Map<number, string>();
  let selectedPad = 0;
  let activeRecording: ActiveRecording | null = null;
  let meterFrame: number | null = null;

  function render() {
    pads.forEach((pad, index) => {
      pad.dataset.selected = String(index === selectedPad);
    });
    padTarget.textContent = `Pad ${String(selectedPad + 1).padStart(2, '0')}`;
    sampleNameLabel.textContent = padNames.get(selectedPad) ?? 'Vuoto';
    previewButton.disabled = !getBuffer(selectedPad);
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
    const buffer = getBuffer(selectedPad);
    if (!buffer) return;
    resumeAudioContext();
    triggerSample(buffer);
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

  render();

  return {
    selectPad(index: number) {
      selectedPad = index;
      setStatus('', 'idle');
      render();
    },
    setSampleName(padIndex: number, name: string) {
      padNames.set(padIndex, name);
      if (padIndex === selectedPad) render();
    },
  };
}
