export function setupDrawer(root: HTMLElement): void {
  const handle = root.querySelector<HTMLButtonElement>('#drawer-handle');
  const drawer = root.querySelector<HTMLElement>('#drawer');
  const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>('.drawer-tabs__tab'));

  if (!handle || !drawer) return;

  handle.addEventListener('click', () => {
    const expanded = handle.getAttribute('aria-expanded') === 'true';
    handle.setAttribute('aria-expanded', String(!expanded));
    handle.textContent = expanded ? '▲' : '▼';
    drawer.hidden = expanded;
  });

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
      if (drawer.hidden) {
        handle.setAttribute('aria-expanded', 'true');
        handle.textContent = '▼';
        drawer.hidden = false;
      }
    });
  });
}
