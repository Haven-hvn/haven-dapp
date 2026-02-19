# Task 4.2: Cache Indicator & Progress Components

## Objective

Create UI components that communicate cache status to the user: a cache indicator badge on the video player, and a cache-aware progress component that shows different UI for cached vs. uncached playback.

## Background

Users should understand why some videos play instantly while others require a loading/decryption step. A subtle cache indicator helps set expectations and builds trust in the system. The progress component needs to handle the new `loadingStage` states from `useVideoCache`.

## Requirements

### CacheIndicator Component (`src/components/player/CacheIndicator.tsx`)

A small badge/icon displayed in the video player header that shows:

1. **Cached state**: Green indicator with "Cached" tooltip — video will play instantly
2. **Not cached state**: No indicator (or subtle gray) — first play will require decryption
3. **Evict action**: Optional dropdown/button to remove from cache

```typescript
interface CacheIndicatorProps {
  isCached: boolean
  videoId: string
  onEvict: () => Promise<void>
}
```

#### Visual Design

- **Cached**: Small green dot or cloud-check icon with "Cached • Instant playback" tooltip
- **Not cached**: Hidden or subtle gray cloud icon
- **Evicting**: Brief spinner, then disappears

### CacheAwareProgress Component (`src/components/player/CacheAwareProgress.tsx`)

Replaces the existing `DecryptionProgress` component with cache-aware messaging:

```typescript
interface CacheAwareProgressProps {
  stage: 'checking-cache' | 'fetching' | 'authenticating' | 'decrypting' | 'caching' | 'ready' | 'error'
  progress: number // 0-100
  isCached: boolean
}
```

#### Stage-Specific UI

| Stage | Icon | Message | Progress Bar |
|-------|------|---------|-------------|
| `checking-cache` | 🔍 | "Checking cache..." | Indeterminate |
| `fetching` | ⬇️ | "Downloading encrypted video..." | Determinate (%) |
| `authenticating` | 🔐 | "Please approve in your wallet..." | Indeterminate |
| `decrypting` | 🔓 | "Decrypting video..." | Determinate (%) |
| `caching` | 💾 | "Saving for instant replay..." | Indeterminate |
| `ready` | ✅ | (hidden — video plays) | — |
| `error` | ❌ | (handled by ErrorOverlay) | — |

#### Special: Authenticating Stage

The `authenticating` stage is special because it requires user action (wallet signature). The UI should:
- Show a prominent "Approve in your wallet" message
- Animate to draw attention to the wallet popup
- Include a "What's this?" link explaining SIWE

## Implementation Details

### CacheIndicator

```typescript
// src/components/player/CacheIndicator.tsx
'use client'

import { useState } from 'react'
import { Cloud, CloudOff, Loader2, Trash2 } from 'lucide-react'

interface CacheIndicatorProps {
  isCached: boolean
  videoId: string
  onEvict: () => Promise<void>
}

export function CacheIndicator({ isCached, videoId, onEvict }: CacheIndicatorProps) {
  const [isEvicting, setIsEvicting] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  
  if (!isCached) return null // Don't show anything for uncached videos
  
  const handleEvict = async () => {
    setIsEvicting(true)
    try {
      await onEvict()
    } finally {
      setIsEvicting(false)
      setShowMenu(false)
    }
  }
  
  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="flex items-center gap-1 px-2 py-1 bg-green-500/20 text-green-400 rounded-full text-xs hover:bg-green-500/30 transition-colors"
        title="Video is cached for instant playback"
      >
        {isEvicting ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <Cloud className="w-3 h-3" />
        )}
        <span>Cached</span>
      </button>
      
      {showMenu && (
        <div className="absolute right-0 top-full mt-1 bg-gray-900 border border-white/10 rounded-lg shadow-lg p-2 min-w-[160px] z-50">
          <button
            onClick={handleEvict}
            disabled={isEvicting}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 rounded transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Remove from cache
          </button>
        </div>
      )}
    </div>
  )
}
```

