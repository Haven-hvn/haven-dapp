'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-surface text-fg">
      <div className="text-center max-w-md crop-marks p-10">
        <p className="seal-mark !border-destructive !text-destructive mb-6 inline-flex">
          Record Error
        </p>

        <h1 className="statement-headline [font-size:clamp(1.75rem,1.2rem+2.5vw,3rem)] mb-4">
          Something went <em className="voice-editorial overprint">wrong</em>
        </h1>
        <p className="lede mb-4">{error.message || 'An unexpected error occurred'}</p>
        {error.digest && (
          <p className="addr mb-8">Error ID: {error.digest}</p>
        )}

        <div className="flex gap-3 justify-center flex-wrap">
          <Button onClick={reset} size="lg">
            Try again
          </Button>
          <Button variant="outline" size="lg" onClick={() => (window.location.href = '/')}>
            Go Home
          </Button>
        </div>
      </div>
    </div>
  )
}
