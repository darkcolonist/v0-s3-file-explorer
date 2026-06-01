'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase-client';
import { clearSupabaseAuthStorage } from '@/lib/clear-supabase-auth-storage';

export default function AuthCallbackPage() {
  const router = useRouter();
  const [message, setMessage] = useState('Completing sign in...');

  useEffect(() => {
    const completeAuth = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const oauthError = params.get('error_description') ?? params.get('error');

      if (oauthError) {
        clearSupabaseAuthStorage();
        setMessage('Sign in was cancelled or failed. Redirecting...');
        router.replace('/');
        return;
      }

      try {
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        }
        router.replace('/');
      } catch (err) {
        console.error('Auth callback failed:', err);
        clearSupabaseAuthStorage();
        setMessage('Sign in failed. Redirecting...');
        router.replace('/');
      }
    };

    void completeAuth();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="animate-pulse">{message}</div>
    </div>
  );
}
