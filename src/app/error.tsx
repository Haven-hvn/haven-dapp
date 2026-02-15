'use client'

import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[Error Boundary] Caught error:', error)
    console.error('[Error Boundary] Error stack:', error.stack)
    console.error('[Error Boundary] Error digest:', error.digest)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertTriangle className="w-10 h-10 text-destructive" />
        </div>
        
        <h2 className="text-2xl font-bold mb-2">Something went wrong!</h2>
        <p className="text-muted-foreground mb-2">
          {error.message || 'An unexpected error occurred'}
        </p>
        {error.digest && (
          <p className="text-xs text-muted-foreground mb-6">
            Error ID: {error.digest}
          </p>
        )}
        
        <div className="flex gap-2 justify-center">
          <Button onClick={reset}>Try again</Button>
          <Button variant="outline" onClick={() => window.location.href = '/'}>
            Go Home
          </Button>
        </div>
        
        {/* Debug info */}
        <div className="mt-6 p-4 bg-muted rounded text-left text-xs font-mono overflow-auto max-h-48">
          <p className="font-semibold mb-2">Debug Info:</p>
          <p>projectId: {process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ? 'set' : 'not set'}</p>
          <p>Error: {error.message}</p>
        </div>
      </div>
    </div>
  )
}
