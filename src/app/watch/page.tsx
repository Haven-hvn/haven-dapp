'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { VideoPlayer } from '@/components/player/VideoPlayer'
import { AudioPlayer } from '@/components/player/AudioPlayer'
import { PlayerLayout } from '@/components/layout/PlayerLayout'
import { useVideoQuery } from '@/hooks/useVideos'

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
      <WatchRouter videoId={videoId} />
    </PlayerLayout>
  )
}

/**
 * Resolves the entity once and mounts the matching player: audio releases
 * (`haven.audio.full`) get chapters + cover art, everything else the video
 * pipeline. React Query dedupes the fetch with the inner player.
 */
function WatchRouter({ videoId }: { videoId: string }) {
  const { video, isLoading, isFound } = useVideoQuery(videoId)

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    )
  }

  // Missing entities fall through to the video player, which owns the
  // not-found state — the router only branches resolved records.
  if (!isFound || !video) {
    return <VideoPlayer videoId={videoId} />
  }

  if (video.mediaKind === 'audio') {
    return <AudioPlayer track={video} />
  }
  return <VideoPlayer videoId={videoId} />
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
