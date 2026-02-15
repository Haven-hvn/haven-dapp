'use client'

import { useAuthSync } from '@/hooks/useAuthSync'
import { ReactNode, useEffect, useState } from 'react'

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setReady(true)
  }, [])

  useAuthSync()
  
  if (!ready) {
    return <>{children}</>
  }
  
  return <>{children}</>
}
