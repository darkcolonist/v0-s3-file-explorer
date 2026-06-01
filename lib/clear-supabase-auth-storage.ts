const isPkceVerifierKey = (key: string) =>
  key.includes('code-verifier') || key.includes('code_verifier');

/** Remove Supabase auth keys from localStorage (legacy) and cookies. */
export function clearSupabaseAuthStorage(options?: { preservePkceVerifier?: boolean }): void {
  if (typeof window === 'undefined') return;

  const preservePkce = options?.preservePkceVerifier ?? false;

  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (!(key.startsWith('sb-') || key.includes('supabase'))) continue;
      if (preservePkce && isPkceVerifierKey(key)) continue;
      localStorage.removeItem(key);
    }
  } catch (err) {
    console.error('Error clearing Supabase localStorage:', err);
  }

  try {
    const cookieNames = document.cookie
      .split(';')
      .map((part) => part.trim().split('=')[0])
      .filter(Boolean);

    for (const name of cookieNames) {
      if (!name.startsWith('sb-')) continue;
      if (preservePkce && isPkceVerifierKey(name)) continue;
      document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
    }
  } catch (err) {
    console.error('Error clearing Supabase cookies:', err);
  }
}
