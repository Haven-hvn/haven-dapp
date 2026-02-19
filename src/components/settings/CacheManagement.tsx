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
import { useCacheStatus, type UseCacheStatusReturn } from '../../hooks/useCacheStatus'
import { useManualSync } from '../../hooks/useBackgroundSync'
import { getVideoCacheService } from '../../services/cacheService'
import { getAllCachedVideos, deleteCachedVideo } from '../../lib/cache/db'

// =============================================================================
// Types
// =============================================================================

interface StatCardProps {
  label: string
  value: string | number
  icon: React.ReactNode
  color?: 'default' | 'green' | 'amber' | 'blue'
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
  }

  const iconColorClasses = {
    default: 'text-gray-500 dark:text-gray-400',
    green: 'text-green-600 dark:text-green-400',
    amber: 'text-amber-600 dark:text-amber-400',
    blue: 'text-blue-600 dark:text-blue-400',
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
// Main Component
// =============================================================================

/**
 * CacheManagement - Cache management section for settings page
 *
 * Provides:
 * - Cache statistics display
 * - Manual sync controls
 * - User preferences (auto-sync, show expired)
 * - Danger zone for clearing cache
 */
export function CacheManagement() {
  // Get cache state from store
  const { stats, isSyncing, lastSyncedAt, lastSyncResult } = useCacheStore()
  const { showExpiredVideos, autoSyncEnabled, toggleShowExpiredVideos, toggleAutoSync } =
    useCachePreferences()

  // Get cache status with forward-compatible interface
  const cacheStatus = useCacheStatus()

  // Get manual sync control
  const { sync: forceSync, isSyncing: isManualSyncing } = useManualSync()

  // Local state for dialogs
  const [showClearExpiredDialog, setShowClearExpiredDialog] = useState(false)
  const [showClearAllDialog, setShowClearAllDialog] = useState(false)
  const [isClearing, setIsClearing] = useState(false)

  // Storage estimate state
  const [storageUsage, setStorageUsage] = useState(0)
  const [storageQuota, setStorageQuota] = useState(0)

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

  // Handle clear expired entries
  const handleClearExpired = useCallback(async () => {
    setIsClearing(true)
    try {
      // Get wallet address from store or context
      // For now, we'll use a placeholder - in real app this would come from wallet
      const walletAddress = '' // This should be obtained from wallet context

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
  }, [])

  // Handle clear all cache
  const handleClearAll = useCallback(async () => {
    setIsClearing(true)
    try {
      const walletAddress = '' // This should be obtained from wallet context

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
  }, [])

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

      {/* Section 2: Video Content Cache (Placeholder) */}
      <div className="space-y-4 pt-6 border-t border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 uppercase tracking-wide">
          Video Content
        </h3>

        <div className="bg-gray-50 dark:bg-gray-800/30 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 h-10 w-10 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
              <HardDriveIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                Content caching not available
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Video content caching is not yet implemented. This feature will allow offline
                playback of your videos.
              </p>
            </div>
          </div>

          {/* Content cache stats (placeholder - null until video-cache implemented) */}
          {cacheStatus.contentStats && (
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div className="bg-white dark:bg-gray-900 rounded-lg p-3">
                <p className="text-xs text-gray-500 dark:text-gray-400">Cached videos</p>
                <p className="text-lg font-semibold">{cacheStatus.contentStats.cachedCount}</p>
              </div>
              <div className="bg-white dark:bg-gray-900 rounded-lg p-3">
                <p className="text-xs text-gray-500 dark:text-gray-400">Content cache size</p>
                <p className="text-lg font-semibold">
                  {formatBytes(cacheStatus.contentStats.totalSize)}
                </p>
              </div>
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
              Remove all locally cached video metadata. Active videos will be re-fetched from Arkiv.
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
          </>
        }
        confirmLabel="Clear All Data"
        onConfirm={handleClearAll}
        onCancel={() => setShowClearAllDialog(false)}
        variant="destructive"
      />
    </section>
  )
}

export default CacheManagement
