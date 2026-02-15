'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactNode, useEffect, useState } from 'react'
import { WagmiProvider, createConfig, http } from 'wagmi'
import { mainnet, sepolia } from '@reown/appkit/networks'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { createAppKit } from '@reown/appkit/react'

const metadata = {
  name: 'Haven Player',
  description: 'Decentralized video library and playback platform',
  url: 'https://haven.video',
  icons: ['https://haven.video/icon.png']
}

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || ''

const queryClient = new QueryClient()

interface Web3ModalProviderProps {
  children: ReactNode
}

export function Web3ModalProvider({ children }: Web3ModalProviderProps) {
  const [mounted, setMounted] = useState(false)
  const [wagmiConfig, setWagmiConfig] = useState<any>(null)

  useEffect(() => {
    setMounted(true)
    
    if (typeof window !== 'undefined' && projectId) {
      try {
        const appNetworks = [mainnet, sepolia]
        
        const wagmiAdapter = new WagmiAdapter({
          networks: appNetworks,
          projectId,
          ssr: true
        })
        
        setWagmiConfig(wagmiAdapter.wagmiConfig)
        
        createAppKit({
          adapters: [wagmiAdapter],
          networks: appNetworks,
          projectId,
          metadata,
          themeMode: 'dark',
          themeVariables: {
            '--apkt-accent': '#3b82f6',
          },
          features: {
            analytics: false,
          }
        })
      } catch (error) {
        console.error('Failed to initialize AppKit:', error)
      }
    }
  }, [])

  if (!mounted) {
    return (
      <QueryClientProvider client={queryClient}>
        <div style={{ visibility: 'hidden' }}></div>
      </QueryClientProvider>
    )
  }

  if (!projectId || !wagmiConfig) {
    return (
      <QueryClientProvider client={queryClient}>
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-pulse">Loading wallet connection...</div>
        </div>
      </QueryClientProvider>
    )
  }

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  )
}