### CacheAwareProgress

```typescript
// src/components/player/CacheAwareProgress.tsx
'use client'

import { Loader2, Download, Shield, Unlock, HardDrive } from 'lucide-react'

type LoadingStage = 'checking-cache' | 'fetching' | 'authenticating' | 'decrypting' | 'caching' | 'ready' | 'error'

interface CacheAwareProgressProps {
  stage: LoadingStage
  progress: number
  isCached: boolean
}

const STAGE_CONFIG: Record<LoadingStage, {
  icon: React.ComponentType<{ className?: string }>
  message: string
  showProgress: boolean
  isIndeterminate: boolean
}> = {
  'checking-cache': {
    icon: Loader2,
    message: 'Checking cache...',
    showProgress: true,
    isIndeterminate: true,
  },
  'fetching': {
    icon: Download,
    message: 'Downloading encrypted video...',
    showProgress: true,
    isIndeterminate: false,
  },
  'authenticating': {
    icon: Shield,
    message: 'Please approve in your wallet...',
    showProgress: true,
    isIndeterminate: true,
  },
  'decrypting': {
    icon: Unlock,
    message: 'Decrypting video...',
    showProgress: true,
    isIndeterminate: false,
  },
  'caching': {
    icon: HardDrive,
    message: 'Saving for instant replay...',
    showProgress: true,
    isIndeterminate: true,
  },
  'ready': {
    icon: Loader2,
    message: '',
    showProgress: false,
    isIndeterminate: false,
  },
  'error': {
    icon: Loader2,
    message: '',
    showProgress: false,
    isIndeterminate: false,
  },
}

export function CacheAwareProgress({ stage, progress, isCached }: CacheAwareProgressProps) {
  const config = STAGE_CONFIG[stage]
  if (!config || !config.showProgress) return null
  
  const Icon = config.icon
  const isSpinner = config.isIndeterminate
  
  return (
    <div className="flex flex-col items-center gap-4 text-white">
      <div className={`${isSpinner ? 'animate-spin' : ''}`}>
        <Icon className="w-8 h-8 text-purple-400" />
      </div>
      
      <p className="text-sm text-white/80">{config.message}</p>
      
      {/* Progress bar */}
      {config.showProgress && (
        <div className="w-64 h-1.5 bg-white/10 rounded-full overflow-hidden">
          {config.isIndeterminate ? (
            <div className="h-full bg-purple-500 rounded-full animate-pulse w-1/3" />
          ) : (
            <div 
              className="h-full bg-purple-500 rounded-full transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          )}
        </div>
      )}
      
      {/* Progress percentage for determinate stages */}
      {!config.isIndeterminate && progress > 0 && (
        <p className="text-xs text-white/40">{Math.round(progress)}%</p>
      )}
      
      {/* Special message for authenticating stage */}
      {stage === 'authenticating' && (
        <p className="text-xs text-white/40 mt-2">
          Check your wallet for a signature request
        </p>
      )}
    </div>
  )
}
```

## Acceptance Criteria

- [ ] `CacheIndicator` shows green badge when video is cached
- [ ] `CacheIndicator` is hidden when video is not cached
- [ ] `CacheIndicator` dropdown allows evicting from cache
- [ ] Eviction shows loading state and completes without errors
- [ ] `CacheAwareProgress` shows appropriate UI for each loading stage
- [ ] Progress bar is determinate for `fetching` and `decrypting` stages
- [ ] Progress bar is indeterminate for `checking-cache`, `authenticating`, `caching` stages
- [ ] `authenticating` stage shows wallet prompt message
- [ ] Components use existing design system (Tailwind classes, lucide icons)
- [ ] Components are responsive (work on mobile)
- [ ] Smooth transitions between stages

## Dependencies

- Task 1.3 (`useVideoCache` Hook — provides `isCached`, `loadingStage`, `progress`)

## Estimated Effort

Small-Medium (3-4 hours)