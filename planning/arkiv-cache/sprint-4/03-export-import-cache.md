# Task 4.3 — Export & Import Cache Data

**Sprint:** 4 — UX & Polish  
**Estimate:** 3–4 hours  
**Files:** `src/lib/cache/exportImport.ts` (new), `src/components/settings/CacheExportImport.tsx` (new)

## Objective

Allow users to export their cached video metadata as a JSON file and import it back. This provides a safety net beyond the browser's IndexedDB — users can back up their library metadata to a file and restore it on a different browser, device, or after clearing browser data.

## Background

IndexedDB is browser-local. If a user:
- Clears browser data
- Switches browsers
- Uses a different device
- Reinstalls their OS

...their cached metadata is lost. Export/import solves this by letting users create portable backups of their library metadata.

## Prerequisites

- Sprint 1 completed (cache types and service)

## Requirements

### 1. Export Format

Define a versioned export format:

```typescript
// src/lib/cache/exportImport.ts

export interface CacheExportData {
  /** Export format version */
  version: 1
  /** When the export was created */
  exportedAt: string  // ISO 8601
  /** App version that created the export */
  appVersion: string
  /** Wallet address this data belongs to */
  walletAddress: string
  /** Number of videos in the export */
  videoCount: number
  /** The cached video records */
  videos: CachedVideo[]
  /** Cache metadata entries */
  metadata: CacheMetadataEntry[]
  /** Checksum for integrity verification */
  checksum: string
}
```

### 2. Export Function

```typescript
export async function exportCacheData(walletAddress: string): Promise<CacheExportData> {
  const cacheService = getVideoCacheService(walletAddress)
  
  // Get all cached videos (raw CachedVideo, not converted to Video)
  const videos = await getAllCachedVideos(walletAddress)
  
  // Get metadata entries
  const db = await getCacheDB(walletAddress)
  const tx = db.transaction('metadata', 'readonly')
  const metadata = await tx.store.getAll()
  await tx.done

  // Compute checksum
  const dataString = JSON.stringify({ videos, metadata })
  const checksum = await computeChecksum(dataString)

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    appVersion: process.env.NEXT_PUBLIC_APP_VERSION || '0.1.0',
    walletAddress: walletAddress.toLowerCase(),
    videoCount: videos.length,
    videos,
    metadata,
    checksum,
  }
}

export function downloadExport(data: CacheExportData): void {
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  
  const a = document.createElement('a')
  a.href = url
  a.download = `haven-library-${data.walletAddress.slice(0, 8)}-${formatDate(new Date())}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0] // YYYY-MM-DD
}
```

### 3. Import Function

```typescript
export interface ImportResult {
  success: boolean
  imported: number
  skipped: number
  errors: string[]
  message: string
}

export async function importCacheData(
  file: File,
  walletAddress: string,
  options: { overwrite?: boolean; mergeStrategy?: 'keep-existing' | 'prefer-import' } = {}
): Promise<ImportResult> {
  const { overwrite = false, mergeStrategy = 'keep-existing' } = options
  const result: ImportResult = {
    success: false,
    imported: 0,
    skipped: 0,
    errors: [],
    message: '',
  }

  try {
    // 1. Read and parse file
    const text = await file.text()
    const data = JSON.parse(text) as CacheExportData

    // 2. Validate export format
    const validation = validateExportData(data)
    if (!validation.valid) {
      result.errors = validation.errors
      result.message = 'Invalid export file format'
      return result
    }

    // 3. Verify wallet address matches
    if (data.walletAddress.toLowerCase() !== walletAddress.toLowerCase()) {
      result.errors.push(
        `Export is for wallet ${data.walletAddress.slice(0, 8)}... ` +
        `but current wallet is ${walletAddress.slice(0, 8)}...`
      )
      result.message = 'Wallet address mismatch'
      return result
    }

    // 4. Verify checksum
    const dataString = JSON.stringify({ videos: data.videos, metadata: data.metadata })
    const expectedChecksum = await computeChecksum(dataString)
    if (expectedChecksum !== data.checksum) {
      result.errors.push('Checksum mismatch — file may be corrupted')
      // Continue anyway — warn but don't block
    }

    // 5. Import videos
    const existingVideos = await getAllCachedVideos(walletAddress)
    const existingIds = new Set(existingVideos.map(v => v.id))

    const toImport: CachedVideo[] = []
    for (const video of data.videos) {
      if (existingIds.has(video.id)) {
        if (mergeStrategy === 'prefer-import' || overwrite) {
          toImport.push(video)
          result.imported++
        } else {
          result.skipped++
        }
      } else {
        toImport.push(video)
        result.imported++
      }
    }

    // 6. Write to IndexedDB
    if (toImport.length > 0) {
      await putCachedVideos(walletAddress, toImport)
    }

    result.success = true
    result.message = `Imported ${result.imported} videos, skipped ${result.skipped}`
    return result
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : 'Unknown error')
    result.message = 'Failed to import cache data'
    return result
  }
}
```

### 4. Validation

```typescript
interface ValidationResult {
  valid: boolean
  errors: string[]
}

