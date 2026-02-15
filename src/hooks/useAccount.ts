'use client'

import { useAppKitAccount } from '@reown/appkit/react'

export function useAccount() {
  const { address, isConnected, isConnecting, chainId, status } = useAppKitAccount()
  
  return {
    address,
    isConnected,
    isConnecting,
    isDisconnected: !isConnected && status === 'disconnected',
    chainId,
    status,
    // Helper to check if on correct network
    isCorrectNetwork: chainId === Number(process.env.NEXT_PUBLIC_CHAIN_ID || 1)
  }
}
