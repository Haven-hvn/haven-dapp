import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { VideoPlayer } from '@/components/player/VideoPlayer'
import { PlayerLayout } from '@/components/layout/PlayerLayout'

// Disable static generation for this page since it uses wagmi hooks
export const dynamic = 'force-dynamic'

interface WatchPageProps {
  params: Promise<{
    id: string
  }>
}

export default async function WatchPage({ params }: WatchPageProps) {
  const { id } = await params
  const videoId = decodeURIComponent(id)
  
  return (
    <ProtectedRoute>
      <PlayerLayout>
        <VideoPlayer videoId={videoId} />
      </PlayerLayout>
    </ProtectedRoute>
  )
}
