'use client';
// force build 2026-05-31 cris
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase-client';
import { getSessionWithTimeout } from '@/lib/auth-session';
import { clearSupabaseAuthStorage } from '@/lib/clear-supabase-auth-storage';
import { logAuthError, resolveAuthError } from '@/lib/auth-error-messages';
import { signOutForAuthRecovery } from '@/lib/auth-recovery';
import {
  CREDENTIAL_DECRYPT_TOAST,
  ENCRYPTION_KEY_SERVER_TOAST,
} from '@/lib/encryption-messages';
import { fetchS3ConfigFromApi } from '@/lib/s3-config-api';
import { S3Manager } from '@/lib/s3-client';
import { AuthView } from '@/components/auth-view';
import { S3ConfigModal } from '@/components/s3-config-modal';
import { FileExplorer } from '@/components/file-explorer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EnvWarning } from '@/components/env-warning';
import { Settings, LogOut, Sun, Moon } from 'lucide-react';
import { useTheme } from 'next-themes';
import toast from 'react-hot-toast';
import { Logo } from '@/components/logo';
import type { AuthChangeEvent } from '@supabase/supabase-js';
import type { S3Config } from '@/lib/s3-client';

/** Reload stored S3 credentials only on sign-in or explicit config updates—not token refresh. */
const S3_CONFIG_AUTH_EVENTS: AuthChangeEvent[] = ['SIGNED_IN', 'USER_UPDATED'];

function s3ConfigFingerprint(
  row: { region: string; bucket: string; provider: string },
  credentials: Pick<
    S3Config,
    'accessKeyId' | 'secretAccessKey' | 'endpoint' | 'rootFolder'
  >
): string {
  return JSON.stringify({
    region: row.region,
    bucket: row.bucket,
    provider: row.provider,
    accessKeyId: credentials.accessKeyId,
    secretAccessKey: credentials.secretAccessKey,
    endpoint: credentials.endpoint ?? '',
    rootFolder: credentials.rootFolder ?? '',
  });
}

const isEnvIncomplete = (): boolean => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return (
    !supabaseUrl ||
    supabaseUrl === 'https://placeholder.supabase.co' ||
    supabaseUrl === 'https://your-project.supabase.co' ||
    supabaseUrl.includes('your-project') ||
    !supabaseAnonKey ||
    supabaseAnonKey === 'placeholder-key' ||
    supabaseAnonKey === 'your-anon-key'
  );
};

