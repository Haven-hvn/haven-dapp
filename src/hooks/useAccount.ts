'use client'

import { useAccount as useWagmiAccount } from 'wagmi'

export function useAccount() {
  const { address, isConnected, isConnecting, isDisconnected, chainId, status } = useWagmiAccount()
  
  return {
    address,
    isConnected,
    isConnecting,
    isDisconnected,
    chainId,
    status,
    // Helper to check if on correct network
    isCorrectNetwork: chainId === Number(process.env.NEXT_PUBLIC_CHAIN_ID || 1)
  }
}
