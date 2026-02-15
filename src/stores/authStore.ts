'use client'

import { create } from 'zustand'

interface AuthState {
  isAuthenticated: boolean
  address: string | null
  chainId: number | null
  lastConnected: number | null
  preferredConnector: string | null
  
  setAuthenticated: (address: string, chainId: number) => void
  setDisconnected: () => void
  updateChainId: (chainId: number) => void
  setPreferredConnector: (connector: string) => void
}

const initialState: Omit<AuthState, 'setAuthenticated' | 'setDisconnected' | 'updateChainId' | 'setPreferredConnector'> = {
  isAuthenticated: false,
  address: null,
  chainId: null,
  lastConnected: null,
  preferredConnector: null,
}

export const useAuthStore = create<AuthState>((set) => ({
  ...initialState,
  
  setAuthenticated: (address: string, chainId: number) => set({
    isAuthenticated: true,
    address,
    chainId,
    lastConnected: Date.now(),
  }),
  
  setDisconnected: () => set(initialState),
  
  updateChainId: (chainId: number) => set({ chainId }),
  
  setPreferredConnector: (connector: string) => set({
    preferredConnector: connector,
  }),
}))
