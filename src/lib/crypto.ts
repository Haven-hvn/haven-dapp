/**
 * Cryptographic Utilities for Haven Web DApp
 * 
 * Provides AES-256-GCM encryption/decryption and helper functions
 * for handling encrypted video content in the browser.
 * 
 * @module lib/crypto
 */

// ============================================================================
// AES-256-GCM Decryption
// ============================================================================

/**
 * Decrypt data using AES-256-GCM.
 * 
 * Uses the Web Crypto API for performant symmetric decryption
 * of video content. The AES key is obtained from Lit Protocol
 * via BLS-IBE decryption.
 * 
 * @param encryptedData - The encrypted data (ciphertext + auth tag)
 * @param key - The 256-bit AES key
 * @param iv - The 12-byte initialization vector
 * @returns Promise resolving to decrypted data
 * @throws Error if decryption fails (corrupted data or wrong key)
 * 
 * @example
 * ```typescript
 * const decrypted = await aesDecrypt(
 *   encryptedVideoData,
 *   aesKey,
 *   iv
 * )
 * const blob = new Blob([decrypted], { type: 'video/mp4' })
 * ```
 */
export async function aesDecrypt(
  encryptedData: Uint8Array,
  key: Uint8Array,
  iv: Uint8Array
): Promise<Uint8Array> {
  // Import the raw AES key for use with Web Crypto API
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  )

  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      cryptoKey,
      encryptedData as BufferSource
    )

    return new Uint8Array(decrypted)
  } catch (error) {
    if (error instanceof DOMException) {
      throw new Error(
        `AES decryption failed: ${error.message}. ` +
        'The file may be corrupted or the wrong key is being used.'
      )
    }
    throw error
  }
}

/**
 * Encrypt data using AES-256-GCM.
 * 
 * Note: This is primarily for testing/development. In production,
 * encryption typically happens on the backend or during upload.
 * 
 * @param data - The plaintext data to encrypt
 * @param key - The 256-bit AES key
 * @param iv - The 12-byte initialization vector (generated if not provided)
 * @returns Object containing ciphertext and IV used
 * @throws Error if encryption fails
 */
export async function aesEncrypt(
  data: Uint8Array,
  key: Uint8Array,
  iv?: Uint8Array
): Promise<{ ciphertext: Uint8Array; iv: Uint8Array }> {
  // Generate IV if not provided
  const ivToUse = iv || generateIV()

  // Import the raw AES key
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  )

  try {
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: ivToUse as BufferSource },
      cryptoKey,
      data as BufferSource
    )

    return {
      ciphertext: new Uint8Array(encrypted),
      iv: ivToUse,
    }
  } catch (error) {
    if (error instanceof DOMException) {
      throw new Error(`AES encryption failed: ${error.message}`)
    }
    throw error
  }
}

/**
 * Generate a cryptographically secure 256-bit AES key.
 * 
 * @returns Promise resolving to a new 32-byte key
 */
export async function generateAESKey(): Promise<Uint8Array> {
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  )

  const exported = await crypto.subtle.exportKey('raw', key)
  return new Uint8Array(exported)
}

/**
 * Generate a random 12-byte IV for AES-GCM.
 * 
 * IVs should never be reused with the same key.
 * 
 * @returns A new 12-byte IV
 */
export function generateIV(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(12))
}

// ============================================================================
// Encoding/Decoding Utilities
// ============================================================================

/**
 * Convert base64 string to Uint8Array.
 * 
 * Handles both standard and URL-safe base64 encoding.
 * 
 * @param base64 - The base64-encoded string
 * @returns Decoded bytes
 * @throws Error if the string is not valid base64
 */
export function base64ToUint8Array(base64: string): Uint8Array {
  // Normalize URL-safe base64 to standard base64
  const normalized = base64
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=')

  try {
    const binary = atob(normalized)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes
  } catch (e) {
    throw new Error(`Invalid base64 string: ${e instanceof Error ? e.message : 'unknown error'}`)
  }
}

/**
 * Convert Uint8Array to base64 string.
 * 
 * @param bytes - The bytes to encode
 * @param urlSafe - Whether to use URL-safe encoding (default: false)
 * @returns Base64-encoded string
 */
export function uint8ArrayToBase64(bytes: Uint8Array, urlSafe: boolean = false): string {
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }

  const base64 = btoa(binary)

  if (urlSafe) {
    return base64
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '')
  }

  return base64
}

/**
 * Convert Uint8Array to ArrayBuffer.
 * 
 * Returns the underlying buffer if possible, otherwise creates a copy.
 * Useful when APIs require ArrayBuffer instead of typed arrays.
 * 
 * @param data - The Uint8Array to convert
 * @returns ArrayBuffer view of the data
 */
export function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  if (data.byteOffset === 0 && data.byteLength === data.buffer.byteLength) {
    return data.buffer as ArrayBuffer
  }
  const buffer = new ArrayBuffer(data.byteLength)
  new Uint8Array(buffer).set(data)
  return buffer
}

/**
 * Convert ArrayBuffer to Uint8Array.
 * 
 * Creates a new Uint8Array view of the buffer without copying.
 * 
 * @param buffer - The ArrayBuffer to convert
 * @returns Uint8Array view
 */
