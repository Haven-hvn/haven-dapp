/**
 * Cache Export/Import Component
 *
 * Settings page section for backing up and restoring the local cache.
 * Allows users to export their cached video metadata as a JSON file
 * and import it back on a different browser or device.
 *
 * Security features:
 * - Wallet address verification (prevent accidental cross-wallet imports)
 * - Checksum verification (detect file corruption)
 * - File size limits (prevent abuse)
 * - Validation of export format before import
 */

'use client'

import React, { useState, useRef, useCallback } from 'react'
import {
  exportCacheData,
  downloadExport,
  importCacheData,
  type ImportResult,
  type ImportOptions,
} from '../../lib/cache/exportImport'

// =============================================================================
// Types
// =============================================================================

interface CacheExportImportProps {
  /** Wallet address for export/import operations */
  walletAddress: string
  /** Optional callback when import completes successfully */
  onImportSuccess?: () => void
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'destructive'
  size?: 'sm' | 'md'
}

interface AlertProps {
  variant: 'success' | 'error' | 'warning'
  children: React.ReactNode
}

// =============================================================================
// Icons
// =============================================================================

function DownloadIcon({ className }: { className?: string }) {
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
        d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
      />
    </svg>
  )
}

function UploadIcon({ className }: { className?: string }) {
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
        d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
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

function ExclamationTriangleIcon({ className }: { className?: string }) {
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

function InformationCircleIcon({ className }: { className?: string }) {
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
        d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
      />
    </svg>
  )
}

// =============================================================================
// Sub-components
// =============================================================================

/**
 * Button - Action button component
 */
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
 * Alert - Status message component
 */
function Alert({ variant, children }: AlertProps) {
  const variantClasses = {
    success: 'bg-green-50 dark:bg-green-950/30 text-green-800 dark:text-green-200 border-green-200 dark:border-green-900/50',
    error: 'bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200 border-red-200 dark:border-red-900/50',
    warning: 'bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-900/50',
  }

  const iconMap = {
    success: <CheckCircleIcon className="h-4 w-4 flex-shrink-0" />,
    error: <ExclamationTriangleIcon className="h-4 w-4 flex-shrink-0" />,
    warning: <ExclamationTriangleIcon className="h-4 w-4 flex-shrink-0" />,
  }

  return (
    <div
      className={`flex items-start gap-2 rounded-lg border p-3 text-xs ${variantClasses[variant]}`}
      role="alert"
    >
      {iconMap[variant]}
      <div className="flex-1">{children}</div>
    </div>
  )
}

/**
 * MergeStrategySelect - Dropdown for selecting merge behavior
 */
interface MergeStrategySelectProps {
  value: ImportOptions['mergeStrategy']
  onChange: (value: ImportOptions['mergeStrategy']) => void
  disabled?: boolean
}

function MergeStrategySelect({ value, onChange, disabled }: MergeStrategySelectProps) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-gray-600 dark:text-gray-400">If video exists:</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as ImportOptions['mergeStrategy'])}
        disabled={disabled}
        className="text-xs rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
      >
        <option value="keep-existing">Keep existing</option>
        <option value="prefer-import">Use import</option>
      </select>
    </div>
  )
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * CacheExportImport - Backup and restore cache data
 *
 * Provides:
 * - Export cached video metadata as JSON file
 * - Import from JSON file with validation
 * - Wallet address verification
 * - Checksum verification
 * - Merge strategy selection
 */
export function CacheExportImport({ walletAddress, onImportSuccess }: CacheExportImportProps) {
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [mergeStrategy, setMergeStrategy] = useState<ImportOptions['mergeStrategy']>('keep-existing')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleExport = useCallback(async () => {
    if (!walletAddress) return
    setIsExporting(true)
    setImportResult(null)

    try {
      const data = await exportCacheData(walletAddress)
      downloadExport(data)
    } catch (error) {
      console.error('[CacheExportImport] Export failed:', error)
      setImportResult({
        success: false,
        imported: 0,
        skipped: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        message: 'Failed to export cache data',
      })
    } finally {
      setIsExporting(false)
    }
  }, [walletAddress])

  const handleImport = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file || !walletAddress) return

      setIsImporting(true)
      setImportResult(null)

      try {
        const result = await importCacheData(file, walletAddress, {
          mergeStrategy,
          maxFileSize: 50 * 1024 * 1024, // 50MB
        })
        setImportResult(result)

        if (result.success && onImportSuccess) {
          onImportSuccess()
        }
      } catch (error) {
        console.error('[CacheExportImport] Import failed:', error)
        setImportResult({
          success: false,
          imported: 0,
          skipped: 0,
          errors: [error instanceof Error ? error.message : 'Unknown error'],
          message: 'Failed to import cache data',
        })
      } finally {
        setIsImporting(false)
        // Reset file input so same file can be selected again
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
      }
    },
    [walletAddress, mergeStrategy, onImportSuccess]
  )

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const clearResult = useCallback(() => {
    setImportResult(null)
  }, [])

  // Determine alert variant from result
  const getAlertVariant = (): AlertProps['variant'] => {
    if (!importResult) return 'success'
    if (importResult.success && importResult.errors.length > 0) return 'warning'
    return importResult.success ? 'success' : 'error'
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">Backup & Restore</h3>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3">
        <Button
          onClick={handleExport}
          disabled={isExporting || !walletAddress}
          variant="outline"
          size="sm"
        >
          {isExporting ? (
            <>
              <Loader2Icon className="h-4 w-4 mr-2 animate-spin" />
              Exporting...
            </>
          ) : (
            <>
              <DownloadIcon className="h-4 w-4 mr-2" />
              Export Library
            </>
          )}
        </Button>

        <Button
          onClick={handleImportClick}
          disabled={isImporting || !walletAddress}
          variant="outline"
          size="sm"
        >
          {isImporting ? (
            <>
              <Loader2Icon className="h-4 w-4 mr-2 animate-spin" />
              Importing...
            </>
          ) : (
            <>
              <UploadIcon className="h-4 w-4 mr-2" />
              Import Library
            </>
          )}
        </Button>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          onChange={handleImport}
          className="hidden"
          aria-label="Import cache file"
        />
      </div>

      {/* Merge Strategy Selector */}
      <MergeStrategySelect
        value={mergeStrategy}
        onChange={setMergeStrategy}
        disabled={isImporting}
      />

      {/* Import Result Alert */}
      {importResult && (
        <Alert variant={getAlertVariant()}>
          <div className="space-y-1">
            <p className="font-medium">{importResult.message}</p>
            {importResult.imported > 0 && (
              <p>Imported: {importResult.imported} videos</p>
            )}
            {importResult.skipped > 0 && (
              <p>Skipped: {importResult.skipped} videos</p>
            )}
            {importResult.errors.length > 0 && (
              <ul className="mt-1 list-disc list-inside space-y-0.5">
                {importResult.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            )}
            <button
              onClick={clearResult}
              className="mt-2 text-xs underline hover:no-underline focus:outline-none"
            >
              Dismiss
            </button>
          </div>
        </Alert>
      )}

      {/* Info Box */}
      <div className="flex items-start gap-2 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 p-3 text-xs text-blue-800 dark:text-blue-200">
        <InformationCircleIcon className="h-4 w-4 flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p>
            Export your library metadata as a JSON file for backup. Import to restore on a new
            browser or device.
          </p>
          <ul className="list-disc list-inside space-y-0.5 text-blue-700 dark:text-blue-300">
            <li>Exports include video metadata, not the actual video files</li>
            <li>Import only works for the same wallet address</li>
            <li>Maximum file size: 50MB</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

export default CacheExportImport
