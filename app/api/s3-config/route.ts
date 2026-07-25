import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import {
  decryptCredentials,
  encryptCredentials,
  isEncryptionKeyConfigured,
} from '@/lib/encryption-server';
import type { S3ConfigSavePayload } from '@/lib/s3-config-types';

function configToResponse(data: {
  id: string;
  name: string;
  provider: string;
  bucket: string;
  region: string;
  encrypted_credentials: string;
}) {
  const credentials = decryptCredentials(data.encrypted_credentials);
  if (!credentials?.accessKeyId || !credentials?.secretAccessKey) {
    return null;
  }

  return {
    id: data.id,
    name: data.name,
    provider: data.provider,
    bucket: data.bucket,
    region: data.region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      endpoint: credentials.endpoint,
      rootFolder: credentials.rootFolder,
      publicAccess: Boolean(credentials.publicAccess),
      customCdnUrl: credentials.customCdnUrl,
    },
  };
}

export async function GET(request: Request) {
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

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (id) {
    const { data, error } = await supabase
      .from('user_s3_configs')
      .select('id, name, provider, bucket, region, encrypted_credentials')
      .eq('user_id', user.id)
      .eq('id', id)
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

    const config = configToResponse(data);
    if (!config) {
      return NextResponse.json(
        {
          error: 'Could not decrypt stored credentials',
          code: 'DECRYPT_FAILED',
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ config });
  }

  const { data, error } = await supabase
    .from('user_s3_configs')
    .select('id, name, provider, bucket, region, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[api/s3-config] list failed:', error.message);
    return NextResponse.json(
      { error: error.message, code: 'SAVE_FAILED' },
      { status: 500 }
    );
  }

  return NextResponse.json({ configs: data ?? [] });
}

function parseSaveBody(body: unknown): S3ConfigSavePayload | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const creds = b.credentials as Record<string, unknown> | undefined;
  if (
    typeof b.name !== 'string' ||
    !b.name.trim() ||
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
    id: typeof b.id === 'string' ? b.id : undefined,
    name: b.name.trim(),
    provider: b.provider,
    bucket: b.bucket,
    region: b.region,
    credentials: {
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
      endpoint: typeof creds.endpoint === 'string' ? creds.endpoint : undefined,
      rootFolder: typeof creds.rootFolder === 'string' ? creds.rootFolder : undefined,
      publicAccess: Boolean(creds.publicAccess),
      customCdnUrl: typeof creds.customCdnUrl === 'string' ? creds.customCdnUrl : undefined,
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
      ...(payload.credentials.publicAccess ? { publicAccess: true } : {}),
      ...(payload.credentials.customCdnUrl ? { customCdnUrl: payload.credentials.customCdnUrl } : {}),
    });

    const row = {
      user_id: user.id,
      name: payload.name,
      provider: payload.provider,
      bucket: payload.bucket,
      region: payload.region,
      encrypted_credentials,
      updated_at: new Date().toISOString(),
    };

    if (payload.id) {
      const { data: existing, error: fetchError } = await supabase
        .from('user_s3_configs')
        .select('id')
        .eq('user_id', user.id)
        .eq('id', payload.id)
        .maybeSingle();

      if (fetchError) {
        console.error('[api/s3-config] update lookup failed:', fetchError.message);
        return NextResponse.json(
          { error: fetchError.message, code: 'SAVE_FAILED' },
          { status: 500 }
        );
      }

      if (!existing) {
        return NextResponse.json(
          { error: 'Connection not found', code: 'NOT_FOUND' },
          { status: 404 }
        );
      }

      const { error } = await supabase
        .from('user_s3_configs')
        .update(row)
        .eq('id', payload.id)
        .eq('user_id', user.id);

      if (error) {
        console.error('[api/s3-config] update failed:', error.message);
        return NextResponse.json(
          { error: error.message, code: 'SAVE_FAILED' },
          { status: 500 }
        );
      }

      return NextResponse.json({ ok: true, id: payload.id });
    }

    const { data, error } = await supabase
      .from('user_s3_configs')
      .insert(row)
      .select('id')
      .single();

    if (error) {
      console.error('[api/s3-config] insert failed:', error.message);
      return NextResponse.json(
        { error: error.message, code: 'SAVE_FAILED' },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, id: data.id });
  } catch (err) {
    console.error('[api/s3-config] encrypt/save error:', err);
    return NextResponse.json(
      { error: 'Failed to save configuration', code: 'SAVE_FAILED' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) {
    return NextResponse.json(
      { error: 'Connection id is required', code: 'INVALID_BODY' },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from('user_s3_configs')
    .delete()
    .eq('user_id', user.id)
    .eq('id', id);

  if (error) {
    console.error('[api/s3-config] delete failed:', error.message);
    return NextResponse.json(
      { error: error.message, code: 'SAVE_FAILED' },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
