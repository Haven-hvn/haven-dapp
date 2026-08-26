'use client'

/**
 * DripRings — concentric unlock rings for V4 drip releases.
 *
 * `unlocked` of `total` outer rings render filled (cyan); the rest stay
 * dim outlines. Used on library cards and the lock notice to show
 * "k / n unlocked" at a glance.
 *
 * @module components/video/DripRings
 */

export interface DripRingsProps {
  unlocked: number
  total: number
  /** Pixel size of the whole ring cluster. */
  size?: number
  className?: string
}

export function DripRings({ unlocked, total, size = 28, className }: DripRingsProps) {
  const clampedTotal = Math.max(1, total)
  const clampedUnlocked = Math.max(0, Math.min(unlocked, clampedTotal))
  const rings: number[] = []
  for (let i = 0; i < clampedTotal; i++) rings.push(i)

  // Each successive ring nests inside the previous one.
  const stroke = Math.max(1.5, size / 14)

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      role="img"
      aria-label={`${clampedUnlocked} of ${clampedTotal} unlocked`}
    >
      {rings.map((i) => {
        const radius = size / 2 - stroke / 2 - i * stroke * 2.2
        if (radius < stroke) return null
        const isUnlocked = i < clampedUnlocked
        return (
          <circle
            key={i}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            className={
              isUnlocked ? 'stroke-[var(--seal)]' : 'stroke-[oklch(0.98_0.01_90/0.15)]'
            }
            opacity={isUnlocked ? 0.9 : 0.6}
          />
        )
      })}
    </svg>
  )
}
