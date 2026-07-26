export function renderPadGrid(container: HTMLElement, count = 16): HTMLButtonElement[] {
  const pads: HTMLButtonElement[] = [];

  for (let i = 0; i < count; i++) {
    const pad = document.createElement('button');
    pad.type = 'button';
    pad.className = 'pad';
    pad.dataset.index = String(i);
    pad.dataset.loaded = 'false';
    pad.setAttribute('role', 'gridcell');
    pad.setAttribute('aria-label', `Pad ${i + 1}`);

    const label = document.createElement('span');
    label.className = 'pad__label';
    label.textContent = String(i + 1).padStart(2, '0');
    pad.appendChild(label);

    container.appendChild(pad);
    pads.push(pad);
  }

  return pads;
}
