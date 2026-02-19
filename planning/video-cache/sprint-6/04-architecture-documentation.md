# Task 6.4: Architecture Documentation

## Objective

Create comprehensive documentation for the video caching system covering architecture, data flow, API reference, troubleshooting, and developer onboarding.

## Documentation Deliverables

### 1. Architecture Overview (`docs/video-cache/architecture.md`)

- System diagram showing all components and their relationships
- Data flow diagrams for cache hit and cache miss scenarios
- Technology choices and rationale (Service Worker, Cache API, OPFS)
- Security model (what's cached, what's in memory, what's cleared when)

### 2. API Reference (`docs/video-cache/api-reference.md`)

Document every public function and hook:

- `useVideoCache(video)` — Primary hook for video playback
- `useCacheStatus(videoIds)` — Batch cache status checking
- `useCapabilities()` — Browser capability detection
- `putVideo()`, `getVideo()`, `hasVideo()`, `deleteVideo()` — Cache API wrapper
- `writeToStaging()`, `readFromStaging()` — OPFS utilities
- `getCachedAuthContext()`, `setCachedAuthContext()` — Lit session cache
- `getCachedKey()`, `setCachedKey()` — AES key cache
- `onWalletDisconnect()`, `onSecurityClear()` — Security cleanup
- `startPeriodicCleanup()` — Expiration service
- `requestPersistentStorage()` — Storage persistence

### 3. Developer Guide (`docs/video-cache/developer-guide.md`)

- How to add a new video source type
- How to modify cache TTL defaults
- How to debug cache issues (DevTools walkthrough)
- How to test cache behavior locally
- How to disable caching for development

### 4. Troubleshooting Guide (`docs/video-cache/troubleshooting.md`)

Common issues and solutions:

| Issue | Cause | Solution |
|-------|-------|---------|
| Video doesn't play from cache | SW not registered | Check HTTPS, check DevTools → Application |
| Cache not persisting | Browser eviction | Request persistent storage in settings |
| Wallet popup on every video | Session cache miss | Check Lit session expiration |
| High memory usage | OPFS not available | Check browser support, use Chrome |
| Video plays but no audio | Incorrect MIME type | Check `originalMimeType` in metadata |

### 5. Data Flow Diagrams

#### Cache Hit Flow
```
User clicks Play
    → useVideoCache checks Cache API
    → Cache hit! Return /haven/v/{id}
    → <video src="/haven/v/{id}">
    → Service Worker intercepts
    → SW reads from Cache API
    → 200 OK with video data
    → Video plays instantly
    
Total time: <100ms
```

#### Cache Miss Flow
```
User clicks Play
    → useVideoCache checks Cache API
    → Cache miss
    → Fetch encrypted data via Synapse SDK
    → (Optional) Stage in OPFS
    → Authenticate with Lit Protocol (cached session or wallet popup)
    → Decrypt AES key via Lit nodes (cached key or network)
    → Decrypt video with AES-GCM
    → Write decrypted video to Cache API
    → Return /haven/v/{id}
    → <video src="/haven/v/{id}">
    → Service Worker serves from cache
    → Video plays
    
Total time: 5-30+ seconds (first play only)
```

## Acceptance Criteria

- [ ] Architecture overview with system diagram
- [ ] API reference for all public functions and hooks
- [ ] Developer guide with practical examples
- [ ] Troubleshooting guide with common issues
- [ ] Data flow diagrams for cache hit and miss
- [ ] Documentation is in Markdown format
- [ ] Documentation is linked from the main README
- [ ] Code examples are accurate and tested

## Dependencies

- All Sprint 1-5 tasks (documents the final system)

## Estimated Effort

Medium (4-6 hours)