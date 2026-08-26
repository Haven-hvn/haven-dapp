'use client'

/**
 * Confetti — zero-dependency brand celebrations.
 *
 * Squares only (squared corners everywhere), colored from the live theme
 * tokens so the Record and the Observatory both celebrate in-palette.
 * One shared canvas overlay per document; particles run on a single rAF
 * loop and the canvas removes itself once the burst dies out. Respects
 * `prefers-reduced-motion` by doing nothing at all.
 *
 * @module components/publish/confetti
 */

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  aspect: number
  rot: number
  vr: number
  color: string
  age: number
  ttl: number
}

const FALLBACK_PALETTE = ['#d96f36', '#5fb98a', '#8b7bd8', '#e3b341', '#5aa7d6']

let canvas: HTMLCanvasElement | null = null
let ctx: CanvasRenderingContext2D | null = null
let particles: Particle[] = []
let rafId = 0

function reducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

function palette(): string[] {
  try {
    const styles = getComputedStyle(document.documentElement)
    const tokens = ['--seal', '--color-arkiv', '--color-icp', '--color-evm', '--color-filecoin']
    const found = tokens.map((t) => styles.getPropertyValue(t).trim()).filter(Boolean)
    return found.length >= 3 ? found : FALLBACK_PALETTE
  } catch {
    return FALLBACK_PALETTE
  }
}

function ensureCanvas(): boolean {
  if (canvas && ctx) return true
  canvas = document.createElement('canvas')
  canvas.setAttribute('aria-hidden', 'true')
  const style = canvas.style
  style.position = 'fixed'
  style.inset = '0'
  style.width = '100%'
  style.height = '100%'
  style.pointerEvents = 'none'
  style.zIndex = '9997'
  document.body.appendChild(canvas)
  ctx = canvas.getContext('2d')
  resize()
  return Boolean(ctx)
}

function resize(): void {
  if (!canvas) return
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = Math.floor(window.innerWidth * dpr)
  canvas.height = Math.floor(window.innerHeight * dpr)
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0)
}

function spawn(
  x: number,
  y: number,
  angleCenter: number,
  spreadRad: number,
  count: number,
  power: number,
  colors: string[]
): void {
  for (let i = 0; i < count; i++) {
    const angle = angleCenter + (Math.random() - 0.5) * spreadRad
    const speed = power * (0.35 + Math.random() * 0.95)
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 5 + Math.random() * 6,
      aspect: 0.55 + Math.random() * 0.75,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.32,
      color: colors[Math.floor(Math.random() * colors.length)],
      age: 0,
      ttl: 90 + Math.random() * 80,
    })
  }
  if (!rafId) rafId = requestAnimationFrame(tick)
}

function tick(): void {
  if (!ctx || !canvas) return
  const w = window.innerWidth
  const h = window.innerHeight
  ctx.clearRect(0, 0, w, h)

  particles = particles.filter((p) => p.age < p.ttl && p.y < h + 40)
  for (const p of particles) {
    p.age++
    p.vx *= 0.985
    p.vy = p.vy * 0.985 + 0.17
    p.x += p.vx
    p.y += p.vy
    p.rot += p.vr

    const fadeStart = p.ttl * 0.7
    const alpha = p.age < fadeStart ? 1 : Math.max(0, 1 - (p.age - fadeStart) / (p.ttl - fadeStart))
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.translate(p.x, p.y)
    ctx.rotate(p.rot)
    ctx.fillStyle = p.color
    ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * p.aspect)
    ctx.restore()
  }

  if (particles.length > 0) {
    rafId = requestAnimationFrame(tick)
  } else {
    cancelAnimationFrame(rafId)
    rafId = 0
    canvas.remove()
    canvas = null
    ctx = null
  }
}

/**
 * Single burst from an origin (viewport px). Defaults to a centered volley —
 * the "plan sealed" moment.
 */
export function confettiBurst(opts?: { origin?: { x: number; y: number }; count?: number }): void {
  if (reducedMotion()) return
  if (!ensureCanvas()) return
  resize()
  const colors = palette()
  const x = opts?.origin?.x ?? window.innerWidth / 2
  const y = opts?.origin?.y ?? Math.max(140, window.innerHeight * 0.34)
  spawn(x, y, -Math.PI / 2, Math.PI * 0.95, opts?.count ?? 120, 11, colors)
}

/** Full celebration: center fountain plus staggered side cannons. */
export function confettiCelebration(): void {
  if (reducedMotion()) return
  if (!ensureCanvas()) return
  resize()
  const w = window.innerWidth
  const h = window.innerHeight
  const colors = palette()

  spawn(w / 2, h * 0.38, -Math.PI / 2, Math.PI * 1.1, 150, 12.5, colors)
  window.setTimeout(() => {
    if (!reducedMotion()) spawn(w * 0.1, h * 0.78, -Math.PI / 2 + 0.42, Math.PI * 0.42, 70, 14, colors)
  }, 160)
  window.setTimeout(() => {
    if (!reducedMotion()) spawn(w * 0.9, h * 0.78, -Math.PI / 2 - 0.42, Math.PI * 0.42, 70, 14, colors)
  }, 320)
}
