/**
 * Library Layout Component
 * 
 * Responsive layout with sidebar (desktop) and mobile navigation.
 * Provides consistent page structure across all screen sizes.
 * 
 * @module components/layout/LibraryLayout
 */

import { Sidebar } from './Sidebar'
import { Header } from './Header'

interface LibraryLayoutProps {
  children: React.ReactNode
}

export function LibraryLayout({ children }: LibraryLayoutProps) {
  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Desktop sidebar - hidden on mobile */}
      <div className="hidden md:block flex-shrink-0">
        <Sidebar />
      </div>
      
      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header />
        <main className="flex-1 overflow-auto hide-scrollbar p-4 sm:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
