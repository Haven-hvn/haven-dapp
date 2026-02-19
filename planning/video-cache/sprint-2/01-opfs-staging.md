# Task 2.1: OPFS Staging for Large Encrypted Files

## Objective

Use the Origin Private File System (OPFS) to stage encrypted video data on disk instead of holding it entirely in the JS heap during the fetch → decrypt pipeline. This dramatically reduces memory pressure on constrained devices.

## Background

### Current Memory Problem

The current flow holds **three copies** of the video in JS heap simultaneously:

1. `encryptedData: Uint8Array` — fetched via Synapse SDK (~500MB)
2. `decryptedData: Uint8Array` — output of `aesDecrypt()` (~500MB)
3. `blob: Blob` — created from decrypted data for `URL.createObjectURL()` (~500MB)

For a 500MB video, this means **~1.5GB of JS heap usage**. Mobile devices with 2-4GB total RAM will crash.

### OPFS Solution

The Origin Private File System (OPFS) provides a sandboxed filesystem accessible from the main thread. We can:

1. Stream the Synapse fetch directly to an OPFS file (encrypted bytes never enter JS heap in bulk)
2. Read from OPFS for decryption in chunks (if possible) or as a single read
3. Write decrypted output directly to Cache API
4. Delete the OPFS staging file

This reduces peak JS heap usage from ~1.5GB to ~500MB (only the decrypted data in transit).

> **Note:** Content retrieval now uses the **Synapse SDK** (`@filoz/synapse-sdk`) instead of direct IPFS HTTP gateways. The `ipfsService.ts` module wraps Synapse SDK calls. All references to "IPFS fetch" below refer to fetching content via Synapse.

## Requirements

### OPFS Utilities (`src/lib/opfs.ts`)

1. **`writeToStaging(videoId, stream)`** — Stream encrypted data to OPFS staging file
   - Accept a `ReadableStream<Uint8Array>` (from Synapse fetch via ipfsService)
   - Write to OPFS path: `haven-staging/{videoId}.enc`
   - Return the total bytes written
   - Support progress callback

2. **`readFromStaging(videoId)`** — Read staged encrypted data
   - Return `Uint8Array` from the OPFS file
   - For future: return `ReadableStream` for streaming decryption

3. **`deleteStaging(videoId)`** — Clean up staging file after decryption
   - Delete the OPFS file
   - Silently ignore if file doesn't exist

4. **`hasStagingFile(videoId)`** — Check if staging file exists
   - Return `boolean`

5. **`clearAllStaging()`** — Clean up all staging files
   - Delete the entire `haven-staging` directory

6. **`getStagingSize(videoId)`** — Get size of staging file
   - Return size in bytes

### Feature Detection

OPFS is required for staging large files. The module must:

- Detect OPFS availability: `navigator.storage?.getDirectory`
- Export `isOpfsAvailable()` for other modules to check
- Throw a clear error if OPFS is not available when staging is attempted

## Implementation Details

### OPFS API Usage

```typescript
// src/lib/opfs.ts

const STAGING_DIR = 'haven-staging'

export function isOpfsAvailable(): boolean {
  return typeof navigator !== 'undefined' && 
         'storage' in navigator && 
         'getDirectory' in navigator.storage
}

async function getStagingDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory()
  return root.getDirectoryHandle(STAGING_DIR, { create: true })
}

export async function writeToStaging(
  videoId: string,
  stream: ReadableStream<Uint8Array>,
  onProgress?: (bytesWritten: number) => void
): Promise<number> {
  const dir = await getStagingDir()
  const fileHandle = await dir.getFileHandle(`${videoId}.enc`, { create: true })
  
  // Use createWritable for streaming writes
  const writable = await fileHandle.createWritable()
  const reader = stream.getReader()
  let totalWritten = 0
  
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      
      await writable.write(value)
      totalWritten += value.byteLength
      onProgress?.(totalWritten)
    }
  } finally {
    await writable.close()
  }
  
  return totalWritten
}

export async function readFromStaging(videoId: string): Promise<Uint8Array> {
  const dir = await getStagingDir()
  const fileHandle = await dir.getFileHandle(`${videoId}.enc`)
  const file = await fileHandle.getFile()
  const buffer = await file.arrayBuffer()
  return new Uint8Array(buffer)
}

export async function deleteStaging(videoId: string): Promise<void> {
  try {
    const dir = await getStagingDir()
    await dir.removeEntry(`${videoId}.enc`)
  } catch {
    // File doesn't exist, that's fine
  }
}

export async function clearAllStaging(): Promise<void> {
  try {
    const root = await navigator.storage.getDirectory()
    await root.removeEntry(STAGING_DIR, { recursive: true })
  } catch {
    // Directory doesn't exist
  }
}
```

### Integration with Synapse Fetch

The `ipfsService` (which wraps Synapse SDK) provides a `streamFromIpfs()` method that returns a `ReadableStream`. The OPFS staging integrates with this:

```typescript
// In useVideoCache (modified flow for large files)
if (isOpfsAvailable() && estimatedSize > OPFS_THRESHOLD) {
  // Stream to OPFS instead of buffering in memory
  const synapseStream = await streamFromIpfs(cid)
  await writeToStaging(video.id, synapseStream, (bytes) => {
    setProgress(10 + (bytes / estimatedSize) * 40) // 10-50%
  })
  
  // Read back for decryption
  const encryptedData = await readFromStaging(video.id)
  
  // Decrypt (still in memory for now — AES-GCM requires full ciphertext)
  const decryptedData = await aesDecrypt(encryptedData, aesKey, iv)
  
  // Clean up staging
  await deleteStaging(video.id)
  
  // Store decrypted in Cache API
  await putVideo(video.id, decryptedData, mimeType)
}
```

### Memory Comparison

| Stage | Before (In-Memory) | After (OPFS Staging) |
|-------|-------------------|---------------------|
| Synapse fetch | ~500MB in heap | ~0 (streamed to disk) |
| Read for decrypt | — | ~500MB (read from disk) |
| Decryption output | ~500MB in heap | ~500MB in heap |
| Blob creation | ~500MB in heap | ~0 (written to Cache API) |
| **Peak heap** | **~1.5GB** | **~1GB** |

Note: AES-GCM requires the full ciphertext for authentication tag verification, so we can't avoid reading the entire encrypted file into memory for decryption. However, we avoid the Synapse fetch buffer and the blob creation buffer.

### Future: Streaming Decryption

If the encryption scheme is changed to use chunked encryption (e.g., AES-GCM with per-chunk auth tags), we could achieve true streaming decryption with near-zero heap usage. This is out of scope for this sprint but the OPFS infrastructure supports it.

## Acceptance Criteria

- [ ] `isOpfsAvailable()` correctly detects OPFS support
- [ ] `writeToStaging()` streams data to OPFS without buffering in JS heap
- [ ] `readFromStaging()` reads staged data back as `Uint8Array`
- [ ] `deleteStaging()` cleans up staging files
- [ ] `clearAllStaging()` removes all staging data
- [ ] Progress callback works during streaming write
- [ ] No orphaned staging files after successful or failed decryption
- [ ] Works in Chrome, Edge, and Firefox (Safari OPFS support is limited)

## Dependencies

- Sprint 1 complete (Cache API wrapper for storing decrypted output)

## Estimated Effort

Medium (4-6 hours)