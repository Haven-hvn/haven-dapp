'use client'

/**
 * Mobile Navigation Component
 * 
 * Slide-out navigation drawer for mobile devices.
 * Provides touch-friendly navigation with overlay backdrop.
 * 
 * @module components/layout/MobileNav
 */

import { useState, useEffect } from 'react'
import { Menu, X, Library, Settings } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/library', label: 'Library', icon: Library },
  { href: '/settings', label: 'Settings', icon: Settings },
]

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
        className="p-3 rounded-lg hover:bg-accent touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center"
        aria-label={isOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={isOpen}
      >
        {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
      </button>
      
      {/* Overlay - closes menu when clicked */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm transition-opacity"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}
      
      {/* Slide-out menu */}
      <div 
        className={cn(
          'fixed top-0 left-0 bottom-0 w-72 bg-background z-50 safe-area-inset',
          'transform transition-transform duration-300 ease-in-out shadow-2xl',
          'flex flex-col',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
        role="dialog"
        aria-modal="true"
        aria-label="Mobile navigation"
      >
        {/* Header */}
        <div className="p-4 border-b border-white/[0.06] flex items-center justify-between safe-area-top">
          <Link 
            href="/library" 
            className="flex items-center gap-2 touch-manipulation"
            onClick={() => setIsOpen(false)}
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#00F5FF] to-[#FF00E5] flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 100 100" fill="none" className="text-white">
                <path d="M28 28 L28 72 L42 72 L42 56 L58 56 L58 72 L72 72 L72 28 L58 28 L58 44 L42 44 L42 28 Z" fill="currentColor"/>
              </svg>
            </div>
            <span className="text-xl font-bold">Haven</span>
          </Link>
          <button
            onClick={() => setIsOpen(false)}
            className="p-3 rounded-lg hover:bg-accent touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Navigation items */}
        <nav className="p-4 flex-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = pathname.startsWith(item.href)
            
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 rounded-lg mb-2',
                  'min-h-[48px] touch-manipulation transition-colors',
                  isActive 
                    ? 'bg-primary/10 text-primary' 
                    : 'text-muted-foreground hover:bg-accent'
                )}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                <span className="font-medium">{item.label}</span>
              </Link>
            )
          })}
        </nav>
        
        {/* Footer with safe area */}
        <div className="p-4 border-t border-white/[0.06] text-xs text-white/40 safe-area-bottom">
          Haven v1.0
        </div>
      </div>
    </div>
  )
}
