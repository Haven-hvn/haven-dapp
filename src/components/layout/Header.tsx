'use client'

/**
 * Header — the app masthead.
 *
 * Lockup on the left; edition and wallet chips on the right. The chrome and
 * the document speak the same language as every other surface.
 *
 * @module components/layout/Header
 */

import { ConnectButton } from '@/components/auth/ConnectButton'
import { MobileNav } from './MobileNav'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import Link from 'next/link'
import { Mark } from '@/components/mark/Mark'

export function Header() {
  return (
    <header className="masthead h-[4.25rem] flex items-center justify-between px-4 md:px-6 safe-area-x">
      <div className="flex items-center gap-2">
        <MobileNav />
        {/* Lockup for mobile - hidden on desktop where the spine carries it */}
        <Link
          href="/library"
          className="md:hidden flex items-center gap-2 touch-manipulation"
          aria-label="Haven — Library"
        >
          <Mark size={20} />
          <span className="wordmark">Haven</span>
        </Link>
      </div>
      <div className="flex-1" />
      <div className="flex items-center gap-1.5 sm:gap-2">
        <ThemeToggle />
        <ConnectButton />
      </div>
    </header>
  )
}
