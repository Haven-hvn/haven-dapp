/**
 * Sidebar Component
 * 
 * Desktop navigation sidebar. Hidden on mobile devices.
 * For mobile navigation, use the MobileNav component instead.
 * 
 * @module components/layout/Sidebar
 */

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Library, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/library', label: 'Library', icon: Library },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  
  return (
    <aside className="w-64 border-r border-white/[0.06] bg-[#0A0A0F] h-full flex flex-col">
      <div className="p-6 safe-area-top">
        <Link href="/library" className="flex items-center gap-2 touch-manipulation">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#00F5FF] to-[#FF00E5] flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 100 100" fill="none" className="text-white">
              <path d="M28 28 L28 72 L42 72 L42 56 L58 56 L58 72 L72 72 L72 28 L58 28 L58 44 L42 44 L42 28 Z" fill="currentColor"/>
            </svg>
          </div>
          <span className="text-xl font-bold">Haven</span>
        </Link>
      </div>
      
      <nav className="px-3 py-2 flex-1">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname.startsWith(item.href)
          
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors min-h-[44px] touch-manipulation',
                isActive 
                  ? 'bg-primary/10 text-primary' 
                  : 'text-muted-foreground hover:bg-accent'
              )}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>
      
      <div className="p-4 border-t border-white/[0.06] text-xs text-white/40 safe-area-bottom">
        Haven v1.0
      </div>
    </aside>
  )
}
