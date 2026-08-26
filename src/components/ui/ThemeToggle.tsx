'use client'

/**
 * ThemeToggle — the edition control.
 *
 * The Record is light by design; readers who need dark get the Observatory's
 * lightness ramp via this chip, labelled like the docs surface ("Ink").
 *
 * @module components/ui/ThemeToggle
 */

import { useTheme } from 'next-themes'
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
      <button
        className="chip min-h-[44px] min-w-[3.6rem]"
        aria-label="Toggle theme"
      >
        <span className="label">·</span>
      </button>
    )
  }

  const isDark = resolvedTheme === 'dark'

  return (
    <button
      className="chip min-h-[44px] touch-manipulation"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={isDark ? 'Switch to stock theme' : 'Switch to ink theme'}
      title={isDark ? 'Switch to stock theme' : 'Switch to ink theme'}
    >
      <span className="label">{isDark ? 'Stock' : 'Ink'}</span>
    </button>
  )
}
