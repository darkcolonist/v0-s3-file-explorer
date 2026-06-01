'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase-client';
import { getSessionWithTimeout } from '@/lib/auth-session';
import { clearSupabaseAuthStorage } from '@/lib/clear-supabase-auth-storage';
import {
  authErrorFromQueryParam,
  formatAuthErrorToast,
  logAuthError,
  resolveAuthError,
} from '@/lib/auth-error-messages';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import toast from 'react-hot-toast';

interface AuthViewProps {
  onAuthSuccess: () => void;
}

export function AuthView({ onAuthSuccess }: AuthViewProps) {
  const [loading, setLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authError = params.get('auth_error');
    if (authError) {
      const details = authErrorFromQueryParam(authError);
      if (details) {
        logAuthError(details, authError);
        toast.error(formatAuthErrorToast(details), { duration: 8000 });
      }
      params.delete('auth_error');
      const query = params.toString();
      const path = window.location.pathname;
      window.history.replaceState(null, '', query ? `${path}?${query}` : path);
    }
  }, []);

  useEffect(() => {
    // Check if already authenticated
    const checkAuth = async () => {
      try {
        const { data, error } = await getSessionWithTimeout();
        if (error) {
          const details = resolveAuthError(error, 'session_check');
          logAuthError(details, error);
          clearSupabaseAuthStorage({ preservePkceVerifier: true });
          return;
        }
        if (data.session) {
          onAuthSuccess();
        }
      } catch (err) {
        const details = resolveAuthError(err, 'session_check');
        logAuthError(details, err);
        clearSupabaseAuthStorage({ preservePkceVerifier: true });
      } finally {
        setIsLoading(false);
      }
    };
    void checkAuth();
  }, [onAuthSuccess]);

  const handleGmailLogin = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        const details = resolveAuthError(error, 'oauth_start');
        logAuthError(details, error);
        toast.error(formatAuthErrorToast(details), { duration: 8000 });
      }
    } catch (err) {
      const details = resolveAuthError(err, 'oauth_start');
      logAuthError(details, err);
      toast.error(formatAuthErrorToast(details), { duration: 8000 });
    } finally {
      setLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">S3 File Explorer</CardTitle>
          <CardDescription>Sign in with your Google account to get started</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={handleGmailLogin}
            disabled={loading}
            className="w-full"
            size="lg"
          >
            {loading ? 'Signing in...' : 'Sign in with Google'}
          </Button>
          <p className="text-xs text-muted-foreground text-center mt-4">
            Only pre-configured users can access this application.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
