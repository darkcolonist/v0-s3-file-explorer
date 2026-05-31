'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase-client';
import { encryptCredentials } from '@/lib/encryption';

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
  const [showSecretKey, setShowSecretKey] = useState(false);

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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('User not authenticated');
        return;
      }

      const credentials = {
        accessKeyId,
        secretAccessKey,
        ...(provider === 'digitalocean' && { endpoint }),
      };

      const encryptedCredentials = encryptCredentials(credentials);

      const { error } = await supabase
        .from('user_s3_configs')
        .upsert(
          {
            user_id: user.id,
            provider,
            bucket,
            region,
            encrypted_credentials: encryptedCredentials,
          },
          { onConflict: 'user_id' }
        );

      if (error) {
        toast.error(`Failed to save configuration: ${error.message}`);
        return;
      }

      toast.success('S3 configuration saved');
      setBucket('');
      setAccessKeyId('');
      setSecretAccessKey('');
      setEndpoint('');
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
        <div className="flex gap-2 justify-end mt-6">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? 'Saving...' : 'Save Configuration'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
