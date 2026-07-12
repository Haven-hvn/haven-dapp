import { describe, expect, it, vi } from 'vitest'
import { linkAbortSignal } from '../abort-signal'

describe('linkAbortSignal', () => {
  it('aborts when parent aborts', () => {
    const parent = new AbortController()
    const linked = linkAbortSignal(parent.signal, undefined)
    parent.abort()
    expect(linked.aborted).toBe(true)
  })

  it('aborts after timeout', async () => {
    vi.useFakeTimers()
    const linked = linkAbortSignal(undefined, 1000)
    vi.advanceTimersByTime(1001)
    expect(linked.aborted).toBe(true)
    vi.useRealTimers()
  })

  it('inherits parent abort reason', () => {
    const parent = new AbortController()
    const linked = linkAbortSignal(parent.signal, 60_000)
    const reason = new Error('user cancel')
    parent.abort(reason)
    expect(linked.reason).toBe(reason)
  })
})
