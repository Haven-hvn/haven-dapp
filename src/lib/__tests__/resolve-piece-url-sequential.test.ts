import { describe, expect, it, vi } from 'vitest'
import { resolvePieceUrlSequential } from '../resolve-piece-url-sequential'

describe('resolvePieceUrlSequential', () => {
  it('returns first resolver that succeeds', async () => {
    const fail = vi.fn().mockRejectedValue(new Error('filbeam fail'))
    const ok = vi.fn().mockResolvedValue('https://pdp.example/piece')
    const url = await resolvePieceUrlSequential({
      address: '0xb24ca10fb6907a2d94b0dc5dbea6b5e379d19ffd',
      client: {} as never,
      pieceCid: { toString: () => 'bafkzcibtest' } as never,
      resolvers: [fail, ok],
    })
    expect(url).toBe('https://pdp.example/piece')
    expect(fail).toHaveBeenCalled()
    expect(ok).toHaveBeenCalled()
  })

  it('aggregates errors when all resolvers fail', async () => {
    await expect(
      resolvePieceUrlSequential({
        address: '0xb24ca10fb6907a2d94b0dc5dbea6b5e379d19ffd',
        client: {} as never,
        pieceCid: { toString: () => 'bafkzcibtest' } as never,
        resolvers: [vi.fn().mockRejectedValue(new Error('a'))],
      })
    ).rejects.toThrow(/All piece URL resolvers failed/)
  })
})
