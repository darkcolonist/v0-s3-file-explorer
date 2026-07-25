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

const CONNECTIONS_CACHE_KEY_PREFIX = 's3-file-explorer-connections-summary';

function connectionsCacheKey(userId: string): string {
  return `${CONNECTIONS_CACHE_KEY_PREFIX}:${userId}`;
}

export function getStoredConnectionsSummary(userId: string): any[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(connectionsCacheKey(userId));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function storeConnectionsSummary(userId: string, configs: any[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(connectionsCacheKey(userId), JSON.stringify(configs));
  } catch {
    // ignore
  }
}

export function clearStoredConnectionsSummary(userId: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(connectionsCacheKey(userId));
  } catch {
    // ignore
  }
}