export function toUint8Array(buffer: ArrayBuffer): Uint8Array {
  return new Uint8Array(buffer)
}

/**
 * Convert hex string to Uint8Array.
 * 
 * @param hex - Hex string (with or without 0x prefix)
 * @returns Decoded bytes
 * @throws Error if string contains non-hex characters
 */
export function hexToUint8Array(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/, '')
  if (clean.length % 2 !== 0) {
    throw new Error('Hex string must have even length')
  }

  const bytes = new Uint8Array(clean.length / 2)
  for (let i = 0; i < clean.length; i += 2) {
    const byte = parseInt(clean.slice(i, i + 2), 16)
    if (isNaN(byte)) {
      throw new Error(`Invalid hex character at position ${i}`)
    }
    bytes[i / 2] = byte
  }
  return bytes
}

/**
 * Convert Uint8Array to hex string.
 * 
 * @param bytes - The bytes to encode
 * @param prefix - Whether to add 0x prefix (default: false)
 * @returns Hex-encoded string
 */
export function uint8ArrayToHex(bytes: Uint8Array, prefix: boolean = false): string {
  const hex = Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  return prefix ? `0x${hex}` : hex
}

// ============================================================================
// Secure Memory Utilities
// ============================================================================

/**
 * Securely clear sensitive data from memory.
 * 
 * Overwrites the array with zeros. Note: This is a best-effort
 * approach as JavaScript engines may optimize/copy data.
 * 
 * @param data - The array to clear
 */
export function secureClear(data: Uint8Array): void {
  if (data && data.fill) {
    data.fill(0)
  }
}

/**
 * Create a secure copy of sensitive data.
 * 
 * Creates a new Uint8Array with the same contents.
 * Useful when you need to pass keys to async operations
 * while keeping the original for cleanup.
 * 
 * @param data - The data to copy
 * @returns New Uint8Array with copied data
 */
export function secureCopy(data: Uint8Array): Uint8Array {
  return new Uint8Array(data)
}

// ============================================================================
// Hashing Utilities
// ============================================================================

/**
 * Compute SHA-256 hash of data.
 * 
 * @param data - The data to hash
 * @returns Promise resolving to 32-byte hash
 */
export async function sha256(data: Uint8Array | string): Promise<Uint8Array> {
  const encoder = new TextEncoder()
  const bytes = typeof data === 'string' ? encoder.encode(data) : data
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return new Uint8Array(hashBuffer)
}

/**
 * Compute SHA-256 hash and return as hex string.
 * 
 * @param data - The data to hash
 * @param prefix - Whether to add 0x prefix (default: false)
 * @returns Promise resolving to hex hash string
 */
export async function sha256Hex(data: Uint8Array | string, prefix: boolean = false): Promise<string> {
  const hash = await sha256(data)
  return uint8ArrayToHex(hash, prefix)
}

// ============================================================================
// File/Stream Utilities
// ============================================================================

/**
 * Read a file as ArrayBuffer.
 * 
 * @param file - The file to read
 * @returns Promise resolving to file contents
 */
export function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(new Error(`Failed to read file: ${reader.error?.message || 'unknown error'}`))
    reader.readAsArrayBuffer(file)
  })
}

/**
 * Read a file as Uint8Array.
 * 
 * @param file - The file to read
 * @returns Promise resolving to file contents
 */
export async function readFileAsUint8Array(file: File): Promise<Uint8Array> {
  const buffer = await readFileAsArrayBuffer(file)
  return new Uint8Array(buffer)
}

/**
 * Calculate the size of a blob with human-readable formatting.
 * 
 * @param bytes - Size in bytes
 * @param decimals - Number of decimal places (default: 2)
 * @returns Human-readable string (e.g., "1.5 MB")
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 Bytes'

  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB']

  const i = Math.floor(Math.log(bytes) / Math.log(k))
  const size = parseFloat((bytes / Math.pow(k, i)).toFixed(dm))

  return `${size} ${sizes[i]}`
}

/**
 * Check if the browser likely supports large file operations.
 * 
 * Detects known limitations in mobile browsers and Safari.
 * 
 * @returns Object with support status and warnings
 */
export function checkLargeFileSupport(): {
  supported: boolean
  maxRecommended: number
  warnings: string[]
} {
  const warnings: string[] = []
  let maxRecommended = 2 * 1024 * 1024 * 1024 // 2GB default

  // Check for mobile
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
  if (isMobile) {
    warnings.push('Mobile devices may have limited memory for large files')
    maxRecommended = 500 * 1024 * 1024 // 500MB on mobile
  }

  // Check for Safari
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
  if (isSafari) {
    warnings.push('Safari has known limitations with large ArrayBuffers')
    maxRecommended = Math.min(maxRecommended, 500 * 1024 * 1024)
  }

  // Check for 32-bit browser (approximate)
  if (navigator.userAgent.includes('x86') || navigator.userAgent.includes('i686')) {
    warnings.push('32-bit browsers have limited address space for large files')
    maxRecommended = Math.min(maxRecommended, 512 * 1024 * 1024)
  }

  return {
    supported: warnings.length === 0,
    maxRecommended,
    warnings,
  }
}
