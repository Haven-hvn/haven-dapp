# Task 3.1: Lit Protocol Session Caching

## Objective

Cache the Lit Protocol authentication context (SIWE session) so that users don't need to sign a wallet message for every video they watch. A single wallet signature should be reusable for the duration of the session (up to 1 hour by default).

## Background

### Current Problem

Every time a user plays an encrypted video, `createLitAuthContext()` in `lit-auth.ts` creates a **new** SIWE authentication context. This triggers a wallet popup asking the user to sign a message. If a user watches 5 videos in a row, they sign 5 times. If they re-watch a video (cache miss), they sign again.

The Lit auth context has a configurable expiration (default: 1 hour). There's no reason to create a new one if the existing one hasn't expired.

### Current Code (from `lit-auth.ts`)

```typescript
const DEFAULT_AUTH_OPTIONS = {
  expirationMs: 60 * 60 * 1000, // 1 hour
}

export async function createLitAuthContext(options: LitAuthContextOptions): Promise<LitAuthContext> {
  // Always creates a new auth context — no caching
  const authContext = await authManager.createEoaAuthContext(authConfig)
  return authContext
}
```

### Solution

Cache the auth context in memory (and optionally in `sessionStorage`) keyed by wallet address. Reuse it until it expires.

## Requirements

### Session Cache (`src/lib/lit-session-cache.ts`)

1. **`getCachedAuthContext(address)`** — Get cached auth context for a wallet address
   - Return the cached `LitAuthContext` if it exists and hasn't expired
   - Return `null` if no cache or expired

2. **`setCachedAuthContext(address, authContext)`** — Cache an auth context
   - Store in memory (primary)
   - Optionally persist to `sessionStorage` for tab-refresh survival
   - Auto-expire based on the context's expiration time

3. **`clearAuthContext(address?)`** — Clear cached auth context
   - If address provided, clear for that address
   - If no address, clear all cached contexts

4. **`isAuthContextValid(authContext)`** — Check if a cached context is still valid
   - Check expiration time
   - Add a safety margin (e.g., expire 5 minutes early to avoid edge cases)

### Modified `lit-auth.ts`

Update `createLitAuthContext` to check the cache first:

```typescript
export async function createLitAuthContext(options: LitAuthContextOptions): Promise<LitAuthContext> {
  const address = getAddressFromOptions(options)
  
  // Check cache first
  const cached = getCachedAuthContext(address)
  if (cached) {
    return cached // No wallet popup!
  }
  
  // Cache miss — create new (triggers wallet popup)
  const authContext = await authManager.createEoaAuthContext(authConfig)
  
  // Cache for reuse
  setCachedAuthContext(address, authContext)
  
  return authContext
}
```

### Modified `lit-decrypt.ts`

Update `decryptAesKey` to pass through and reuse auth contexts:

```typescript
export async function decryptAesKey(options: DecryptAesKeyOptions): Promise<DecryptKeyResult> {
  // ... existing code ...
  
  // The auth context is now potentially cached
  // No change needed here if createLitAuthContext handles caching
  
  return { aesKey, authContext }
}
```

## Implementation Details

### In-Memory Cache

```typescript
// src/lib/lit-session-cache.ts

import { isAuthContextExpired, type LitAuthContext } from './lit-auth'

interface CachedSession {
  authContext: LitAuthContext
  address: string
  cachedAt: number
  expiresAt: number
}

// In-memory cache (survives navigation, lost on tab close)
const sessionCache = new Map<string, CachedSession>()

// Safety margin: expire 5 minutes early
const EXPIRY_SAFETY_MARGIN = 5 * 60 * 1000

export function getCachedAuthContext(address: string): LitAuthContext | null {
  const normalizedAddress = address.toLowerCase()
  const cached = sessionCache.get(normalizedAddress)
  
  if (!cached) return null
  
  // Check expiration with safety margin
  if (Date.now() >= cached.expiresAt - EXPIRY_SAFETY_MARGIN) {
    sessionCache.delete(normalizedAddress)
    return null
  }
  
  // Double-check using Lit's own expiration check
  if (isAuthContextExpired(cached.authContext)) {
    sessionCache.delete(normalizedAddress)
    return null
  }
  
  return cached.authContext
}

export function setCachedAuthContext(
  address: string,
  authContext: LitAuthContext,
  expirationMs: number = 60 * 60 * 1000
): void {
  const normalizedAddress = address.toLowerCase()
  
  const session: CachedSession = {
    authContext,
    address: normalizedAddress,
    cachedAt: Date.now(),
    expiresAt: Date.now() + expirationMs,
  }
  
  sessionCache.set(normalizedAddress, session)
  
  // Also persist to sessionStorage for tab-refresh survival
  try {
    const serializable = {
      address: normalizedAddress,
      cachedAt: session.cachedAt,
      expiresAt: session.expiresAt,
      // Note: authContext may not be fully serializable
      // Only persist what's needed for session validation
    }
    sessionStorage.setItem(
      `haven-lit-session-${normalizedAddress}`,
      JSON.stringify(serializable)
    )
  } catch {
    // sessionStorage not available or full
  }
}

export function clearAuthContext(address?: string): void {
  if (address) {
    const normalized = address.toLowerCase()
    sessionCache.delete(normalized)
    try {
      sessionStorage.removeItem(`haven-lit-session-${normalized}`)
    } catch {}
  } else {
    sessionCache.clear()
    try {
      // Clear all haven-lit-session-* entries
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const key = sessionStorage.key(i)
        if (key?.startsWith('haven-lit-session-')) {
          sessionStorage.removeItem(key)
        }
      }
    } catch {}
  }
}

export function getSessionInfo(address: string): {
  isCached: boolean
  expiresIn: number // milliseconds
  cachedAt: Date | null
} {
  const cached = sessionCache.get(address.toLowerCase())
  
  if (!cached) {
    return { isCached: false, expiresIn: 0, cachedAt: null }
  }
  
  return {
    isCached: true,
    expiresIn: Math.max(0, cached.expiresAt - Date.now()),
    cachedAt: new Date(cached.cachedAt),
  }
}
```

### Wallet Disconnect Cleanup

When the user disconnects their wallet, clear the session cache:

```typescript
// In the wallet disconnect handler (wherever that lives)
import { clearAuthContext } from '@/lib/lit-session-cache'

function onWalletDisconnect(address: string) {
  clearAuthContext(address)
}
```

### UX Impact

| Scenario | Before | After |
|----------|--------|-------|
| Watch video #1 | Wallet popup → sign | Wallet popup → sign (first time) |
| Watch video #2 | Wallet popup → sign | **No popup** (cached session) |
| Watch video #3 | Wallet popup → sign | **No popup** (cached session) |
| Re-watch video #1 (no video cache) | Wallet popup → sign | **No popup** (cached session) |
| After 1 hour | Wallet popup → sign | Wallet popup → sign (session expired) |

## Acceptance Criteria

- [ ] `getCachedAuthContext()` returns cached context when valid
- [ ] `getCachedAuthContext()` returns `null` when expired
- [ ] `setCachedAuthContext()` stores context in memory
- [ ] `createLitAuthContext()` checks cache before creating new context
- [ ] Second video playback within session does NOT trigger wallet popup
- [ ] Session expires correctly after configured duration
- [ ] Safety margin prevents using nearly-expired sessions
- [ ] `clearAuthContext()` removes cached sessions
- [ ] Wallet disconnect clears the session cache
- [ ] No regression in first-time authentication flow

## Dependencies

- None (can be developed independently of Sprint 1/2)

## Estimated Effort

Medium (4-5 hours)