/**
 * CacheManagement Component
 *
 * Settings page section for cache management. Provides visibility into and
 * control over the local cache: statistics, manual sync, cache clearing,
 * and user preferences.
 *
 * This component is designed as the single cache management UI for both
 * metadata cache (arkiv-cache) and video content cache (video-cache).
 * Currently implements metadata cache; video content cache is a placeholder
 * for future implementation.
 */

'use client'

import React, { useState, useCallback, useEffect } from 'react'
import { useCacheStore, useCachePreferences } from '../../stores/cacheStore'
import { useCacheSettings } from '../../stores/cacheSettingsStore'
import { useCacheStatus, type UseCacheStatusReturn, type ContentCacheStats } from '../../hooks/useCacheStatus'
import { useManualSync } from '../../hooks/useBackgroundSync'
import { useAccount } from '../../hooks/useAccount'
import { getVideoCacheService } from '../../services/cacheService'
import { getAllCachedVideos, deleteCachedVideo } from '../../lib/cache/db'
import { listCachedVideos, deleteVideo, clearAllVideos, getCacheStorageEstimate, type CacheEntry } from '../../lib/video-cache'
import { getStorageDetails, requestPersistentStorage, type StorageDetails } from '../../lib/storage-persistence'

// =============================================================================
// Types
// =============================================================================

interface StatCardProps {
  label: string
  value: string | number
  icon: React.ReactNode
  color?: 'default' | 'green' | 'amber' | 'blue' | 'purple'
}

interface ConfirmDialogProps {
  isOpen: boolean
  title: string
  description: React.ReactNode
  confirmLabel: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
  variant?: 'default' | 'destructive'
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

/**
 * Format timestamp to relative time string
 */
export function formatRelativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 60) return 'Just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`
  return `${Math.floor(seconds / 86400)} days ago`
}

// =============================================================================
// Icons
// =============================================================================

function FilmIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-8.625 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m0 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125m9.375-1.125c.621 0 1.125.504 1.125 1.125m0 0h7.5m-7.5 0v-1.5c0-.621.504-1.125 1.125-1.125M20.625 19.5h-7.5m7.5 0a1.125 1.125 0 01-1.125 1.125M20.625 19.5v-1.5c0-.621-.504-1.125-1.125-1.125m0 0h-7.5m7.5 0v-1.5c0-.621-.504-1.125-1.125-1.125"
      />
    </svg>
  )
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  )
}

function ArchiveIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
      />
    </svg>
  )
}

function HardDriveIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z"
      />
    </svg>
  )
}

function RefreshCwIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
      />
    </svg>
  )
}

function Loader2Icon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
      />
    </svg>
  )
}

function AlertTriangleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
      />
    </svg>
  )
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
      />
    </svg>
  )
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  )
}

// =============================================================================
// Sub-components
// =============================================================================

/**
 * StatCard - Displays a single statistic with icon
 */
