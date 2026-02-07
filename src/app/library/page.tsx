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
          <h1 className="text-2xl font-bold mb-6">Your Library</h1>
          <VideoGrid />
        </div>
      </LibraryLayout>
    </ProtectedRoute>
  )
}
