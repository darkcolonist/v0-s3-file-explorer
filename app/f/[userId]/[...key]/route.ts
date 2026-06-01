import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { decryptCredentials } from '@/lib/encryption';
import { S3Manager } from '@/lib/s3-client';

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ userId: string; key: string[] }> }
) {
  try {
    const resolvedParams = await props.params;
    const { userId, key } = resolvedParams;
    const fileKey = key.join('/');

    // 1. Initialize Supabase Client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    );

    // 2. Fetch user's S3 config
    const { data, error } = await supabase
      .from('user_s3_configs')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      return new NextResponse('Configuration not found', { status: 404 });
    }

    // 3. Decrypt S3 credentials
    const credentials = decryptCredentials(data.encrypted_credentials);
    if (!credentials) {
      return new NextResponse('Failed to decrypt credentials: encryption key mismatch', { status: 500 });
    }

    // 4. Initialize S3Manager on the server
    const s3Manager = new S3Manager({
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      region: data.region,
      bucket: data.bucket,
      endpoint: credentials.endpoint,
      forcePathStyle: data.provider === 'digitalocean',
      rootFolder: credentials.rootFolder,
    });

    // 5. Generate a pre-signed S3 download URL (60-second expiration for redirect)
    const signedUrl = await s3Manager.getSignedDownloadUrl(fileKey, 60);

    // 6. Redirect the visitor to the direct S3 resource URL
    return NextResponse.redirect(signedUrl);
  } catch (err: any) {
    console.error('Error in shareable redirect route:', err);
    return new NextResponse(`Redirect Error: ${err.message}`, { status: 500 });
  }
}
