import { NextResponse } from 'next/server';
import { isEncryptionKeyConfigured } from '@/lib/encryption-server';

export async function GET() {
  return NextResponse.json({
    encryptionConfigured: isEncryptionKeyConfigured(),
  });
}
