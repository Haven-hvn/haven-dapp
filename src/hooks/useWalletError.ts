'use client'

import { useEffect } from 'react'

interface WalletErrorProps {
  error?: Error | null
}

export function useWalletError({ error }: WalletErrorProps = {}) {
  useEffect(() => {
    if (error) {
      console.error('Wallet connection error:', error)
      // Log error details for debugging
      console.error('Error name:', error.name)
      console.error('Error message:', error.message)
      // In a production app, you would show a toast notification here
    }
  }, [error])
  
  return { error }
}
