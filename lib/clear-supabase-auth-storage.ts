/** Remove Supabase auth keys from localStorage (fixes stuck sessions after bad OAuth redirects). */
export function clearSupabaseAuthStorage(): void {
  if (typeof window === 'undefined') return;

  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('sb-') || key.includes('supabase'))) {
        localStorage.removeItem(key);
      }
    }
  } catch (err) {
    console.error('Error clearing Supabase auth storage:', err);
  }
}
