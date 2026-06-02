export type ExplorerViewMode = 'list' | 'grid';

const VIEW_MODE_STORAGE_KEY = 's3-file-explorer-view-mode';

export function getStoredViewMode(): ExplorerViewMode {
  if (typeof window === 'undefined') return 'list';
  try {
    const stored = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    if (stored === 'list' || stored === 'grid') return stored;
  } catch {
    // ignore quota / private mode
  }
  return 'list';
}

export function storeViewMode(mode: ExplorerViewMode): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
  } catch {
    // ignore
  }
}
