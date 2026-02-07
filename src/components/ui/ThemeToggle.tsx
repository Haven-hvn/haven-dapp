'use client'

/**
 * Theme Toggle Component
 * 
 * Button component that toggles between dark and light themes.
 * Shows sun icon in dark mode (click to switch to light) and
 * moon icon in light mode (click to switch to dark).
 * 
 * Features:
 * - System preference detection
 * - Theme persistence in localStorage
 * - Prevents hydration mismatch with mounted state check
 * - Accessible with proper aria-label
 * 
 * @module components/ui/ThemeToggle
 */

import { useTheme } from 'next-themes'
import { Sun, Moon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useEffect, useState } from 'react'

export function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  
  // Prevent hydration mismatch by only rendering after mount
  useEffect(() => {
    setMounted(true)
  }, [])
  
  // Show placeholder during SSR to prevent layout shift
  if (!mounted) {
    return (
      <Button 
        variant="ghost" 
        size="icon" 
        className="w-9 h-9"
        aria-label="Toggle theme"
      >
        <span className="h-4 w-4" />
      </Button>
    )
  }
  
  const isDark = resolvedTheme === 'dark'
  
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="w-9 h-9 touch-manipulation"
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
    >
      {isDark ? (
        <Sun className="h-4 w-4 transition-all" />
      ) : (
        <Moon className="h-4 w-4 transition-all" />
      )}
    </Button>
  )
}
