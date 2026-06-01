import CryptoJS from 'crypto-js';

const PLACEHOLDER_KEYS = new Set([
  'default-key-change-in-production',
  'your-secret-key',
]);

const ENCRYPTION_KEY = process.env.NEXT_PUBLIC_ENCRYPTION_KEY || 'default-key-change-in-production';

export function isEncryptionKeyConfigured(): boolean {
  const key = process.env.NEXT_PUBLIC_ENCRYPTION_KEY;
  return Boolean(key && !PLACEHOLDER_KEYS.has(key));
}

/** Shown when decrypt fails — re-login does not rotate the stored ciphertext. */
export const CREDENTIAL_DECRYPT_TOAST =
  'Could not unlock your saved S3 credentials. Open Storage Settings, enter your keys again, and save.';

export const encryptCredentials = (credentials: Record<string, string>): string => {
  return CryptoJS.AES.encrypt(
    JSON.stringify(credentials),
    ENCRYPTION_KEY
  ).toString();
};

export const decryptCredentials = (encrypted: string): Record<string, string> | null => {
  try {
    const decrypted = CryptoJS.AES.decrypt(encrypted, ENCRYPTION_KEY).toString(
      CryptoJS.enc.Utf8
    );
    if (!decrypted) {
      console.warn(
        '[encryption] decrypt returned empty — wrong NEXT_PUBLIC_ENCRYPTION_KEY or corrupt data. ' +
          'Re-save S3 settings after confirming the key matches the one used when credentials were stored. ' +
          'On Vercel, NEXT_PUBLIC_* values are baked in at build time; redeploy after changing them.'
      );
      return null;
    }
    return JSON.parse(decrypted);
  } catch {
    console.warn('[encryption] decrypt failed — key mismatch or invalid ciphertext');
    return null;
  }
};
