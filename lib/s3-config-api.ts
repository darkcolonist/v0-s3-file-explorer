import type {
  S3ConfigApiData,
  S3ConfigApiErrorCode,
  S3ConfigSavePayload,
  S3ConfigSummary,
} from '@/lib/s3-config-types';

export type S3ConfigFetchResult =
  | { ok: true; config: S3ConfigApiData | null }
  | { ok: false; code: S3ConfigApiErrorCode; message: string };

export type S3ConfigListResult =
  | { ok: true; configs: S3ConfigSummary[] }
  | { ok: false; code: S3ConfigApiErrorCode; message: string };

export type S3ConfigSaveResult =
  | { ok: true; id: string }
  | { ok: false; code: S3ConfigApiErrorCode; message: string };

export type S3ConfigDeleteResult =
  | { ok: true }
  | { ok: false; code: S3ConfigApiErrorCode; message: string };

async function parseApiError(
  res: Response
): Promise<{ code: S3ConfigApiErrorCode; message: string }> {
  try {
    const body = await res.json();
    return {
      code: (body.code as S3ConfigApiErrorCode) ?? 'SAVE_FAILED',
      message: body.error ?? res.statusText,
    };
  } catch {
    return { code: 'SAVE_FAILED', message: res.statusText || 'Request failed' };
  }
}

export async function fetchS3ConfigListFromApi(): Promise<S3ConfigListResult> {
  const res = await fetch('/api/s3-config', {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
  });

  if (!res.ok) {
    const err = await parseApiError(res);
    return { ok: false, ...err };
  }

  const data = await res.json();
  return { ok: true, configs: (data.configs ?? []) as S3ConfigSummary[] };
}

export async function fetchS3ConfigFromApi(id: string): Promise<S3ConfigFetchResult> {
  const res = await fetch(`/api/s3-config?id=${encodeURIComponent(id)}`, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
  });

  if (res.status === 404) {
    return { ok: true, config: null };
  }

  if (!res.ok) {
    const err = await parseApiError(res);
    return { ok: false, ...err };
  }

  const data = await res.json();
  if (!data.config) {
    return { ok: true, config: null };
  }
  return { ok: true, config: data.config as S3ConfigApiData };
}

export async function saveS3ConfigToApi(payload: S3ConfigSavePayload): Promise<S3ConfigSaveResult> {
  const res = await fetch('/api/s3-config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await parseApiError(res);
    return { ok: false, ...err };
  }

  const data = await res.json();
  return { ok: true, id: data.id as string };
}

export async function deleteS3ConfigFromApi(id: string): Promise<S3ConfigDeleteResult> {
  const res = await fetch(`/api/s3-config?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'include',
  });

  if (!res.ok) {
    const err = await parseApiError(res);
    return { ok: false, ...err };
  }

  return { ok: true };
}
