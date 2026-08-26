'use client'

/**
 * Mobile Navigation — slide-out register drawer.
 *
 * Same folio-numbered register as the desktop spine, in a drawer with an
 * overlay. 44px touch targets throughout; body scroll locked while open.
 *
 * @module components/layout/MobileNav
 */

import { useState, useEffect } from 'react'
import { Menu, X } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Mark } from '@/components/mark/Mark'
import { NAV_ITEMS } from './nav'

export function MobileNav() {
  const [isOpen, setIsOpen] = useState(false)
  const pathname = usePathname()

  // Prevent body scroll when menu is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  return (
    <div className="md:hidden">
      {/* Hamburger button - minimum 44px touch target */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-3 hover:bg-accent hover:text-accent-foreground touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center"
        aria-label={isOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={isOpen}
      >
        {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* Overlay - closes menu when clicked */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-fg/20 z-40 backdrop-blur-sm transition-opacity"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Slide-out drawer */}
      <div
        className={cn(
          'fixed top-0 left-0 bottom-0 w-72 bg-surface z-50 safe-area-inset border-r border-line',
          'transform transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] shadow-[var(--lift-3)]',
          'flex flex-col',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
        role="dialog"
        aria-modal="true"
        aria-label="Mobile navigation"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-line flex items-center justify-between safe-area-top">
          <Link
            href="/library"
            className="lockup touch-manipulation"
            onClick={() => setIsOpen(false)}
            aria-label="Haven — Library"
          >
            <Mark size={20} />
            <span className="wordmark">Haven</span>
          </Link>
          <button
            onClick={() => setIsOpen(false)}
            className="p-3 -mr-2 hover:bg-accent touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Register */}
        <nav className="px-3 py-4 flex-1 overflow-y-auto flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname.startsWith(item.href)

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsOpen(false)}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'relative flex items-baseline gap-3 px-4 py-3 min-h-[48px] touch-manipulation transition-colors',
                  isActive
                    ? 'bg-seal-wash text-fg'
                    : 'text-fg-2 hover:bg-accent hover:text-fg'
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute left-0 top-0 bottom-0 w-[2px] bg-seal transition-scale duration-300',
                    isActive ? 'scale-y-100' : 'scale-y-0'
                  )}
                />
                <span
                  className={cn('folio w-6 shrink-0', !isActive && 'text-fg-5')}
                >
                  {item.folio}
                </span>
                <span className="font-medium">{item.label}</span>
              </Link>
            )
          })}
        </nav>

        <div className="rule-engraved mx-5" aria-hidden="true" />

        {/* Footer with safe area */}
        <div className="px-5 py-5 text-nano font-[family-name:var(--font-ledger)] tracking-[0.08em] text-fg-5 uppercase safe-area-bottom">
          Haven v1.0 — Arkiv · ICP · EVM · Filecoin
        </div>
      </div>
    </div>
  )
}
