'use client'

import React, { type ReactNode, useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cookieToInitialState, WagmiProvider, type Config } from 'wagmi'

const queryClient = new QueryClient()

const metadata = {
  name: 'Haven - Decentralized Video Library',
  description: 'Access your encrypted video collection from anywhere using your Web3 wallet',
  url: 'http://localhost:3000',
  icons: ['https://haven.video/icon.png']
}

let appKitInstance: any = null
let adapter: any = null

function InitializeAppKit() {
  useEffect(() => {
    if (!appKitInstance && typeof window !== 'undefined') {
      const { createAppKit } = require('@reown/appkit/react')
      const { getWagmiAdapter, getNetworks } = require('@/config')
      
      adapter = getWagmiAdapter()
      const networks = getNetworks()
      
      if (adapter) {
        appKitInstance = createAppKit({
          adapters: [adapter],
          projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "b56e18d47c72ab683b10814fe9495694",
          networks,
          metadata,
          themeMode: 'dark',
          features: { analytics: false },
          themeVariables: { '--w3m-accent': '#3b82f6' }
        })
      }
    }
  }, [])
  return null
}

function ContextProviderInner({ children, cookies }: { children: ReactNode; cookies: string | null }) {
  const [mounted, setMounted] = useState(false)
  const [wagmiConfig, setWagmiConfig] = useState<Config | null>(null)
  
  useEffect(() => {
    setMounted(true)
    const { getWagmiAdapter } = require('@/config')
    const adp = getWagmiAdapter()
    if (adp) {
      setWagmiConfig(adp.wagmiConfig as Config)
    }
  }, [])

  const initialState = wagmiConfig && cookies ? cookieToInitialState(wagmiConfig, cookies) : undefined

  if (!wagmiConfig) {
    return (
      <WagmiProvider config={{} as Config}>
        <QueryClientProvider client={queryClient}>
          {mounted && <InitializeAppKit />}
          {children}
        </QueryClientProvider>
      </WagmiProvider>
    )
  }

  return (
    <WagmiProvider config={wagmiConfig} initialState={initialState}>
      <QueryClientProvider client={queryClient}>
        {mounted && <InitializeAppKit />}
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  )
}

export function useModal() {
  return appKitInstance
}

export const modal = {
  open: () => {
    if (appKitInstance) {
      appKitInstance.open()
    }
  },
  close: () => {
    if (appKitInstance) {
      appKitInstance.close()
    }
  }
}

interface ContextProviderProps {
  children: ReactNode
  cookies: string | null
}

export function ContextProvider({ children, cookies }: ContextProviderProps) {
  return (
    <ContextProviderInner cookies={cookies}>
      {children}
    </ContextProviderInner>
  )
}