export default function Home() {
  const [user, setUser] = useState<any>(null);
  const [s3Manager, setS3Manager] = useState<S3Manager | null>(null);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [explorerKey, setExplorerKey] = useState(0);
  const recoveringSessionRef = useRef(false);
  const s3ConfigFingerprintRef = useRef<string | null>(null);

  const { theme, setTheme } = useTheme();

  const recoverFromCredentialsMismatch = useCallback(async () => {
    if (recoveringSessionRef.current) return;
    recoveringSessionRef.current = true;
    setUser(null);
    setS3Manager(null);
    setConfigModalOpen(false);
    try {
      await signOutForAuthRecovery(
        'Could not unlock your saved storage setup. Please sign in again.'
      );
    } finally {
      recoveringSessionRef.current = false;
    }
  }, []);

  const loadS3Config = useCallback(async () => {
    try {
      const result = await fetchS3ConfigFromApi();

      if (!result.ok) {
        if (result.code === 'UNAUTHORIZED') {
          await recoverFromCredentialsMismatch();
          return;
        }
        if (result.code === 'ENCRYPTION_NOT_CONFIGURED') {
          setS3Manager(null);
          toast.error(ENCRYPTION_KEY_SERVER_TOAST, { duration: 10000 });
          return;
        }
        if (result.code === 'DECRYPT_FAILED') {
          setS3Manager(null);
          setConfigModalOpen(true);
          toast.error(CREDENTIAL_DECRYPT_TOAST, { duration: 10000 });
          return;
        }
        console.error('Failed to load S3 config:', result.message);
        setS3Manager(null);
        return;
      }

      if (!result.config) {
        setS3Manager(null);
        return;
      }

      const { config } = result;
      const { credentials } = config;
      const managerConfig: S3Config = {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        region: config.region,
        bucket: config.bucket,
        endpoint: credentials.endpoint,
        forcePathStyle: config.provider === 'digitalocean',
        rootFolder: credentials.rootFolder,
      };
      const fingerprint = s3ConfigFingerprint(config, credentials);

      setS3Manager((prev) => {
        if (prev && s3ConfigFingerprintRef.current === fingerprint) {
          return prev;
        }
        s3ConfigFingerprintRef.current = fingerprint;
        return new S3Manager(managerConfig);
      });
    } catch (err) {
      console.error('Failed to load S3 config:', err);
      setS3Manager(null);
    }
  }, [recoverFromCredentialsMismatch]);
  const envIncomplete = isEnvIncomplete();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (envIncomplete) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    let initialLoadFinished = false;
    const finishInitialLoad = () => {
      if (cancelled || initialLoadFinished) return;
      initialLoadFinished = true;
      setLoading(false);
    };

    const initAuth = async () => {
      try {
        const { data: { session }, error } = await getSessionWithTimeout();
        if (error) {
          logAuthError(resolveAuthError(error, 'session_init'), error);
          clearSupabaseAuthStorage({ preservePkceVerifier: true });
          return;
        }
        if (session?.user) {
          setUser(session.user);
          await loadS3Config();
        }
      } catch (err) {
        logAuthError(resolveAuthError(err, 'session_init'), err);
        clearSupabaseAuthStorage({ preservePkceVerifier: true });
      } finally {
        finishInitialLoad();
      }
    };

    void initAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'INITIAL_SESSION' || event === 'SIGNED_OUT') {
          finishInitialLoad();
        }

        if (session?.user) {
          setUser(session.user);
          if (S3_CONFIG_AUTH_EVENTS.includes(event)) {
            void loadS3Config();
          }
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
          setS3Manager(null);
          s3ConfigFingerprintRef.current = null;
        }
      }
    );

    return () => {
      cancelled = true;
      authListener.subscription.unsubscribe();
    };
  }, [envIncomplete, loadS3Config]);

  const handleLogout = async () => {
    const toastId = toast.loading('Logging you out...');
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('Error during Supabase signout:', err);
    } finally {
      // Clear react states
      setUser(null);
      setS3Manager(null);
      s3ConfigFingerprintRef.current = null;

      clearSupabaseAuthStorage();

      toast.dismiss(toastId);
      toast.success('Logged out');
    }
  };

  const handleConfigSaved = async () => {
    if (user) {
      await loadS3Config();
      setExplorerKey((k) => k + 1);
      toast.success('S3 configuration loaded');
    }
  };

  if (envIncomplete) {
    return <EnvWarning />;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse">Initializing...</div>
      </div>
    );
  }

  if (!user) {
    return <AuthView onAuthSuccess={() => {}} />;
  }

  return (
    <main className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-40">
        <div className="max-w-none w-full px-4 md:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo className="w-8 h-8 shrink-0 text-blue-500" />
            <div>
              <h1 className="text-2xl font-bold leading-tight">S3 File Explorer</h1>
              <p className="text-sm text-muted-foreground truncate max-w-[140px] sm:max-w-none">{user.email}</p>
            </div>
          </div>
          <div className="flex gap-2 items-center">
            {mounted && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="w-9 h-9 p-0 flex items-center justify-center cursor-pointer"
                aria-label="Toggle Theme"
              >
                {theme === 'dark' ? (
                  <Sun className="w-4 h-4 text-amber-400" />
                ) : (
                  <Moon className="w-4 h-4 text-slate-700" />
                )}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfigModalOpen(true)}
              className="h-9 w-9 md:w-auto md:px-3 md:py-2 p-0 flex items-center justify-center cursor-pointer"
              title="Configure Storage"
            >
              <Settings className="w-4 h-4 md:mr-2" />
              <span className="hidden md:inline">Configure Storage</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              className="h-9 w-9 md:w-auto md:px-3 md:py-2 p-0 flex items-center justify-center cursor-pointer"
              title="Logout"
            >
              <LogOut className="w-4 h-4 md:mr-2" />
              <span className="hidden md:inline">Logout</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-none w-full px-4 md:px-8 py-8">
        {!s3Manager ? (
          <Card>
            <CardHeader>
              <CardTitle>No S3 Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                You haven&apos;t configured your S3 storage yet. Click the button below to add your AWS S3 or DigitalOcean Spaces credentials.
              </p>
              <Button onClick={() => setConfigModalOpen(true)}>
                <Settings className="w-4 h-4 mr-2" />
                Configure Storage
              </Button>
            </CardContent>
          </Card>
        ) : (
          <FileExplorer key={explorerKey} s3Manager={s3Manager} user={user} />
        )}
      </div>

      {/* S3 Config Modal */}
      <S3ConfigModal
        open={configModalOpen}
        onClose={() => setConfigModalOpen(false)}
        onConfigSaved={handleConfigSaved}
      />
    </main>
  );
}

