import CryptoJS from 'crypto-js';

const ENCRYPTION_KEY = process.env.NEXT_PUBLIC_ENCRYPTION_KEY || 'default-key-change-in-production';

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
    if (!decrypted) return null; // empty string means wrong key
    return JSON.parse(decrypted);
  } catch {
    return null; // malformed UTF-8 or bad JSON — key mismatch
  }
};
