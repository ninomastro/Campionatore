export function setupDrawer(root: HTMLElement): void {
  const handle = root.querySelector<HTMLButtonElement>('#drawer-handle');
  const drawer = root.querySelector<HTMLElement>('#drawer');
  const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>('.drawer-tabs__tab'));
  const panels = root.querySelectorAll<HTMLElement>('.drawer__panel');

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
      panels.forEach((panel) => {
        panel.hidden = panel.dataset.panel !== tab.dataset.tab;
      });
      if (drawer.hidden) {
        handle.setAttribute('aria-expanded', 'true');
        handle.textContent = '▼';
        drawer.hidden = false;
      }
    });
  });
}

export function isDrawerOpen(root: HTMLElement): boolean {
  const drawer = root.querySelector<HTMLElement>('#drawer');
  return !!drawer && !drawer.hidden;
}

export function isEditTabActive(root: HTMLElement): boolean {
  const activeTab = root.querySelector<HTMLButtonElement>('.drawer-tabs__tab[aria-selected="true"]');
  return activeTab?.dataset.tab === 'edit';
}
