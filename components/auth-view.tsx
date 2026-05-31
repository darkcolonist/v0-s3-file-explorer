'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase-client';
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
    // Check if already authenticated
    const checkAuth = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        onAuthSuccess();
      }
      setIsLoading(false);
    };
    checkAuth();
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
        toast.error(`Login failed: ${error.message}`);
      }
    } catch (err) {
      toast.error('An error occurred during login');
      console.error(err);
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
