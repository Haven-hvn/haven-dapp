# Haven Video Cache Architecture

Comprehensive architecture documentation for the Haven DApp video caching system.

## Table of Contents

- [Overview](#overview)
- [System Components](#system-components)
- [Technology Choices](#technology-choices)
- [Security Model](#security-model)
- [Data Flow Diagrams](#data-flow-diagrams)
- [Component Interactions](#component-interactions)

## Overview

The Haven video cache system provides fast, encrypted video playback with intelligent caching. It implements a **cache-first strategy** where decrypted video content is stored locally after the first play, enabling instant playback on subsequent views without requiring wallet signatures or network requests.

### Key Features

- **Cache-first loading**: Check cache before any network/crypto operations
- **Sub-100ms playback**: Cached videos play instantly via Service Worker
- **Automatic decryption pipeline**: Fetch → Decrypt → Cache on first play
- **Memory-efficient staging**: OPFS reduces peak memory usage by 30-40%
- **Session caching**: Lit Protocol sessions cached to avoid repeated wallet popups
- **AES key caching**: Decrypted keys cached in memory to skip BLS-IBE operations
- **Periodic cleanup**: Automatic TTL-based expiration and storage pressure management

## System Components

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              HAVEN DAPP                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐          │
│  │   UI Components │    │   React Hooks   │    │   Cache Store   │          │
│  │                 │    │                 │    │                 │          │
│  │ • VideoPlayer   │◄───│ • useVideoCache │◄───│ • cacheStore    │          │
│  │ • VideoCard     │    │ • useCacheStatus│    │ • Cache stats   │          │
│  │ • Settings      │    │ • usePrefetch   │    │ • Sync state    │          │
│  └─────────────────┘    └────────┬────────┘    └─────────────────┘          │
│                                   │                                          │
│  ┌────────────────────────────────┼──────────────────────────────────────┐  │
│  │                        Core Library Layer                             │  │
│  │                                                                       │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐  │  │
│  │  │ video-cache │  │   lit-      │  │  aes-key-   │  │   security   │  │  │
│  │  │  (Cache API)│  │ session-    │  │   cache     │  │   cleanup    │  │  │
│  │  │             │  │   cache     │  │             │  │              │  │  │
│  │  │ • putVideo  │  │             │  │             │  │              │  │  │
│  │  │ • getVideo  │  │ • getCached │  │ • getCached │  │ • onWallet   │  │  │
│  │  │ • hasVideo  │  │   AuthCtx   │  │   Key       │  │   Disconnect │  │  │
│  │  │ • deleteVid │  │ • setCached │  │ • setCached │  │ • onSecurity │  │  │
│  │  │ • listCached│  │   AuthCtx   │  │   Key       │  │   Clear      │  │  │
│  │  └──────┬──────┘  └─────────────┘  └─────────────┘  └──────────────┘  │  │
│  │         │                                                             │  │
│  │  ┌──────┴──────┐  ┌─────────────────────────────────────────────────┐  │  │
│  │  │    opfs     │  │         cache-expiration.ts                     │  │  │
│  │  │  (Staging)  │  │                                                 │  │  │
│  │  │             │  │  • startPeriodicCleanup()                       │  │  │
│  │  │ • writeTo   │  │  • runCleanupSweep()                            │  │  │
│  │  │   Staging   │  │  • runStoragePressureCleanup()                  │  │  │
│  │  │ • readFrom  │  │  • TTL management                               │  │  │
│  │  │   Staging   │  │                                                 │  │  │
│  │  └─────────────┘  └─────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                   │                                          │
│                                   ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         Browser APIs                                 │   │
│  │                                                                      │   │
│  │   ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │   │
│  │   │  Cache API   │  │    OPFS      │  │  Storage Persistence API │  │   │
│  │   │              │  │              │  │                          │  │   │
│  │   │ • Persistent │  │ • Private    │  │ • requestPersistent()    │  │   │
│  │   │   disk cache │  │   filesystem │  │ • persisted()            │  │   │
│  │   │ • Request/   │  │ • Stream I/O │  │ • estimate()             │  │   │
│  │   │   Response   │  │              │  │                          │  │   │
│  │   └──────┬───────┘  └──────────────┘  └──────────────────────────┘  │   │
│  │          │                                                          │   │
│  └──────────┼──────────────────────────────────────────────────────────┘   │
│             │                                                               │
└─────────────┼───────────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SERVICE WORKER                                       │
│                    (public/haven-sw.js)                                      │
│                                                                              │
│   Intercepts: https://app.haven.io/haven/v/{videoId}                        │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                         Fetch Handler                              │   │
│   │                                                                     │   │
│   │   1. Check if URL matches /haven/v/*                               │   │
│   │   2. Look up in Cache API                                          │   │
│   │   3. If found: return cached Response                              │   │
│   │   4. Handle Range requests for seeking                             │   │
│   │   5. Return 404 if not in cache                                    │   │
│   │                                                                     │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Component Descriptions

#### 1. React Hooks Layer

| Hook | Purpose |
|------|---------|
| `useVideoCache(video)` | Primary hook for video playback. Implements cache-first loading strategy. |
| `useCacheStatus(videoIds?)` | Check cache status for videos. Returns global stats when called without args. |
| `usePrefetch()` | Prefetch videos for faster subsequent playback. |
| `useSecurityCleanup()` | Detect wallet changes and trigger security cleanup. |

#### 2. Core Library Layer

| Module | Purpose |
|--------|---------|
| `video-cache.ts` | Cache API wrapper with put/get/delete/has operations |
| `lit-session-cache.ts` | Caches Lit Protocol SIWE sessions to avoid repeated wallet signatures |
| `aes-key-cache.ts` | In-memory cache for decrypted AES keys |
| `opfs.ts` | Origin Private File System utilities for staging large encrypted files |
| `cache-expiration.ts` | TTL management and periodic cleanup |
| `security-cleanup.ts` | Coordinates cleanup on wallet disconnect/account change |

#### 3. Browser APIs

| API | Usage |
|-----|-------|
| **Cache API** | Persistent storage for decrypted video content |
| **OPFS** | Stream encrypted data to disk to reduce memory pressure |
| **Storage API** | Request persistent storage, estimate quota usage |
| **Service Worker** | Intercept synthetic URLs and serve from cache |

#### 4. Service Worker (`public/haven-sw.js`)

The Service Worker is the critical bridge between the video element and the cache:

- **Intercepts**: Requests to `/haven/v/{videoId}` URLs
- **Serves**: Returns cached Response objects from Cache API
- **Handles**: HTTP Range requests for video seeking support
- **Transparent**: Video element works normally with `src="/haven/v/{id}"`

## Technology Choices

### Service Worker + Cache API

**Why**: The Cache API provides a persistent, disk-based key-value store with Request/Response semantics. It's ideal for video content because:

- **Native integration**: Works seamlessly with the `<video>` element
- **Range request support**: HTTP 206 Partial Content for seeking
- **Large storage**: Can store multiple GB of video data
- **Browser-managed**: Efficient eviction when storage pressure occurs

**Trade-offs**:
- Requires HTTPS (secure context)
- Not available in all browsers (Safari has partial support)
- Storage may be cleared by browser under pressure (unless persisted)

### Origin Private File System (OPFS)

**Why**: Reduces peak memory usage during the fetch → decrypt pipeline:

- **Traditional flow**: Three copies in JS heap (encrypted + decrypted + blob) = ~1.5GB for 500MB video
- **OPFS flow**: Stream to disk, read for decryption, only decrypted data in memory = ~500MB peak

**When used**: For encrypted videos larger than the in-memory threshold (default: 200MB on mobile, 500MB on desktop)

**Browser support**: Chrome 86+, Edge 86+, Firefox 111+, Safari 15.2+ (limited)

### Lit Protocol Session Caching

**Why**: Lit Protocol requires a wallet signature to create a SIWE session. Without caching:

- User would need to sign for every video (terrible UX)
- Each signature adds 1-3 seconds to playback

**Implementation**:
- Sessions cached in memory (primary) + sessionStorage (backup)
- 1-hour default TTL with 5-minute safety margin
- Cleared on wallet disconnect for security

### AES Key Caching

**Why**: Decrypting the AES key via Lit nodes requires expensive BLS-IBE operations:

- Cold key decryption: 500ms - 2s
- Cached key retrieval: <1ms

**Security considerations**:
- Keys stored in-memory only (never persisted)
- Zero-filled on removal
- Cleared on wallet disconnect and page unload

## Security Model

### What's Cached Where

| Data Type | Storage | Persistence | Cleared When |
|-----------|---------|-------------|--------------|
| **Decrypted video content** | Cache API (disk) | Until TTL expiry or manual clear | Manual clear, TTL expiry, or browser eviction |
| **Lit auth context** | Memory + sessionStorage | Tab lifetime | Wallet disconnect, session expiry, tab close |
| **Decrypted AES keys** | Memory only | Session only | Wallet disconnect, page unload, TTL expiry |
| **Video metadata** | IndexedDB | Persistent | Manual clear |
| **Staging files** | OPFS | Session only | After successful decryption, or on cleanup |

### Security Boundaries

```
┌─────────────────────────────────────────────────────────────────┐
│                        TRUST BOUNDARIES                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  USER WALLET (Most Trusted)              │   │
│  │  • Private keys never leave wallet                       │   │
│  │  • SIWE signatures for Lit session creation              │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │           IN-MEMORY CACHE (Session Only)                 │   │
│  │  • AES keys (decrypted)                                  │   │
│  │  • Lit auth contexts                                     │   │
│  │  • Zero-filled on cleanup                                │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │         PERSISTENT STORAGE (Disk - Less Sensitive)       │   │
│  │  • Decrypted video content (already encrypted at rest)   │   │
│  │  • Video metadata                                        │   │
│  │  • Staging files (encrypted, temporary)                  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Cleanup Triggers

| Event | Action | Videos Cleared | Auth Cleared | Keys Cleared |
|-------|--------|----------------|--------------|--------------|
| Wallet disconnect | `onWalletDisconnect()` | Configurable (default: no) | Yes | Yes |
| Account change | `onAccountChange()` | Configurable (default: no) | Yes | Yes |
| Chain change | `onChainChange()` | No | Yes | No |
| Manual "Clear All Data" | `onSecurityClear()` | Yes | Yes | Yes |
| Session expiry | Auto | No | Yes | No |
| Page unload | Auto | No | No | Yes |

### Encryption at Rest

- **Video content**: Decrypted for local playback, but origin is already an encrypted platform (stored encrypted on IPFS/Filecoin)
- **Staging files**: Encrypted data only (never decrypted in OPFS)
- **Keys**: AES keys never written to disk, only held in memory
- **Auth**: Session tokens stored in memory primarily, minimal metadata in sessionStorage

## Data Flow Diagrams

### Cache Hit Flow

```
User clicks Play
    │
    ▼
┌─────────────────────┐
│ useVideoCache hook  │
│ checks Cache API    │
└──────────┬──────────┘
           │
           ▼
    ┌──────────────┐
    │  Cache HIT!  │
    └──────┬───────┘
           │
           ▼
┌──────────────────────────┐
│ Return /haven/v/{id} URL │
└──────────┬───────────────┘
           │
           ▼
┌─────────────────────────┐
│ <video src="/haven/v/..."> │
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│ Service Worker intercepts│
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│ SW reads from Cache API │
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│ 200 OK with video data  │
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│     Video plays         │
│    (< 100ms total)      │
└─────────────────────────┘
```

**Total time**: <100ms (instant playback)

**No network requests, no wallet popup, no decryption!**

### Cache Miss Flow

```
User clicks Play
    │
    ▼
┌─────────────────────┐
│ useVideoCache hook  │
│ checks Cache API    │
└──────────┬──────────┘
           │
           ▼
    ┌──────────────┐
    │ Cache MISS   │
    └──────┬───────┘
           │
           ▼
┌─────────────────────────┐
│ Fetch encrypted data    │
│ via Synapse SDK / IPFS  │
└──────────┬──────────────┘
           │ (5-30 seconds)
           ▼
┌─────────────────────────┐
│ (Optional) Stage in OPFS│
│ if file is large        │
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│ Authenticate with       │
│ Lit Protocol            │
└──────────┬──────────────┘
           │
     ┌─────┴─────┐
     │           │
     ▼           ▼
┌────────┐  ┌──────────────┐
│ Cached │  │ Wallet popup │
│ session│  │ (SIWE sign)  │
│ (warm) │  │  (cold)      │
└───┬────┘  └──────┬───────┘
    │              │
    └──────┬───────┘
           │
           ▼
┌─────────────────────────┐
│ Decrypt AES key via     │
│ Lit nodes (or cache)    │
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│ Decrypt video with      │
│ AES-GCM                 │
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│ Write decrypted video   │
│ to Cache API            │
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│ Return /haven/v/{id}    │
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│ <video src="/haven/v/..."> │
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│ Service Worker serves   │
│ from cache              │
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│     Video plays         │
│  (5-30s first time)     │
└─────────────────────────┘
```

**Total time**: 5-30+ seconds (first play only)

**Subsequent plays**: <100ms (cache hit)

## Component Interactions

### Video Playback Sequence

```
VideoPlayer Component
         │
         │ useVideoCache(video)
         ▼
┌─────────────────┐
│ useVideoCache   │
│    Hook         │
└────────┬────────┘
         │
         ├─────────────────┐
         │                 │
         ▼                 ▼
┌─────────────┐      ┌─────────────┐
│  hasVideo   │      │ useVideoDecryption│
│ (Cache API) │      │    Hook     │
└──────┬──────┘      └──────┬──────┘
       │                    │
       │ Cache Miss         │ decrypt(video, encryptedData)
       │                    │
       │                    ▼
       │           ┌─────────────────┐
       │           │ getCachedAuthCtx│
       │           │ (Lit session)   │
       │           └────────┬────────┘
       │                    │
       │                    ├──────────────┐
       │                    │              │
       │                    ▼              ▼
       │            ┌──────────┐    ┌─────────────┐
       │            │  Cached  │    │ Lit Client  │
       │            │  Session │    │  Auth Flow  │
       │            └────┬─────┘    └──────┬──────┘
       │                 │                 │
       │                 └────────┬────────┘
       │                          │
       │                          ▼
       │                 ┌─────────────────┐
       │                 │ getCachedKey    │
       │                 │ (AES key cache) │
       │                 └────────┬────────┘
       │                          │
       │                          ├──────────────┐
       │                          │              │
       │                          ▼              ▼
       │                   ┌──────────┐    ┌─────────────┐
       │                   │  Cached  │    │  Lit Nodes  │
       │                   │   Key    │    │  BLS-IBE    │
       │                   └────┬─────┘    └──────┬──────┘
       │                        │                 │
       │                        └────────┬────────┘
       │                                 │
       │                                 ▼
       │                        ┌─────────────────┐
       │                        │ AES-GCM Decrypt │
       │                        └────────┬────────┘
       │                                 │
       │                                 │ decrypted Blob
       │                                 │
       │                                 ▼
       │                        ┌─────────────────┐
       │                        │   putVideo      │
       │                        │  (Cache API)    │
       │                        └────────┬────────┘
       │                                 │
       │◄────────────────────────────────┘
       │
       ▼
┌─────────────────┐
│ Return videoUrl │
│ /haven/v/{id}   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ <video> element │
│ plays content   │
└─────────────────┘
```

### Cleanup Flow

```
Wallet Disconnect
       │
       ▼
┌─────────────────┐
│ onWalletDisconnect│
│   (address)     │
└────────┬────────┘
         │
         ├────────────────┬────────────────┐
         │                │                │
         ▼                ▼                ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│clearAuthCtx  │  │ clearAllKeys │  │clearAllVideos│
│(Lit session) │  │ (AES keys)   │  │ (optional)   │
└──────────────┘  └──────────────┘  └──────────────┘
         │                │                │
         │                │                │
         ▼                ▼                ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Memory: cleared│  │ Memory: zero │  │ Cache API:   │
│ sessionStorage:│  │ filled &     │  │ cleared      │
│ removed        │  │ removed      │  │ (optional)   │
└──────────────┘  └──────────────┘  └──────────────┘
```

### Periodic Cleanup Flow

```
┌─────────────────┐
│ startPeriodic   │
│ Cleanup()       │
└────────┬────────┘
         │
         │ Every cleanupInterval (default: 1 hour)
         ▼
┌─────────────────┐
│   runFullCleanup│
└────────┬────────┘
         │
         ├────────────────┬────────────────┬────────────────┐
         │                │                │                │
         ▼                ▼                ▼                ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│runCleanup    │  │runStorage    │  │runCritical   │  │enforceMax    │
│Sweep         │  │Pressure      │  │Storage       │  │Videos        │
│              │  │Cleanup       │  │Cleanup       │  │              │
│TTL-based     │  │LRU-based     │  │Size-based    │  │Count-based   │
└──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘
```

## File Locations

| Component | Location |
|-----------|----------|
| Service Worker | `public/haven-sw.js` |
| Video Cache API | `src/lib/video-cache.ts` |
| Lit Session Cache | `src/lib/lit-session-cache.ts` |
| AES Key Cache | `src/lib/aes-key-cache.ts` |
| OPFS Utilities | `src/lib/opfs.ts` |
| Cache Expiration | `src/lib/cache-expiration.ts` |
| Security Cleanup | `src/lib/security-cleanup.ts` |
| Storage Persistence | `src/lib/storage-persistence.ts` |
| Browser Capabilities | `src/lib/browser-capabilities.ts` |
| useVideoCache Hook | `src/hooks/useVideoCache.ts` |
| useCacheStatus Hook | `src/hooks/useCacheStatus.ts` |
| useSecurityCleanup Hook | `src/hooks/useSecurityCleanup.ts` |
| CapabilitiesProvider | `src/components/providers/CapabilitiesProvider.tsx` |
