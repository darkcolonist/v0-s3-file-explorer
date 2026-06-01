import { supabase } from '@/lib/supabase-client';

const DEFAULT_SESSION_TIMEOUT_MS = 10_000;

export async function getSessionWithTimeout(timeoutMs = DEFAULT_SESSION_TIMEOUT_MS) {
  return Promise.race([
    supabase.auth.getSession(),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Session lookup timed out')), timeoutMs);
    }),
  ]);
}
