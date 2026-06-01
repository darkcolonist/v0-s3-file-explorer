'use client';
// force build 2026-05-31 cris
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase-client';
import { decryptCredentials } from '@/lib/encryption';
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

const isEnvIncomplete = (): boolean => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const encryptionKey = process.env.NEXT_PUBLIC_ENCRYPTION_KEY;

  return (
    !supabaseUrl ||
    supabaseUrl === 'https://placeholder.supabase.co' ||
    supabaseUrl === 'https://your-project.supabase.co' ||
    supabaseUrl.includes('your-project') ||
    !supabaseAnonKey ||
    supabaseAnonKey === 'placeholder-key' ||
    supabaseAnonKey === 'your-anon-key' ||
    !encryptionKey ||
    encryptionKey === 'default-key-change-in-production' ||
    encryptionKey === 'your-secret-key'
  );
};

export default function Home() {
  const [user, setUser] = useState<any>(null);
  const [s3Manager, setS3Manager] = useState<S3Manager | null>(null);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  const { theme, setTheme } = useTheme();
  const envIncomplete = isEnvIncomplete();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (envIncomplete) {
      setLoading(false);
      return;
    }

    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
        await loadS3Config(session.user.id);
      }
      setLoading(false);
    };

    initAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          setUser(session.user);
          await loadS3Config(session.user.id);
        } else {
          setUser(null);
          setS3Manager(null);
        }
      }
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [envIncomplete]);

  const loadS3Config = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_s3_configs')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error || !data) {
        setS3Manager(null);
        return;
      }

      const credentials = decryptCredentials(data.encrypted_credentials);
      if (!credentials) {
        console.warn('Failed to decrypt S3 config: encryption key mismatch. Please re-enter your credentials.');
        setS3Manager(null);
        return;
      }
      const manager = new S3Manager({
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        region: data.region,
        bucket: data.bucket,
        endpoint: credentials.endpoint,
        forcePathStyle: data.provider === 'digitalocean',
        rootFolder: credentials.rootFolder,
      });

      setS3Manager(manager);
    } catch (err) {
      console.error('Failed to load S3 config:', err);
      setS3Manager(null);
    }
  };

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

      // Clean up Supabase client cached values in localStorage
      try {
        if (typeof window !== 'undefined') {
          for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (key && (key.startsWith('sb-') || key.includes('supabase'))) {
              localStorage.removeItem(key);
            }
          }
        }
      } catch (storageErr) {
        console.error('Error clearing local storage:', storageErr);
      }

      toast.dismiss(toastId);
      toast.success('Logged out');
    }
  };

  const handleConfigSaved = async () => {
    if (user) {
      await loadS3Config(user.id);
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
          <FileExplorer s3Manager={s3Manager} user={user} />
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

