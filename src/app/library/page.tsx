import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { LibraryLayout } from '@/components/layout/LibraryLayout'
import { VideoGrid } from '@/components/library/VideoGrid'

/**
 * Library Page
 * 
 * Displays the user's video library with search, filters, and view options.
 * Protected route - requires authentication.
 */
export default function LibraryPage() {
  return (
    <ProtectedRoute>
      <LibraryLayout>
        <div className="p-6">
          <div className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight text-white/90">Library</h1>
            <p className="text-sm text-white/50 mt-1">Access your decentralized video collection</p>
          </div>
          <VideoGrid />
        </div>
      </LibraryLayout>
    </ProtectedRoute>
  )
}
