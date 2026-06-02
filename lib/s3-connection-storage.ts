const STORAGE_KEY_PREFIX = 's3-file-explorer-active-connection';

function storageKey(userId: string): string {
  return `${STORAGE_KEY_PREFIX}:${userId}`;
}

export function getStoredConnectionId(userId: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(storageKey(userId));
  } catch {
    return null;
  }
}

export function storeConnectionId(userId: string, connectionId: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(storageKey(userId), connectionId);
  } catch {
    // ignore quota / private mode
  }
}

export function clearStoredConnectionId(userId: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(storageKey(userId));
  } catch {
    // ignore
  }
}
