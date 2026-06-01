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
import { Settings, LogOut } from 'lucide-react';
import toast from 'react-hot-toast';

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

  const envIncomplete = isEnvIncomplete();

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
      const manager = new S3Manager({
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        region: data.region,
        bucket: data.bucket,
        endpoint: credentials.endpoint,
        forcePathStyle: data.provider === 'digitalocean',
      });

      setS3Manager(manager);
    } catch (err) {
      console.error('Failed to load S3 config:', err);
      setS3Manager(null);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setS3Manager(null);
    toast.success('Logged out');
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
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">S3 File Explorer</h1>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfigModalOpen(true)}
            >
              <Settings className="w-4 h-4 mr-2" />
              Configure Storage
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
            >
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 py-8">
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
          <FileExplorer s3Manager={s3Manager} />
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

