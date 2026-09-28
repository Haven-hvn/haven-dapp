/**
 * Whole-file decrypt for single-blob seals (`[12-byte IV][ciphertext+tag]`,
 * the Herald/aol_seal layout) plus the format dispatcher shared with the
 * chunked (haven-cli) pipeline.
 *
 * Video uploads seal chunked for progressive playback; single-file music
 * releases seal as one blob. The player must open both: `decryptToPlaintext`
 * sniffs with the existing `isChunkedFormat` heuristic and routes.
 *
 * @module lib/blob-decrypt
 */

import { decryptFile } from 'haven-aol'
import {
  concatenateChunks,
  decryptChunkedStream,
  isChunkedFormat,
  type ChunkedDecryptProgress,
} from './chunked-decrypt'

/**
 * Decrypt one single-blob seal with an already-unwrapped AES key. Thin
 * wrapper over the SDK's byte-verbatim `decryptFile` so the dapp pins the
 * layout in one place (a seal that is neither chunked nor single-blob
 * fails here, loudly, instead of mis-decrypting).
 */
export async function decryptSingleBlob(
  encryptedData: Uint8Array,
  aesKey: Uint8Array,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  if (signal?.aborted) throw new Error('Decryption cancelled')
  return decryptFile(encryptedData, aesKey)
}

/**
 * Decrypt to full plaintext regardless of seal layout: chunked seals
 * stream through the chunk pipeline, everything else goes single-blob.
 */
export async function decryptToPlaintext(
  encryptedData: Uint8Array,
  aesKey: Uint8Array,
  signal?: AbortSignal,
  onChunkProgress?: ChunkedDecryptProgress,
): Promise<Uint8Array> {
  if (isChunkedFormat(encryptedData)) {
    const chunks: Uint8Array[] = []
    for await (const chunk of decryptChunkedStream(encryptedData, aesKey, { signal, onProgress: onChunkProgress })) {
      chunks.push(chunk)
    }
    return concatenateChunks(chunks)
  }
  return decryptSingleBlob(encryptedData, aesKey, signal)
}
