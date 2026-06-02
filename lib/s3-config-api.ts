import type { S3ConfigApiData, S3ConfigApiErrorCode, S3ConfigSavePayload } from '@/lib/s3-config-types';

export type S3ConfigFetchResult =
  | { ok: true; config: S3ConfigApiData | null }
  | { ok: false; code: S3ConfigApiErrorCode; message: string };

export type S3ConfigSaveResult =
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

export async function fetchS3ConfigFromApi(): Promise<S3ConfigFetchResult> {
  const res = await fetch('/api/s3-config', {
    method: 'GET',
    credentials: 'include',
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

  return { ok: true };
}
