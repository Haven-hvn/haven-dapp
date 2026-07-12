'use client'

/**
 * Cache Indicator Component
 * 
 * A small badge/icon displayed in the video player header that shows
 * cache status and allows evicting from cache.
 * 
 * Features:
 * - Shows green badge when video is cached (instant playback)
 * - Hidden when video is not cached
 * - Dropdown menu to remove from cache
 * - Loading state during eviction
 * 
 * @module components/player/CacheIndicator
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { Cloud, Loader2, Trash2 } from 'lucide-react'

interface CacheIndicatorProps {
  /** Whether the video is currently cached */
  isCached: boolean
  /** Video ID for cache operations */
  videoId: string
  /** Callback to evict video from cache */
  onEvict: () => Promise<void>
  /** Optional className for styling */
  className?: string
}

/**
 * CacheIndicator - Shows cache status with evict action
 * 
 * Displays a green badge when video is cached with a dropdown
 * menu to remove it from cache.
 */
export function CacheIndicator({ 
  isCached, 
  videoId, 
  onEvict,
  className = '' 
}: CacheIndicatorProps) {
  const [isEvicting, setIsEvicting] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false)
      }
    }
    
    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showMenu])

  const handleEvict = useCallback(async () => {
    setIsEvicting(true)
    try {
      await onEvict()
    } finally {
      setIsEvicting(false)
      setShowMenu(false)
    }
  }, [onEvict])

  // Don't show anything for uncached videos
  if (!isCached) return null

  return (
    <div className={`relative ${className}`} ref={menuRef}>
      <button
        onClick={() => setShowMenu(!showMenu)}
        disabled={isEvicting}
        className="flex items-center gap-1.5 px-2.5 py-1 bg-green-500/20 text-green-400 rounded-full text-xs font-medium hover:bg-green-500/30 transition-colors disabled:opacity-50"
        title="Video is cached for instant playback"
        aria-label="Video is cached. Click to see options"
        aria-expanded={showMenu}
      >
        {isEvicting ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <Cloud className="w-3 h-3" />
        )}
        <span>Cached</span>
      </button>
      
      {showMenu && (
        <div 
          className="absolute right-0 top-full mt-1.5 bg-gray-900 border border-white/10 rounded-lg shadow-lg p-1.5 min-w-[160px] z-50"
          role="menu"
        >
          <div className="px-3 py-1.5 text-xs text-white/50 border-b border-white/5 mb-1">
            Instant playback available
          </div>
          <button
            onClick={handleEvict}
            disabled={isEvicting}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 rounded-md transition-colors disabled:opacity-50"
            role="menuitem"
          >
            <Trash2 className="w-4 h-4" />
            Remove from cache
          </button>
        </div>
      )}
    </div>
  )
}