function StatCard({ label, value, icon, color = 'default' }: StatCardProps) {
  const colorClasses = {
    default: 'bg-gray-50 dark:bg-gray-800/50 text-gray-900 dark:text-gray-100',
    green: 'bg-green-50 dark:bg-green-950/30 text-green-900 dark:text-green-100',
    amber: 'bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-100',
    blue: 'bg-blue-50 dark:bg-blue-950/30 text-blue-900 dark:text-blue-100',
    purple: 'bg-purple-50 dark:bg-purple-950/30 text-purple-900 dark:text-purple-100',
  }

  const iconColorClasses = {
    default: 'text-gray-500 dark:text-gray-400',
    green: 'text-green-600 dark:text-green-400',
    amber: 'text-amber-600 dark:text-amber-400',
    blue: 'text-blue-600 dark:text-blue-400',
    purple: 'text-purple-600 dark:text-purple-400',
  }

  return (
    <div className={`rounded-lg p-4 ${colorClasses[color]}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
          <p className="text-2xl font-semibold mt-1">{value}</p>
        </div>
        <div className={`h-8 w-8 ${iconColorClasses[color]}`}>{icon}</div>
      </div>
    </div>
  )
}

/**
 * Switch - Toggle component for preferences
 */
interface SwitchProps {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
}

function Switch({ checked, onCheckedChange, disabled = false }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={`
        relative inline-flex h-6 w-11 items-center rounded-full
        transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2
        ${checked ? 'bg-primary' : 'bg-gray-200 dark:bg-gray-700'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      <span
        className={`
          inline-block h-4 w-4 transform rounded-full bg-white transition-transform
          ${checked ? 'translate-x-6' : 'translate-x-1'}
        `}
      />
    </button>
  )
}

/**
 * Button - Action button component
 */
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'destructive'
  size?: 'sm' | 'md'
}

function Button({
  children,
  variant = 'default',
  size = 'md',
  className = '',
  disabled = false,
  ...props
}: ButtonProps) {
  const baseClasses =
    'inline-flex items-center justify-center font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2'

  const variantClasses = {
    default: 'bg-primary text-primary-foreground hover:bg-primary/90 focus:ring-primary',
    outline:
      'border border-gray-300 dark:border-gray-600 bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800 focus:ring-gray-400',
    destructive: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
  }

  const sizeClasses = {
    sm: 'rounded-md px-3 py-1.5 text-xs',
    md: 'rounded-lg px-4 py-2 text-sm',
  }

  return (
    <button
      className={`
        ${baseClasses}
        ${variantClasses[variant]}
        ${sizeClasses[size]}
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        ${className}
      `}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  )
}

/**
 * ConfirmDialog - Modal dialog for destructive actions
 */
function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  variant = 'default',
}: ConfirmDialogProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onCancel}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        className="relative w-full max-w-md rounded-lg bg-white dark:bg-gray-900 p-6 shadow-xl"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby="dialog-description"
      >
        {/* Header */}
        <div className="flex items-start gap-4">
          {variant === 'destructive' && (
            <div className="flex-shrink-0 rounded-full bg-red-100 dark:bg-red-950/50 p-2">
              <AlertTriangleIcon className="h-6 w-6 text-red-600 dark:text-red-400" />
            </div>
          )}
          <div className="flex-1">
            <h3
              id="dialog-title"
              className="text-lg font-semibold text-gray-900 dark:text-gray-100"
            >
              {title}
            </h3>
            <div
              id="dialog-description"
              className="mt-2 text-sm text-gray-600 dark:text-gray-400"
            >
              {description}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" size="sm" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            variant={variant === 'destructive' ? 'destructive' : 'default'}
            size="sm"
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// Persistence Status Component
// =============================================================================

/**
 * PersistenceStatus - Displays storage persistence status and allows manual request
 *
 * Shows whether the browser will evict cached videos under storage pressure,
 * and provides a button to request persistent storage protection.
 */
