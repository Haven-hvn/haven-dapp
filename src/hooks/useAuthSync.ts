'use client'

import { useEffect } from 'react'
import { useAppKitAccount } from '@reown/appkit/react'
import { useAuthStore } from '@/stores/authStore'

export function useAuthSync() {
  const { address, isConnected, chainId } = useAppKitAccount()
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
