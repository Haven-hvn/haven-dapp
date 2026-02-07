'use client'

/**
 * Header Component
 * 
 * Main application header with mobile navigation and wallet connection.
 * Adapts layout for mobile screens with touch-friendly elements.
 * 
 * @module components/layout/Header
 */

import { ConnectButton } from '@/components/auth/ConnectButton'
import { MobileNav } from './MobileNav'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import Link from 'next/link'

export function Header() {
  return (
    <header className="h-16 border-b flex items-center justify-between px-4 md:px-6 bg-card safe-area-x">
      <div className="flex items-center gap-2">
        <MobileNav />
        {/* Logo for mobile - hidden on desktop */}
        <Link 
          href="/library" 
          className="md:hidden flex items-center gap-2 touch-manipulation"
        >
          <div className="w-7 h-7 rounded bg-gradient-to-br from-blue-500 to-purple-600" />
          <span className="font-bold text-lg">Haven</span>
        </Link>
      </div>
      <div className="flex-1" />
      <div className="flex items-center gap-1 sm:gap-2">
        <ThemeToggle />
        <ConnectButton />
      </div>
    </header>
  )
}
