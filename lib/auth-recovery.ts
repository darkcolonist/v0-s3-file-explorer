import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase-client';
import { clearSupabaseAuthStorage } from '@/lib/clear-supabase-auth-storage';

const DEFAULT_MESSAGE =
  'Your session could not be verified. Please sign in again to reload your storage setup.';

/** Sign out and clear auth storage so the user can sign in fresh (e.g. decrypt or token mismatch). */
export async function signOutForAuthRecovery(
  message: string = DEFAULT_MESSAGE
): Promise<void> {
  const toastId = toast.loading('Refreshing your session…');

  try {
    await supabase.auth.signOut();
  } catch (err) {
    console.error('Sign out during auth recovery failed:', err);
  } finally {
    clearSupabaseAuthStorage();
    toast.dismiss(toastId);
    toast.error(message, { duration: 6000 });
  }
}

export function isAuthRelatedConfigError(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  const msg = (error.message ?? '').toLowerCase();
  const code = error.code ?? '';
  return (
    code === 'PGRST301' ||
    msg.includes('jwt') ||
    msg.includes('not authenticated') ||
    msg.includes('invalid claim') ||
    msg.includes('session')
  );
}
