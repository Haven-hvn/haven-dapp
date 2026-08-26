/**
 * Sidebar — the spine.
 *
 * Desktop navigation as a document register: each surface numbered, the active
 * entry sealed. Hidden on mobile; use MobileNav there.
 *
 * @module components/layout/Sidebar
 */

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Mark } from '@/components/mark/Mark'
import { NAV_ITEMS } from './nav'

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-64 border-r border-line bg-surface h-full flex flex-col">
      <div className="px-6 pt-7 pb-6 safe-area-top">
        <Link href="/library" className="lockup touch-manipulation" aria-label="Haven — Library">
          <Mark size={20} />
          <span className="wordmark">Haven</span>
          <span className="lockup-rule" aria-hidden="true" />
          <span className="lockup-descriptor">
            <span className="label">Sovereign Media</span>
            <span className="label text-fg-5 text-[0.625rem]">v1.0</span>
          </span>
        </Link>
      </div>

      <div className="rule-engraved mx-6" aria-hidden="true" />

      <nav className="px-3 py-4 flex-1 flex flex-col gap-1" aria-label="Surfaces">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname.startsWith(item.href)

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'group relative flex items-baseline gap-3 px-3 py-3 transition-colors min-h-[44px] touch-manipulation',
                isActive
                  ? 'bg-seal-wash text-fg'
                  : 'text-fg-2 hover:bg-accent hover:text-fg'
              )}
            >
              {/* Active entries carry a seal rule on the spine, not a pill. */}
              <span
                aria-hidden="true"
                className={cn(
                  'absolute left-0 top-0 bottom-0 w-[2px] bg-seal transition-scale duration-300',
                  isActive ? 'scale-y-100' : 'scale-y-0'
                )}
              />
              <span
                className={cn(
                  'folio w-6 shrink-0',
                  isActive ? '' : 'text-fg-5 group-hover:text-seal-text'
                )}
              >
                {item.folio}
              </span>
              <span className="text-small font-medium tracking-[-0.014em] leading-[1.9]">
                {item.label}
              </span>
            </Link>
          )
        })}
      </nav>

      <div className="px-6 py-5 border-t border-line safe-area-bottom">
        <p className="label text-fg-5">Haven v1.0</p>
        <p className="mt-2 text-nano font-[family-name:var(--font-ledger)] tracking-[0.08em] text-fg-5 uppercase">
          Arkiv · ICP · EVM · Filecoin
        </p>
      </div>
    </aside>
  )
}
