# Task 3.4: Wallet Disconnect & Security Cleanup

## Objective

Implement comprehensive cleanup of all cached sensitive data when a user disconnects their wallet, switches accounts, or when security-relevant events occur. This ensures that cached sessions, keys, and optionally video content are properly cleaned up.

## Background

When a user disconnects their wallet or switches to a different account, all cached authentication state must be invalidated:

- **Lit session cache**: The SIWE auth context is tied to a specific wallet address
- **AES key cache**: Keys were decrypted using that wallet's access permissions
- **Video cache**: Optionally, cached videos may need to be cleared if they were decrypted under a different wallet's permissions

Failing to clean up creates security issues:
- A shared device could expose one user's cached session to another
- Switching wallets could use stale auth contexts with wrong permissions
- Cached AES keys from a revoked wallet could theoretically be reused

## Requirements

### Cleanup Coordinator (`src/lib/security-cleanup.ts`)

1. **`onWalletDisconnect(address)`** — Full cleanup on wallet disconnect
   - Clear Lit session cache for the address
   - Clear all AES keys (they're tied to wallet permissions)
   - Optionally clear video cache (configurable)
   - Log the cleanup action

2. **`onAccountChange(oldAddress, newAddress)`** — Cleanup on account switch
   - Clear Lit session for old address
   - Clear AES keys (permissions may differ)
   - Keep video cache (videos are content, not auth-sensitive)

3. **`onChainChange(oldChainId, newChainId)`** — Cleanup on chain switch
   - Clear Lit session (SIWE is chain-specific)
   - Keep AES keys (they're chain-agnostic)
   - Keep video cache

4. **`onSessionExpired()`** — Cleanup on Lit session expiration
   - Clear Lit session cache
   - Keep AES keys (they may still be valid)
   - Keep video cache

5. **`onSecurityClear()`** — Nuclear option: clear everything
   - Clear all Lit sessions
   - Clear all AES keys
   - Clear all cached videos
   - Clear OPFS staging files
   - Called from settings UI "Clear All Data"

### Integration Points

#### wagmi Account Change Detection

```typescript
// Using wagmi's useAccount hook to detect changes
import { useAccount } from 'wagmi'
import { useEffect, useRef } from 'react'
import { onWalletDisconnect, onAccountChange, onChainChange } from '@/lib/security-cleanup'

export function useSecurityCleanup() {
  const { address, isConnected, chainId } = useAccount()
  const prevAddressRef = useRef<string | undefined>(address)
  const prevChainRef = useRef<number | undefined>(chainId)
  
  useEffect(() => {
    const prevAddress = prevAddressRef.current
    
    // Detect disconnect
    if (prevAddress && !isConnected) {
      onWalletDisconnect(prevAddress)
    }
    
    // Detect account change
    if (prevAddress && address && prevAddress !== address) {
      onAccountChange(prevAddress, address)
    }
    
    prevAddressRef.current = address
  }, [address, isConnected])
  
  useEffect(() => {
    const prevChain = prevChainRef.current
    
    // Detect chain change
    if (prevChain && chainId && prevChain !== chainId) {
      onChainChange(prevChain, chainId)
    }
    
    prevChainRef.current = chainId
  }, [chainId])
}
```

## Implementation Details

### Cleanup Coordinator

```typescript
// src/lib/security-cleanup.ts

import { clearAuthContext } from './lit-session-cache'
import { clearAllKeys } from './aes-key-cache'
import { clearAllVideos } from './video-cache'
import { clearAllStaging } from './opfs'

interface CleanupOptions {
  /** Whether to clear cached videos on wallet disconnect. Default: false */
  clearVideosOnDisconnect: boolean
  
  /** Whether to clear cached videos on account change. Default: false */
  clearVideosOnAccountChange: boolean
}

const DEFAULT_OPTIONS: CleanupOptions = {
  clearVideosOnDisconnect: false,
  clearVideosOnAccountChange: false,
}

let options = { ...DEFAULT_OPTIONS }

export function configureCleanup(newOptions: Partial<CleanupOptions>): void {
  options = { ...options, ...newOptions }
}

export function onWalletDisconnect(address: string): void {
  console.info(`[SecurityCleanup] Wallet disconnected: ${address.slice(0, 8)}...`)
  
  // Always clear auth-related caches
  clearAuthContext(address)
  clearAllKeys()
  
  // Optionally clear video cache
  if (options.clearVideosOnDisconnect) {
    clearAllVideos().catch(err => 
      console.warn('[SecurityCleanup] Failed to clear video cache:', err)
    )
  }
  
  // Always clean up staging files
  clearAllStaging().catch(err =>
    console.warn('[SecurityCleanup] Failed to clear staging:', err)
  )
}

export function onAccountChange(oldAddress: string, newAddress: string): void {
  console.info(
    `[SecurityCleanup] Account changed: ${oldAddress.slice(0, 8)}... → ${newAddress.slice(0, 8)}...`
  )
  
  // Clear old account's auth
  clearAuthContext(oldAddress)
  clearAllKeys()
  
  // Optionally clear video cache
  if (options.clearVideosOnAccountChange) {
    clearAllVideos().catch(err =>
      console.warn('[SecurityCleanup] Failed to clear video cache:', err)
    )
  }
}

export function onChainChange(oldChainId: number, newChainId: number): void {
  console.info(
    `[SecurityCleanup] Chain changed: ${oldChainId} → ${newChainId}`
  )
  
  // SIWE is chain-specific, clear session
  clearAuthContext()
  
  // AES keys are chain-agnostic, keep them
  // Video cache is chain-agnostic, keep it
}

export function onSessionExpired(): void {
  console.info('[SecurityCleanup] Lit session expired')
  clearAuthContext()
}

export async function onSecurityClear(): Promise<{
  sessionsCleared: boolean
  keysCleared: boolean
  videosCleared: boolean
  stagingCleared: boolean
}> {
  console.info('[SecurityCleanup] Full security clear requested')
  
  const results = {
    sessionsCleared: false,
    keysCleared: false,
    videosCleared: false,
    stagingCleared: false,
  }
  
  try {
    clearAuthContext()
    results.sessionsCleared = true
  } catch (err) {
    console.error('[SecurityCleanup] Failed to clear sessions:', err)
  }
  
  try {
    clearAllKeys()
    results.keysCleared = true
  } catch (err) {
    console.error('[SecurityCleanup] Failed to clear keys:', err)
  }
  
  try {
    await clearAllVideos()
    results.videosCleared = true
  } catch (err) {
    console.error('[SecurityCleanup] Failed to clear videos:', err)
  }
  
  try {
    await clearAllStaging()
    results.stagingCleared = true
  } catch (err) {
    console.error('[SecurityCleanup] Failed to clear staging:', err)
  }
  
  return results
}
```

### Security Cleanup Provider

```typescript
// src/components/providers/SecurityCleanupProvider.tsx
'use client'

import { useSecurityCleanup } from '@/hooks/useSecurityCleanup'

export function SecurityCleanupProvider({ children }: { children: React.ReactNode }) {
  useSecurityCleanup()
  return <>{children}</>
}
```

### Cleanup Matrix

| Event | Lit Session | AES Keys | Video Cache | OPFS Staging |
|-------|------------|----------|-------------|--------------|
| Wallet disconnect | ✅ Clear | ✅ Clear | ⚙️ Configurable | ✅ Clear |
| Account change | ✅ Clear old | ✅ Clear | ⚙️ Configurable | ✅ Clear |
| Chain change | ✅ Clear | ❌ Keep | ❌ Keep | ❌ Keep |
| Session expired | ✅ Clear | ❌ Keep | ❌ Keep | ❌ Keep |
| Security clear (UI) | ✅ Clear | ✅ Clear | ✅ Clear | ✅ Clear |
| Page unload | ❌ Keep* | ✅ Clear | ❌ Keep | ❌ Keep |

*Lit session persists in memory for the tab's lifetime but is lost on tab close.

## Acceptance Criteria

- [ ] `onWalletDisconnect()` clears Lit session and AES keys
- [ ] `onAccountChange()` clears old account's auth state
- [ ] `onChainChange()` clears Lit session (chain-specific SIWE)
- [ ] `onSessionExpired()` clears Lit session only
- [ ] `onSecurityClear()` clears everything (nuclear option)
- [ ] `useSecurityCleanup` hook detects wallet/account/chain changes via wagmi
- [ ] `SecurityCleanupProvider` is integrated into the app root
- [ ] Video cache clearing is configurable (default: keep on disconnect)
- [ ] OPFS staging files are cleaned up on disconnect
- [ ] All cleanup operations are logged for debugging
- [ ] No errors thrown if caches are already empty

## Dependencies

- Task 3.1 (Lit Session Cache)
- Task 3.2 (AES Key Cache)
- Task 1.2 (Cache API Wrapper — `clearAllVideos`)
- Task 2.1 (OPFS — `clearAllStaging`)

## Estimated Effort

Medium (4-5 hours)