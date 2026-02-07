'use client'

import { createAppKit } from '@reown/appkit/react'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import { mainnet, sepolia } from '@reown/appkit/networks'
import { ReactNode, useState, useEffect } from 'react'

// Metadata for AppKit
const metadata = {
  name: 'Haven Player',
  description: 'Decentralized video library and playback platform',
  url: 'https://haven.video',
  icons: ['https://haven.video/icon.png']
}

// Create wagmi adapter
function createWagmiAdapter(projectId: string) {
  if (!projectId) {
    console.warn('NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is not defined. WalletConnect will not work.')
  }

  return new WagmiAdapter({
    networks: [mainnet, sepolia],
    projectId: projectId || 'placeholder',
  })
}

// Initialize AppKit on client side only
function initAppKit(projectId: string, wagmiAdapter: WagmiAdapter) {
  if (typeof window === 'undefined') return null
  
  if (!projectId) {
    return null
  }
  
  try {
    createAppKit({
      adapters: [wagmiAdapter],
      networks: [mainnet, sepolia],
      metadata,
      projectId,
      themeMode: 'dark',
      themeVariables: {
        '--apkt-accent': '#3b82f6',
      },
      features: {
        analytics: false,
      }
    })
    return true
  } catch (e) {
    console.error('Failed to create AppKit:', e)
    return null
  }
}

interface Web3ModalProviderProps {
  children: ReactNode
}

export function Web3ModalProvider({ children }: Web3ModalProviderProps) {
  // Get project ID from env
  const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || ''
  
  // Create query client
  const [queryClient] = useState(() => new QueryClient())
  
  // Create wagmi adapter
  const [wagmiAdapter] = useState(() => createWagmiAdapter(projectId))
  
  // Initialize AppKit on client side
  const [isInitialized, setIsInitialized] = useState(false)
  
  useEffect(() => {
    if (!isInitialized) {
      initAppKit(projectId, wagmiAdapter)
      setIsInitialized(true)
    }
  }, [projectId, wagmiAdapter, isInitialized])
  
  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  )
}
