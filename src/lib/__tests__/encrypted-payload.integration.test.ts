import { describe, expect, it } from 'vitest'
import {
  extractHavenEncryptedPayload,
  looksLikeHavenChunkedEncryptStrict,
} from '../encrypted-payload'
import { reassembleUnixfsFileFromCar } from '../unixfs-car'

const PIECE_URL =
  'https://0xb24ca10fb6907a2d94b0dc5dbea6b5e379d19ffd.calibration.filbeam.io/bafkzcibf7ptzggiwddrd4cwnoazqf2tx5xw2ecrsvbcoafw3cg33o5k2akri3i5pamkq'

describe.runIf(process.env.RUN_PIECE_INTEGRATION === 'true')(
  'encrypted-payload integration',
  () => {
    it('reassembles UnixFS shards and extracts haven ciphertext', async () => {
      const response = await fetch(PIECE_URL)
      expect(response.ok).toBe(true)
      const downloaded = new Uint8Array(await response.arrayBuffer())
      expect(downloaded.length).toBeGreaterThan(70_000_000)

      const reassembled = await reassembleUnixfsFileFromCar(downloaded)
      expect(reassembled.length).toBeGreaterThan(70_000_000)
      expect(looksLikeHavenChunkedEncryptStrict(reassembled, 0)).toBe(true)

      const extracted = await extractHavenEncryptedPayload(downloaded)
      expect(extracted.length).toBe(reassembled.length)
      expect(looksLikeHavenChunkedEncryptStrict(extracted, 0)).toBe(true)
    }, 120_000)
  }
)
