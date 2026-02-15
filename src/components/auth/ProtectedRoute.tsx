'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAccount } from 'wagmi'
import { useHydration } from '@/hooks/useHydration'

interface ProtectedRouteProps {
  children: React.ReactNode
  fallback?: React.ReactNode
}

export function ProtectedRoute({ children, fallback }: ProtectedRouteProps) {
  const router = useRouter()
  const { isConnected, isConnecting } = useAccount()
  const isHydrated = useHydration()
  
  useEffect(() => {
    if (isHydrated && !isConnected && !isConnecting) {
      router.push('/')
    }
  }, [isHydrated, isConnected, isConnecting, router])
  
  if (!isHydrated || isConnecting) {
    return fallback || <LoadingScreen />
  }
  
  if (!isConnected) {
    return null
  }
  
  return <>{children}</>
}

function LoadingScreen() {
  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
    </div>
  )
}
