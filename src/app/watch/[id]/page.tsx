import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { VideoPlayer } from '@/components/player/VideoPlayer'
import { PlayerLayout } from '@/components/layout/PlayerLayout'

interface WatchPageProps {
  params: {
    id: string
  }
}

export default function WatchPage({ params }: WatchPageProps) {
  const videoId = decodeURIComponent(params.id)
  
  return (
    <ProtectedRoute>
      <PlayerLayout>
        <VideoPlayer videoId={videoId} />
      </PlayerLayout>
    </ProtectedRoute>
  )
}
