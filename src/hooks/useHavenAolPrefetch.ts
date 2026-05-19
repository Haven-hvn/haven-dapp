'use client'

import { useEffect } from 'react'

/**
 * Previously prefetched the Haven-AOL verification key when wallet connected.
 *
 * Now a no-op — the verification key is bundled in the requestDecryptionKey
 * response, eliminating the need for a separate prefetch call.
 *
 * @param walletConnected - Whether the wallet is currently connected (unused)
 */
export function useHavenAolPrefetch(_walletConnected: boolean): void {
  useEffect(() => {
    // No-op: verification key is now bundled in requestDecryptionKey response.
    // No separate prefetch needed.
  }, [_walletConnected])
}
