export interface WaveformDrawOptions {
  trimStart?: number;
  trimEnd?: number;
}

function resizeForDpr(canvas: HTMLCanvasElement): { width: number; height: number } {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round((rect.width || canvas.clientWidth || 300) * dpr));
  const height = Math.max(1, Math.round((rect.height || 72) * dpr));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  return { width, height };
}

export function drawWaveform(
  canvas: HTMLCanvasElement,
  buffer: AudioBuffer | undefined,
  options: WaveformDrawOptions = {}
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const { width, height } = resizeForDpr(canvas);
  const styles = getComputedStyle(canvas);
  const waveColor = styles.getPropertyValue('--color-teal').trim() || '#4FA8A0';
  const dimColor = styles.getPropertyValue('--color-border').trim() || '#33363E';

  ctx.clearRect(0, 0, width, height);

  if (!buffer) {
    ctx.strokeStyle = dimColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
    return;
  }

  const data = buffer.getChannelData(0);
  const step = data.length / width;
  const mid = height / 2;

  ctx.fillStyle = waveColor;
  for (let x = 0; x < width; x++) {
    const start = Math.floor(x * step);
    const end = Math.min(data.length, Math.floor((x + 1) * step) + 1);
    let min = 0;
    let max = 0;
    for (let i = start; i < end; i++) {
      const value = data[i];
      if (value < min) min = value;
      if (value > max) max = value;
    }
    const y1 = mid + min * mid;
    const y2 = mid + max * mid;
    ctx.fillRect(x, y1, 1, Math.max(1, y2 - y1));
  }

  const trimStart = options.trimStart ?? 0;
  const trimEnd = options.trimEnd ?? 1;
  ctx.fillStyle = 'rgba(22, 23, 26, 0.65)';
  if (trimStart > 0) ctx.fillRect(0, 0, trimStart * width, height);
  if (trimEnd < 1) ctx.fillRect(trimEnd * width, 0, (1 - trimEnd) * width, height);
}

export function drawPlayhead(canvas: HTMLCanvasElement, progress: number): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const width = canvas.width;
  const height = canvas.height;
  const styles = getComputedStyle(canvas);
  const color = styles.getPropertyValue('--color-amber').trim() || '#E8A33D';

  const x = Math.max(0, Math.min(width - 1, progress * width));
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, height);
  ctx.stroke();
}
