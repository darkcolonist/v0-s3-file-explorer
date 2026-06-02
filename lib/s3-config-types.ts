export type S3Provider = 'aws' | 'digitalocean';

export type S3StoredCredentials = {
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string;
  rootFolder?: string;
};

export type S3ConfigApiData = {
  provider: S3Provider;
  bucket: string;
  region: string;
  credentials: S3StoredCredentials;
};

export type S3ConfigSavePayload = S3ConfigApiData;

export type S3ConfigApiErrorCode =
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'DECRYPT_FAILED'
  | 'ENCRYPTION_NOT_CONFIGURED'
  | 'SAVE_FAILED'
  | 'INVALID_BODY';
