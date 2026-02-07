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
    <aside className="w-64 border-r bg-card h-full flex flex-col">
      <div className="p-6 safe-area-top">
        <Link href="/library" className="flex items-center gap-2 touch-manipulation">
          <div className="w-8 h-8 rounded bg-gradient-to-br from-blue-500 to-purple-600" />
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
      
      <div className="p-4 border-t text-xs text-muted-foreground safe-area-bottom">
        Haven Player v1.0
      </div>
    </aside>
  )
}
