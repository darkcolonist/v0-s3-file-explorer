/** Shown when decrypt fails — re-login does not rotate the stored ciphertext. */
export const CREDENTIAL_DECRYPT_TOAST =
  'Could not unlock your saved S3 credentials. Open Storage Settings, enter your keys again, and save.';

export const ENCRYPTION_KEY_SERVER_TOAST =
  'ENCRYPTION_KEY is missing or still a placeholder on the server. Set it in Vercel/host env (not NEXT_PUBLIC), redeploy, then re-save S3 credentials.';
