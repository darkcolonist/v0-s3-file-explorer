'use client';

import { useState, useEffect, useCallback, useRef, type MouseEvent, type PointerEvent } from 'react';
import { computePageSize, getViewportSize, MIN_PAGE_SIZE } from '@/lib/viewport-page-size';
import {
  getStoredViewMode,
  storeViewMode,
  type ExplorerViewMode,
} from '@/lib/view-mode-storage';
import { formatDistanceToNow, format } from 'date-fns';
import { S3Manager, S3Object } from '@/lib/s3-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
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
  HardDrive,
  ChevronDown,
  CheckSquare,
  Pencil,
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { MediaPlayer } from './media-player';
import { Spinner } from '@/components/ui/spinner';
import { useIsMobile } from '@/hooks/use-mobile';
import type { S3ConfigSummary } from '@/lib/s3-config-types';

interface FileExplorerProps {
  s3Manager: S3Manager;
  user: any;
  connections?: S3ConfigSummary[];
  activeConnectionId?: string | null;
  onConnectionChange?: (connectionId: string) => void;
  connectionSwitching?: boolean;
}

interface UploadStatus {
  key: string;
  fileName: string;
  progress: number;
  status: 'uploading' | 'success' | 'failed';
  error?: string;
}

const getFileNameAndExtension = (key: string, isDirectory: boolean) => {
  if (isDirectory) {
    const parts = key.split('/').filter(Boolean);
    return { name: parts[parts.length - 1] || key, ext: '' };
  }
  const fullName = key.split('/').pop() || '';
  
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

export function FileExplorer({
  s3Manager,
  user,
  connections = [],
  activeConnectionId,
  onConnectionChange,
  connectionSwitching = false,
}: FileExplorerProps) {
  const isMobile = useIsMobile();
  const rootFolder = s3Manager.config.rootFolder 
    ? (s3Manager.config.rootFolder.endsWith('/') ? s3Manager.config.rootFolder : s3Manager.config.rootFolder + '/') 
    : '';

  const [objects, setObjects] = useState<S3Object[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentPath, setCurrentPath] = useState(rootFolder);
  const [breadcrumbs, setBreadcrumbs] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<S3Object | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [localConnectionSwitching, setLocalConnectionSwitching] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<Set<string>>(new Set());
  const [overwriteTarget, setOverwriteTarget] = useState<{ file: File; key: string } | null>(null);
  const [selectedFile, setSelectedFile] = useState<S3Object | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [viewMode, setViewMode] = useState<ExplorerViewMode>(() => getStoredViewMode());
  const [renameTarget, setRenameTarget] = useState<S3Object | null>(null);
  const [renameNewName, setRenameNewName] = useState('');
  const [renaming, setRenaming] = useState(false);

  // Search & Pagination States
  const [searchQuery, setSearchQuery] = useState('');
  const [s3SearchQuery, setS3SearchQuery] = useState('');
  const [s3SearchActive, setS3SearchActive] = useState(false);
  const [visibleCount, setVisibleCount] = useState(MIN_PAGE_SIZE);
  const [pageSize, setPageSize] = useState(MIN_PAGE_SIZE);

  const getPageSizeForView = useCallback(
    (mode: 'list' | 'grid') => computePageSize(mode, getViewportSize()),
    []
  );

  // Drag and drop states
  const [isDragging, setIsDragging] = useState(false);
  // Upload status list
  const [uploads, setUploads] = useState<UploadStatus[]>([]);
  // Cached signed URLs for image thumbnails
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  // Cached signed URLs for URL-preview tooltips
  const [fileUrls, setFileUrls] = useState<Record<string, string>>({});

  const objectsRef = useRef(objects);
  objectsRef.current = objects;
  const currentPathRef = useRef(currentPath);
  currentPathRef.current = currentPath;
  const viewModeRef = useRef(viewMode);
  viewModeRef.current = viewMode;
  const s3SearchQueryRef = useRef(s3SearchQuery);
  s3SearchQueryRef.current = s3SearchQuery;
  const prevRootFolderRef = useRef(rootFolder);

  useEffect(() => {
    if (!connectionSwitching) {
      setLocalConnectionSwitching(false);
    }
  }, [connectionSwitching]);

  const isConnectionSwitching = connectionSwitching || localConnectionSwitching;

  const handleConnectionSelect = (connectionId: string) => {
    if (isConnectionSwitching || connectionId === activeConnectionId) return;
    setLocalConnectionSwitching(true);
    onConnectionChange?.(connectionId);
  };

  useEffect(() => {
    setSelectedKeys(new Set());
  }, [currentPath]);

  useEffect(() => {
    storeViewMode(viewMode);
  }, [viewMode]);

  // Sync starting path from URL only on mount (connection switches reset URL to /)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const decoded = decodeURIComponent(window.location.pathname);
      const segments = decoded.split('/').filter(Boolean);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only apply URL on mount per connection
  }, []);

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

  // Reset path only when the configured root prefix changes (not on token refresh)
  useEffect(() => {
    if (prevRootFolderRef.current !== rootFolder) {
      prevRootFolderRef.current = rootFolder;
      setCurrentPath(rootFolder);
    }
  }, [rootFolder]);

  // Derive page size from viewport and view mode (columns × rows for grid)
  useEffect(() => {
    const syncPageSize = () => {
      const next = getPageSizeForView(viewMode);
      setPageSize(next);
      setVisibleCount((prev) => Math.max(prev, next));
    };

    syncPageSize();
    window.addEventListener('resize', syncPageSize);
    return () => window.removeEventListener('resize', syncPageSize);
  }, [viewMode, getPageSizeForView]);

  const loadFiles = useCallback(
    async (
      activeSearch = s3SearchQuery,
      options: { resetPagination?: boolean } = { resetPagination: true }
    ) => {
      setLoading(true);
      const fetchStartTime = Date.now();
      try {
        const items = await s3Manager.listObjects(currentPath, activeSearch, !!activeSearch);
        setObjects((prev) => {
          const localNewUploads = prev.filter((obj) => {
            const isSameFolder = obj.key.startsWith(currentPath);
            const isRecent = obj.lastModified && (new Date(obj.lastModified).getTime() >= fetchStartTime - 5000);
            const notInItems = !items.some((item) => item.key === obj.key);
            return isSameFolder && isRecent && notInItems;
          });
          return [...items, ...localNewUploads];
        });
        if (options.resetPagination) {
          setVisibleCount(getPageSizeForView(viewModeRef.current));
        }
      } catch (err) {
        toast.error('Failed to load files');
        console.error(err);
      } finally {
        setLoading(false);
      }
    },
    [s3Manager, currentPath, s3SearchQuery, getPageSizeForView]
  );

  const addUploadedObject = useCallback((file: File, key: string) => {
    const newObj: S3Object = {
      key,
      size: file.size,
      lastModified: new Date(),
      isDirectory: false,
    };
    setObjects((prev) => {
      const without = prev.filter((o) => o.key !== key);
      return [...without, newObj];
    });
  }, []);

  const removeObjectFromList = useCallback((key: string) => {
    setObjects((prev) => prev.filter((o) => o.key !== key));
    setImageUrls((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setFileUrls((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setSelectedFile((current) => {
      if (current?.key === key) {
        setPreviewUrl(null);
        return null;
      }
      return current;
    });
    setSelectedKeys((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const handleUploadRef = useRef<(files: FileList | File[] | null) => Promise<void>>(async () => {});

  // Document-wide drag and drop + clipboard paste listeners
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
        await handleUploadRef.current(e.dataTransfer.files);
      }
    };

    const handlePaste = async (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      const items = e.clipboardData?.items;
      if (!items) return;

      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }

      if (files.length === 0) return;

      e.preventDefault();
      await handleUploadRef.current(files);
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);
    window.addEventListener('paste', handlePaste);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleDrop);
      window.removeEventListener('paste', handlePaste);
    };
  }, []);

  // Load listing when navigating folders; manual refresh and search use loadFiles directly
  useEffect(() => {
    void loadFiles(s3SearchQueryRef.current);
    const rootPartsCount = rootFolder.split('/').filter(Boolean).length;
    const parts = currentPath.split('/').filter(Boolean);
    const relativeParts = parts.slice(rootPartsCount);
    setBreadcrumbs(relativeParts);
  }, [currentPath, loadFiles, rootFolder]);

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
      setObjects((prev) => {
        if (prev.some((o) => o.key === folderKey)) return prev;
        return [
          ...prev,
          {
            key: folderKey,
            size: 0,
            lastModified: new Date(),
            isDirectory: true,
          },
        ];
      });
    } catch (err) {
      toast.error('Failed to create folder');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;

    const path = currentPathRef.current;
    const list = Array.from(files);

    for (const file of list) {
      const fileKey = path + file.name;

      const fileExists = objectsRef.current.some(
        (obj) => obj.key === fileKey && !obj.isDirectory
      );

      if (fileExists) {
        setOverwriteTarget({ file, key: fileKey });
        return;
      }

      await uploadFile(file, fileKey);
    }
  };

  handleUploadRef.current = handleUpload;

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
      addUploadedObject(file, key);
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

    setDeleting(true);
    try {
      const key = deleteTarget.key;
      if (deleteTarget.isDirectory) {
        await s3Manager.deleteEmptyFolder(key);
        toast.success('Folder deleted');
      } else {
        await s3Manager.deleteObject(key);
        toast.success('File deleted');
      }
      setDeleteTarget(null);
      removeObjectFromList(key);
    } catch (err) {
      if (deleteTarget.isDirectory && (err as Error).name === 'FolderNotEmptyError') {
        toast.error('Unable to delete — folder is not empty. Remove its contents first.');
      } else {
        toast.error(deleteTarget.isDirectory ? 'Failed to delete folder' : 'Failed to delete file');
      }
      console.error(err);
    } finally {
      setDeleting(false);
    }
  };

  const startRename = (obj: S3Object) => {
    setRenameTarget(obj);
    const fileName = obj.key.split('/').pop() || '';
    setRenameNewName(fileName);
  };

  const handleRename = async () => {
    if (!renameTarget || !renameNewName.trim()) return;

    const oldKey = renameTarget.key;
    const parts = oldKey.split('/');
    parts.pop(); // Remove old filename
    const parentPath = parts.length > 0 ? parts.join('/') + '/' : '';
    const newKey = parentPath + renameNewName.trim();

    if (oldKey === newKey) {
      setRenameTarget(null);
      return;
    }

    const exists = objects.some((o) => o.key === newKey && !o.isDirectory);
    if (exists) {
      toast.error('A file with this name already exists');
      return;
    }

    setRenaming(true);
    try {
      await s3Manager.renameObject(oldKey, newKey);
      toast.success('File renamed successfully');

      // Update state locally
      setObjects((prev) =>
        prev.map((o) => (o.key === oldKey ? { ...o, key: newKey } : o))
      );

      // Clear old key caches
      setImageUrls((prev) => {
        const next = { ...prev };
        delete next[oldKey];
        return next;
      });
      setFileUrls((prev) => {
        const next = { ...prev };
        delete next[oldKey];
        return next;
      });

      // Update selectedKeys if the renamed file was selected
      setSelectedKeys((prev) => {
        if (!prev.has(oldKey)) return prev;
        const next = new Set(prev);
        next.delete(oldKey);
        next.add(newKey);
        return next;
      });

      setRenameTarget(null);
    } catch (err) {
      toast.error('Failed to rename file');
      console.error(err);
    } finally {
      setRenaming(false);
    }
  };

  const canDeleteFolder = (obj: S3Object) => {
    if (!obj.isDirectory) return true;
    if (obj.key === rootFolder) return false;
    if (rootFolder && obj.key.startsWith(rootFolder) && obj.key === rootFolder) return false;
    return true;
  };

  const toggleFileSelection = (key: string, selected: boolean) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (selected) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const exitBulkMode = () => {
    setBulkMode(false);
    setSelectedKeys(new Set());
  };

  const toggleBulkMode = () => {
    if (bulkMode) exitBulkMode();
    else setBulkMode(true);
  };

  const handleBulkDelete = async () => {
    const keys = Array.from(selectedKeys);
    if (keys.length === 0) return;

    setBulkDeleting(true);
    try {
      const results = await Promise.allSettled(
        keys.map((key) => s3Manager.deleteObject(key))
      );
      const succeeded = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.length - succeeded;

      keys.forEach((key, i) => {
        if (results[i].status === 'fulfilled') removeObjectFromList(key);
      });
      setSelectedKeys(new Set());
      setBulkMode(false);
      setBulkDeleteOpen(false);

      if (failed === 0) {
        toast.success(
          succeeded === 1 ? 'File deleted' : `Deleted ${succeeded} files`
        );
      } else if (succeeded > 0) {
        toast.error(`Deleted ${succeeded} files; ${failed} failed`);
      } else {
        toast.error('Failed to delete selected files');
      }
    } catch (err) {
      toast.error('Failed to delete selected files');
      console.error(err);
    } finally {
      setBulkDeleting(false);
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

  const prefetchUrl = async (key: string) => {
    if (fileUrls[key]) return;
    try {
      const url = await s3Manager.getSignedDownloadUrl(key);
      setFileUrls((prev) => ({ ...prev, [key]: url }));
    } catch {
      // silently fail — tooltip just won't show a url
    }
  };

  const renderDeleteButton = (
    obj: S3Object,
    isUploading: boolean,
    options?: { variant?: 'icon' | 'menu'; className?: string }
  ) => {
    if (!canDeleteFolder(obj)) return null;

    const label = obj.isDirectory ? 'Delete Folder' : 'Delete File';

    if (options?.variant === 'menu') {
      return (
        <DropdownMenuItem
          onClick={() => setDeleteTarget(obj)}
          className={`cursor-pointer text-red-600 focus:text-red-700 ${options.className ?? ''}`}
          disabled={isUploading}
        >
          <Trash2 className="w-4 h-4 mr-2" />
          Delete
        </DropdownMenuItem>
      );
    }

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setDeleteTarget(obj)}
            disabled={isUploading}
            className={options?.className}
          >
            <Trash2 className="w-4 h-4 text-red-500" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    );
  };
  const renderFileUrlLine = (signedUrl?: string) => (
    <div className="pt-1.5 mt-1 border-t border-border/60 min-w-0">
      <p className="text-[10px] font-medium text-muted-foreground mb-0.5">File URL</p>
      {signedUrl ? (
        <a
          href={signedUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          title={signedUrl}
          className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline block truncate max-w-[260px]"
        >
          {signedUrl}
        </a>
      ) : (
        <span className="text-[10px] text-muted-foreground italic">Loading URL…</span>
      )}
    </div>
  );

  const renderFileItemDetails = (
    obj: S3Object,
    fileName: string,
    fileExt: string,
    options?: { signedUrl?: string; includeUrl?: boolean }
  ) => (
    <div className="space-y-1 text-left max-w-[280px] pointer-events-auto min-w-0">
      {isImageFile(obj.key) && imageUrls[obj.key] && (
        <div className="w-full flex items-center justify-center aspect-video rounded-md overflow-hidden border border-border/80 bg-muted mb-2 shadow-sm">
          <img
            src={imageUrls[obj.key]}
            alt={fileName}
            className="max-w-full max-h-full object-contain"
          />
        </div>
      )}
      <p className="font-medium text-sm leading-snug break-words">{fileName}</p>
      {fileExt && (
        <p className="text-[10px] font-mono uppercase text-muted-foreground">{fileExt}</p>
      )}
      {obj.isDirectory ? (
        <p className="text-xs text-muted-foreground">Folder</p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">{formatFileSize(obj.size)}</p>
          <p className="text-xs text-muted-foreground">
            Uploaded {formatDistanceToNow(new Date(obj.lastModified), { addSuffix: true })}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {format(new Date(obj.lastModified), "MMM d, yyyy 'at' h:mm a")}
          </p>
        </>
      )}
      <p className="text-[10px] text-muted-foreground truncate" title={obj.key}>
        {obj.key}
      </p>
      {!obj.isDirectory && options?.includeUrl !== false && renderFileUrlLine(options?.signedUrl)}
    </div>
  );

  const renderFileTooltipActions = (obj: S3Object, isUploading: boolean) => {
    const stopEvent = (e: MouseEvent | PointerEvent) => e.stopPropagation();
    const iconBtn =
      'h-9 w-9 p-0 shrink-0 cursor-pointer bg-muted/50 hover:bg-muted border border-border/60';

    return (
      <div
        role="toolbar"
        aria-label="File actions"
        className="grid grid-cols-5 gap-1.5 w-[220px] pb-2.5 mb-2 border-b border-border/60"
        onClick={stopEvent}
        onPointerDown={stopEvent}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={iconBtn}
          disabled={isUploading}
          aria-label="Preview"
          title="Preview"
          onClick={() => handlePreview(obj)}
        >
          <Eye className="w-4 h-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={iconBtn}
          disabled={isUploading}
          aria-label="Copy URL"
          title="Copy URL"
          onClick={() => handleCopyUrl(obj.key)}
        >
          <Copy className="w-4 h-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={iconBtn}
          disabled={isUploading}
          aria-label="Download"
          title="Download"
          onClick={async () => {
            try {
              const url = await s3Manager.getSignedDownloadUrl(obj.key);
              const a = document.createElement('a');
              a.href = url;
              a.download = obj.key.split('/').pop() || 'download';
              a.click();
              toast.success('Download started');
            } catch {
              toast.error('Failed to download');
            }
          }}
        >
          <Download className="w-4 h-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={iconBtn}
          disabled={isUploading}
          aria-label="Open in new tab"
          title="Open in new tab"
          onClick={() => handleVisit(obj)}
        >
          <ExternalLink className="w-4 h-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={`${iconBtn} text-red-600 hover:text-red-500 dark:text-red-400`}
          disabled={isUploading}
          aria-label="Delete"
          title="Delete"
          onClick={() => setDeleteTarget(obj)}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    );
  };

  const renderGridTooltipContent = (
    obj: S3Object,
    fileName: string,
    fileExt: string,
    isUploading: boolean
  ) => (
    <div className="w-[240px] max-w-[min(90vw,280px)] min-w-0 pointer-events-auto">
      {!obj.isDirectory && renderFileTooltipActions(obj, isUploading)}
      {renderFileItemDetails(obj, fileName, fileExt, {
        signedUrl: fileUrls[obj.key],
        includeUrl: false,
      })}
      {!obj.isDirectory && renderFileUrlLine(fileUrls[obj.key])}
    </div>
  );

  const renderGridItemActionsMenu = (
    obj: S3Object,
    isUploading: boolean,
    fileName: string,
    fileExt: string
  ) => (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open && !obj.isDirectory) prefetchUrl(obj.key);
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 p-0 cursor-pointer hover:bg-muted touch-manipulation"
          aria-label={`Actions for ${fileName}`}
        >
          <MoreVertical className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        side={isMobile ? 'bottom' : 'right'}
        className="w-64 max-w-[min(100vw-2rem,18rem)]"
      >
        <DropdownMenuItem
          onClick={() => handlePreview(obj)}
          className="cursor-pointer"
          disabled={isUploading}
        >
          <Eye className="w-4 h-4 mr-2" />
          Preview
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleCopyUrl(obj.key)}
          className="cursor-pointer"
          disabled={isUploading}
        >
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
            } catch {
              toast.error('Failed to download');
            }
          }}
          className="cursor-pointer"
          disabled={isUploading}
        >
          <Download className="w-4 h-4 mr-2" />
          Download
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleVisit(obj)}
          className="cursor-pointer"
          disabled={isUploading}
        >
          <ExternalLink className="w-4 h-4 mr-2" />
          Open in New Tab
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => startRename(obj)}
          className="cursor-pointer"
          disabled={isUploading}
        >
          <Pencil className="w-4 h-4 mr-2" />
          Rename
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => setDeleteTarget(obj)}
          className="cursor-pointer text-red-600 focus:text-red-700"
          disabled={isUploading}
        >
          <Trash2 className="w-4 h-4 mr-2" />
          Delete
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="font-normal px-2 py-2 cursor-default">
          {renderFileItemDetails(obj, fileName, fileExt, {
            signedUrl: fileUrls[obj.key],
          })}
        </DropdownMenuLabel>
      </DropdownMenuContent>
    </DropdownMenu>
  );

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
  const selectableFilesOnPage = paginatedObjects.filter((o) => !o.isDirectory);
  const allPageFilesSelected =
    selectableFilesOnPage.length > 0 &&
    selectableFilesOnPage.every((o) => selectedKeys.has(o.key));
  const somePageFilesSelected = selectableFilesOnPage.some((o) => selectedKeys.has(o.key));
  const selectedCount = selectedKeys.size;
  const activeConnection =
    connections.find((c) => c.id === activeConnectionId) ?? connections[0] ?? null;
  const showConnectionSwitcher = connections.length > 1 && onConnectionChange;

  const renderConnectionSwitcher = (className?: string) => {
    if (!showConnectionSwitcher || !activeConnection) return null;

    const switchingLabelConnection =
      connections.find((c) => c.id === activeConnectionId) ?? activeConnection;

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            disabled={isConnectionSwitching}
            className={`h-9 rounded-none border-r border-border px-2.5 gap-1.5 shrink-0 max-w-[180px] sm:max-w-[220px] ${className ?? ''}`}
            aria-label="Switch storage connection"
          >
            {isConnectionSwitching ? (
              <Spinner className="w-4 h-4 text-blue-500 shrink-0" />
            ) : (
              <HardDrive className="w-4 h-4 text-blue-500 shrink-0" />
            )}
            <span className="truncate text-xs font-medium">
              {isConnectionSwitching ? 'Switching…' : switchingLabelConnection.name}
            </span>
            {!isConnectionSwitching && (
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64 max-w-[calc(100vw-32px)]">
          <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
            Storage connection
          </DropdownMenuLabel>
          {connections.map((connection) => (
            <DropdownMenuItem
              key={connection.id}
              className="cursor-pointer flex flex-col items-start gap-0.5 py-2"
              disabled={isConnectionSwitching}
              onClick={() => handleConnectionSelect(connection.id)}
            >
              <span className="flex items-center gap-2 w-full">
                {isConnectionSwitching && connection.id === activeConnectionId && (
                  <Spinner className="w-3 h-3 shrink-0" />
                )}
                <span
                  className={
                    connection.id === activeConnectionId
                      ? 'font-semibold text-blue-600 dark:text-blue-400'
                      : 'font-medium'
                  }
                >
                  {connection.name}
                </span>
              </span>
              <span className="text-[10px] text-muted-foreground font-mono truncate w-full">
                {connection.bucket} · {connection.region}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

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
            <p className="text-xs text-slate-500">You can also paste files from the clipboard (Ctrl+V)</p>
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

          {renderConnectionSwitcher()}

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
                onClick={() => loadFiles(s3SearchQuery, { resetPagination: false })}
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
            onClick={() => loadFiles(s3SearchQuery, { resetPagination: false })}
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
              {/* View mode — top */}
              <div className="p-2 border-b">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-2">
                  View mode
                </span>
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

              {/* Current directory — middle */}
              <div className="p-2 border-b">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                  Current directory
                </span>
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

              <DropdownMenuItem
                onClick={() => setShowNewFolderInput(!showNewFolderInput)}
                className="cursor-pointer"
              >
                <FolderPlus className="w-4 h-4 mr-2 text-blue-500" />
                New folder
              </DropdownMenuItem>

              {showConnectionSwitcher && activeConnection && (
                <>
                  <DropdownMenuSeparator />
                  <div className="p-2">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                      Storage connection
                    </span>
                    <div className="space-y-1">
                      {connections.map((connection) => (
                        <button
                          key={connection.id}
                          type="button"
                          disabled={isConnectionSwitching}
                          onClick={() => handleConnectionSelect(connection.id)}
                          className={`w-full text-left rounded-md px-2 py-1.5 text-xs hover:bg-muted ${
                            connection.id === activeConnectionId
                              ? 'bg-muted font-semibold text-blue-600 dark:text-blue-400'
                              : ''
                          }`}
                        >
                          <span className="block truncate">{connection.name}</span>
                          <span className="block truncate text-[10px] text-muted-foreground font-mono">
                            {connection.bucket}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
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
                void loadFiles('', { resetPagination: false });
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
                void loadFiles('', { resetPagination: false });
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
                  void loadFiles('', { resetPagination: false });
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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-sm">Files & Folders</CardTitle>
            {selectableFilesOnPage.length > 0 && (
              <div className="flex items-center gap-2">
                <Button
                  variant={bulkMode ? 'secondary' : 'outline'}
                  size="sm"
                  className="cursor-pointer h-8"
                  onClick={toggleBulkMode}
                  aria-pressed={bulkMode}
                >
                  <CheckSquare className="w-3.5 h-3.5 mr-1.5" />
                  {bulkMode ? 'Done' : 'Select'}
                </Button>
                {bulkMode && (
                  <>
                    <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                      <Checkbox
                        checked={
                          allPageFilesSelected
                            ? true
                            : somePageFilesSelected
                              ? 'indeterminate'
                              : false
                        }
                        onCheckedChange={() => {
                          if (allPageFilesSelected) {
                            setSelectedKeys(new Set());
                          } else {
                            setSelectedKeys(new Set(selectableFilesOnPage.map((o) => o.key)));
                          }
                        }}
                        aria-label="Select all files on this page"
                      />
                      Select page
                    </label>
                    {selectedCount > 0 && (
                      <Button
                        variant="destructive"
                        size="sm"
                        className="cursor-pointer h-8"
                        onClick={() => setBulkDeleteOpen(true)}
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                        Delete {selectedCount}
                      </Button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="relative pt-6">
          {loading && !isConnectionSwitching && (
            <div className="absolute top-0 left-0 right-0 h-1 overflow-hidden bg-blue-500/10">
              <div className="h-full bg-blue-600 animate-pulse w-full" />
            </div>
          )}
          {isConnectionSwitching ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
              <Spinner className="w-5 h-5 text-blue-500" />
              <span className="animate-pulse">
                Switching connection…
              </span>
            </div>
          ) : objects.length === 0 ? (
            loading ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
                <Spinner className="w-5 h-5 text-blue-500" />
                <span className="italic">Loading files...</span>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground italic">No files or folders found here.</div>
            )
          ) : viewMode === 'list' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {paginatedObjects.map((obj, index) => {
                const isUploading = uploadingFiles.has(obj.key);
                const { name: fileName, ext: fileExt } = getFileNameAndExtension(obj.key, obj.isDirectory);
                return (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 hover:bg-muted rounded-lg group transition duration-150"
                  >
                    {bulkMode && !obj.isDirectory && (
                      <Checkbox
                        checked={selectedKeys.has(obj.key)}
                        onCheckedChange={(checked) =>
                          toggleFileSelection(obj.key, checked === true)
                        }
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                        aria-label={`Select ${fileName}`}
                        className="mr-2 shrink-0"
                      />
                    )}
                    {(() => {
                      const listPrimaryCell = (
                        <div
                          className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                          onClick={() =>
                            obj.isDirectory ? navigateToFolder(obj.key) : handleVisit(obj)
                          }
                          onMouseEnter={() => {
                            if (!obj.isDirectory) prefetchUrl(obj.key);
                          }}
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
                                      alt={fileName}
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
                              <p className="text-sm font-medium truncate text-card-foreground min-w-0">
                                {fileName}
                              </p>
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
                                <span className="truncate">
                                  Uploaded{' '}
                                  {formatDistanceToNow(new Date(obj.lastModified), {
                                    addSuffix: true,
                                  })}
                                </span>
                              </p>
                            )}
                          </div>
                        </div>
                      );

                      if (isMobile) {
                        return listPrimaryCell;
                      }

                      return (
                        <Tooltip>
                          <TooltipTrigger asChild>{listPrimaryCell}</TooltipTrigger>
                          <TooltipContent
                            side="top"
                            sideOffset={6}
                            className="max-w-xs p-3 pointer-events-auto"
                          >
                            {renderFileItemDetails(obj, fileName, fileExt, {
                              signedUrl: obj.isDirectory ? undefined : fileUrls[obj.key],
                            })}
                          </TooltipContent>
                        </Tooltip>
                      );
                    })()}
                    {!obj.isDirectory && (
                      <>
                        {/* Desktop Actions */}
                        <div
                          className="hidden md:flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2 shrink-0"
                          onMouseEnter={() => prefetchUrl(obj.key)}
                        >
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
                            <TooltipContent side="bottom" className="max-w-xs">
                              <p className="font-medium mb-1">Copy URL</p>
                              {fileUrls[obj.key] ? (
                                <a
                                  href={fileUrls[obj.key]}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-[10px] text-blue-400 hover:text-blue-300 break-all leading-tight block"
                                >
                                  {fileUrls[obj.key].slice(0, 80)}…
                                </a>
                              ) : (
                                <span className="text-[10px] text-muted-foreground">hover to load url</span>
                              )}
                            </TooltipContent>
                          </Tooltip>

                          {/* Shareable Link — hidden until route is confirmed working */}
                          <span className="hidden">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleCopyShareableUrl(obj.key)}
                                  disabled={isUploading}
                                >
                                  <Share2 className="w-4 h-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Copy Shareable Link</TooltipContent>
                            </Tooltip>
                          </span>

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
                            <TooltipContent side="bottom" className="max-w-xs">
                              <p className="font-medium mb-1">Download File</p>
                              {fileUrls[obj.key] ? (
                                <a
                                  href={fileUrls[obj.key]}
                                  download={obj.key.split('/').pop()}
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-[10px] text-blue-400 hover:text-blue-300 break-all leading-tight block"
                                >
                                  {fileUrls[obj.key].slice(0, 80)}…
                                </a>
                              ) : (
                                <span className="text-[10px] text-muted-foreground">hover to load url</span>
                              )}
                            </TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleVisit(obj)}
                                disabled={isUploading}
                              >
                                <ExternalLink className="w-4 h-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-xs">
                              <p className="font-medium mb-1">Open in New Tab</p>
                              {fileUrls[obj.key] ? (
                                <a
                                  href={fileUrls[obj.key]}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-[10px] text-blue-400 hover:text-blue-300 break-all leading-tight block"
                                >
                                  {fileUrls[obj.key].slice(0, 80)}…
                                </a>
                              ) : (
                                <span className="text-[10px] text-muted-foreground">hover to load url</span>
                              )}
                            </TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => startRename(obj)}
                                disabled={isUploading}
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Rename File</TooltipContent>
                          </Tooltip>

                          {renderDeleteButton(obj, isUploading)}
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
                              <DropdownMenuItem onClick={() => handleVisit(obj)} className="cursor-pointer">
                                <ExternalLink className="w-4 h-4 mr-2" />
                                Open in New Tab
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => startRename(obj)} className="cursor-pointer">
                                <Pencil className="w-4 h-4 mr-2" />
                                Rename
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {renderDeleteButton(obj, isUploading, { variant: 'menu' })}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </>
                    )}
                    {obj.isDirectory && canDeleteFolder(obj) && (
                      <>
                        <div className="hidden md:flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2 shrink-0">
                          {renderDeleteButton(obj, isUploading)}
                        </div>
                        <div className="flex md:hidden ml-2 shrink-0">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 cursor-pointer">
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-40">
                              {renderDeleteButton(obj, isUploading, { variant: 'menu' })}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
              {hasMore ? (
                <div className="col-span-full flex justify-center pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setVisibleCount((c) => c + pageSize)}
                    className="cursor-pointer"
                  >
                    Load More ({sortedObjects.length - visibleCount} remaining)
                  </Button>
                </div>
              ) : sortedObjects.length > 0 && (
                <div className="col-span-full flex justify-center pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled
                    className="text-muted-foreground bg-muted/20 border-muted-foreground/20 cursor-not-allowed"
                  >
                    already at the end
                  </Button>
                </div>
              )}
            </div>
          ) : (
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
              {paginatedObjects.map((obj, index) => {
                const isUploading = uploadingFiles.has(obj.key);
                const { name: fileName, ext: fileExt } = getFileNameAndExtension(obj.key, obj.isDirectory);
                const gridCardClassName =
                  'relative group flex flex-col items-center justify-between p-4 bg-card hover:bg-muted/40 border rounded-xl transition duration-150 cursor-pointer text-center aspect-square select-none';
                const onGridCardClick = () =>
                  obj.isDirectory ? navigateToFolder(obj.key) : handleVisit(obj);

                const gridCardBody = (
                  <>
                    {bulkMode && !obj.isDirectory && (
                      <div
                        className="absolute top-2 left-2 z-10"
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        <Checkbox
                          checked={selectedKeys.has(obj.key)}
                          onCheckedChange={(checked) =>
                            toggleFileSelection(obj.key, checked === true)
                          }
                          aria-label={`Select ${fileName}`}
                          className="bg-card/90 border shadow-sm"
                        />
                      </div>
                    )}
                    {!obj.isDirectory && (
                      <div
                        className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-lg border border-border/80 bg-card/95 shadow-sm p-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 focus-within:opacity-100 transition-opacity"
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                        onMouseEnter={() => prefetchUrl(obj.key)}
                      >
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 p-0 cursor-pointer hover:bg-muted touch-manipulation"
                          aria-label={`Copy URL for ${fileName}`}
                          title="Copy URL"
                          disabled={isUploading}
                          onClick={() => handleCopyUrl(obj.key)}
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </Button>
                        {renderGridItemActionsMenu(obj, isUploading, fileName, fileExt)}
                      </div>
                    )}
                    {obj.isDirectory && canDeleteFolder(obj) && (
                      <div
                        className="absolute top-2 right-2 z-10 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 focus-within:opacity-100 transition-opacity"
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        {renderDeleteButton(obj, isUploading, {
                          className: 'h-7 w-7 p-0 cursor-pointer hover:bg-muted touch-manipulation',
                        })}
                      </div>
                    )}

                    <div className="flex-1 flex items-center justify-center w-full min-h-0 overflow-hidden relative z-[1]">
                      {(() => {
                        if (obj.isDirectory) {
                          return (
                            <Folder className="w-1/2 h-1/2 max-w-[64px] max-h-[64px] text-blue-500" />
                          );
                        }
                        if (isImageFile(obj.key)) {
                          const thumbUrl = imageUrls[obj.key];
                          if (thumbUrl) {
                            return (
                              <div className="w-full h-full rounded-lg border bg-muted overflow-hidden flex items-center justify-center shadow-sm">
                                <img
                                  src={thumbUrl}
                                  alt={fileName}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            );
                          }
                          return (
                            <div className="w-full h-full rounded-lg border bg-muted/40 animate-pulse flex items-center justify-center">
                              <File className="w-8 h-8 text-slate-400" />
                            </div>
                          );
                        }
                        return (
                          <div className="w-full h-full rounded-lg border bg-muted/20 flex items-center justify-center relative">
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

                    <div className="w-full mt-2 shrink-0 relative z-[1]">
                      <div className="flex items-center justify-center gap-1 min-w-0">
                        <p className="text-xs font-semibold truncate text-card-foreground max-w-[80%]">
                          {fileName}
                        </p>
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
                  </>
                );

                if (isMobile) {
                  return (
                    <div
                      key={index}
                      onClick={onGridCardClick}
                      className={gridCardClassName}
                    >
                      {gridCardBody}
                    </div>
                  );
                }

                return (
                  <Tooltip key={index}>
                    <TooltipTrigger asChild>
                      <div
                        onClick={onGridCardClick}
                        className={gridCardClassName}
                        onMouseEnter={() => {
                          if (!obj.isDirectory) prefetchUrl(obj.key);
                        }}
                      >
                        {gridCardBody}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent
                      side="top"
                      sideOffset={8}
                      className="p-3 text-popover-foreground pointer-events-auto"
                    >
                      {renderGridTooltipContent(obj, fileName, fileExt, isUploading)}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
              {hasMore ? (
                <div className="col-span-full flex justify-center pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setVisibleCount((c) => c + pageSize)}
                    className="cursor-pointer"
                  >
                    Load More ({sortedObjects.length - visibleCount} remaining)
                  </Button>
                </div>
              ) : sortedObjects.length > 0 && (
                <div className="col-span-full flex justify-center pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled
                    className="text-muted-foreground bg-muted/20 border-muted-foreground/20 cursor-not-allowed"
                  >
                    already at the end
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
          <CardHeader className="bg-slate-950/40 py-1.5 px-3 border-b border-slate-800 flex flex-row items-center justify-between space-y-0 shrink-0">
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
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteTarget?.isDirectory ? 'Delete Folder' : 'Delete File'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.isDirectory ? (
                <>
                  Delete empty folder &quot;
                  {deleteTarget.key.replace(/\/$/, '').split('/').pop()}&quot;? This cannot be
                  undone. Folders with files or subfolders must be emptied first.
                </>
              ) : (
                <>
                  Are you sure you want to delete &quot;{deleteTarget?.key.split('/').pop()}&quot;?
                  This action cannot be undone.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-2 justify-end">
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirmation */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selectedCount} {selectedCount === 1 ? 'file' : 'files'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Really delete {selectedCount} {selectedCount === 1 ? 'file' : 'files'}? This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-2 justify-end">
            <AlertDialogCancel disabled={bulkDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} disabled={bulkDeleting}>
              {bulkDeleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
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

      {/* Rename File Dialog */}
      <Dialog
        open={!!renameTarget}
        onOpenChange={(open) => {
          if (!open && !renaming) setRenameTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Rename File</DialogTitle>
            <DialogDescription>
              Enter a new name for the file.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Input
              id="rename-input"
              value={renameNewName}
              onChange={(e) => setRenameNewName(e.target.value)}
              className="col-span-3 h-9 text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && renameNewName.trim() && !renaming) {
                  void handleRename();
                }
              }}
              autoFocus
            />
          </div>
          <DialogFooter className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => setRenameTarget(null)}
              disabled={renaming}
              className="cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              onClick={handleRename}
              disabled={renaming || !renameNewName.trim() || !!(renameTarget && renameNewName.trim() === renameTarget.key.split('/').pop())}
              className="cursor-pointer"
            >
              {renaming ? 'Renaming…' : 'Rename'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
