import CryptoJS from 'crypto-js';

const ENCRYPTION_KEY = process.env.NEXT_PUBLIC_ENCRYPTION_KEY || 'default-key-change-in-production';

export const encryptCredentials = (credentials: Record<string, string>): string => {
  return CryptoJS.AES.encrypt(
    JSON.stringify(credentials),
    ENCRYPTION_KEY
  ).toString();
};

export const decryptCredentials = (encrypted: string): Record<string, string> => {
  const decrypted = CryptoJS.AES.decrypt(encrypted, ENCRYPTION_KEY).toString(
    CryptoJS.enc.Utf8
  );
  return JSON.parse(decrypted);
};
