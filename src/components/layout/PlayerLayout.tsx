'use client'

/**
 * Player Layout Component
 * 
 * A minimal layout for the video player page that:
 * - Removes the sidebar for immersive viewing
 * - Provides a clean full-screen experience
 * - Maintains header for navigation
 * 
 * @module components/layout/PlayerLayout
 */

import { ReactNode } from 'react'

interface PlayerLayoutProps {
  children: ReactNode
}

export function PlayerLayout({ children }: PlayerLayoutProps) {
  return (
    <div className="min-h-screen bg-black">
      {children}
    </div>
  )
}
