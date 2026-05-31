'use client';

import { useState, useEffect, useCallback } from 'react';
import { S3Manager, S3Object } from '@/lib/s3-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Folder,
  File,
  ChevronRight,
  Upload,
  Trash2,
  Eye,
  Download,
  RefreshCw,
  ChevronLeft,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { MediaPlayer } from './media-player';

interface FileExplorerProps {
  s3Manager: S3Manager;
}

export function FileExplorer({ s3Manager }: FileExplorerProps) {
  const [objects, setObjects] = useState<S3Object[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentPath, setCurrentPath] = useState('');
  const [breadcrumbs, setBreadcrumbs] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<S3Object | null>(null);
  const [uploadingFiles, setUploadingFiles] = useState<Set<string>>(new Set());
  const [overwriteTarget, setOverwriteTarget] = useState<{ file: File; key: string } | null>(null);
  const [selectedFile, setSelectedFile] = useState<S3Object | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      const items = await s3Manager.listObjects(currentPath);
      setObjects(items);
    } catch (err) {
      toast.error('Failed to load files');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [s3Manager, currentPath]);

  useEffect(() => {
    loadFiles();
    // Update breadcrumbs
    const parts = currentPath.split('/').filter(Boolean);
    setBreadcrumbs(parts);
  }, [currentPath, loadFiles]);

  const navigateToFolder = (folder: string) => {
    setCurrentPath(folder);
  };

  const handleBreadcrumbClick = (index: number) => {
    const parts = currentPath.split('/').filter(Boolean);
    const newPath = parts.slice(0, index + 1).join('/') + (index >= 0 ? '/' : '');
    setCurrentPath(newPath);
  };

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileKey = currentPath + file.name;

      // Check if file already exists
      const fileExists = objects.some((obj) => obj.key === fileKey && !obj.isDirectory);

      if (fileExists) {
        setOverwriteTarget({ file, key: fileKey });
        return;
      }

      await uploadFile(file, fileKey);
    }
  };

  const uploadFile = async (file: File, key: string) => {
    setUploadingFiles((prev) => new Set(prev).add(key));
    try {
      const contentType = file.type || 'application/octet-stream';
      await s3Manager.uploadObject(key, file, contentType);
      toast.success(`Uploaded ${file.name}`);
      loadFiles();
    } catch (err) {
      toast.error(`Failed to upload ${file.name}`);
      console.error(err);
    } finally {
      setUploadingFiles((prev) => {
        const newSet = new Set(prev);
        newSet.delete(key);
        return newSet;
      });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    try {
      await s3Manager.deleteObject(deleteTarget.key);
      toast.success('File deleted');
      setDeleteTarget(null);
      loadFiles();
    } catch (err) {
      toast.error('Failed to delete file');
      console.error(err);
    }
  };

  const handlePreview = async (file: S3Object) => {
    setSelectedFile(file);
    try {
      const url = await s3Manager.getSignedDownloadUrl(file.key);
      setPreviewUrl(url);
    } catch (err) {
      toast.error('Failed to load preview');
      console.error(err);
    }
  };

  const handleDownload = async () => {
    if (!selectedFile) return;
    try {
      const url = await s3Manager.getSignedDownloadUrl(selectedFile.key);
      const a = document.createElement('a');
      a.href = url;
      a.download = selectedFile.key.split('/').pop() || 'download';
      a.click();
      toast.success('Download started');
    } catch (err) {
      toast.error('Failed to download file');
      console.error(err);
    }
  };

  const getFileIcon = (obj: S3Object) => {
    if (obj.isDirectory) {
      return <Folder className="w-5 h-5 text-blue-500" />;
    }
    return <File className="w-5 h-5 text-gray-500" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '-';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="space-y-4">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-2 text-sm overflow-x-auto pb-2">
        <button
          onClick={() => setCurrentPath('')}
          className="text-blue-600 hover:underline whitespace-nowrap"
        >
          Root
        </button>
        {breadcrumbs.map((crumb, index) => (
          <div key={index} className="flex items-center gap-2 whitespace-nowrap">
            <ChevronRight className="w-4 h-4 text-gray-400" />
            <button
              onClick={() => handleBreadcrumbClick(index)}
              className="text-blue-600 hover:underline"
            >
              {crumb}
            </button>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex gap-2 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <Input
            type="file"
            multiple
            onChange={(e) => handleUpload(e.target.files)}
            className="hidden"
            id="file-input"
          />
          <Button
            asChild
            className="w-full"
            size="sm"
          >
            <label htmlFor="file-input" className="cursor-pointer">
              <Upload className="w-4 h-4 mr-2" />
              Upload Files
            </label>
          </Button>
        </div>
        <Button onClick={loadFiles} variant="outline" size="sm" disabled={loading}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {/* File List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Files & Folders</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : objects.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No files or folders</div>
          ) : (
            <div className="space-y-2">
              {objects.map((obj, index) => {
                const isUploading = uploadingFiles.has(obj.key);
                return (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 hover:bg-muted rounded-lg group"
                  >
                    <div
                      className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                      onClick={() => obj.isDirectory && navigateToFolder(obj.key)}
                    >
                      {getFileIcon(obj)}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{obj.key.split('/').pop()}</p>
                        {!obj.isDirectory && (
                          <p className="text-xs text-muted-foreground">
                            {formatFileSize(obj.size)}
                          </p>
                        )}
                      </div>
                    </div>
                    {!obj.isDirectory && (
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handlePreview(obj)}
                          disabled={isUploading}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            try {
                              const url = await s3Manager.getSignedDownloadUrl(obj.key);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = obj.key.split('/').pop() || 'download';
                              a.click();
                              toast.success('Download started');
                            } catch (err) {
                              toast.error('Failed to download');
                            }
                          }}
                          disabled={isUploading}
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDeleteTarget(obj)}
                          disabled={isUploading}
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete File</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deleteTarget?.key.split('/').pop()}&quot;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-2 justify-end">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Overwrite Confirmation */}
      <AlertDialog open={!!overwriteTarget} onOpenChange={() => setOverwriteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>File Already Exists</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{overwriteTarget?.file.name}&quot; already exists. Do you want to overwrite it?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-2 justify-end">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (overwriteTarget) {
                  await uploadFile(overwriteTarget.file, overwriteTarget.key);
                  setOverwriteTarget(null);
                }
              }}
            >
              Overwrite
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Media Player */}
      {selectedFile && previewUrl && (
        <MediaPlayer
          fileUrl={previewUrl}
          fileName={selectedFile.key.split('/').pop() || ''}
          fileType={selectedFile.key.split('.').pop() || ''}
          onClose={() => {
            setSelectedFile(null);
            setPreviewUrl(null);
          }}
          onDownload={handleDownload}
        />
      )}
    </div>
  );
}
