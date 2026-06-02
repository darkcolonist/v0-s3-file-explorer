import { createClient } from '@/lib/supabase/client';

/** Browser Supabase client (PKCE verifier stored in cookies via @supabase/ssr). */
export const supabase = createClient();

export type UserS3Config = {
  id: string;
  user_id: string;
  name: string;
  provider: 'aws' | 'digitalocean';
  bucket: string;
  region: string;
  encrypted_credentials: string;
  created_at: string;
  updated_at: string;
};
