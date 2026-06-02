import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import {
  decryptCredentials,
  encryptCredentials,
  isEncryptionKeyConfigured,
} from '@/lib/encryption-server';
import type { S3ConfigSavePayload } from '@/lib/s3-config-types';

export async function GET() {
  if (!isEncryptionKeyConfigured()) {
    return NextResponse.json(
      {
        error: 'Server encryption key is not configured',
        code: 'ENCRYPTION_NOT_CONFIGURED',
      },
      { status: 503 }
    );
  }

  const { supabase, user } = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('user_s3_configs')
    .select('provider, bucket, region, encrypted_credentials')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    console.error('[api/s3-config] load failed:', error.message);
    return NextResponse.json(
      { error: error.message, code: 'SAVE_FAILED' },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json({ config: null });
  }

  const credentials = decryptCredentials(data.encrypted_credentials);
  if (!credentials?.accessKeyId || !credentials?.secretAccessKey) {
    return NextResponse.json(
      {
        error: 'Could not decrypt stored credentials',
        code: 'DECRYPT_FAILED',
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    config: {
      provider: data.provider,
      bucket: data.bucket,
      region: data.region,
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        endpoint: credentials.endpoint,
        rootFolder: credentials.rootFolder,
      },
    },
  });
}

function parseSaveBody(body: unknown): S3ConfigSavePayload | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const creds = b.credentials as Record<string, unknown> | undefined;
  if (
    (b.provider !== 'aws' && b.provider !== 'digitalocean') ||
    typeof b.bucket !== 'string' ||
    typeof b.region !== 'string' ||
    !creds ||
    typeof creds.accessKeyId !== 'string' ||
    typeof creds.secretAccessKey !== 'string'
  ) {
    return null;
  }
  if (b.provider === 'digitalocean' && typeof creds.endpoint !== 'string') {
    return null;
  }
  return {
    provider: b.provider,
    bucket: b.bucket,
    region: b.region,
    credentials: {
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
      endpoint: typeof creds.endpoint === 'string' ? creds.endpoint : undefined,
      rootFolder: typeof creds.rootFolder === 'string' ? creds.rootFolder : undefined,
    },
  };
}

export async function POST(request: Request) {
  if (!isEncryptionKeyConfigured()) {
    return NextResponse.json(
      {
        error: 'Server encryption key is not configured',
        code: 'ENCRYPTION_NOT_CONFIGURED',
      },
      { status: 503 }
    );
  }

  const { supabase, user } = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body', code: 'INVALID_BODY' },
      { status: 400 }
    );
  }

  const payload = parseSaveBody(body);
  if (!payload) {
    return NextResponse.json(
      { error: 'Invalid configuration payload', code: 'INVALID_BODY' },
      { status: 400 }
    );
  }

  try {
    const encrypted_credentials = encryptCredentials({
      accessKeyId: payload.credentials.accessKeyId,
      secretAccessKey: payload.credentials.secretAccessKey,
      ...(payload.provider === 'digitalocean' && payload.credentials.endpoint
        ? { endpoint: payload.credentials.endpoint }
        : {}),
      ...(payload.credentials.rootFolder
        ? { rootFolder: payload.credentials.rootFolder }
        : {}),
    });

    const { error } = await supabase.from('user_s3_configs').upsert(
      {
        user_id: user.id,
        provider: payload.provider,
        bucket: payload.bucket,
        region: payload.region,
        encrypted_credentials,
      },
      { onConflict: 'user_id' }
    );

    if (error) {
      console.error('[api/s3-config] save failed:', error.message);
      return NextResponse.json(
        { error: error.message, code: 'SAVE_FAILED' },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/s3-config] encrypt/save error:', err);
    return NextResponse.json(
      { error: 'Failed to save configuration', code: 'SAVE_FAILED' },
      { status: 500 }
    );
  }
}
