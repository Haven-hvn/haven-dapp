'use client'

import { useEffect } from 'react'
import { useAccount } from 'wagmi'
import { useAuthStore } from '@/stores/authStore'
import { onWalletDisconnect } from '@/lib/security-cleanup'

/**
 * Hook to synchronize wagmi wallet state with the auth store.
 * 
 * This hook coordinates between wagmi's useAccount and our internal auth state,
 * ensuring they stay in sync. Security cleanup is handled separately by
 * SecurityCleanupProvider which uses useSecurityCleanup.
 * 
 * @see SecurityCleanupProvider - Handles security cleanup on wallet events
 */
export function useAuthSync() {
  const { address, isConnected, chainId } = useAccount()
  const { 
    setAuthenticated, 
    setDisconnected,
    updateChainId,
    isAuthenticated 
  } = useAuthStore()
  
  // Sync wagmi connection state to our store
  useEffect(() => {
    if (isConnected && address && chainId) {
      if (!isAuthenticated || address !== useAuthStore.getState().address) {
        setAuthenticated(address, chainId)
      } else if (chainId !== useAuthStore.getState().chainId) {
        updateChainId(chainId)
      }
    } else if (!isConnected && isAuthenticated) {
      // Clear the previous address before disconnecting
      const previousAddress = useAuthStore.getState().address
      if (previousAddress) {
        // Security cleanup is handled by SecurityCleanupProvider via useSecurityCleanup
        // but we trigger it here to ensure proper sequencing with auth state
        onWalletDisconnect(previousAddress)
      }
      setDisconnected()
    }
  }, [isConnected, address, chainId, isAuthenticated, setAuthenticated, setDisconnected, updateChainId])
  
  // Handle chain changes
  useEffect(() => {
    if (isConnected && chainId && chainId !== useAuthStore.getState().chainId) {
      updateChainId(chainId)
    }
  }, [isConnected, chainId, updateChainId])
  
  return { isSynced: true }
}
