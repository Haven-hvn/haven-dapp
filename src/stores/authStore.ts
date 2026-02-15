'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

interface AuthState {
  // State
  isAuthenticated: boolean
  address: string | null
  chainId: number | null
  lastConnected: number | null // timestamp
  preferredConnector: string | null
  
  // Actions
  setAuthenticated: (address: string, chainId: number) => void
  setDisconnected: () => void
  updateChainId: (chainId: number) => void
  setPreferredConnector: (connector: string) => void
}

// Initial state
const initialState = {
  isAuthenticated: false,
  address: null,
  chainId: null,
  lastConnected: null,
  preferredConnector: null,
}

// Safe storage adapter for SSR
const createSafeStorage = () => {
  if (typeof window === 'undefined') {
    return {
      getItem: () => Promise.resolve(null),
      setItem: () => Promise.resolve(),
      removeItem: () => Promise.resolve(),
    }
  }
  return createJSONStorage(() => localStorage)
}

// Create the store
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      ...initialState,
      
      // Actions
      setAuthenticated: (address, chainId) => set({
        isAuthenticated: true,
        address,
        chainId,
        lastConnected: Date.now(),
      }),
      
      setDisconnected: () => set(initialState),
      
      updateChainId: (chainId) => set({ chainId }),
      
      setPreferredConnector: (connector) => set({
        preferredConnector: connector,
      }),
    }),
    {
      name: 'haven-auth-storage',
      storage: createSafeStorage(),
      partialize: (state) => ({
        address: state.address,
        preferredConnector: state.preferredConnector,
        lastConnected: state.lastConnected,
      }),
    }
  )
)