function PersistenceStatus() {
  const [details, setDetails] = useState<StorageDetails | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const loadDetails = useCallback(async () => {
    setIsLoading(true)
    try {
      const d = await getStorageDetails()
      setDetails(d)
    } catch (error) {
      console.error('[PersistenceStatus] Failed to load storage details:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadDetails()
  }, [loadDetails])

  const handleRequestPersistence = useCallback(async () => {
    setIsLoading(true)
    try {
      await requestPersistentStorage()
      await loadDetails()
    } catch (error) {
      console.error('[PersistenceStatus] Failed to request persistence:', error)
    } finally {
      setIsLoading(false)
    }
  }, [loadDetails])

  if (!details) {
    return (
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
        <div className="flex items-center gap-2">
          <Loader2Icon className="h-4 w-4 animate-spin text-gray-400" />
          <span className="text-sm text-gray-500 dark:text-gray-400">Loading storage info...</span>
        </div>
      </div>
    )
  }

  // Safari or browsers without Storage API support
  if (!details.isSupported) {
    return (
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            <HardDriveIcon className="h-5 w-5 text-gray-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Storage Protection</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Your browser manages cache automatically. Cached videos may be removed when storage is low.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            {details.isPersisted ? (
              <CheckCircleIcon className="h-5 w-5 text-green-500" />
            ) : (
              <AlertTriangleIcon className="h-5 w-5 text-amber-500" />
            )}
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Storage Protection</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {details.isPersisted
                ? 'Your cached videos are protected from automatic browser cleanup'
                : 'Cached videos may be removed by the browser when storage is low'}
            </p>
          </div>
        </div>
        <div className="flex-shrink-0">
          {!details.isPersisted ? (
            <button
              onClick={handleRequestPersistence}
              disabled={isLoading}
              className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/30 rounded-md hover:bg-purple-200 dark:hover:bg-purple-900/50 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? (
                <Loader2Icon className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <HardDriveIcon className="h-3 w-3 mr-1" />
              )}
              Protect Cache
            </button>
          ) : (
            <span className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/30 rounded-md">
              <CheckCircleIcon className="h-3 w-3 mr-1" />
              Protected
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * Enriched cache entry with metadata from arkiv-cache
 */
interface EnrichedCacheEntry extends CacheEntry {
  title?: string
  description?: string
  thumbnailUrl?: string
  isEncrypted?: boolean
  arkivStatus?: string
}

/**
 * Sort type for cached videos
 */
type SortBy = 'size' | 'cachedAt' | 'expiresAt'

/**
 * CacheManagement - Cache management section for settings page
 *
 * Provides:
 * - Cache statistics display (metadata + content)
 * - Manual sync controls
 * - User preferences (auto-sync, show expired, cache TTL, prefetch)
 * - Video content cache management
 * - Danger zone for clearing cache
 */
export function CacheManagement() {
  // Get wallet address
  const { address: walletAddress, isConnected } = useAccount()

  // Get cache state from store
  const { stats, isSyncing, lastSyncedAt, lastSyncResult } = useCacheStore()
  const { showExpiredVideos, autoSyncEnabled, toggleShowExpiredVideos, toggleAutoSync } =
    useCachePreferences()

  // Get cache settings
  const cacheSettings = useCacheSettings()

  // Get cache status with forward-compatible interface
  const cacheStatus = useCacheStatus()

  // Get manual sync control
  const { sync: forceSync, isSyncing: isManualSyncing } = useManualSync()

  // Local state for dialogs
  const [showClearExpiredDialog, setShowClearExpiredDialog] = useState(false)
  const [showClearAllDialog, setShowClearAllDialog] = useState(false)
  const [showClearContentDialog, setShowClearContentDialog] = useState(false)
  const [isClearing, setIsClearing] = useState(false)

  // Storage estimate state (metadata)
  const [storageUsage, setStorageUsage] = useState(0)
  const [storageQuota, setStorageQuota] = useState(0)

  // Content cache state
  const [contentEntries, setContentEntries] = useState<EnrichedCacheEntry[]>([])
  const [contentStats, setContentStats] = useState<ContentCacheStats | null>(null)
  const [contentStorageEstimate, setContentStorageEstimate] = useState({ usage: 0, quota: 0 })
  const [isLoadingContent, setIsLoadingContent] = useState(false)
  const [contentSortBy, setContentSortBy] = useState<SortBy>('cachedAt')
  const [selectedVideos, setSelectedVideos] = useState<Set<string>>(new Set())

  // Load storage estimate on mount
  useEffect(() => {
    const estimateStorage = async () => {
      try {
        if (typeof navigator !== 'undefined' && 'storage' in navigator && 'estimate' in navigator.storage) {
          const estimate = await navigator.storage.estimate()
          setStorageUsage(estimate.usage || 0)
          setStorageQuota(estimate.quota || 0)
        }
      } catch {
        // Ignore errors - storage estimate is optional
      }
    }

    estimateStorage()
  }, [stats])

  // Load content cache data
  const loadContentCacheData = useCallback(async () => {
    if (!isConnected || !walletAddress) return
    
    setIsLoadingContent(true)
    try {
      // Get cache entries from Cache API
      const entries = await listCachedVideos()
      
      // Get metadata from arkiv-cache for enrichment
      const cacheService = getVideoCacheService(walletAddress)
      const metadataVideos = await cacheService.getContentCachedVideos()
      
      // Enrich entries with metadata
      const enriched: EnrichedCacheEntry[] = entries.map(entry => {
        const metadata = metadataVideos.find(v => v.id === entry.videoId)
        return {
          ...entry,
          title: metadata?.title ?? 'Unknown video',
          description: metadata?.description,
          thumbnailUrl: metadata?.thumbnailUrl,
          isEncrypted: metadata?.isEncrypted ?? false,
          arkivStatus: metadata ? 'active' : 'unknown',
        }
      })
      
      setContentEntries(enriched)
      
      // Calculate content stats
      const totalSize = entries.reduce((sum, e) => sum + e.size, 0)
      const now = Date.now()
      const staleCount = entries.filter(entry => {
        if (!entry.ttl) return false
        const expiryTime = entry.cachedAt.getTime() + entry.ttl
        return now > expiryTime
      }).length
      
      setContentStats({
        cachedCount: entries.length,
        totalSize,
        staleCount,
        lastUpdated: entries.length > 0 ? Math.max(...entries.map(e => e.cachedAt.getTime())) : null,
      })
      
      // Get storage estimate
      const estimate = await getCacheStorageEstimate()
      setContentStorageEstimate({ usage: estimate.usage, quota: estimate.quota })
    } catch (error) {
      console.error('[CacheManagement] Failed to load content cache data:', error)
    } finally {
      setIsLoadingContent(false)
    }
  }, [isConnected, walletAddress])

  // Load content cache on mount
  useEffect(() => {
    loadContentCacheData()
  }, [loadContentCacheData])

  // Handle remove single video
  const handleRemoveVideo = useCallback(async (videoId: string) => {
    if (!walletAddress) return
    
    try {
      // Remove from Cache API
      await deleteVideo(videoId)
      
      // Notify arkiv-cache
      const cacheService = getVideoCacheService(walletAddress)
      await cacheService.updateVideoCacheStatus(videoId, 'not-cached')
      
      // Refresh data
      await loadContentCacheData()
      
      // Remove from selection if selected
      setSelectedVideos(prev => {
        const next = new Set(prev)
        next.delete(videoId)
        return next
      })
    } catch (error) {
      console.error('[CacheManagement] Failed to remove video:', error)
    }
  }, [walletAddress, loadContentCacheData])

  // Handle bulk remove
  const handleBulkRemove = useCallback(async () => {
    if (!walletAddress || selectedVideos.size === 0) return
    
    try {
      for (const videoId of selectedVideos) {
        await deleteVideo(videoId)
        
        // Notify arkiv-cache
        const cacheService = getVideoCacheService(walletAddress)
        await cacheService.updateVideoCacheStatus(videoId, 'not-cached')
      }
      
      // Refresh data
      await loadContentCacheData()
      setSelectedVideos(new Set())
    } catch (error) {
      console.error('[CacheManagement] Failed to bulk remove videos:', error)
    }
  }, [walletAddress, selectedVideos, loadContentCacheData])

  // Handle clear all content
  const handleClearAllContent = useCallback(async () => {
    if (!walletAddress) return
    
    setIsClearing(true)
    try {
      // Get all cached video IDs before clearing
      const entries = await listCachedVideos()
      
      // Clear all from Cache API
      await clearAllVideos()
      
      // Notify arkiv-cache for each video
      const cacheService = getVideoCacheService(walletAddress)
      for (const entry of entries) {
        await cacheService.updateVideoCacheStatus(entry.videoId, 'not-cached')
      }
      
      // Refresh data
      await loadContentCacheData()
      setSelectedVideos(new Set())
    } catch (error) {
      console.error('[CacheManagement] Failed to clear all content:', error)
    } finally {
      setIsClearing(false)
      setShowClearContentDialog(false)
    }
  }, [walletAddress, loadContentCacheData])

  // Handle clear expired content
  const handleClearExpiredContent = useCallback(async () => {
    if (!walletAddress) return
    
    setIsClearing(true)
    try {
      const now = Date.now()
      const expiredEntries = contentEntries.filter(entry => {
        if (!entry.ttl) return false
        const expiryTime = entry.cachedAt.getTime() + entry.ttl
        return now > expiryTime
      })
      
      for (const entry of expiredEntries) {
        await deleteVideo(entry.videoId)
        
        // Notify arkiv-cache
        const cacheService = getVideoCacheService(walletAddress)
        await cacheService.updateVideoCacheStatus(entry.videoId, 'not-cached')
      }
      
      // Refresh data
      await loadContentCacheData()
    } catch (error) {
      console.error('[CacheManagement] Failed to clear expired content:', error)
    } finally {
      setIsClearing(false)
    }
  }, [walletAddress, contentEntries, loadContentCacheData])

  // Handle export cache info
  const handleExportCacheInfo = useCallback(() => {
    const exportData = {
      exportedAt: new Date().toISOString(),
      totalVideos: contentEntries.length,
      totalSize: contentStats?.totalSize ?? 0,
      videos: contentEntries.map(entry => ({
        videoId: entry.videoId,
        title: entry.title,
        size: entry.size,
        mimeType: entry.mimeType,
        cachedAt: entry.cachedAt.toISOString(),
        ttl: entry.ttl,
        expiresAt: entry.ttl ? new Date(entry.cachedAt.getTime() + entry.ttl).toISOString() : null,
      })),
    }
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `haven-cache-export-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [contentEntries, contentStats])

  // Sort entries (must be defined before callbacks that use it)
  const sortedEntries = React.useMemo(() => {
    return [...contentEntries].sort((a, b) => {
      switch (contentSortBy) {
        case 'size':
          return b.size - a.size
        case 'cachedAt':
          return b.cachedAt.getTime() - a.cachedAt.getTime()
        case 'expiresAt':
          const aExpiry = a.ttl ? a.cachedAt.getTime() + a.ttl : Infinity
          const bExpiry = b.ttl ? b.cachedAt.getTime() + b.ttl : Infinity
          return aExpiry - bExpiry
        default:
          return 0
      }
    })
  }, [contentEntries, contentSortBy])

  // Toggle video selection
  const toggleVideoSelection = useCallback((videoId: string) => {
    setSelectedVideos(prev => {
      const next = new Set(prev)
      if (next.has(videoId)) {
        next.delete(videoId)
      } else {
        next.add(videoId)
      }
      return next
    })
  }, [])

  // Select all videos
  const selectAllVideos = useCallback(() => {
    if (selectedVideos.size === sortedEntries.length) {
      setSelectedVideos(new Set())
    } else {
      setSelectedVideos(new Set(sortedEntries.map(e => e.videoId)))
    }
  }, [sortedEntries, selectedVideos.size])

  // Handle clear expired entries
  const handleClearExpired = useCallback(async () => {
    setIsClearing(true)
    try {
      if (walletAddress) {
        const cacheService = getVideoCacheService(walletAddress)
        const allVideos = await getAllCachedVideos(walletAddress)
        const expiredVideoIds = allVideos
          .filter((v) => v.arkivEntityStatus === 'expired')
          .map((v) => v.id)

        // Delete expired videos one by one
        for (const videoId of expiredVideoIds) {
          await deleteCachedVideo(walletAddress, videoId)
        }

        // Refresh stats
        const newStats = await cacheService.getStats()
        useCacheStore.getState().setStats(newStats)
      }
    } catch (error) {
      console.error('[CacheManagement] Failed to clear expired entries:', error)
    } finally {
      setIsClearing(false)
      setShowClearExpiredDialog(false)
    }
  }, [walletAddress])

  // Handle clear all cache
  const handleClearAll = useCallback(async () => {
    setIsClearing(true)
    try {
      if (walletAddress) {
        const cacheService = getVideoCacheService(walletAddress)
        await cacheService.clearAll()

        // Refresh stats
        const newStats = await cacheService.getStats()
        useCacheStore.getState().setStats(newStats)
      }
    } catch (error) {
      console.error('[CacheManagement] Failed to clear cache:', error)
    } finally {
      setIsClearing(false)
      setShowClearAllDialog(false)
    }
  }, [walletAddress])

  // Combined sync state
  const isAnySyncing = isSyncing || isManualSyncing

  return (
    <section className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Local Cache</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Manage your local video metadata cache and synchronization settings.
        </p>
      </div>

      {/* Section 1: Metadata Cache */}
      <div className="space-y-6">
        <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 uppercase tracking-wide">
          Video Metadata
        </h3>

        {/* Cache Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Total Videos"
            value={stats?.totalVideos ?? 0}
            icon={<FilmIcon className="h-6 w-6" />}
          />
          <StatCard
            label="Active (On-chain)"
            value={stats?.activeVideos ?? 0}
            icon={<CheckCircleIcon className="h-6 w-6" />}
            color="green"
          />
          <StatCard
            label="Expired (Cached)"
            value={stats?.expiredVideos ?? 0}
            icon={<ArchiveIcon className="h-6 w-6" />}
            color="amber"
          />
          <StatCard
            label="Cache Size"
            value={formatBytes(stats?.cacheSize ?? 0)}
            icon={<HardDriveIcon className="h-6 w-6" />}
          />
        </div>

        {/* Storage usage bar */}
        {storageQuota > 0 && (
          <div className="mt-4">
            <div className="flex justify-between text-sm text-gray-500 dark:text-gray-400 mb-1">
              <span>Storage used</span>
              <span>
                {formatBytes(storageUsage)} / {formatBytes(storageQuota)}
              </span>
            </div>
            <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 dark:bg-blue-500 rounded-full transition-all"
                style={{ width: `${Math.min((storageUsage / storageQuota) * 100, 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Sync Controls */}
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 space-y-4">
          {/* Last sync info */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Last synced</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {lastSyncedAt ? formatRelativeTime(lastSyncedAt) : 'Never synced'}
              </p>
            </div>
            <Button onClick={forceSync} disabled={isAnySyncing} variant="outline" size="sm">
              {isAnySyncing ? (
                <>
                  <Loader2Icon className="h-4 w-4 animate-spin mr-2" />
                  Syncing...
                </>
              ) : (
                <>
                  <RefreshCwIcon className="h-4 w-4 mr-2" />
                  Sync Now
                </>
              )}
            </Button>
          </div>

          {/* Last sync result */}
          {lastSyncResult && (
            <div className="text-xs text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-900 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
              <p>Last sync: {formatRelativeTime(lastSyncResult.syncedAt)}</p>
              <p className="mt-1">
                <span className="text-green-600 dark:text-green-400">+{lastSyncResult.added}</span>{' '}
                added,{' '}
                <span className="text-blue-600 dark:text-blue-400">~{lastSyncResult.updated}</span>{' '}
                updated,{' '}
                <span className="text-amber-600 dark:text-amber-400">-{lastSyncResult.expired}</span>{' '}
                expired,{' '}
                <span className="text-gray-500 dark:text-gray-500">={lastSyncResult.unchanged}</span>{' '}
                unchanged
              </p>
              {lastSyncResult.errors.length > 0 && (
                <p className="text-red-600 dark:text-red-400 mt-1">
                  {lastSyncResult.errors.length} error(s)
                </p>
              )}
            </div>
          )}
        </div>

        {/* Cache Preferences */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">Preferences</h3>

          {/* Auto-sync toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-900 dark:text-gray-100">Auto-sync</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Periodically sync with Arkiv in the background
              </p>
            </div>
            <Switch checked={autoSyncEnabled} onCheckedChange={toggleAutoSync} />
          </div>

          {/* Show expired videos toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-900 dark:text-gray-100">Show expired videos</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Display videos whose Arkiv entities have expired
              </p>
            </div>
            <Switch checked={showExpiredVideos} onCheckedChange={toggleShowExpiredVideos} />
          </div>
        </div>
      </div>

      {/* Section 2: Video Content Cache */}
      <div className="space-y-6 pt-6 border-t border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 uppercase tracking-wide">
          Video Content
        </h3>

        {/* Storage Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Cached Videos"
            value={contentStats?.cachedCount ?? 0}
            icon={<HardDriveIcon className="h-6 w-6" />}
            color="purple"
          />
          <StatCard
            label="Content Size"
            value={formatBytes(contentStats?.totalSize ?? 0)}
            icon={<HardDriveIcon className="h-6 w-6" />}
            color="purple"
          />
          <StatCard
            label="Storage Used"
            value={contentStorageEstimate.quota > 0 
              ? `${((contentStorageEstimate.usage / contentStorageEstimate.quota) * 100).toFixed(1)}%`
              : 'N/A'}
            icon={<HardDriveIcon className="h-6 w-6" />}
          />
          <StatCard
            label="Stale Entries"
            value={contentStats?.staleCount ?? 0}
            icon={<AlertTriangleIcon className="h-6 w-6" />}
            color={contentStats && contentStats.staleCount > 0 ? 'amber' : 'default'}
          />
        </div>

        {/* Content Storage Progress Bar */}
        {contentStorageEstimate.quota > 0 && (
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
            <div className="flex justify-between text-sm text-gray-500 dark:text-gray-400 mb-1">
              <span>Content cache storage</span>
              <span>
                {formatBytes(contentStats?.totalSize ?? 0)} / {formatBytes(cacheSettings.maxCacheSizeMB * 1024 * 1024)}
              </span>
            </div>
            <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-purple-600 dark:bg-purple-500 rounded-full transition-all"
                style={{ width: `${Math.min(((contentStats?.totalSize ?? 0) / (cacheSettings.maxCacheSizeMB * 1024 * 1024)) * 100, 100)}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              {contentEntries.length} video{contentEntries.length !== 1 ? 's' : ''} cached
              {contentStats?.staleCount ? ` • ${contentStats.staleCount} stale` : ''}
            </p>
          </div>
        )}

        {/* Storage Persistence Status */}
        <PersistenceStatus />

        {/* Content Cache Settings */}
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 space-y-4">
          <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">Cache Settings</h4>
          
          {/* Cache TTL */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <p className="text-sm text-gray-900 dark:text-gray-100">Cache retention</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                How long to keep cached videos
              </p>
            </div>
            <select
              value={cacheSettings.ttlDays}
              onChange={(e) => cacheSettings.setTtlDays(Number(e.target.value))}
              className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value={1}>1 day</option>
              <option value={3}>3 days</option>
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
            </select>
          </div>

          {/* Max Cache Size */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <p className="text-sm text-gray-900 dark:text-gray-100">Max cache size</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Maximum storage for cached videos
              </p>
            </div>
            <select
              value={cacheSettings.maxCacheSizeMB}
              onChange={(e) => cacheSettings.setMaxCacheSizeMB(Number(e.target.value))}
              className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value={500}>500 MB</option>
              <option value={1000}>1 GB</option>
              <option value={2000}>2 GB</option>
              <option value={5000}>5 GB</option>
              <option value={10000}>10 GB</option>
            </select>
          </div>

          {/* Prefetch Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-900 dark:text-gray-100">Background prefetch</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Automatically cache videos you&apos;re likely to watch
              </p>
            </div>
            <Switch 
              checked={cacheSettings.prefetchEnabled} 
              onCheckedChange={cacheSettings.setPrefetchEnabled} 
            />
          </div>

          {/* Clear on Disconnect Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-900 dark:text-gray-100">Clear on disconnect</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Remove cached videos when you disconnect your wallet
              </p>
            </div>
            <Switch 
              checked={cacheSettings.clearOnDisconnect} 
              onCheckedChange={cacheSettings.setClearOnDisconnect} 
            />
          </div>
        </div>

        {/* Cached Videos List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
              Cached Videos
            </h4>
            <div className="flex items-center gap-2">
              {/* Refresh button */}
              <Button
                variant="outline"
                size="sm"
                onClick={loadContentCacheData}
                disabled={isLoadingContent}
              >
                {isLoadingContent ? (
                  <Loader2Icon className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCwIcon className="h-4 w-4" />
                )}
                <span className="ml-1">Refresh</span>
              </Button>

              {/* Sort dropdown */}
              <select
                value={contentSortBy}
                onChange={(e) => setContentSortBy(e.target.value as SortBy)}
                className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-xs px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="cachedAt">Sort: Date cached</option>
                <option value="size">Sort: Size</option>
                <option value="expiresAt">Sort: Expires</option>
              </select>

              {/* Export button */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportCacheInfo}
                disabled={contentEntries.length === 0}
              >
                Export
              </Button>
            </div>
          </div>

          {/* Bulk actions */}
          {contentEntries.length > 0 && (
            <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800/30 rounded-lg p-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selectedVideos.size === sortedEntries.length && sortedEntries.length > 0}
                  onChange={selectAllVideos}
                  className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                />
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {selectedVideos.size} selected
                </span>
              </div>
              {selectedVideos.size > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleBulkRemove}
                >
                  <TrashIcon className="h-4 w-4 mr-1" />
                  Remove
                </Button>
              )}
            </div>
          )}

          {/* Videos list */}
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {sortedEntries.length === 0 ? (
              <div className="text-center py-8 bg-gray-50 dark:bg-gray-800/30 rounded-lg">
                <HardDriveIcon className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  No videos cached yet.
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Videos will be cached automatically after first play.
                </p>
              </div>
            ) : (
              sortedEntries.map((entry) => (
                <div
                  key={entry.videoId}
                  className="flex items-center gap-3 p-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-purple-300 dark:hover:border-purple-700 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selectedVideos.has(entry.videoId)}
                    onChange={() => toggleVideoSelection(entry.videoId)}
                    className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                  />
                  
                  {/* Thumbnail placeholder */}
                  <div className="flex-shrink-0 h-12 w-16 bg-gray-100 dark:bg-gray-800 rounded overflow-hidden">
                    {entry.thumbnailUrl ? (
                      <img
                        src={entry.thumbnailUrl}
                        alt={entry.title}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center">
                        <FilmIcon className="h-6 w-6 text-gray-400" />
                      </div>
                    )}
                  </div>
                  
                  {/* Video info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                      {entry.title}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <span>{formatBytes(entry.size)}</span>
                      <span>•</span>
                      <span>Cached {formatRelativeTime(entry.cachedAt.getTime())}</span>
                      {entry.ttl && (
                        <>
                          <span>•</span>
                          <span>
                            Expires {formatRelativeTime(entry.cachedAt.getTime() + entry.ttl)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  
                  {/* Remove button */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRemoveVideo(entry.videoId)}
                    className="text-red-600 dark:text-red-400 border-red-200 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-950/30"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
          </div>

          {/* Clear actions */}
          {contentEntries.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearExpiredContent}
                disabled={isClearing || (contentStats?.staleCount ?? 0) === 0}
              >
                <ClockIcon className="h-4 w-4 mr-1" />
                Clear Expired
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowClearContentDialog(true)}
                disabled={isClearing}
              >
                <TrashIcon className="h-4 w-4 mr-1" />
                Clear All Content
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Danger Zone */}
      <div className="border border-red-200 dark:border-red-900/30 rounded-lg p-4 mt-6 bg-red-50/50 dark:bg-red-950/20">
        <h3 className="text-sm font-medium text-red-700 dark:text-red-400 flex items-center gap-2">
          <AlertTriangleIcon className="h-4 w-4" />
          Danger Zone
        </h3>

        {/* Clear expired entries */}
        <div className="flex items-center justify-between mt-4">
          <div>
            <p className="text-sm text-gray-900 dark:text-gray-100">Clear expired entries</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Remove videos that are no longer on Arkiv. This data cannot be recovered.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="text-red-600 dark:text-red-400 border-red-200 dark:border-red-900/50 hover:bg-red-100 dark:hover:bg-red-950/50"
            onClick={() => setShowClearExpiredDialog(true)}
            disabled={isClearing || (stats?.expiredVideos ?? 0) === 0}
          >
            Clear Expired
          </Button>
        </div>

        {/* Clear all cache */}
        <div className="flex items-center justify-between mt-4">
          <div>
            <p className="text-sm text-gray-900 dark:text-gray-100">Clear all cached data</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Remove all locally cached video metadata. 
              {contentEntries.length > 0 && (
                <span className="text-amber-600 dark:text-amber-400">
                  {' '}Warning: {contentEntries.length} video(s) have cached content that will become 
                  orphaned. Consider clearing the video content cache first.
                </span>
              )}
            </p>
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setShowClearAllDialog(true)}
            disabled={isClearing || (stats?.totalVideos ?? 0) === 0}
          >
            Clear Cache
          </Button>
        </div>
      </div>

      {/* Confirmation Dialogs */}
      <ConfirmDialog
        isOpen={showClearExpiredDialog}
        title="Clear expired entries?"
        description={
          <>
            This will remove {stats?.expiredVideos ?? 0} expired video records from your browser.
            This action cannot be undone.
          </>
        }
        confirmLabel="Clear Expired"
        onConfirm={handleClearExpired}
        onCancel={() => setShowClearExpiredDialog(false)}
        variant="destructive"
      />

      <ConfirmDialog
        isOpen={showClearAllDialog}
        title="Clear all cached data?"
        description={
          <>
            This will remove all {stats?.totalVideos ?? 0} cached video records from your browser.
            Active videos will be re-fetched from Arkiv, but expired video metadata (
            {stats?.expiredVideos ?? 0} videos) will be permanently lost.
            {contentEntries.length > 0 && (
              <span className="text-amber-600 dark:text-amber-400 block mt-2">
                Warning: {contentEntries.length} video(s) have cached content that will become 
                orphaned (no metadata to identify them). Consider clearing the video content cache first.
              </span>
            )}
          </>
        }
        confirmLabel="Clear All Data"
        onConfirm={handleClearAll}
        onCancel={() => setShowClearAllDialog(false)}
        variant="destructive"
      />

      <ConfirmDialog
        isOpen={showClearContentDialog}
        title="Clear all cached video content?"
        description={
          <>
            This will remove {contentEntries.length} cached video(s) ({formatBytes(contentStats?.totalSize ?? 0)}).
            You will need to re-decrypt them on next play, which requires a wallet signature.
            <span className="text-green-600 dark:text-green-400 block mt-2">
              Your video metadata (titles, descriptions) will NOT be affected.
            </span>
          </>
        }
        confirmLabel="Clear Content"
        onConfirm={handleClearAllContent}
        onCancel={() => setShowClearContentDialog(false)}
        variant="destructive"
      />
    </section>
  )
}

export default CacheManagement
