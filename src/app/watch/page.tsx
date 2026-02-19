'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { VideoPlayer } from '@/components/player/VideoPlayer'
import { PlayerLayout } from '@/components/layout/PlayerLayout'

function WatchContent() {
  const searchParams = useSearchParams()
  const videoId = searchParams.get('v')

  if (!videoId) {
    return (
      <PlayerLayout>
        <div className="flex h-full items-center justify-center">
          <p className="text-muted-foreground">No video specified.</p>
        </div>
      </PlayerLayout>
    )
  }

  return (
    <PlayerLayout>
      <VideoPlayer videoId={videoId} />
    </PlayerLayout>
  )
}

export default function WatchPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={
        <div className="flex h-screen items-center justify-center bg-background">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
        </div>
      }>
        <WatchContent />
      </Suspense>
    </ProtectedRoute>
  )
}