import 'server-only';
import CryptoJS from 'crypto-js';

const PLACEHOLDER_KEYS = new Set([
  'default-key-change-in-production',
  'your-secret-key',
]);

/** Prefer server-only ENCRYPTION_KEY; fall back to legacy NEXT_PUBLIC_* for existing deploys. */
export function getEncryptionKey(): string | null {
  const key =
    process.env.ENCRYPTION_KEY?.trim() ||
    process.env.NEXT_PUBLIC_ENCRYPTION_KEY?.trim() ||
    null;
  if (!key || PLACEHOLDER_KEYS.has(key)) return null;
  return key;
}

export function isEncryptionKeyConfigured(): boolean {
  return getEncryptionKey() !== null;
}

export function encryptCredentials(credentials: Record<string, string>): string {
  const key = getEncryptionKey();
  if (!key) {
    throw new Error('ENCRYPTION_KEY_NOT_CONFIGURED');
  }
  return CryptoJS.AES.encrypt(JSON.stringify(credentials), key).toString();
}

export function decryptCredentials(encrypted: string): Record<string, string> | null {
  const key = getEncryptionKey();
  if (!key) {
    console.warn('[encryption] ENCRYPTION_KEY not configured on server');
    return null;
  }
  try {
    const decrypted = CryptoJS.AES.decrypt(encrypted, key).toString(CryptoJS.enc.Utf8);
    if (!decrypted) {
      console.warn(
        '[encryption] decrypt returned empty — wrong ENCRYPTION_KEY or corrupt data. ' +
          'Re-save S3 settings after confirming the server key matches the one used when credentials were stored.'
      );
      return null;
    }
    return JSON.parse(decrypted);
  } catch {
    console.warn('[encryption] decrypt failed — key mismatch or invalid ciphertext');
    return null;
  }
}
