import type { S3ConfigSavePayload, S3Provider, S3StoredCredentials } from '@/lib/s3-config-types';

export const S3_CONFIG_EXPORT_VERSION = 1;

export type S3ConfigExportData = {
  version: number;
  name: string;
  provider: S3Provider;
  bucket: string;
  region: string;
  credentials: S3StoredCredentials;
};

export function buildExportPayload(input: {
  name: string;
  provider: S3Provider;
  bucket: string;
  region: string;
  credentials: S3StoredCredentials;
}): S3ConfigExportData {
  return {
    version: S3_CONFIG_EXPORT_VERSION,
    name: input.name.trim(),
    provider: input.provider,
    bucket: input.bucket.trim(),
    region: input.region.trim(),
    credentials: {
      accessKeyId: input.credentials.accessKeyId.trim(),
      secretAccessKey: input.credentials.secretAccessKey,
      ...(input.credentials.endpoint?.trim()
        ? { endpoint: input.credentials.endpoint.trim() }
        : {}),
      ...(input.credentials.rootFolder !== undefined
        ? { rootFolder: input.credentials.rootFolder }
        : {}),
    },
  };
}

export function downloadExportJson(data: S3ConfigExportData, filename?: string): void {
  const safeName = data.name.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'connection';
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename ?? `${safeName}-s3-connection.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

type ImportResult =
  | { ok: true; payload: S3ConfigSavePayload }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(obj: Record<string, unknown>, key: string): string | null {
  const value = obj[key];
  return typeof value === 'string' ? value.trim() : null;
}

export function parseImportJson(raw: unknown): ImportResult {
  if (!isRecord(raw)) {
    return { ok: false, error: 'Invalid JSON: expected an object' };
  }

  const version = raw.version;
  if (version !== S3_CONFIG_EXPORT_VERSION) {
    return {
      ok: false,
      error: `Unsupported export version (${String(version)}). Expected version ${S3_CONFIG_EXPORT_VERSION}.`,
    };
  }

  const name = readString(raw, 'name');
  const bucket = readString(raw, 'bucket');
  const region = readString(raw, 'region');
  const provider = raw.provider;

  if (!name || !bucket || !region) {
    return { ok: false, error: 'Missing required fields: name, bucket, or region' };
  }

  if (provider !== 'aws' && provider !== 'digitalocean') {
    return { ok: false, error: 'Invalid provider (expected "aws" or "digitalocean")' };
  }

  if (!isRecord(raw.credentials)) {
    return { ok: false, error: 'Missing or invalid credentials object' };
  }

  const accessKeyId = readString(raw.credentials, 'accessKeyId');
  const secretAccessKey = readString(raw.credentials, 'secretAccessKey');
  if (!accessKeyId || !secretAccessKey) {
    return { ok: false, error: 'Credentials must include accessKeyId and secretAccessKey' };
  }

  if (provider === 'digitalocean') {
    const endpoint = readString(raw.credentials, 'endpoint');
    if (!endpoint) {
      return { ok: false, error: 'DigitalOcean connections require an endpoint in credentials' };
    }
  }

  const endpoint = readString(raw.credentials, 'endpoint');
  const rootFolder =
    typeof raw.credentials.rootFolder === 'string' ? raw.credentials.rootFolder : '';

  return {
    ok: true,
    payload: {
      name,
      provider,
      bucket,
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
        ...(endpoint ? { endpoint } : {}),
        rootFolder,
      },
    },
  };
}

/** Pick a unused connection name; appends -00, -01, … when the base name already exists. */
export function resolveUniqueConnectionName(
  desiredName: string,
  existingNames: string[]
): string {
  const base = desiredName.trim();
  const taken = new Set(existingNames.map((n) => n.trim().toLowerCase()));

  if (!taken.has(base.toLowerCase())) {
    return base;
  }

  for (let i = 0; i < 1000; i++) {
    const candidate = `${base}-${String(i).padStart(2, '0')}`;
    if (!taken.has(candidate.toLowerCase())) {
      return candidate;
    }
  }

  return `${base}-${Date.now()}`;
}
