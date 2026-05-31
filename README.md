# S3 File Explorer

A mobile-first S3 file explorer built with Next.js, featuring Supabase authentication, encrypted credential storage, and a universal media player.

## Features

- **Supabase Gmail Authentication** - Secure login with pre-configured users only
- **Multi-Provider Support** - AWS S3 and DigitalOcean Spaces
- **Encrypted Credential Storage** - Safely store S3 credentials in Supabase
- **File Management** - Upload, download, delete, and navigate files
- **Universal Media Player** - Preview images, audio, video, and PDFs
- **Overwrite Protection** - Confirmation prompts when uploading duplicate files
- **Mobile-First Design** - Responsive UI optimized for all devices
- **Direct S3 API** - Browser-based S3 requests with CORS support

## Setup Instructions

### 1. Prerequisites

- Node.js 18+
- Supabase project with Gmail OAuth configured
- AWS S3 or DigitalOcean Spaces bucket
- Environment variables configured

### 2. Environment Variables

Create a `.env.local` file in the project root:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Encryption (optional - change in production)
NEXT_PUBLIC_ENCRYPTION_KEY=your-secret-key
```

### 3. Supabase Setup

#### Enable Gmail OAuth

1. Go to **Settings → Authentication → Providers**
2. Enable **Google** provider
3. Configure OAuth credentials
4. Add authorized redirect URLs:
   - `http://localhost:3000/auth/callback` (development)
   - `https://yourdomain.com/auth/callback` (production)

#### Create Database Table

Create the `user_s3_configs` table in Supabase:

```sql
CREATE TABLE user_s3_configs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('aws', 'digitalocean')),
  bucket TEXT NOT NULL,
  region TEXT NOT NULL,
  encrypted_credentials TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS (optional but recommended)
ALTER TABLE user_s3_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only access their own config" ON user_s3_configs
  FOR ALL USING (auth.uid() = user_id);
```

### 4. AWS S3 Configuration

#### Create IAM User with Minimal Permissions

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket",
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": [
        "arn:aws:s3:::your-bucket",
        "arn:aws:s3:::your-bucket/*"
      ]
    }
  ]
}
```

#### Enable CORS on S3 Bucket

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
    "AllowedOrigins": ["http://localhost:3000", "https://yourdomain.com"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

### 5. DigitalOcean Spaces Configuration

#### Create API Key

1. Go to **API → Spaces Keys**
2. Generate new key
3. Note the endpoint URL (e.g., `https://nyc3.digitaloceanspaces.com`)

#### Enable CORS on Space

```bash
# Using AWS CLI configured for DigitalOcean
aws s3api put-bucket-cors \
  --bucket your-space-name \
  --cors-configuration '{
    "CORSRules": [
      {
        "AllowedHeaders": ["*"],
        "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
        "AllowedOrigins": ["http://localhost:3000", "https://yourdomain.com"],
        "ExposeHeaders": ["ETag"],
        "MaxAgeSeconds": 3000
      }
    ]
  }' \
  --endpoint-url https://nyc3.digitaloceanspaces.com
```

## Installation & Running

```bash
# Install dependencies
pnpm install

# Run development server
pnpm dev

# Build for production
pnpm build
pnpm start
```

Visit `http://localhost:3000` in your browser.

## Architecture

### Components

- **AuthView** - Supabase Gmail OAuth login
- **S3ConfigModal** - Configure S3/DigitalOcean credentials
- **FileExplorer** - Browse, upload, download, delete files
- **MediaPlayer** - Preview images, audio, video, PDFs

### Utilities

- **encryption.ts** - AES encryption/decryption for credentials
- **s3-client.ts** - AWS SDK v3 wrapper with signed URLs
- **supabase-client.ts** - Supabase client initialization

### API Routes

- `/auth/callback` - Handles Supabase OAuth redirect

## Security Considerations

1. **Credential Encryption** - All S3 credentials are AES-encrypted before storage
2. **Signed URLs** - All S3 requests use signed URLs with 1-hour expiration
3. **RLS (Optional)** - Enable Row Level Security in Supabase for additional protection
4. **CORS** - Restrict CORS origins to your domain
5. **IAM Policies** - Use least-privilege IAM policies for S3 access

## Supported Media Types

- **Audio**: MP3, WAV, M4A, OGG, FLAC
- **Video**: MP4, WebM, MKV, MOV
- **Images**: JPEG, PNG, GIF, WebP, SVG
- **Documents**: PDF
- **Other**: Browser preview available for other file types

## File Size Limits

Default 1GB max upload size per file. Configure in Next.js if needed:

```js
// next.config.mjs
export default {
  api: {
    bodyParser: {
      sizeLimit: '1gb',
    },
  },
}
```

## Troubleshooting

### CORS Errors

- Verify CORS configuration on S3 bucket
- Check that origin URL matches allowed origins
- Clear browser cache and retry

### Authentication Issues

- Confirm Gmail OAuth is enabled in Supabase
- Verify redirect URL matches callback route
- Check that user exists in Supabase (no registration allowed)

### S3 Connection Fails

- Verify access key and secret key
- Confirm bucket name and region
- Check IAM policy permissions
- For DigitalOcean, verify endpoint URL format

### Files Not Uploading

- Check browser console for errors
- Verify S3 bucket CORS policy
- Confirm IAM write permissions
- Check file size limits

## Performance Tips

1. **Direct S3 Requests** - Uploads/downloads go directly to S3 for speed
2. **Signed URLs** - 1-hour expiration, refresh on page load
3. **File Listing** - Uses S3 ListObjects with path delimiters
4. **Media Preview** - Streams directly from S3, no local storage

## Deployment

### To Vercel

```bash
# Push to GitHub
git push origin main

# Connect to Vercel and deploy
```

### Environment Variables in Vercel

Add to **Settings → Environment Variables**:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_ENCRYPTION_KEY
```

### CORS Update for Production

Update S3 CORS policy with production domain:

```json
{
  "AllowedOrigins": ["https://yourdomain.com"]
}
```

## License

MIT

## Support

For issues, check:
- [Supabase Docs](https://supabase.com/docs)
- [AWS S3 Docs](https://docs.aws.amazon.com/s3/)
- [DigitalOcean Spaces Docs](https://docs.digitalocean.com/products/spaces/)
