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

/** Tab del drawer attualmente selezionata (indipendentemente dal fatto che il drawer sia aperto). */
export function getActiveTab(root: HTMLElement): string | undefined {
  const activeTab = root.querySelector<HTMLButtonElement>('.drawer-tabs__tab[aria-selected="true"]');
  return activeTab?.dataset.tab;
}

/** Vero quando il drawer è aperto su una tab che "possiede" il pad (Edit o Mix): il tap seleziona invece di suonare. */
export function isPadSelectionTab(root: HTMLElement): boolean {
  if (!isDrawerOpen(root)) return false;
  const tab = getActiveTab(root);
  return tab === 'edit' || tab === 'mix';
}
