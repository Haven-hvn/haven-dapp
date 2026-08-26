import { Suspense } from 'react'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { LibraryLayout } from '@/components/layout/LibraryLayout'
import { VideoGrid } from '@/components/library/VideoGrid'

/**
 * Library Page — the collection register.
 *
 * Displays the user's video library with search, filters, and view options.
 * Protected route - requires authentication.
 */
export default function LibraryPage() {
  return (
    <ProtectedRoute>
      <LibraryLayout>
        <div className="p-6 max-w-[1560px]">
          <header className="section-head mb-8">
            <div className="section-head-meta">
              <span className="folio">01</span>
              <span className="section-head-rule" aria-hidden="true" />
              <h1 className="statement-title text-fg">Your Library</h1>
            </div>
            <span className="section-head-annotation label hidden sm:block">
              Decentralized collection
            </span>
          </header>
          <Suspense fallback={
            <div className="space-y-4">
              <div className="h-10 bg-line animate-pulse" />
              <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <div className="aspect-video bg-line animate-pulse" />
                    <div className="h-4 w-3/4 bg-line animate-pulse" />
                    <div className="h-3 w-1/2 bg-line animate-pulse" />
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
