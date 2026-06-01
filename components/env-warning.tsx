'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Copy, 
  Check, 
  FileCode, 
  Terminal, 
  HelpCircle 
} from 'lucide-react';
import toast from 'react-hot-toast';

interface EnvVarStatus {
  name: string;
  value: string | undefined;
  status: 'configured' | 'placeholder' | 'missing';
  description: string;
}

export function EnvWarning() {
  const [copied, setCopied] = useState(false);

  const getEnvStatus = (): { overallIncomplete: boolean; vars: EnvVarStatus[] } => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const encryptionKey = process.env.NEXT_PUBLIC_ENCRYPTION_KEY;

    const vars: EnvVarStatus[] = [
      {
        name: 'NEXT_PUBLIC_SUPABASE_URL',
        value: supabaseUrl,
        status: !supabaseUrl 
          ? 'missing' 
          : (supabaseUrl === 'https://placeholder.supabase.co' || supabaseUrl === 'https://your-project.supabase.co' || supabaseUrl.includes('your-project'))
            ? 'placeholder' 
            : 'configured',
        description: 'The API URL endpoint for your Supabase project.'
      },
      {
        name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
        value: supabaseAnonKey,
        status: !supabaseAnonKey 
          ? 'missing' 
          : (supabaseAnonKey === 'placeholder-key' || supabaseAnonKey === 'your-anon-key')
            ? 'placeholder' 
            : 'configured',
        description: 'The anonymous public API key for your Supabase project.'
      },
      {
        name: 'NEXT_PUBLIC_ENCRYPTION_KEY',
        value: encryptionKey,
        status: !encryptionKey 
          ? 'missing' 
          : (encryptionKey === 'default-key-change-in-production' || encryptionKey === 'your-secret-key')
            ? 'placeholder' 
            : 'configured',
        description: 'Used to securely encrypt your S3 credentials in the database.'
      }
    ];

    const overallIncomplete = vars.some(v => v.status === 'missing' || v.status === 'placeholder');

    return { overallIncomplete, vars };
  };

  const { vars } = getEnvStatus();

  const envTemplate = `# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=${process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://your-project.supabase.co'}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'your-anon-key'}

# Encryption (use a unique secret string)
NEXT_PUBLIC_ENCRYPTION_KEY=${process.env.NEXT_PUBLIC_ENCRYPTION_KEY || 'your-secret-key'}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(envTemplate);
    setCopied(true);
    toast.success('Configuration template copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  const getStatusBadge = (status: EnvVarStatus['status']) => {
    switch (status) {
      case 'configured':
        return (
          <Badge variant="default" className="bg-emerald-500/15 text-emerald-500 border-emerald-500/20 gap-1 font-semibold">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Configured
          </Badge>
        );
      case 'placeholder':
        return (
          <Badge variant="secondary" className="bg-amber-500/15 text-amber-500 border-amber-500/20 gap-1 font-semibold">
            <AlertTriangle className="w-3.5 h-3.5" />
            Using Placeholder
          </Badge>
        );
      case 'missing':
        return (
          <Badge variant="destructive" className="bg-rose-500/15 text-rose-500 border-rose-500/20 gap-1 font-semibold">
            <XCircle className="w-3.5 h-3.5" />
            Missing
          </Badge>
        );
    }
  };

  const maskValue = (val: string | undefined, status: EnvVarStatus['status']) => {
    if (!val || status === 'missing') return <span className="text-rose-500/60 italic font-mono text-xs">undefined</span>;
    if (status === 'placeholder') return <span className="text-amber-500/60 font-mono text-xs">{val}</span>;
    
    // Mask most of the key/URL for display
    const len = val.length;
    if (len <= 12) return <span className="text-muted-foreground font-mono text-xs">••••••••</span>;
    return <span className="text-muted-foreground font-mono text-xs">{val.slice(0, 8)}••••{val.slice(-4)}</span>;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 relative overflow-hidden select-none">
      {/* Background Orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl -z-10 animate-pulse duration-4000"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl -z-10 animate-pulse duration-3000"></div>

      <div className="w-full max-w-3xl space-y-6 animate-in fade-in slide-in-from-bottom-5 duration-500">
        
        {/* Header Alert Card */}
        <Card className="border-amber-500/30 bg-slate-900/80 backdrop-blur-xl shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600"></div>
          
          <CardHeader className="flex flex-row items-start gap-4 space-y-0 pb-6">
            <div className="p-3 bg-amber-500/10 rounded-xl text-amber-500 border border-amber-500/20 shrink-0">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <div>
              <CardTitle className="text-2xl font-bold tracking-tight text-white">
                Environment Variables Incomplete
              </CardTitle>
              <CardDescription className="text-slate-400 mt-1 text-base">
                To access the S3 File Explorer, your environment variables must be fully configured. Please create or update your <code className="text-amber-400 font-mono font-semibold">.env.local</code> file.
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Status list */}
            <div className="grid gap-4">
              {vars.map((v) => (
                <div 
                  key={v.name} 
                  className="flex flex-col md:flex-row md:items-center justify-between p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 hover:border-slate-700 transition duration-200 gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-semibold tracking-wider text-slate-200">
                        {v.name}
                      </span>
                      {getStatusBadge(v.status)}
                    </div>
                    <p className="text-xs text-slate-400 max-w-md">
                      {v.description}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 self-start md:self-center bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800 shrink-0">
                    <span className="text-xs text-slate-500 font-medium">Value:</span>
                    {maskValue(v.value, v.status)}
                  </div>
                </div>
              ))}
            </div>

            {/* Instruction Accordion */}
            <div className="space-y-3 border-t border-slate-800 pt-6">
              <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <FileCode className="w-4 h-4 text-blue-400" />
                Setup Guide
              </h3>
              
              <div className="text-xs text-slate-400 space-y-2 pl-6 list-decimal">
                <p>1. In the root directory of this project, create a file named <strong className="text-slate-200 font-mono">.env.local</strong>.</p>
                <p>2. Copy the template below and configure it with your Supabase keys & encryption key.</p>
                <p>3. Restart the development server by running <code className="text-slate-300 font-mono bg-slate-950 px-1 py-0.5 rounded">npm run dev</code>.</p>
              </div>
            </div>

            {/* Code Template Box */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-purple-400" />
                  .env.local Template
                </span>
                <Button 
                  onClick={handleCopy} 
                  variant="outline" 
                  size="sm" 
                  className="h-8 px-3 border-slate-800 hover:border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs gap-1.5 cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-500 animate-in zoom-in-50 duration-200" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Copy Template
                    </>
                  )}
                </Button>
              </div>

              <div className="relative rounded-xl overflow-hidden border border-slate-800 bg-slate-950/80">
                <pre className="p-4 text-xs font-mono text-slate-300 overflow-x-auto select-all leading-relaxed whitespace-pre-wrap">
                  {envTemplate}
                </pre>
              </div>
            </div>

            <div className="text-center text-xs text-slate-500 border-t border-slate-850 pt-4 flex justify-between items-center">
              <span className="flex items-center gap-1">
                <HelpCircle className="w-3.5 h-3.5" />
                Need help? Check out <a href="#readme" onClick={(e) => { e.preventDefault(); toast.loading('Reading README.md...', { duration: 2000 }) }} className="underline hover:text-slate-300">README.md</a>.
              </span>
              <span>v0-s3-file-explorer</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
