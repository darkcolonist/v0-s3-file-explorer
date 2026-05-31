'use client';

import { useState, useRef, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X, Play, Pause, Volume2, Download } from 'lucide-react';

interface MediaPlayerProps {
  fileUrl: string;
  fileName: string;
  fileType: string;
  onClose: () => void;
  onDownload?: () => void;
}

export function MediaPlayer({ fileUrl, fileName, fileType, onClose, onDownload }: MediaPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const mediaRef = useRef<HTMLAudioElement | HTMLVideoElement>(null);

  const isAudio = fileType.startsWith('audio/');
  const isVideo = fileType.startsWith('video/');
  const isImage = fileType.startsWith('image/');
  const isPDF = fileType === 'application/pdf';

  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleTimeUpdate = () => setCurrentTime(media.currentTime);
    const handleLoadedMetadata = () => setDuration(media.duration);

    media.addEventListener('play', handlePlay);
    media.addEventListener('pause', handlePause);
    media.addEventListener('timeupdate', handleTimeUpdate);
    media.addEventListener('loadedmetadata', handleLoadedMetadata);

    return () => {
      media.removeEventListener('play', handlePlay);
      media.removeEventListener('pause', handlePause);
      media.removeEventListener('timeupdate', handleTimeUpdate);
      media.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, []);

  const togglePlayPause = () => {
    if (!mediaRef.current) return;
    if (isPlaying) {
      mediaRef.current.pause();
    } else {
      mediaRef.current.play();
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (mediaRef.current && (isAudio || isVideo)) {
      (mediaRef.current as HTMLAudioElement | HTMLVideoElement).volume = newVolume;
    }
  };

  const handleProgressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    if (mediaRef.current) {
      (mediaRef.current as HTMLAudioElement | HTMLVideoElement).currentTime = newTime;
    }
  };

  const formatTime = (time: number) => {
    if (isNaN(time)) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <Card className="fixed inset-0 m-4 max-w-2xl mx-auto my-auto max-h-[90vh] z-50 overflow-y-auto">
      <CardContent className="p-0">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold truncate text-sm">{fileName}</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Media Display */}
        <div className="aspect-video bg-black flex items-center justify-center">
          {isVideo && (
            <video
              ref={mediaRef as React.Ref<HTMLVideoElement>}
              src={fileUrl}
              className="w-full h-full object-contain"
              crossOrigin="anonymous"
            />
          )}
          {isAudio && (
            <div className="text-center">
              <audio
                ref={mediaRef as React.Ref<HTMLAudioElement>}
                src={fileUrl}
                crossOrigin="anonymous"
              />
              <div className="text-white space-y-4">
                <div className="text-4xl">🎵</div>
                <p className="text-sm">{fileName}</p>
              </div>
            </div>
          )}
          {isImage && (
            <img src={fileUrl} alt={fileName} className="w-full h-full object-contain" />
          )}
          {isPDF && (
            <iframe src={fileUrl} className="w-full h-full" title={fileName} />
          )}
          {!isVideo && !isAudio && !isImage && !isPDF && (
            <div className="text-center text-muted-foreground">
              <p>Preview not available for this file type</p>
              <p className="text-xs mt-2">{fileType}</p>
            </div>
          )}
        </div>

        {/* Controls */}
        {(isAudio || isVideo) && (
          <div className="bg-muted p-4 space-y-3">
            {/* Progress Bar */}
            <input
              type="range"
              min="0"
              max={duration || 0}
              value={currentTime}
              onChange={handleProgressChange}
              className="w-full"
            />

            {/* Time Display */}
            <div className="text-xs text-muted-foreground flex justify-between">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>

            {/* Control Buttons */}
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={togglePlayPause}>
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </Button>

              <div className="flex items-center gap-2 flex-1">
                <Volume2 className="w-4 h-4 text-muted-foreground" />
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={volume}
                  onChange={handleVolumeChange}
                  className="flex-1"
                />
              </div>

              {onDownload && (
                <Button variant="outline" size="sm" onClick={onDownload}>
                  <Download className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Footer Actions */}
        {onDownload && !(isAudio || isVideo) && (
          <div className="p-4 border-t flex gap-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={onDownload}>
              <Download className="w-4 h-4 mr-2" />
              Download
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
