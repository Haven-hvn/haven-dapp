/**
 * Mark — the Haven aperture.
 *
 * Four blades, each one a public network, rotated in a pinwheel so that they
 * enclose a void without any of them touching. The void is the archive —
 * protected by the arrangement, owned by none of the parts.
 */

interface MarkProps {
  size?: number
  className?: string
  /** Blade colour; defaults to the seal (ember). */
  tone?: 'seal' | 'fg'
}

export function Mark({ size = 20, className, tone = 'seal' }: MarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      className={className}
    >
      <g
        fill="currentColor"
        style={{ color: tone === 'seal' ? 'var(--seal)' : 'var(--fg)' }}
      >
        <path d="M5 5h15v4.6H5z" />
        <path d="M22.4 5H27v15h-4.6z" />
        <path d="M12 22.4h15V27H12z" />
        <path d="M5 12h4.6v15H5z" />
      </g>
    </svg>
  )
}
