import { Suspense } from 'react'
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
          <Suspense fallback={
            <div className="space-y-4">
              <div className="h-9 bg-white/[0.04] rounded-md animate-pulse" />
              <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <div className="aspect-video rounded-lg bg-white/[0.04] animate-pulse" />
                    <div className="h-4 w-3/4 bg-white/[0.04] rounded animate-pulse" />
                    <div className="h-3 w-1/2 bg-white/[0.04] rounded animate-pulse" />
                  </div>
                ))}
              </div>
            </div>
          }>
            <VideoGrid />
          </Suspense>
        </div>
      </LibraryLayout>
    </ProtectedRoute>
  )
}
