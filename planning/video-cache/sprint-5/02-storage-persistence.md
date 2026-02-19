# Task 5.2: Persistent Storage Request

## Objective

Request persistent storage from the browser to prevent the video cache from being automatically evicted by the browser's storage pressure mechanisms. Without persistent storage, the browser may silently delete cached videos when disk space is low.

## Background

### Browser Storage Eviction

By default, browser storage (Cache API, IndexedDB, OPFS) is "best-effort" — the browser can evict it at any time when under storage pressure. This means a user could cache 10 videos, close the browser, and find them all gone the next day because the browser needed space.

### Persistent Storage API

The `navigator.storage.persist()` API requests that the browser keep our origin's storage permanently. Once granted:

- Storage is not evicted under pressure
- Data survives browser restarts
- User must explicitly clear it (via browser settings or our UI)

### Browser Behavior

| Browser | Auto-grant? | Criteria |
|---------|------------|----------|
| Chrome | Yes, if engaged | Site is bookmarked, installed as PWA, or has push notifications |
| Firefox | Prompts user | Shows a permission dialog |
| Safari | No API | Uses its own heuristics |
| Edge | Same as Chrome | Same criteria |

## Requirements

### Storage Persistence Service (`src/lib/storage-persistence.ts`)

1. **`requestPersistentStorage()`** — Request persistent storage
   - Call `navigator.storage.persist()`
   - Return whether persistence was granted
   - Log the result for debugging

2. **`isPersisted()`** — Check if storage is already persistent
   - Call `navigator.storage.persisted()`
   - Return `boolean`

3. **`getStorageDetails()`** — Get comprehensive storage information
   - Persistence status
   - Usage and quota
   - Estimated available space
   - Whether the API is supported

### Integration Points

1. **On first video cache**: After the first successful video cache write, request persistent storage
2. **In settings UI**: Show persistence status and allow manual request
3. **On app load**: Check persistence status for display purposes

## Implementation Details

### Storage Persistence Service

```typescript
// src/lib/storage-persistence.ts

export interface StorageDetails {
  isPersisted: boolean
  isSupported: boolean
  usage: number
  quota: number
  percentUsed: number
  estimatedAvailable: number
}

export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) {
    console.info('[Storage] Persistent storage API not available')
    return false
  }
  
  // Check if already persisted
  const alreadyPersisted = await navigator.storage.persisted()
  if (alreadyPersisted) {
    console.info('[Storage] Storage is already persistent')
    return true
  }
  
  // Request persistence
  const granted = await navigator.storage.persist()
  
  if (granted) {
    console.info('[Storage] Persistent storage granted')
  } else {
    console.info('[Storage] Persistent storage denied — cache may be evicted by browser')
  }
  
  return granted
}

export async function isPersisted(): Promise<boolean> {
  if (!navigator.storage?.persisted) return false
  return navigator.storage.persisted()
}

export async function getStorageDetails(): Promise<StorageDetails> {
  const isSupported = !!navigator.storage?.persist
  
  let persisted = false
  let usage = 0
  let quota = 0
  
  if (navigator.storage) {
    try {
      persisted = await navigator.storage.persisted()
    } catch {}
    
    try {
      const estimate = await navigator.storage.estimate()
      usage = estimate.usage || 0
      quota = estimate.quota || 0
    } catch {}
  }
  
  const percentUsed = quota > 0 ? (usage / quota) * 100 : 0
  const estimatedAvailable = Math.max(0, quota - usage)
  
  return {
    isPersisted: persisted,
    isSupported,
    usage,
    quota,
    percentUsed,
    estimatedAvailable,
  }
}
```

### Auto-Request After First Cache

```typescript
// In useVideoCache hook, after successful putVideo():
import { requestPersistentStorage, isPersisted } from '@/lib/storage-persistence'

// After first successful cache write
const persisted = await isPersisted()
if (!persisted) {
  // Request persistence silently — don't block playback
  requestPersistentStorage().catch(() => {})
}
```

### Settings UI Integration

```typescript
// In CacheManagement.tsx — add persistence status
function PersistenceStatus() {
  const [details, setDetails] = useState<StorageDetails | null>(null)
  
  useEffect(() => {
    getStorageDetails().then(setDetails)
  }, [])
  
  if (!details) return null
  
  return (
    <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
      <div>
        <p className="text-sm text-white">Storage Protection</p>
        <p className="text-xs text-white/40">
          {details.isPersisted 
            ? 'Your cached videos are protected from browser cleanup'
            : 'Cached videos may be removed by the browser when storage is low'
          }
        </p>
      </div>
      {!details.isPersisted && details.isSupported && (
        <button 
          onClick={async () => {
            await requestPersistentStorage()
            setDetails(await getStorageDetails())
          }}
          className="px-3 py-1 bg-purple-500/20 text-purple-400 rounded text-sm"
        >
          Protect Cache
        </button>
      )}
      {details.isPersisted && (
        <span className="text-green-400 text-sm">✓ Protected</span>
      )}
    </div>
  )
}
```

## Acceptance Criteria

- [ ] `requestPersistentStorage()` calls the browser API and returns result
- [ ] `isPersisted()` correctly reports persistence status
- [ ] `getStorageDetails()` returns comprehensive storage information
- [ ] Persistent storage is requested after first successful video cache
- [ ] Settings UI shows persistence status
- [ ] Settings UI allows manual persistence request
- [ ] Graceful handling when API is not supported (Safari)
- [ ] No errors or popups on browsers that auto-grant
- [ ] Firefox users see the permission dialog (expected behavior)

## Dependencies

- Task 1.2 (Cache API Wrapper — triggers persistence request)
- Task 5.1 (Cache Management Settings — displays persistence status)

## Estimated Effort

Small (2-3 hours)