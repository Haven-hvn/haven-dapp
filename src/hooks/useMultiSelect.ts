/**
 * Multi-Select Hook
 *
 * Manages selection state for batch download: tracks which videos are selected,
 * their selection order (1-based badge), and enforces max 20 limit.
 *
 * @module hooks/useMultiSelect
 */

'use client'

import { useState, useCallback, useMemo } from 'react'
import type { Video } from '@/types'

// ============================================================================
// Constants
// ============================================================================

const MAX_SELECTION = 20

// ============================================================================
// Types
// ============================================================================

export interface UseMultiSelectReturn {
  /** Whether select mode is active */
  isSelectMode: boolean
  /** Toggle select mode on/off (clears selection on off) */
  toggleSelectMode: () => void
  /** Toggle a video's selection state */
  toggleSelection: (video: Video) => void
  /** Whether a specific video is selected */
  isSelected: (videoId: string) => boolean
  /** Get selection order (1-based badge number) for a video */
  getSelectionOrder: (videoId: string) => number | null
  /** All currently selected videos in selection order */
  selectedVideos: Video[]
  /** Count of selected videos */
  selectedCount: number
  /** Clear all selections */
  clearSelection: () => void
  /** Whether max (20) is reached */
  isMaxReached: boolean
}

// ============================================================================
// Hook
// ============================================================================

export function useMultiSelect(): UseMultiSelectReturn {
  const [isSelectMode, setIsSelectMode] = useState(false)
  const [selectedVideos, setSelectedVideos] = useState<Video[]>([])

  const toggleSelectMode = useCallback(() => {
    setIsSelectMode((prev) => {
      if (prev) {
        // Turning off — clear selection
        setSelectedVideos([])
      }
      return !prev
    })
  }, [])

  const toggleSelection = useCallback((video: Video) => {
    setSelectedVideos((prev) => {
      const idx = prev.findIndex((v) => v.id === video.id)
      if (idx >= 0) {
        // Deselect
        return prev.filter((v) => v.id !== video.id)
      }
      // Select (enforce max)
      if (prev.length >= MAX_SELECTION) return prev
      return [...prev, video]
    })
  }, [])

  const isSelected = useCallback(
    (videoId: string) => selectedVideos.some((v) => v.id === videoId),
    [selectedVideos]
  )

  const getSelectionOrder = useCallback(
    (videoId: string): number | null => {
      const idx = selectedVideos.findIndex((v) => v.id === videoId)
      return idx >= 0 ? idx + 1 : null
    },
    [selectedVideos]
  )

  const clearSelection = useCallback(() => {
    setSelectedVideos([])
  }, [])

  const isMaxReached = useMemo(
    () => selectedVideos.length >= MAX_SELECTION,
    [selectedVideos.length]
  )

  return {
    isSelectMode,
    toggleSelectMode,
    toggleSelection,
    isSelected,
    getSelectionOrder,
    selectedVideos,
    selectedCount: selectedVideos.length,
    clearSelection,
    isMaxReached,
  }
}
