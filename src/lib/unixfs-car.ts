/**
 * Reassemble a UnixFS file from an IPFS CAR (filecoin-pin upload layout).
 *
 * FilBeam returns the FOC piece bytes: a CAR whose root is a UnixFS file split
 * into ~1 MiB raw blocks. Haven `.encrypted` chunk boundaries do not align with
 * those shards, so callers must concatenate link order before parsing headers.
 *
 * @module lib/unixfs-car
 */

import { CarReader } from '@ipld/car'
import * as dagPb from '@ipld/dag-pb'
import { UnixFS } from 'ipfs-unixfs'
import type { CID } from 'multiformats/cid'
import { EncryptedPayloadError } from './encrypted-payload'

export class UnixfsCarError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnixfsCarError'
  }
}

async function loadCarBlockMap(
  carBytes: Uint8Array
): Promise<{ roots: CID[]; blocks: Map<string, Uint8Array> }> {
  const reader = await CarReader.fromBytes(carBytes)
  const roots = await reader.getRoots()
  const blocks = new Map<string, Uint8Array>()

  for await (const { cid, bytes } of reader.blocks()) {
    blocks.set(cid.toString(), bytes)
  }

  return { roots, blocks }
}

function estimateNodeOutputSize(
  cid: CID,
  blocks: Map<string, Uint8Array>,
  visited: Set<string>
): number {
  const cidStr = cid.toString()
  if (visited.has(cidStr)) {
    return 0
  }

  const blockBytes = blocks.get(cidStr)
  if (blockBytes == null) {
    return 0
  }

  let node: dagPb.PBNode
  try {
    node = dagPb.decode(blockBytes)
  } catch {
    return blockBytes.length
  }

  if (node.Data == null || node.Data.length === 0) {
    let total = 0
    for (const link of node.Links) {
      total += estimateNodeOutputSize(link.Hash, blocks, new Set(visited).add(cidStr))
    }
    return total
  }

  const ufs = UnixFS.unmarshal(node.Data)
  const declared = Number(ufs.fileSize())
  if (declared > 0) {
    return declared
  }

  let inline = ufs.data?.length ?? 0
  for (const link of node.Links) {
    inline += estimateNodeOutputSize(link.Hash, blocks, new Set(visited).add(cidStr))
  }
  return inline
}

function writeNodeBytes(
  cid: CID,
  blocks: Map<string, Uint8Array>,
  visited: Set<string>,
  out: Uint8Array,
  offset: number
): number {
  const cidStr = cid.toString()
  if (visited.has(cidStr)) {
    throw new UnixfsCarError(`UnixFS cycle detected at ${cidStr}`)
  }
  visited.add(cidStr)

  const blockBytes = blocks.get(cidStr)
  if (blockBytes == null) {
    throw new UnixfsCarError(`CAR missing block ${cidStr}`)
  }

  let node: dagPb.PBNode
  try {
    node = dagPb.decode(blockBytes)
  } catch {
    out.set(blockBytes, offset)
    return offset + blockBytes.length
  }

  if (node.Data == null || node.Data.length === 0) {
    let cursor = offset
    for (const link of node.Links) {
      cursor = writeNodeBytes(link.Hash, blocks, visited, out, cursor)
    }
    return cursor
  }

  const ufs = UnixFS.unmarshal(node.Data)

  if (ufs.isDirectory()) {
    if (node.Links.length === 0) {
      throw new UnixfsCarError('UnixFS directory has no links')
    }
    if (node.Links.length === 1) {
      return writeNodeBytes(node.Links[0]!.Hash, blocks, visited, out, offset)
    }
    let cursor = offset
    for (const link of node.Links) {
      cursor = writeNodeBytes(link.Hash, blocks, visited, out, cursor)
    }
    return cursor
  }

  let cursor = offset
  if (ufs.data != null && ufs.data.length > 0) {
    out.set(ufs.data, cursor)
    cursor += ufs.data.length
  }

  for (const link of node.Links) {
    cursor = writeNodeBytes(link.Hash, blocks, visited, out, cursor)
  }

  return cursor
}

/**
 * Concatenate the UnixFS file payload embedded in a CAR.
 */
export async function reassembleUnixfsFileFromCar(
  carBytes: Uint8Array
): Promise<Uint8Array> {
  if (carBytes.length === 0) {
    throw new UnixfsCarError('CAR is empty')
  }

  try {
    const { roots, blocks } = await loadCarBlockMap(carBytes)
    if (roots.length === 0) {
      throw new UnixfsCarError('CAR has no roots')
    }

    const root = roots[0]!
    const totalSize = estimateNodeOutputSize(root, blocks, new Set())
    if (totalSize <= 0) {
      throw new UnixfsCarError('UnixFS file size is zero')
    }

    const out = new Uint8Array(totalSize)
    const written = writeNodeBytes(root, blocks, new Set(), out, 0)
    if (written !== totalSize) {
      return out.subarray(0, written)
    }
    return out
  } catch (error) {
    if (error instanceof UnixfsCarError) {
      throw new EncryptedPayloadError(error.message)
    }
    throw error
  }
}
