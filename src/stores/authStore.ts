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

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      // Initial state
      isAuthenticated: false,
      address: null,
      chainId: null,
      lastConnected: null,
      preferredConnector: null,
      
      // Actions
      setAuthenticated: (address, chainId) => set({
        isAuthenticated: true,
        address,
        chainId,
        lastConnected: Date.now(),
      }),
      
      setDisconnected: () => set({
        isAuthenticated: false,
        address: null,
        chainId: null,
        lastConnected: null,
        preferredConnector: null,
      }),
      
      updateChainId: (chainId) => set({ chainId }),
      
      setPreferredConnector: (connector) => set({
        preferredConnector: connector,
      }),
    }),
    {
      name: 'haven-auth-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        address: state.address,
        preferredConnector: state.preferredConnector,
        lastConnected: state.lastConnected,
      }),
    }
  )
)
