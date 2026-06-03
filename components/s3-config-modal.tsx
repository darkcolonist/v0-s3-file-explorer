'use client';

import { useState, useEffect, useRef, useCallback, type ChangeEvent } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileDown, FileUp } from 'lucide-react';
import toast from 'react-hot-toast';
import { CREDENTIAL_DECRYPT_TOAST, ENCRYPTION_KEY_SERVER_TOAST } from '@/lib/encryption-messages';
import {
  deleteS3ConfigFromApi,
  fetchS3ConfigFromApi,
  fetchS3ConfigListFromApi,
  saveS3ConfigToApi,
} from '@/lib/s3-config-api';
import { S3Manager } from '@/lib/s3-client';
import type { S3ConfigSummary } from '@/lib/s3-config-types';
import {
  buildExportPayload,
  downloadExportJson,
  parseImportJson,
  resolveUniqueConnectionName,
} from '@/lib/s3-config-import-export';

function connectionNameToBucketName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9.-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function extractDoRegionFromEndpoint(endpoint: string): string | null {
  try {
    const url = new URL(endpoint.includes('://') ? endpoint : `https://${endpoint}`);
    const parts = url.hostname.toLowerCase().split('.');
    const doIdx = parts.indexOf('digitaloceanspaces');
    if (doIdx >= 1) {
      const region = parts[doIdx - 1];
      if (/^[a-z0-9]+$/.test(region)) return region;
    }
  } catch {
    // ignore invalid URLs while typing
  }
  return null;
}

interface S3ConfigModalProps {
  open: boolean;
  onClose: () => void;
  onConfigSaved: () => void;
  connections?: S3ConfigSummary[];
}

