'use client'

/**
 * Video Player Controls Component
 * 
 * Provides a complete video player UI with:
 * - Play/pause controls
 * - Seek/progress bar with buffered indication
 * - Volume control with mute toggle
 * - Fullscreen toggle
 * - Keyboard shortcuts
 * - Auto-hiding controls overlay
 * 
 * @module components/player/VideoPlayerControls
 */

import { useRef, useState, useEffect, useCallback } from 'react'
import { 
  Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  SkipBack, SkipForward
} from 'lucide-react'

interface VideoPlayerControlsProps {
  src: string
  title: string
  poster?: string
}

// Helper function to detect touch devices
function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0
}

export function VideoPlayerControls({ src, title, poster }: VideoPlayerControlsProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [buffered, setBuffered] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [lastTap, setLastTap] = useState(0)
  const [showTapFeedback, setShowTapFeedback] = useState<'left' | 'right' | null>(null)
  
  // Control functions defined first so they can be used in effects
  const togglePlay = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    
    if (isPlaying) {
      video.pause()
    } else {
      video.play().catch(err => {
        console.error('[VideoPlayerControls] Play failed:', err)
      })
    }
    setIsPlaying(!isPlaying)
  }, [isPlaying])
  
  const toggleMute = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    
    video.muted = !isMuted
    setIsMuted(!isMuted)
  }, [isMuted])
  
  const toggleFullscreen = useCallback(async () => {
    const container = containerRef.current
    if (!container) return
    
    try {
      if (!isFullscreen) {
        await container.requestFullscreen()
      } else {
        await document.exitFullscreen()
      }
    } catch (err) {
      console.error('[VideoPlayerControls] Fullscreen error:', err)
    }
  }, [isFullscreen])
  
  const seek = useCallback((seconds: number) => {
    const video = videoRef.current
    if (!video) return
    
    video.currentTime = Math.max(0, Math.min(video.currentTime + seconds, duration))
  }, [duration])
  
  // Auto-hide controls
  useEffect(() => {
    if (!isPlaying) return
    
    const timer = setTimeout(() => {
      setShowControls(false)
    }, 3000)
    
    return () => clearTimeout(timer)
  }, [isPlaying, showControls])
  
  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if user is typing in an input
      if (document.activeElement?.tagName === 'INPUT') return
      
      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault()
          togglePlay()
          break
        case 'f':
          e.preventDefault()
          toggleFullscreen()
          break
        case 'm':
          e.preventDefault()
          toggleMute()
          break
        case 'ArrowLeft':
          e.preventDefault()
          seek(-10)
          break
        case 'ArrowRight':
          e.preventDefault()
          seek(10)
          break
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [seek, toggleFullscreen, toggleMute, togglePlay])
  
  // Fullscreen change listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])
  
  const handleTimeUpdate = () => {
    const video = videoRef.current
    if (!video) return
    
    setCurrentTime(video.currentTime)
    
    // Calculate buffered end time
    if (video.buffered.length > 0) {
      const bufferedEnd = video.buffered.end(video.buffered.length - 1)
      setBuffered(bufferedEnd)
    }
  }
  
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value)
    const video = videoRef.current
    if (!video) return
    
    video.currentTime = time
    setCurrentTime(time)
  }
  
  // Touch handlers for progress bar seeking
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    setIsDragging(true)
    handleTouchMove(e)
  }
  
  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!containerRef.current) return
    
    const rect = containerRef.current.querySelector('.progress-container')?.getBoundingClientRect()
    if (!rect) return
    
    const x = e.touches[0].clientX - rect.left
    const percentage = Math.max(0, Math.min(1, x / rect.width))
    const newTime = percentage * duration
    
    const video = videoRef.current
    if (video) {
      video.currentTime = newTime
      setCurrentTime(newTime)
    }
  }
  
  const handleTouchEnd = () => {
    setIsDragging(false)
  }
  
  // Double tap to seek
  const handleDoubleTap = (direction: 'left' | 'right') => {
    const currentTime = Date.now()
    if (currentTime - lastTap < 300) {
      // Double tap detected
      const seekAmount = direction === 'left' ? -10 : 10
      seek(seekAmount)
      
      // Show feedback
      setShowTapFeedback(direction)
      setTimeout(() => setShowTapFeedback(null), 500)
    }
    setLastTap(currentTime)
  }
  
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value)
    const video = videoRef.current
    if (!video) return
    
    video.volume = newVolume
    setVolume(newVolume)
    setIsMuted(newVolume === 0)
  }
  
  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    const hours = Math.floor(mins / 60)
    
    if (hours > 0) {
      return `${hours}:${(mins % 60).toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }
  
  return (
    <div 
      ref={containerRef}
      className="relative w-full h-full group"
      onMouseMove={() => setShowControls(true)}
      onMouseLeave={() => isPlaying && !isTouchDevice() && setShowControls(false)}
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        className="w-full h-full object-contain"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={() => {
          const video = videoRef.current
          if (video) {
            setDuration(video.duration)
            setVolume(video.volume)
          }
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onClick={togglePlay}
        playsInline
        controls={false}
      />
      
      {/* Double tap areas for seeking */}
      <div className="absolute inset-0 flex pointer-events-none">
        <div 
          className="flex-1 pointer-events-auto"
          onTouchEnd={() => handleDoubleTap('left')}
        />
        <div 
          className="flex-1 pointer-events-auto"
          onTouchEnd={() => handleDoubleTap('right')}
        />
      </div>
      
      {/* Double tap feedback indicators */}
      {showTapFeedback === 'left' && (
        <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
          <div className="bg-black/60 text-white px-4 py-2 rounded-full text-lg font-medium animate-pulse">
            « -10s
          </div>
        </div>
      )}
      {showTapFeedback === 'right' && (
        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
          <div className="bg-black/60 text-white px-4 py-2 rounded-full text-lg font-medium animate-pulse">
            +10s »
          </div>
        </div>
      )}
      
      {/* Controls overlay */}
      <div 
        className={`absolute inset-0 flex flex-col justify-end transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0'
        }`}
        style={{
          background: showControls ? 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 40%)' : 'none'
        }}
      >
        {/* Progress bar */}
        <div className="px-4 py-2 progress-container">
          <div 
            className="relative h-2 sm:h-1 bg-white/30 rounded-full cursor-pointer group/progress touch-manipulation"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {/* Buffered */}
            <div 
              className="absolute h-full bg-white/30 rounded-full"
              style={{ width: duration > 0 ? `${(buffered / duration) * 100}%` : '0%' }}
            />
            {/* Played */}
            <div 
              className="absolute h-full bg-primary rounded-full"
              style={{ width: duration > 0 ? `${(currentTime / duration) * 100}%` : '0%' }}
            />
            {/* Thumb - larger on mobile for easier touch */}
            <div 
              className={`
                absolute bg-primary rounded-full transition-opacity
                w-4 h-4 sm:w-3 sm:h-3 -mt-1.5 sm:-mt-1
                ${isDragging ? 'opacity-100 scale-125' : 'opacity-80 sm:opacity-0 group-hover/progress:sm:opacity-100'}
              `}
              style={{ 
                left: duration > 0 ? `${(currentTime / duration) * 100}%` : '0%', 
                transform: 'translateX(-50%)' 
              }}
            />
            <input
              type="range"
              min={0}
              max={duration || 0}
              value={currentTime}
              onChange={handleSeek}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
          </div>
        </div>
        
        {/* Control buttons */}
        <div className="flex items-center justify-between px-4 pb-4">
          <div className="flex items-center gap-2">
            <button 
              onClick={togglePlay}
              className="p-3 sm:p-2 rounded-full hover:bg-white/20 text-white transition-colors touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
            </button>
            
            <button 
              onClick={() => seek(-10)}
              className="p-3 sm:p-2 rounded-full hover:bg-white/20 text-white transition-colors touch-manipulation min-h-[44px] min-w-[44px] hidden sm:flex items-center justify-center"
              aria-label="Skip back 10 seconds"
            >
              <SkipBack className="w-5 h-5" />
            </button>
            
            <button 
              onClick={() => seek(10)}
              className="p-3 sm:p-2 rounded-full hover:bg-white/20 text-white transition-colors touch-manipulation min-h-[44px] min-w-[44px] hidden sm:flex items-center justify-center"
              aria-label="Skip forward 10 seconds"
            >
              <SkipForward className="w-5 h-5" />
            </button>
            
            {/* Volume control */}
            <div className="flex items-center gap-2 group/volume">
              <button 
                onClick={toggleMute}
                className="p-3 sm:p-2 rounded-full hover:bg-white/20 text-white transition-colors touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>
              
              <div className="w-0 overflow-hidden group-hover/volume:w-20 transition-all duration-200">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.1}
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-16 h-1 bg-white/30 rounded-full appearance-none cursor-pointer"
                />
              </div>
            </div>
            
            <span className="text-white text-sm ml-2">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>
          
          <button 
            onClick={toggleFullscreen}
            className="p-3 sm:p-2 rounded-full hover:bg-white/20 text-white transition-colors touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
          </button>
        </div>
      </div>
      
      {/* Title overlay (shown briefly on play) */}
      {showControls && title && (
        <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/60 to-transparent">
          <h2 className="text-white text-sm font-medium truncate">{title}</h2>
        </div>
      )}
    </div>
  )
}
