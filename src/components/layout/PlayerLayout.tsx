'use client'

/**
 * Player Layout Component
 *
 * THE OBSERVATORY. A minimal layout for the video player page that:
 * - Removes the sidebar for immersive viewing
 * - Forces the void tone so every token inside resolves to the dark world,
 *   whatever edition the document is in
 *
 * @module components/layout/PlayerLayout
 */

import { ReactNode } from 'react'

interface PlayerLayoutProps {
  children: ReactNode
}

export function PlayerLayout({ children }: PlayerLayoutProps) {
  return (
    <div data-tone="void" className="min-h-dvh h-dvh overflow-hidden bg-black text-[oklch(0.968_0.005_90)]">
      {children}
    </div>
  )
}
