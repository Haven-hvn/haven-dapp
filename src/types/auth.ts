// Authentication types for Haven Web DApp

export interface AuthUser {
  address: string
  chainId: number
  ensName?: string
  ensAvatar?: string
}

export interface AuthContextValue {
  user: AuthUser | null
  isAuthenticated: boolean
  isLoading: boolean
  error: Error | null
}

export enum AuthError {
  WALLET_NOT_FOUND = 'WALLET_NOT_FOUND',
  USER_REJECTED = 'USER_REJECTED',
  WRONG_NETWORK = 'WRONG_NETWORK',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

// Auth store state (without actions)
export interface AuthStateSnapshot {
  isAuthenticated: boolean
  address: string | null
  chainId: number | null
  lastConnected: number | null
  preferredConnector: string | null
}
