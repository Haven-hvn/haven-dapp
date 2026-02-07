'use client'

import { useAuthSync } from '@/hooks/useAuthSync'
import { ReactNode } from 'react'

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  useAuthSync()
  
  return <>{children}</>
}
