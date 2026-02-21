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
    <header className="h-16 border-b border-white/[0.06] flex items-center justify-between px-4 md:px-6 bg-[#0A0A0F] safe-area-x">
      <div className="flex items-center gap-2">
        <MobileNav />
        {/* Logo for mobile - hidden on desktop */}
        <Link 
          href="/library" 
          className="md:hidden flex items-center gap-2 touch-manipulation"
        >
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#00F5FF] to-[#FF00E5] flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 100 100" fill="none" className="text-white">
              <path d="M28 28 L28 72 L42 72 L42 56 L58 56 L58 72 L72 72 L72 28 L58 28 L58 44 L42 44 L42 28 Z" fill="currentColor"/>
            </svg>
          </div>
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
