'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatDistanceToNow, format } from 'date-fns';
import { S3Manager, S3Object } from '@/lib/s3-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
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
  ExternalLink,
  Copy,
  MoreVertical,
  LayoutGrid,
  List,
  FolderPlus,
  FolderOpen,
  Share2,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { MediaPlayer } from './media-player';

interface FileExplorerProps {
  s3Manager: S3Manager;
  user: any;
}

interface UploadStatus {
  key: string;
  fileName: string;
  progress: number;
  status: 'uploading' | 'success' | 'failed';
  error?: string;
}

const getFileNameAndExtension = (key: string, isDirectory: boolean) => {
  const fullName = key.split('/').pop() || '';
  if (isDirectory) return { name: fullName, ext: '' };
  
  const lastDot = fullName.lastIndexOf('.');
  if (lastDot === -1 || lastDot === 0) return { name: fullName, ext: '' };
  
  return {
    name: fullName.slice(0, lastDot),
    ext: fullName.slice(lastDot + 1).toUpperCase()
  };
};

const isImageFile = (key: string) => {
  const ext = key.split('.').pop()?.toLowerCase() || '';
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext);
};

export function FileExplorer({ s3Manager, user }: FileExplorerProps) {
  const rootFolder = s3Manager.config.rootFolder 
    ? (s3Manager.config.rootFolder.endsWith('/') ? s3Manager.config.rootFolder : s3Manager.config.rootFolder + '/') 
    : '';

  const [objects, setObjects] = useState<S3Object[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentPath, setCurrentPath] = useState(rootFolder);
  const [breadcrumbs, setBreadcrumbs] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<S3Object | null>(null);
  const [uploadingFiles, setUploadingFiles] = useState<Set<string>>(new Set());
  const [overwriteTarget, setOverwriteTarget] = useState<{ file: File; key: string } | null>(null);
  const [selectedFile, setSelectedFile] = useState<S3Object | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  // Search & Pagination States
  const [searchQuery, setSearchQuery] = useState('');
  const [s3SearchQuery, setS3SearchQuery] = useState('');
  const [s3SearchActive, setS3SearchActive] = useState(false);
  const [visibleCount, setVisibleCount] = useState(10);

  // Drag and drop states
  const [isDragging, setIsDragging] = useState(false);
  // Upload status list
  const [uploads, setUploads] = useState<UploadStatus[]>([]);
  // Cached signed URLs for image thumbnails
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});

  // Synchronize starting currentPath from the URL path on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const decoded = decodeURIComponent(window.location.pathname);
      const segments = decoded.split('/').filter(Boolean);
      
      // If we are on the share link route `/f/...`, do not hijack routing
      if (window.location.pathname.startsWith('/f/')) return;
      
      if (segments.length === 0) {
        setCurrentPath(rootFolder);
      } else {
        const relativePath = segments.join('/') + '/';
        if (rootFolder && !relativePath.startsWith(rootFolder)) {
          setCurrentPath(rootFolder + relativePath);
        } else {
          setCurrentPath(relativePath);
        }
      }
    }
  }, [rootFolder]);

  // Synchronize URL path with currentPath when navigating
  useEffect(() => {
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/f/')) {
      let relativePath = currentPath;
      if (rootFolder && currentPath.startsWith(rootFolder)) {
        relativePath = currentPath.slice(rootFolder.length);
      }
      
      const cleanSegments = relativePath.split('/').filter(Boolean);
      const newPathname = cleanSegments.length > 0 ? '/' + cleanSegments.join('/') : '/';
      
      if (window.location.pathname !== newPathname) {
        window.history.pushState(null, '', newPathname);
      }
    }
  }, [currentPath, rootFolder]);

  // Load S3 signed URLs for images asynchronously to show thumbnails
  useEffect(() => {
    const imageFiles = objects.filter((obj) => !obj.isDirectory && isImageFile(obj.key));
    const missingKeys = imageFiles
      .map((obj) => obj.key)
      .filter((key) => !imageUrls[key]);

    if (missingKeys.length === 0) return;

    let active = true;

    const loadThumbnails = async () => {
      const fetched: Record<string, string> = {};
      await Promise.all(
        missingKeys.map(async (key) => {
          try {
            const url = await s3Manager.getSignedDownloadUrl(key, 3600);
            fetched[key] = url;
          } catch (err) {
            console.error(`Failed to load thumbnail: ${key}`, err);
          }
        })
      );

      if (active && Object.keys(fetched).length > 0) {
        setImageUrls((prev) => ({ ...prev, ...fetched }));
      }
    };

    loadThumbnails();

    return () => {
      active = false;
    };
  }, [objects, s3Manager]);

  // Reset path when active storage manager or its root path changes
  useEffect(() => {
    setCurrentPath(rootFolder);
  }, [s3Manager, rootFolder]);

  // Document-wide drag and drop listeners
  useEffect(() => {
    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (
        e.relatedTarget === null ||
        e.clientX <= 0 ||
        e.clientY <= 0 ||
        e.clientX >= window.innerWidth ||
        e.clientY >= window.innerHeight
      ) {
        setIsDragging(false);
      }
    };

    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      if (e.dataTransfer && e.dataTransfer.files.length > 0) {
        await handleUpload(e.dataTransfer.files);
      }
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleDrop);
    };
  }, [currentPath, objects]);

  const loadFiles = useCallback(async (activeSearch = s3SearchQuery) => {
    setLoading(true);
    try {
      const items = await s3Manager.listObjects(currentPath, activeSearch, !!activeSearch);
      setObjects(items);
      setVisibleCount(10); // Reset pagination display count
    } catch (err) {
      toast.error('Failed to load files');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [s3Manager, currentPath, s3SearchQuery]);

  useEffect(() => {
    loadFiles(s3SearchQuery);
    // Update breadcrumbs relative to rootFolder
    const rootPartsCount = rootFolder.split('/').filter(Boolean).length;
    const parts = currentPath.split('/').filter(Boolean);
    const relativeParts = parts.slice(rootPartsCount);
    setBreadcrumbs(relativeParts);
  }, [currentPath, loadFiles, rootFolder, s3SearchQuery]);

  const navigateToFolder = (folder: string) => {
    setSearchQuery('');
    setS3SearchQuery('');
    setS3SearchActive(false);
    setCurrentPath(folder);
  };

  const handleBreadcrumbClick = (index: number) => {
    const rootPartsCount = rootFolder.split('/').filter(Boolean).length;
    const parts = currentPath.split('/').filter(Boolean);
    const actualIndex = index + rootPartsCount;
    const newPath = parts.slice(0, actualIndex + 1).join('/') + (actualIndex >= 0 ? '/' : '');
    setCurrentPath(newPath);
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;

    const folderName = newFolderName.trim();
    const folderKey = currentPath + folderName + '/';

    setLoading(true);
    try {
      await s3Manager.uploadObject(folderKey, new Blob([]), 'application/x-directory');
      toast.success(`Folder "${folderName}" created`);
      setNewFolderName('');
      setShowNewFolderInput(false);
      loadFiles();
    } catch (err) {
      toast.error('Failed to create folder');
      console.error(err);
    } finally {
      setLoading(false);
    }
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
    
    const newUpload: UploadStatus = {
      key,
      fileName: file.name,
      progress: 0,
      status: 'uploading',
    };
    setUploads((prev) => [newUpload, ...prev]);

    try {
      const contentType = file.type || 'application/octet-stream';
      const uploadUrl = await s3Manager.getSignedUploadUrl(key, contentType);

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', uploadUrl, true);
        xhr.setRequestHeader('Content-Type', contentType);

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const progress = Math.round((event.loaded / event.total) * 100);
            setUploads((prev) =>
              prev.map((up) => (up.key === key ? { ...up, progress } : up))
            );
          }
        };

        xhr.onload = () => {
          if (xhr.status === 200) {
            setUploads((prev) =>
              prev.map((up) => (up.key === key ? { ...up, status: 'success', progress: 100 } : up))
            );
            resolve();
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        };

        xhr.onerror = () => {
          reject(new Error('Network error during upload'));
        };

        xhr.send(file);
      });

      toast.success(`Uploaded ${file.name}`);
      loadFiles();

      // Automatically copy to clipboard when upload completes successfully
      try {
        const downloadUrl = await s3Manager.getSignedDownloadUrl(key);
        await navigator.clipboard.writeText(downloadUrl);
        toast.success(`URL for ${file.name} copied to clipboard`);
      } catch (copyErr) {
        console.error('Failed to auto-copy URL:', copyErr);
      }
    } catch (err: any) {
      console.error('Upload failed:', err);
      setUploads((prev) =>
        prev.map((up) => (up.key === key ? { ...up, status: 'failed', error: err.message } : up))
      );
      toast.error(`Failed to upload ${file.name}`);
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

  const handleVisit = async (file: S3Object) => {
    try {
      const url = await s3Manager.getSignedDownloadUrl(file.key);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      toast.error('Failed to open file');
      console.error(err);
    }
  };

  const handleCopyUrl = async (key: string) => {
    try {
      const url = await s3Manager.getSignedDownloadUrl(key);
      await navigator.clipboard.writeText(url);
      toast.success('URL copied to clipboard');
    } catch (err) {
      toast.error('Failed to copy URL');
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

  const handleCopyShareableUrl = async (key: string) => {
    try {
      if (!user) {
        toast.error('User not authenticated');
        return;
      }
      const shareUrl = `${window.location.origin}/f/${user.id}/${key}`;
      await navigator.clipboard.writeText(shareUrl);
      toast.success('Shareable link copied to clipboard');
    } catch (err) {
      toast.error('Failed to copy shareable link');
      console.error(err);
    }
  };

  const getFilteredAndSortedObjects = () => {
    let list = objects;
    if (searchQuery && !s3SearchActive) {
      list = objects.filter((obj) => {
        const { name } = getFileNameAndExtension(obj.key, obj.isDirectory);
        return name.toLowerCase().includes(searchQuery.toLowerCase());
      });
    }

    return [...list].sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      if (a.isDirectory && b.isDirectory) {
        return a.key.localeCompare(b.key);
      }
      return new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime();
    });
  };

  const sortedObjects = getFilteredAndSortedObjects();
  const paginatedObjects = sortedObjects.slice(0, visibleCount);
  const hasMore = sortedObjects.length > visibleCount;

  return (
    <div className="space-y-4">
      {/* Drag & Drop Visual Overlay */}
      {isDragging && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex flex-col items-center justify-center z-50 animate-in fade-in duration-200">
          <div className="p-8 border-2 border-dashed border-blue-500 rounded-3xl flex flex-col items-center gap-4 bg-slate-900/60 shadow-2xl scale-100 animate-in zoom-in-95 duration-200">
            <div className="p-4 bg-blue-500/10 rounded-2xl text-blue-500 animate-bounce">
              <Upload className="w-12 h-12" />
            </div>
            <h2 className="text-2xl font-bold text-white">Drop files to upload</h2>
            <p className="text-sm text-slate-400">Upload directly to <span className="font-mono text-blue-400 font-semibold">{currentPath || 'Root'}</span></p>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Desktop Controls (hidden on mobile) */}
        <div className="hidden sm:flex items-center border rounded-lg overflow-hidden bg-card shadow-sm flex-wrap w-full">
          {/* Upload Files - Far Left, Blue, with label */}
          <Input
            type="file"
            multiple
            onChange={(e) => handleUpload(e.target.files)}
            className="hidden"
            id="file-input-desktop"
          />
          <Button
            asChild
            variant="default"
            className="rounded-none border-r border-border bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 h-9 shadow-none cursor-pointer shrink-0"
            size="sm"
          >
            <label htmlFor="file-input-desktop" className="cursor-pointer flex items-center">
              <Upload className="w-4 h-4 mr-2" />
              Upload Files
            </label>
          </Button>

          {/* Current Path / Breadcrumbs */}
          <div className="flex items-center gap-2 px-3 py-1 border-r border-border text-sm overflow-x-auto min-w-[120px] max-w-[250px] sm:max-w-md md:max-w-xl shrink-0 select-none h-9">
            <FolderOpen className="w-4 h-4 text-blue-500 shrink-0" />
            <button
              onClick={() => setCurrentPath(rootFolder)}
              className="text-blue-600 hover:underline whitespace-nowrap font-medium text-xs"
            >
              Root
            </button>
            {breadcrumbs.map((crumb, index) => (
              <div key={index} className="flex items-center gap-1.5 whitespace-nowrap text-xs">
                <ChevronRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                <button
                  onClick={() => handleBreadcrumbClick(index)}
                  className="text-blue-600 hover:underline"
                >
                  {crumb}
                </button>
              </div>
            ))}
          </div>

          {/* New Folder - Icon only */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={showNewFolderInput ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setShowNewFolderInput(!showNewFolderInput)}
                className="h-9 w-9 p-0 rounded-none border-r border-border cursor-pointer shrink-0"
              >
                <FolderPlus className="w-4 h-4 text-blue-500" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>New Folder</TooltipContent>
          </Tooltip>

          {/* Refresh - Icon only */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={() => loadFiles()}
                variant="ghost"
                size="sm"
                disabled={loading}
                className="h-9 w-9 p-0 rounded-none border-r border-border cursor-pointer shrink-0"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh Files</TooltipContent>
          </Tooltip>

          {/* List View - Icon only */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('list')}
                className="h-9 w-9 p-0 rounded-none border-r border-border cursor-pointer shrink-0"
              >
                <List className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>List View</TooltipContent>
          </Tooltip>

          {/* Grid View - Icon only */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('grid')}
                className="h-9 w-9 p-0 rounded-none cursor-pointer shrink-0"
              >
                <LayoutGrid className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Grid View</TooltipContent>
          </Tooltip>
        </div>

        {/* Mobile Controls (hidden on desktop) */}
        <div className="flex sm:hidden items-center border rounded-lg overflow-hidden bg-card shadow-sm w-full">
          {/* Upload Files - Left side */}
          <Input
            type="file"
            multiple
            onChange={(e) => handleUpload(e.target.files)}
            className="hidden"
            id="file-input-mobile"
          />
          <Button
            asChild
            variant="default"
            className="rounded-none border-r border-border bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 h-9 shadow-none cursor-pointer flex-1 justify-center"
            size="sm"
          >
            <label htmlFor="file-input-mobile" className="cursor-pointer flex items-center justify-center">
              <Upload className="w-4 h-4 mr-2" />
              Upload Files
            </label>
          </Button>

          {/* Refresh - Standard button */}
          <Button
            onClick={() => loadFiles()}
            variant="ghost"
            size="sm"
            disabled={loading}
            className="h-9 w-9 p-0 rounded-none border-r border-border cursor-pointer shrink-0"
            title="Refresh Files"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>

          {/* More options - Dropdown menu (hamburger / 3-button style) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-9 w-9 p-0 rounded-none cursor-pointer shrink-0"
                title="More Actions"
              >
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 max-w-[calc(100vw-32px)]">
              {/* Path / Current directory info */}
              <div className="p-2 border-b">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">Current Directory</span>
                <div className="flex items-center gap-1.5 text-xs text-blue-600 overflow-x-auto py-1 scrollbar-none">
                  <FolderOpen className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                  <button
                    onClick={() => setCurrentPath(rootFolder)}
                    className="hover:underline whitespace-nowrap font-semibold"
                  >
                    Root
                  </button>
                  {breadcrumbs.map((crumb, index) => (
                    <div key={index} className="flex items-center gap-1 shrink-0">
                      <ChevronRight className="w-3 h-3 text-gray-400" />
                      <button
                        onClick={() => handleBreadcrumbClick(index)}
                        className="hover:underline whitespace-nowrap"
                      >
                        {crumb}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Other Actions */}
              <DropdownMenuItem
                onClick={() => setShowNewFolderInput(!showNewFolderInput)}
                className="cursor-pointer"
              >
                <FolderPlus className="w-4 h-4 mr-2 text-blue-500" />
                New Folder
              </DropdownMenuItem>
              
              <DropdownMenuSeparator />
              
              <div className="p-2">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-2">View Mode</span>
                <div className="grid grid-cols-2 gap-1">
                  <Button
                    variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('list')}
                    className="h-8 text-xs cursor-pointer"
                  >
                    <List className="w-3.5 h-3.5 mr-1.5" />
                    List
                  </Button>
                  <Button
                    variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('grid')}
                    className="h-8 text-xs cursor-pointer"
                  >
                    <LayoutGrid className="w-3.5 h-3.5 mr-1.5" />
                    Grid
                  </Button>
                </div>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {showNewFolderInput && (
        <div className="flex gap-2 p-3 bg-card border rounded-lg w-full sm:max-w-sm animate-in fade-in slide-in-from-top-2 duration-200">
          <Input
            placeholder="Folder name"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            className="h-9 text-sm"
            onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
            autoFocus
          />
          <div className="flex gap-1 shrink-0">
            <Button size="sm" variant="ghost" onClick={() => setShowNewFolderInput(false)} className="h-9 cursor-pointer">
              Cancel
            </Button>
            <Button size="sm" onClick={handleCreateFolder} disabled={!newFolderName.trim()} className="h-9 cursor-pointer">
              Create
            </Button>
          </div>
        </div>
      )}

      {/* Search Bar */}
      <div className="flex items-center gap-2 w-full">
        <div className="relative flex-1">
          <Input
            id="file-search-input"
            placeholder="Filter files by name…"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (!e.target.value) {
                setS3SearchQuery('');
                setS3SearchActive(false);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && searchQuery.trim()) {
                setS3SearchQuery(searchQuery.trim());
                setS3SearchActive(true);
                loadFiles(searchQuery.trim());
              }
              if (e.key === 'Escape') {
                setSearchQuery('');
                setS3SearchQuery('');
                setS3SearchActive(false);
              }
            }}
            className="h-9 pr-24 text-sm"
          />
          <div className="absolute right-1 top-1 flex gap-1">
            {(searchQuery || s3SearchActive) && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-muted-foreground cursor-pointer"
                onClick={() => {
                  setSearchQuery('');
                  setS3SearchQuery('');
                  setS3SearchActive(false);
                }}
              >
                Clear
              </Button>
            )}
            <Button
              size="sm"
              variant={s3SearchActive ? 'secondary' : 'ghost'}
              className="h-7 px-2 text-xs cursor-pointer"
              disabled={!searchQuery.trim()}
              onClick={() => {
                if (searchQuery.trim()) {
                  setS3SearchQuery(searchQuery.trim());
                  setS3SearchActive(true);
                  loadFiles(searchQuery.trim());
                }
              }}
              title={s3SearchActive ? 'S3 prefix search active' : 'Search S3 (press Enter)'}
            >
              {s3SearchActive ? 'S3 ✓' : 'S3'}
            </Button>
          </div>
        </div>
      </div>

      {/* File List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Files & Folders</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground animate-pulse">Loading...</div>
          ) : objects.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground italic">No files or folders found here.</div>
          ) : viewMode === 'list' ? (
            <div className="space-y-2">
              {paginatedObjects.map((obj, index) => {
                const isUploading = uploadingFiles.has(obj.key);
                const { name: fileName, ext: fileExt } = getFileNameAndExtension(obj.key, obj.isDirectory);
                return (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 hover:bg-muted rounded-lg group transition duration-150"
                  >
                    <div
                      className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                      onClick={() => obj.isDirectory ? navigateToFolder(obj.key) : handleVisit(obj)}
                    >
                      {(() => {
                        if (obj.isDirectory) {
                          return (
                            <div className="w-8 h-8 flex items-center justify-center shrink-0">
                              <Folder className="w-5 h-5 text-blue-500" />
                            </div>
                          );
                        }
                        if (isImageFile(obj.key)) {
                          const thumbUrl = imageUrls[obj.key];
                          if (thumbUrl) {
                            return (
                              <div className="w-8 h-8 rounded border border-muted bg-muted overflow-hidden shrink-0 flex items-center justify-center">
                                <img 
                                  src={thumbUrl} 
                                  alt={obj.key.split('/').pop()} 
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            );
                          }
                          return (
                            <div className="w-8 h-8 rounded border border-muted bg-muted/40 animate-pulse shrink-0 flex items-center justify-center">
                              <File className="w-4 h-4 text-slate-400" />
                            </div>
                          );
                        }
                        return (
                          <div className="w-8 h-8 flex items-center justify-center shrink-0">
                            <File className="w-5 h-5 text-gray-500" />
                          </div>
                        );
                      })()}
                      <div className="min-w-0 flex-1 flex flex-col justify-center">
                        <div className="flex items-center gap-2 w-full min-w-0">
                          <p className="text-sm font-medium truncate text-card-foreground min-w-0">{fileName}</p>
                          {fileExt && (
                            <Badge 
                              variant="outline" 
                              className="text-[9px] px-1 py-0 bg-muted/40 font-mono text-muted-foreground uppercase font-semibold border-muted/80 shrink-0"
                            >
                              {fileExt}
                            </Badge>
                          )}
                        </div>
                        {!obj.isDirectory && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5 truncate w-full">
                            <span className="shrink-0">{formatFileSize(obj.size)}</span>
                            <span className="text-slate-400 dark:text-slate-600 shrink-0">•</span>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help hover:underline decoration-dotted decoration-muted-foreground/40 truncate">
                                  Uploaded {formatDistanceToNow(new Date(obj.lastModified), { addSuffix: true })}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                {format(new Date(obj.lastModified), "eeee, MMMM d, yyyy 'at' h:mm:ss a")}
                              </TooltipContent>
                            </Tooltip>
                          </p>
                        )}
                      </div>
                    </div>
                    {!obj.isDirectory && (
                      <>
                        {/* Desktop Actions */}
                        <div className="hidden md:flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2 shrink-0">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handlePreview(obj)}
                                disabled={isUploading}
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Preview File</TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleCopyUrl(obj.key)}
                                disabled={isUploading}
                              >
                                <Copy className="w-4 h-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Copy URL</TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger asChild>
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
                            </TooltipTrigger>
                            <TooltipContent>Download File</TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleVisit(obj)}
                                disabled={isUploading}
                              >
                                <ExternalLink className="w-4 h-4 text-blue-500" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Open in New Tab</TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setDeleteTarget(obj)}
                                disabled={isUploading}
                              >
                                <Trash2 className="w-4 h-4 text-red-500" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Delete File</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleCopyShareableUrl(obj.key)}
                                disabled={isUploading}
                              >
                                <Share2 className="w-4 h-4 text-emerald-500" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Copy Shareable Link</TooltipContent>
                          </Tooltip>
                        </div>

                        {/* Mobile Actions Dropdown */}
                        <div className="flex md:hidden ml-2 shrink-0">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 cursor-pointer">
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-40">
                              <DropdownMenuItem onClick={() => handlePreview(obj)} className="cursor-pointer">
                                <Eye className="w-4 h-4 mr-2" />
                                Preview
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleCopyUrl(obj.key)} className="cursor-pointer">
                                <Copy className="w-4 h-4 mr-2" />
                                Copy URL
                              </DropdownMenuItem>
                              <DropdownMenuItem 
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
                                className="cursor-pointer"
                              >
                                <Download className="w-4 h-4 mr-2" />
                                Download
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleVisit(obj)} className="cursor-pointer text-blue-500 focus:text-blue-600">
                                <ExternalLink className="w-4 h-4 mr-2" />
                                Open in New Tab
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => handleCopyShareableUrl(obj.key)} className="cursor-pointer text-emerald-600 focus:text-emerald-700">
                                <Share2 className="w-4 h-4 mr-2" />
                                Copy Shareable Link
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => setDeleteTarget(obj)} className="cursor-pointer text-red-600 focus:text-red-700">
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
              {hasMore && (
                <div className="flex justify-center pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setVisibleCount((c) => c + 10)}
                    className="cursor-pointer"
                  >
                    Load More ({sortedObjects.length - visibleCount} remaining)
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {paginatedObjects.map((obj, index) => {
                const isUploading = uploadingFiles.has(obj.key);
                const { name: fileName, ext: fileExt } = getFileNameAndExtension(obj.key, obj.isDirectory);
                return (
                  <div
                    key={index}
                    onClick={() => obj.isDirectory ? navigateToFolder(obj.key) : handleVisit(obj)}
                    className="relative group flex flex-col items-center justify-between p-4 bg-card hover:bg-muted/40 border rounded-xl transition duration-150 cursor-pointer text-center aspect-square select-none"
                  >
                    {/* Top Right Action Button for Files */}
                    {!obj.isDirectory && (
                      <div 
                        className="absolute top-2 right-2 md:opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity z-10"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 cursor-pointer bg-card/80 hover:bg-card border shadow-sm">
                              <MoreVertical className="w-3.5 h-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem onClick={() => handlePreview(obj)} className="cursor-pointer">
                              <Eye className="w-4 h-4 mr-2" />
                              Preview
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleCopyUrl(obj.key)} className="cursor-pointer">
                              <Copy className="w-4 h-4 mr-2" />
                              Copy URL
                            </DropdownMenuItem>
                            <DropdownMenuItem 
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
                              className="cursor-pointer"
                            >
                              <Download className="w-4 h-4 mr-2" />
                              Download
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleVisit(obj)} className="cursor-pointer text-blue-500 focus:text-blue-600">
                              <ExternalLink className="w-4 h-4 mr-2" />
                              Open in New Tab
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleCopyShareableUrl(obj.key)} className="cursor-pointer text-emerald-600 focus:text-emerald-700">
                              <Share2 className="w-4 h-4 mr-2" />
                              Copy Shareable Link
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => setDeleteTarget(obj)} className="cursor-pointer text-red-600 focus:text-red-700">
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    )}

                    {/* Graphic/Icon Representation */}
                    <div className="flex-1 flex items-center justify-center w-full min-h-0">
                      {(() => {
                        if (obj.isDirectory) {
                          return <Folder className="w-16 h-16 text-blue-500 shrink-0" />;
                        }
                        if (isImageFile(obj.key)) {
                          const thumbUrl = imageUrls[obj.key];
                          if (thumbUrl) {
                            return (
                              <div className="w-20 h-20 rounded-lg border bg-muted overflow-hidden flex items-center justify-center shadow-sm shrink-0">
                                <img 
                                  src={thumbUrl} 
                                  alt={obj.key.split('/').pop()} 
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            );
                          }
                          return (
                            <div className="w-20 h-20 rounded-lg border bg-muted/40 animate-pulse flex items-center justify-center shrink-0">
                              <File className="w-8 h-8 text-slate-400" />
                            </div>
                          );
                        }
                        return (
                          <div className="w-20 h-20 rounded-lg border bg-muted/20 flex items-center justify-center relative shrink-0">
                            <File className="w-10 h-10 text-gray-400" />
                            {fileExt && (
                              <Badge 
                                variant="outline" 
                                className="absolute bottom-1 right-1 text-[8px] px-1 py-0 bg-background/90 font-mono text-muted-foreground uppercase font-semibold border-muted/80"
                              >
                                {fileExt}
                              </Badge>
                            )}
                          </div>
                        );
                      })()}
                    </div>

                    {/* Metadata & Title */}
                    <div className="w-full mt-2 shrink-0">
                      <div className="flex items-center justify-center gap-1 min-w-0">
                        <p className="text-xs font-semibold truncate text-card-foreground max-w-[80%]">{fileName}</p>
                        {isImageFile(obj.key) && fileExt && (
                          <Badge 
                            variant="outline" 
                            className="text-[8px] px-0.5 py-0 bg-muted/40 font-mono text-muted-foreground uppercase font-semibold border-muted/80 scale-90 shrink-0"
                          >
                            {fileExt}
                          </Badge>
                        )}
                      </div>
                      {!obj.isDirectory && (
                        <p className="text-[9px] text-muted-foreground truncate mt-0.5">
                          {formatFileSize(obj.size)}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
              {hasMore && (
                <div className="col-span-full flex justify-center pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setVisibleCount((c) => c + 10)}
                    className="cursor-pointer"
                  >
                    Load More ({sortedObjects.length - visibleCount} remaining)
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Floating Uploads Progress Pane */}
      {uploads.length > 0 && (
        <Card className="fixed bottom-4 right-4 left-4 sm:left-auto sm:w-96 z-40 max-h-[350px] flex flex-col bg-slate-900/95 border-slate-800 shadow-2xl backdrop-blur-xl animate-in slide-in-from-bottom-5 duration-300">
          <CardHeader className="bg-slate-950/40 p-3 border-b border-slate-800 flex flex-row items-center justify-between space-y-0 shrink-0">
            <CardTitle className="text-xs font-bold flex items-center gap-2 text-white">
              <span>Uploads ({uploads.filter(u => u.status === 'uploading').length} active)</span>
            </CardTitle>
            <div className="flex gap-2">
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-6 text-[9px] uppercase font-bold text-slate-400 hover:text-white cursor-pointer px-1.5"
                onClick={() => setUploads((prev) => prev.filter((u) => u.status === 'uploading'))}
              >
                Clear Completed
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-6 w-6 p-0 text-slate-400 hover:text-white cursor-pointer"
                onClick={() => setUploads([])}
              >
                ×
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-3 overflow-y-auto space-y-2.5 flex-1">
            {uploads.map((up) => (
              <div key={up.key} className="space-y-1 text-xs">
                <div className="flex justify-between items-center gap-2">
                  <span className="font-medium text-slate-200 truncate max-w-[65%]">{up.fileName}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {up.status === 'success' && (
                      <button
                        onClick={() => handleCopyUrl(up.key)}
                        className="p-0.5 hover:bg-slate-800 rounded text-slate-400 hover:text-emerald-400 transition cursor-pointer"
                        title="Copy URL"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    )}
                    <span className={`font-semibold font-mono text-[9px] uppercase ${
                      up.status === 'success' ? 'text-emerald-400' :
                      up.status === 'failed' ? 'text-rose-400' : 'text-blue-400'
                    }`}>
                      {up.status === 'success' && 'Done'}
                      {up.status === 'failed' && 'Failed'}
                      {up.status === 'uploading' && `${up.progress}%`}
                    </span>
                  </div>
                </div>
                
                <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-200 ${
                      up.status === 'success' ? 'bg-emerald-500' :
                      up.status === 'failed' ? 'bg-rose-500' : 'bg-blue-500'
                    }`}
                    style={{ width: `${up.progress}%` }}
                  />
                </div>
                {up.error && <p className="text-[9px] text-rose-400/80 leading-tight">{up.error}</p>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

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