function validateExportData(data: unknown): ValidationResult {
  const errors: string[] = []

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Not a valid JSON object'] }
  }

  const d = data as Record<string, unknown>

  if (d.version !== 1) {
    errors.push(`Unsupported export version: ${d.version}`)
  }
  if (typeof d.walletAddress !== 'string') {
    errors.push('Missing wallet address')
  }
  if (!Array.isArray(d.videos)) {
    errors.push('Missing or invalid videos array')
  }
  if (typeof d.checksum !== 'string') {
    errors.push('Missing checksum')
  }

  // Validate individual video records
  if (Array.isArray(d.videos)) {
    for (let i = 0; i < Math.min(d.videos.length, 5); i++) {
      if (!isValidCachedVideo(d.videos[i])) {
        errors.push(`Invalid video record at index ${i}`)
      }
    }
  }

  return { valid: errors.length === 0, errors }
}
```

### 5. Checksum Utility

```typescript
async function computeChecksum(data: string): Promise<string> {
  const encoder = new TextEncoder()
  const buffer = encoder.encode(data)
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}
```

### 6. UI Component

```typescript
// src/components/settings/CacheExportImport.tsx

export function CacheExportImport() {
  const { address } = useAppKitAccount()
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleExport = async () => {
    if (!address) return
    setIsExporting(true)
    try {
      const data = await exportCacheData(address)
      downloadExport(data)
    } catch (error) {
      toast.error('Failed to export cache data')
    } finally {
      setIsExporting(false)
    }
  }

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !address) return
    
    setIsImporting(true)
    try {
      const result = await importCacheData(file, address)
      setImportResult(result)
      if (result.success) {
        toast.success(result.message)
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      toast.error('Failed to import cache data')
    } finally {
      setIsImporting(false)
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium">Backup & Restore</h3>
      
      <div className="flex gap-3">
        <Button 
          onClick={handleExport} 
          disabled={isExporting}
          variant="outline" 
          size="sm"
        >
          <Download className="h-4 w-4 mr-2" />
          {isExporting ? 'Exporting...' : 'Export Library'}
        </Button>

        <Button 
          onClick={() => fileInputRef.current?.click()} 
          disabled={isImporting}
          variant="outline" 
          size="sm"
        >
          <Upload className="h-4 w-4 mr-2" />
          {isImporting ? 'Importing...' : 'Import Library'}
        </Button>
        
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleImport}
          className="hidden"
        />
      </div>

      {importResult && (
        <div className={cn(
          "text-xs rounded-lg p-3",
          importResult.success ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
        )}>
          <p>{importResult.message}</p>
          {importResult.errors.length > 0 && (
            <ul className="mt-1 list-disc list-inside">
              {importResult.errors.map((err, i) => <li key={i}>{err}</li>)}
            </ul>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Export your library metadata as a JSON file for backup. 
        Import to restore on a new browser or device.
      </p>
    </div>
  )
}
```

## Security Considerations

- **No encryption keys in export** — `litEncryptionMetadata` contains encrypted keys, not plaintext. Safe to export.
- **Wallet address verification** — Import only works for the matching wallet address.
- **Checksum verification** — Detects file corruption or tampering.
- **No executable code** — Export is pure JSON data, no scripts.
- **File size limit** — Consider limiting import file size (e.g., 50MB) to prevent abuse.

## Acceptance Criteria

- [ ] Export produces a valid JSON file with all cached videos
- [ ] Export filename includes wallet prefix and date
- [ ] Import validates file format before processing
- [ ] Import verifies wallet address matches
- [ ] Import checksum verification detects corruption
- [ ] Merge strategy works (keep-existing vs prefer-import)
- [ ] UI shows export/import progress and results
- [ ] Error messages are clear and actionable
- [ ] Large exports (1000+ videos) complete in reasonable time
- [ ] Component integrates into settings page

## Testing Notes

- Test export → import round-trip (data should be identical)
- Test import with wrong wallet address → rejected
- Test import with corrupted file → error message
- Test import with old format version → appropriate error
- Test merge strategies with overlapping video IDs
- Test with large dataset (1000 videos) for performance