export function S3ConfigModal({
  open,
  onClose,
  onConfigSaved,
  connections = [],
}: S3ConfigModalProps) {
  const [savedConnections, setSavedConnections] = useState<S3ConfigSummary[]>(connections);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
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
  const [deleting, setDeleting] = useState(false);
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const formSessionRef = useRef(0);
  const bucketAutoSyncRef = useRef(true);
  const regionAutoSyncRef = useRef(true);

  const resetForm = useCallback(() => {
    formSessionRef.current += 1;
    bucketAutoSyncRef.current = true;
    regionAutoSyncRef.current = true;
    setEditingId(null);
    setName('');
    setProvider('aws');
    setBucket('');
    setRegion('us-east-1');
    setAccessKeyId('');
    setSecretAccessKey('');
    setEndpoint('');
    setRootFolder('');
    setShowFolderBrowser(false);
    setShowSecretKey(false);
    setBrowserCurrentPath('');
    setBrowserFolders([]);
    setNewFolderName('');
  }, []);

  const applyConfigToForm = useCallback((config: {
    id: string;
    name: string;
    provider: 'aws' | 'digitalocean';
    bucket: string;
    region: string;
    credentials: {
      accessKeyId?: string;
      secretAccessKey?: string;
      endpoint?: string;
      rootFolder?: string;
    };
  }) => {
    bucketAutoSyncRef.current = false;
    regionAutoSyncRef.current = false;
    setEditingId(config.id);
    setName(config.name);
    setProvider(config.provider);
    setBucket(config.bucket);
    setRegion(config.region);
    setAccessKeyId(config.credentials.accessKeyId || '');
    setSecretAccessKey(config.credentials.secretAccessKey || '');
    setEndpoint(config.credentials.endpoint || '');
    setRootFolder(config.credentials.rootFolder || '');
    setShowFolderBrowser(false);
    setBrowserCurrentPath('');
    setBrowserFolders([]);
    setNewFolderName('');
  }, []);

  const createFormS3Manager = useCallback(() => {
    if (provider === 'digitalocean' && !endpoint) {
      throw new Error('Endpoint is required for DigitalOcean Spaces');
    }

    return new S3Manager({
      accessKeyId,
      secretAccessKey,
      region,
      bucket,
      endpoint: provider === 'digitalocean' ? endpoint : undefined,
      forcePathStyle: provider === 'digitalocean',
    });
  }, [accessKeyId, secretAccessKey, region, bucket, endpoint, provider]);

  const loadConnectionIntoForm = useCallback(async (connectionId: string) => {
    const session = formSessionRef.current;
    try {
      const result = await fetchS3ConfigFromApi(connectionId);
      if (session !== formSessionRef.current) return;

      if (!result.ok) {
        if (result.code === 'ENCRYPTION_NOT_CONFIGURED') {
          toast.error(ENCRYPTION_KEY_SERVER_TOAST, { duration: 10000 });
        } else if (result.code === 'DECRYPT_FAILED') {
          toast.error(CREDENTIAL_DECRYPT_TOAST, { duration: 10000 });
        } else {
          toast.error(`Failed to load connection: ${result.message}`);
        }
        return;
      }
      if (!result.config) {
        toast.error('Connection not found');
        return;
      }
      if (session !== formSessionRef.current) return;
      applyConfigToForm(result.config);
    } catch (err) {
      console.error('Failed to load connection in modal:', err);
      toast.error('Failed to load connection');
    }
  }, [applyConfigToForm]);

  useEffect(() => {
    setSavedConnections(connections);
  }, [connections]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    const refreshConnections = async () => {
      try {
        const listResult = await fetchS3ConfigListFromApi();
        if (cancelled) return;
        if (listResult.ok) {
          setSavedConnections(listResult.configs);
        }
        resetForm();
      } catch (err) {
        console.error('Failed to load saved config in modal:', err);
      }
    };

    void refreshConnections();
    return () => {
      cancelled = true;
    };
  }, [open, resetForm]);

  const loadBrowserFolders = async (path: string) => {
    if (!bucket || !region || !accessKeyId || !secretAccessKey) {
      toast.error('Credentials and bucket are required to browse folders');
      return;
    }

    setBrowserLoading(true);
    try {
      const tempManager = createFormS3Manager();

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
      const tempManager = createFormS3Manager();

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
    if (provider === 'digitalocean' && !endpoint) {
      toast.error('Endpoint is required for DigitalOcean Spaces');
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
      const tempManager = createFormS3Manager();

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
    if (!name.trim()) {
      toast.error('Connection name is required');
      return;
    }

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
        ...(editingId ? { id: editingId } : {}),
        name: name.trim(),
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

      toast.success(editingId ? 'Connection updated' : 'Connection saved');
      onConfigSaved();
      onClose();
    } catch (err) {
      toast.error('An error occurred while saving configuration');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!editingId) return;
    if (!window.confirm(`Delete connection "${name}"? This cannot be undone.`)) return;

    setDeleting(true);
    try {
      const result = await deleteS3ConfigFromApi(editingId);
      if (!result.ok) {
        toast.error(`Failed to delete connection: ${result.message}`);
        return;
      }

      toast.success('Connection deleted');
      onConfigSaved();
      onClose();
    } catch (err) {
      toast.error('An error occurred while deleting the connection');
      console.error(err);
    } finally {
      setDeleting(false);
    }
  };

  const handleConnectionSelect = (value: string) => {
    if (value === '__new__') {
      resetForm();
      return;
    }
    void loadConnectionIntoForm(value);
  };

  const connectionSelectValue = editingId ?? '__new__';
  const formBusy = loading || testing || deleting || importing;
  const canExport = !!editingId && !formBusy;

  const handleNameChange = (value: string) => {
    setName(value);
    if (bucketAutoSyncRef.current) {
      setBucket(connectionNameToBucketName(value));
    }
  };

  const handleBucketChange = (value: string) => {
    bucketAutoSyncRef.current = false;
    setBucket(value);
  };

  const handleRegionChange = (value: string) => {
    regionAutoSyncRef.current = false;
    setRegion(value);
  };

  const handleProviderChange = (value: 'aws' | 'digitalocean') => {
    setProvider(value);
    if (value === 'digitalocean' && region === 'us-east-1') {
      regionAutoSyncRef.current = true;
      setRegion('');
    }
  };

  const handleEndpointChange = (value: string) => {
    setEndpoint(value);
    if (provider !== 'digitalocean') return;

    const canAutoFillRegion =
      regionAutoSyncRef.current || !region.trim() || region === 'us-east-1';
    if (!canAutoFillRegion) return;

    const extracted = extractDoRegionFromEndpoint(value);
    if (extracted) {
      regionAutoSyncRef.current = true;
      setRegion(extracted);
    }
  };

  const handleExportConnection = () => {
    if (!editingId) return;

    if (!name.trim() || !bucket.trim() || !region.trim() || !accessKeyId || !secretAccessKey) {
      toast.error('Connection details are incomplete');
      return;
    }

    if (provider === 'digitalocean' && !endpoint.trim()) {
      toast.error('Endpoint is required for DigitalOcean exports');
      return;
    }

    downloadExportJson(
      buildExportPayload({
        name,
        provider,
        bucket,
        region,
        credentials: {
          accessKeyId,
          secretAccessKey,
          ...(provider === 'digitalocean' && { endpoint }),
          rootFolder,
        },
      })
    );
    toast.success('Connection exported');
  };

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setImporting(true);
    try {
      const text = await file.text();
      const parsed = parseImportJson(JSON.parse(text) as unknown);
      if (!parsed.ok) {
        toast.error(parsed.error);
        return;
      }

      const uniqueName = resolveUniqueConnectionName(
        parsed.payload.name,
        savedConnections.map((c) => c.name)
      );
      const importPayload = { ...parsed.payload, name: uniqueName };

      const result = await saveS3ConfigToApi(importPayload);
      if (!result.ok) {
        if (result.code === 'UNAUTHORIZED') {
          toast.error('User not authenticated');
        } else if (result.code === 'ENCRYPTION_NOT_CONFIGURED') {
          toast.error(ENCRYPTION_KEY_SERVER_TOAST, { duration: 10000 });
        } else {
          toast.error(`Failed to import connection: ${result.message}`);
        }
        return;
      }

      const renamed = uniqueName !== parsed.payload.name.trim();
      toast.success(
        renamed
          ? `Imported as "${uniqueName}" (name was already in use)`
          : `Imported "${uniqueName}"`
      );

      const listResult = await fetchS3ConfigListFromApi();
      if (listResult.ok) {
        setSavedConnections(listResult.configs);
      }

      onConfigSaved();
      await loadConnectionIntoForm(result.id);
    } catch {
      toast.error('Invalid connection JSON file');
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configure S3 Storage</DialogTitle>
          <DialogDescription>
            Manage your S3 or DigitalOcean Spaces connections
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={handleImportFile}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={formBusy}
              onClick={() => importInputRef.current?.click()}
            >
              <FileUp className="w-4 h-4 mr-1.5" />
              {importing ? 'Importing…' : 'Import JSON'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!canExport}
              onClick={handleExportConnection}
            >
              <FileDown className="w-4 h-4 mr-1.5" />
              Export JSON
            </Button>
          </div>
          <p className="text-xs text-muted-foreground -mt-2">
            Import saves a new connection immediately. Export is available for saved connections only
            and includes credentials in plain text — share with trusted users only.
          </p>

          {savedConnections.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="saved-connection">Saved connection</Label>
              <Select
                value={connectionSelectValue}
                onValueChange={handleConnectionSelect}
                disabled={formBusy}
              >
                <SelectTrigger id="saved-connection" className="w-full">
                  <SelectValue placeholder="Select a connection" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__new__">+ New connection</SelectItem>
                  {savedConnections.map((connection) => (
                    <SelectItem key={connection.id} value={connection.id}>
                      {connection.name} ({connection.bucket})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Label htmlFor="connection-name">Connection name</Label>
              <Input
                id="connection-name"
                placeholder="e.g. Production, Personal backup"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="provider">Provider</Label>
              <Select value={provider} onValueChange={(value) => handleProviderChange(value as 'aws' | 'digitalocean')}>
                <SelectTrigger id="provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="aws">AWS S3</SelectItem>
                  <SelectItem value="digitalocean">DigitalOcean Spaces</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="bucket">Bucket name</Label>
              <Input
                id="bucket"
                placeholder="my-bucket"
                value={bucket}
                onChange={(e) => handleBucketChange(e.target.value)}
              />
            </div>

            <div className={provider === 'aws' ? 'md:col-span-2' : ''}>
              <Label htmlFor="region">Region</Label>
              {provider === 'aws' ? (
                <Select value={region} onValueChange={handleRegionChange}>
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
                  onChange={(e) => handleRegionChange(e.target.value)}
                />
              )}
            </div>

            {provider === 'digitalocean' && (
              <div>
                <Label htmlFor="endpoint">Endpoint URL</Label>
                <Input
                  id="endpoint"
                  placeholder="https://nyc3.digitaloceanspaces.com"
                  value={endpoint}
                  onChange={(e) => handleEndpointChange(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Use the regional endpoint, not the bucket URL.
                </p>
              </div>
            )}

            <div>
              <Label htmlFor="access-key">Access key ID</Label>
              <Input
                id="access-key"
                placeholder="AKIA2EXAMPLE"
                value={accessKeyId}
                onChange={(e) => setAccessKeyId(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="secret-key">Secret access key</Label>
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
                  type="button"
                  className="shrink-0"
                  onClick={() => setShowSecretKey(!showSecretKey)}
                >
                  {showSecretKey ? 'Hide' : 'Show'}
                </Button>
              </div>
            </div>

            <div className="md:col-span-2 space-y-2">
              <Label htmlFor="root-folder">Root directory (optional)</Label>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  id="root-folder"
                  placeholder="e.g. photos/ or leave empty for bucket root"
                  value={rootFolder}
                  onChange={(e) => setRootFolder(e.target.value)}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={handleOpenFolderBrowser}
                  disabled={loading || testing || browserLoading}
                >
                  Browse folders
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Define a starting path. The file explorer will start here and restrict access above it.
              </p>
            </div>
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

          <Card className="bg-muted/50 border-0">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Credentials security</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Your credentials are encrypted before being stored in our database. Never share your secret access key.
            </CardContent>
          </Card>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col lg:flex-row gap-2 justify-between mt-6">
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              variant="secondary"
              onClick={handleTestConnection}
              disabled={formBusy}
              className="w-full sm:w-auto"
            >
              {testing ? 'Testing...' : 'Test connection'}
            </Button>
            {editingId && (
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={formBusy}
                className="w-full sm:w-auto"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </Button>
            )}
          </div>
          <div className="flex flex-col sm:flex-row gap-2 lg:justify-end w-full lg:w-auto">
            <Button variant="outline" onClick={onClose} disabled={formBusy} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={formBusy} className="w-full sm:w-auto">
              {loading ? 'Saving...' : editingId ? 'Update connection' : 'Save connection'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

