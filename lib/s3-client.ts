import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectCommand,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface S3Config {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  bucket: string;
  endpoint?: string; // For DigitalOcean Spaces
  forcePathStyle?: boolean;
}

export interface S3Object {
  key: string;
  size: number;
  lastModified: Date;
  isDirectory: boolean;
}

export class S3Manager {
  private client: S3Client;
  private config: S3Config;

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
      clientConfig.endpoint = config.endpoint;
      clientConfig.forcePathStyle = config.forcePathStyle ?? false;
    }

    this.client = new S3Client(clientConfig);
  }

  async listObjects(prefix = ''): Promise<S3Object[]> {
    try {
      const command = new ListObjectsV2Command({
        Bucket: this.config.bucket,
        Prefix: prefix,
        Delimiter: '/',
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
        Body: arrayBuffer,
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
}
