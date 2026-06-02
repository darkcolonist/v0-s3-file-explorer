'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import toast from 'react-hot-toast';
import { CREDENTIAL_DECRYPT_TOAST, ENCRYPTION_KEY_SERVER_TOAST } from '@/lib/encryption-messages';
import { fetchS3ConfigFromApi, saveS3ConfigToApi } from '@/lib/s3-config-api';
import { S3Manager } from '@/lib/s3-client';

interface S3ConfigModalProps {
  open: boolean;
  onClose: () => void;
  onConfigSaved: () => void;
}

export function S3ConfigModal({ open, onClose, onConfigSaved }: S3ConfigModalProps) {
  const [provider, setProvider] = useState<'aws' | 'digitalocean'>('aws');
  const [bucket, setBucket] = useState('');
  const [region, setRegion] = useState('us-east-1');
  const [accessKeyId, setAccessKeyId] = useState('');
  const [secretAccessKey, setSecretAccessKey] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [rootFolder, setRootFolder] = useState('');
  const [showFolderBrowser, setShowFolderBrowser] = useState(false);
  const [browserCurrentPath, setBrowserCurrentPath] = useState('');
  const [browserFolders, setBrowserFolders] = useState<string[]>([]);
  const [browserLoading, setBrowserLoading] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  useEffect(() => {
    if (open) {
      const loadSavedConfig = async () => {
        try {
          const result = await fetchS3ConfigFromApi();
          if (!result.ok) {
            if (result.code === 'ENCRYPTION_NOT_CONFIGURED') {
              toast.error(ENCRYPTION_KEY_SERVER_TOAST, { duration: 10000 });
            } else if (result.code === 'DECRYPT_FAILED') {
              toast.error(CREDENTIAL_DECRYPT_TOAST, { duration: 10000 });
            }
            return;
          }
          if (!result.config) return;

          const { config } = result;
          setProvider(config.provider);
          setBucket(config.bucket);
          setRegion(config.region);
          setAccessKeyId(config.credentials.accessKeyId || '');
          setSecretAccessKey(config.credentials.secretAccessKey || '');
          setEndpoint(config.credentials.endpoint || '');
          setRootFolder(config.credentials.rootFolder || '');
        } catch (err) {
          console.error('Failed to load saved config in modal:', err);
        }
      };

      loadSavedConfig();
    }
  }, [open]);

  const loadBrowserFolders = async (path: string) => {
    if (!bucket || !region || !accessKeyId || !secretAccessKey) {
      toast.error('Credentials and bucket are required to browse folders');
      return;
    }

    setBrowserLoading(true);
    try {
      const tempManager = new S3Manager({
        accessKeyId,
        secretAccessKey,
        region,
        bucket,
        endpoint: provider === 'digitalocean' ? endpoint : undefined,
        forcePathStyle: provider === 'digitalocean',
      });

      const items = await tempManager.listObjects(path);
      const folders = items
        .filter((item) => item.isDirectory)
        .map((item) => item.key);
      
      setBrowserFolders(folders);
      setBrowserCurrentPath(path);
    } catch (err: any) {
      console.error('Failed to load folders in browser:', err);
      toast.error(`Failed to load folders: ${err.message || 'Unknown error'}`);
    } finally {
      setBrowserLoading(false);
    }
  };

  const handleBrowserCreateFolder = async () => {
    if (!newFolderName.trim()) return;

    const folderName = newFolderName.trim();
    const folderKey = browserCurrentPath + folderName + '/';

    setBrowserLoading(true);
    try {
      const tempManager = new S3Manager({
        accessKeyId,
        secretAccessKey,
        region,
        bucket,
        endpoint: provider === 'digitalocean' ? endpoint : undefined,
        forcePathStyle: provider === 'digitalocean',
      });

      await tempManager.uploadObject(folderKey, new Blob([]), 'application/x-directory');
      toast.success(`Folder "${folderName}" created`);
      setNewFolderName('');
      await loadBrowserFolders(browserCurrentPath);
    } catch (err: any) {
      console.error('Failed to create folder:', err);
      toast.error(`Failed to create folder: ${err.message || 'Unknown error'}`);
    } finally {
      setBrowserLoading(false);
    }
  };

  const handleOpenFolderBrowser = () => {
    if (!bucket || !region || !accessKeyId || !secretAccessKey) {
      toast.error('Please configure your credentials and bucket name first');
      return;
    }
    setShowFolderBrowser(true);
    loadBrowserFolders('');
  };

  const handleTestConnection = async () => {
    if (!bucket || !region || !accessKeyId || !secretAccessKey) {
      toast.error('All fields are required to test connection');
      return;
    }

    if (provider === 'digitalocean' && !endpoint) {
      toast.error('Endpoint is required for DigitalOcean Spaces');
      return;
    }

    setTesting(true);
    const toastId = toast.loading('Testing S3 connection...');
    try {
      const tempManager = new S3Manager({
        accessKeyId,
        secretAccessKey,
        region,
        bucket,
        endpoint: provider === 'digitalocean' ? endpoint : undefined,
        forcePathStyle: provider === 'digitalocean',
      });

      // Attempt to list objects (this is a lightweight call to verify credentials/permissions/endpoints)
      await tempManager.listObjects();
      
      toast.success('Connection successful! Bucket is reachable.', { id: toastId });
    } catch (err: any) {
      console.error('S3 connection test failed:', err);
      let errorMsg = err.message || 'Unknown error';
      if (err.name === 'TypeError' && err.message.includes('Failed to fetch')) {
        errorMsg = 'Failed to fetch. This may be due to CORS issues, an incorrect endpoint, or network connection failure.';
      }
      toast.error(`Connection failed: ${errorMsg}`, { id: toastId });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!bucket || !region || !accessKeyId || !secretAccessKey) {
      toast.error('All fields are required');
      return;
    }

    if (provider === 'digitalocean' && !endpoint) {
      toast.error('Endpoint is required for DigitalOcean Spaces');
      return;
    }

    setLoading(true);
    try {
      const result = await saveS3ConfigToApi({
        provider,
        bucket,
        region,
        credentials: {
          accessKeyId,
          secretAccessKey,
          ...(provider === 'digitalocean' && { endpoint }),
          rootFolder,
        },
      });

      if (!result.ok) {
        if (result.code === 'UNAUTHORIZED') {
          toast.error('User not authenticated');
        } else if (result.code === 'ENCRYPTION_NOT_CONFIGURED') {
          toast.error(ENCRYPTION_KEY_SERVER_TOAST, { duration: 10000 });
        } else {
          toast.error(`Failed to save configuration: ${result.message}`);
        }
        return;
      }

      toast.success('S3 configuration saved');
      setBucket('');
      setAccessKeyId('');
      setSecretAccessKey('');
      setEndpoint('');
      setRootFolder('');
      setShowFolderBrowser(false);
      onConfigSaved();
      onClose();
    } catch (err) {
      toast.error('An error occurred while saving configuration');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configure S3 Storage</DialogTitle>
          <DialogDescription>Add your S3 or DigitalOcean Spaces credentials</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Provider Selection */}
          <div>
            <Label htmlFor="provider">Provider</Label>
            <Select value={provider} onValueChange={(value) => setProvider(value as 'aws' | 'digitalocean')}>
              <SelectTrigger id="provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="aws">AWS S3</SelectItem>
                <SelectItem value="digitalocean">DigitalOcean Spaces</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Bucket Name */}
          <div>
            <Label htmlFor="bucket">Bucket Name</Label>
            <Input
              id="bucket"
              placeholder="my-bucket"
              value={bucket}
              onChange={(e) => setBucket(e.target.value)}
            />
          </div>

          {/* Region */}
          <div>
            <Label htmlFor="region">Region</Label>
            {provider === 'aws' ? (
              <Select value={region} onValueChange={setRegion}>
                <SelectTrigger id="region">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="us-east-1">US East (N. Virginia)</SelectItem>
                  <SelectItem value="us-west-2">US West (Oregon)</SelectItem>
                  <SelectItem value="eu-west-1">Europe (Ireland)</SelectItem>
                  <SelectItem value="ap-southeast-1">Asia Pacific (Singapore)</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Input
                id="region"
                placeholder="nyc3"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
              />
            )}
          </div>

          {/* Endpoint for DigitalOcean */}
          {provider === 'digitalocean' && (
            <div>
              <Label htmlFor="endpoint">Endpoint URL</Label>
              <Input
                id="endpoint"
                placeholder="https://nyc3.digitaloceanspaces.com"
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
              />
            </div>
          )}

          {/* Access Key ID */}
          <div>
            <Label htmlFor="access-key">Access Key ID</Label>
            <Input
              id="access-key"
              placeholder="AKIA2EXAMPLE"
              value={accessKeyId}
              onChange={(e) => setAccessKeyId(e.target.value)}
            />
          </div>

          {/* Secret Access Key */}
          <div>
            <Label htmlFor="secret-key">Secret Access Key</Label>
            <div className="flex gap-2">
              <Input
                id="secret-key"
                type={showSecretKey ? 'text' : 'password'}
                placeholder="••••••••••••••••"
                value={secretAccessKey}
                onChange={(e) => setSecretAccessKey(e.target.value)}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSecretKey(!showSecretKey)}
              >
                {showSecretKey ? 'Hide' : 'Show'}
              </Button>
            </div>
          </div>

          {/* Root Directory / Start Path */}
          <div className="space-y-2">
            <Label htmlFor="root-folder">Root Directory (Optional)</Label>
            <div className="flex gap-2">
              <Input
                id="root-folder"
                placeholder="e.g. photos/ or leave empty for bucket root"
                value={rootFolder}
                onChange={(e) => setRootFolder(e.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleOpenFolderBrowser}
                disabled={loading || testing || browserLoading}
              >
                Browse Folders
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Define a starting path. The file explorer will start here and restrict access above it.
            </p>
          </div>

          {/* Folder Browser Card */}
          {showFolderBrowser && (
            <Card className="border border-slate-800 bg-slate-950/60 backdrop-blur-md overflow-hidden transition-all duration-300">
              <CardHeader className="bg-slate-900/40 p-4 border-b border-slate-800">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span>Browse Bucket: <span className="font-mono text-xs text-amber-500 font-semibold">{bucket}</span></span>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-6 w-6 p-0 hover:bg-slate-800"
                    onClick={() => setShowFolderBrowser(false)}
                  >
                    ×
                  </Button>
                </CardTitle>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap font-mono mt-1">
                  <span className="cursor-pointer hover:underline text-blue-400" onClick={() => loadBrowserFolders('')}>root</span>
                  {browserCurrentPath.split('/').filter(Boolean).map((part, index, arr) => {
                    const path = arr.slice(0, index + 1).join('/') + '/';
                    return (
                      <span key={index} className="flex items-center gap-1">
                        <span>/</span>
                        <span className="cursor-pointer hover:underline text-blue-400" onClick={() => loadBrowserFolders(path)}>{part}</span>
                      </span>
                    );
                  })}
                </div>
              </CardHeader>
              <CardContent className="p-4 space-y-4 max-h-[300px] overflow-y-auto">
                {browserLoading ? (
                  <div className="text-center py-4 text-xs text-muted-foreground animate-pulse">Loading folders...</div>
                ) : (
                  <div className="space-y-2">
                    {browserCurrentPath && (
                      <div 
                        className="flex items-center gap-2 p-2 hover:bg-slate-800/60 rounded-lg text-xs cursor-pointer font-medium text-slate-305"
                        onClick={() => {
                          const parts = browserCurrentPath.split('/').filter(Boolean);
                          const parent = parts.slice(0, -1).join('/') + (parts.length > 1 ? '/' : '');
                          loadBrowserFolders(parent);
                        }}
                      >
                        <span className="text-blue-400 font-bold">←</span> Parent Directory
                      </div>
                    )}

                    {browserFolders.length === 0 ? (
                      <div className="text-center py-4 text-xs text-muted-foreground italic">No subdirectories found here.</div>
                    ) : (
                      browserFolders.map((path) => {
                        const parts = path.split('/').filter(Boolean);
                        const folderName = parts[parts.length - 1];
                        return (
                          <div 
                            key={path}
                            className="flex items-center justify-between p-2 hover:bg-slate-800/60 rounded-lg text-xs cursor-pointer group"
                            onClick={() => loadBrowserFolders(path)}
                          >
                            <span className="flex items-center gap-2 text-slate-200">
                              <span className="text-blue-500">📁</span> {folderName}
                            </span>
                            <span className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                              Click to open
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}

                {/* Create Folder Row */}
                <div className="flex gap-2 pt-2 border-t border-slate-800">
                  <Input
                    placeholder="New folder name"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    className="h-8 text-xs bg-slate-950/80 border-slate-805"
                    disabled={browserLoading}
                  />
                  <Button 
                    size="sm" 
                    className="h-8 text-xs shrink-0 cursor-pointer"
                    onClick={handleBrowserCreateFolder}
                    disabled={browserLoading || !newFolderName.trim()}
                  >
                    Create
                  </Button>
                </div>

                <div className="flex gap-2 justify-end pt-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-8 text-xs border-slate-850 bg-slate-900/40 cursor-pointer"
                    onClick={() => setShowFolderBrowser(false)}
                  >
                    Cancel
                  </Button>
                  <Button 
                    size="sm" 
                    className="h-8 text-xs bg-blue-600 hover:bg-blue-500 text-white cursor-pointer"
                    onClick={() => {
                      setRootFolder(browserCurrentPath);
                      setShowFolderBrowser(false);
                      toast.success(`Selected "${browserCurrentPath || 'root'}" as root folder`);
                    }}
                  >
                    Select Current Folder
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Info Cards */}
          <Card className="bg-muted/50 border-0">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Credentials Security</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Your credentials are encrypted before being stored in our database. Never share your secret access key.
            </CardContent>
          </Card>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-2 justify-between mt-6">
          <Button 
            variant="secondary" 
            onClick={handleTestConnection} 
            disabled={loading || testing}
            className="w-full sm:w-auto"
          >
            {testing ? 'Testing...' : 'Test Connection'}
          </Button>
          <div className="flex gap-2 justify-end w-full sm:w-auto">
            <Button variant="outline" onClick={onClose} disabled={loading || testing} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={loading || testing} className="w-full sm:w-auto">
              {loading ? 'Saving...' : 'Save Configuration'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

