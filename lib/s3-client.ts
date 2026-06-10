import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectCommand,
  PutObjectCommand,
  GetObjectCommand,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface S3Config {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  bucket: string;
  endpoint?: string; // For DigitalOcean Spaces
  forcePathStyle?: boolean;
  rootFolder?: string; // Root prefix to scope operations
}

export interface S3Object {
  key: string;
  size: number;
  lastModified: Date;
  isDirectory: boolean;
}

/** Avoid double bucket in path when DO endpoint uses bucket subdomain + path-style URLs. */
export function normalizeSpacesEndpoint(
  endpoint: string,
  bucket: string,
  region: string
): string {
  try {
    const url = new URL(endpoint.includes('://') ? endpoint : `https://${endpoint}`);
    const hostname = url.hostname.toLowerCase();
    const bucketPrefix = `${bucket.toLowerCase()}.`;
    if (hostname.startsWith(bucketPrefix) && hostname.endsWith('.digitaloceanspaces.com')) {
      url.hostname = `${region.toLowerCase()}.digitaloceanspaces.com`;
    }
    return url.origin;
  } catch {
    return endpoint;
  }
}

export class S3Manager {
  private client: S3Client;
  public config: S3Config;

  constructor(config: S3Config) {
    this.config = config;

    const clientConfig: any = {
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    };

    // Support for DigitalOcean Spaces or custom S3 endpoints
    if (config.endpoint) {
      const endpoint =
        config.forcePathStyle
          ? normalizeSpacesEndpoint(config.endpoint, config.bucket, config.region)
          : config.endpoint;
      clientConfig.endpoint = endpoint;
      clientConfig.forcePathStyle = config.forcePathStyle ?? false;
    }

    this.client = new S3Client(clientConfig);
  }

  async listObjects(prefix = '', searchQuery?: string, recursive = false): Promise<S3Object[]> {
    try {
      const searchPrefix = searchQuery ? prefix + searchQuery : prefix;
      const command = new ListObjectsV2Command({
        Bucket: this.config.bucket,
        Prefix: searchPrefix,
        ...(recursive ? {} : { Delimiter: '/' }),
      });
      const response = await this.client.send(command);
      const objects: S3Object[] = [];

      // Add directories from CommonPrefixes
      if (response.CommonPrefixes) {
        response.CommonPrefixes.forEach((prefix) => {
          objects.push({
            key: prefix.Prefix || '',
            size: 0,
            lastModified: new Date(),
            isDirectory: true,
          });
        });
      }

      // Add files from Contents
      if (response.Contents) {
        response.Contents.forEach((item) => {
          if (item.Key && !item.Key.endsWith('/')) {
            objects.push({
              key: item.Key,
              size: item.Size || 0,
              lastModified: item.LastModified || new Date(),
              isDirectory: false,
            });
          }
        });
      }

      return objects;
    } catch (error) {
      console.error('Error listing objects:', error);
      throw error;
    }
  }

  async deleteObject(key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
      });
      await this.client.send(command);
    } catch (error) {
      console.error('Error deleting object:', error);
      throw error;
    }
  }

  /** True when the prefix has no objects except an optional folder marker key. */
  async isPrefixEmpty(prefix: string): Promise<boolean> {
    const normalizedPrefix = prefix.endsWith('/') ? prefix : `${prefix}/`;
    const command = new ListObjectsV2Command({
      Bucket: this.config.bucket,
      Prefix: normalizedPrefix,
      MaxKeys: 1,
    });
    const response = await this.client.send(command);
    const keys =
      response.Contents?.map((item) => item.Key).filter(
        (key): key is string => !!key
      ) ?? [];

    if (keys.length === 0) return true;
    return keys.length === 1 && keys[0] === normalizedPrefix;
  }

  /** Delete a folder only if it is empty. Throws when the prefix is not empty. */
  async deleteEmptyFolder(prefix: string): Promise<void> {
    const normalizedPrefix = prefix.endsWith('/') ? prefix : `${prefix}/`;
    const empty = await this.isPrefixEmpty(normalizedPrefix);
    if (!empty) {
      const error = new Error('Folder is not empty');
      error.name = 'FolderNotEmptyError';
      throw error;
    }

    try {
      await this.deleteObject(normalizedPrefix);
    } catch (error: unknown) {
      const err = error as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
        return;
      }
      throw error;
    }
  }

  async uploadObject(
    key: string,
    body: Blob | File,
    contentType?: string
  ): Promise<void> {
    try {
      const arrayBuffer = await body.arrayBuffer();
      const command = new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: new Uint8Array(arrayBuffer),
        ContentType: contentType || 'application/octet-stream',
      });
      await this.client.send(command);
    } catch (error) {
      console.error('Error uploading object:', error);
      throw error;
    }
  }

  async getSignedDownloadUrl(key: string, expiresIn = 3600): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
      });
      const url = await getSignedUrl(this.client, command, {
        expiresIn,
      });
      return url;
    } catch (error) {
      console.error('Error getting signed URL:', error);
      throw error;
    }
  }

  async getSignedUploadUrl(key: string, contentType: string, expiresIn = 3600): Promise<string> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        ContentType: contentType,
      });
      const url = await getSignedUrl(this.client, command, {
        expiresIn,
      });
      return url;
    } catch (error) {
      console.error('Error getting signed upload URL:', error);
      throw error;
    }
  }

  async renameObject(oldKey: string, newKey: string): Promise<void> {
    try {
      // S3 requires the CopySource parameter to be of the form: /bucket-name/key-name
      // It is critical to URL encode the key component so spaces/special chars don't break.
      const copySource = `/${this.config.bucket}/${encodeURIComponent(oldKey).replace(/%2F/g, '/')}`;
      const command = new CopyObjectCommand({
        Bucket: this.config.bucket,
        CopySource: copySource,
        Key: newKey,
      });
      await this.client.send(command);
      
      // Delete old object
      await this.deleteObject(oldKey);
    } catch (error) {
      console.error('Error renaming object:', error);
      throw error;
    }
  }
}
