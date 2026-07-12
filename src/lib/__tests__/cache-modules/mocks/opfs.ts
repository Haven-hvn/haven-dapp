/**
 * Mock Origin Private File System (OPFS) for unit testing
 * 
 * Provides an in-memory implementation of the OPFS API for testing
 * without browser dependencies.
 */

/**
 * Mock file handle that stores data in memory.
 */
export class MockFileHandle implements FileSystemFileHandle {
  readonly kind = 'file' as const
  name: string
  private data: Uint8Array = new Uint8Array(0)

  constructor(name: string) {
    this.name = name
  }

  /**
   * Get the file data as a File object.
   */
  async getFile(): Promise<File> {
    return new File([this.data], this.name)
  }

  /**
   * Create a writable stream for the file.
   */
  async createWritable(): Promise<FileSystemWritableFileStream> {
    return new MockWritableStream(this) as unknown as FileSystemWritableFileStream
  }

  /**
   * Internal method to write data to the file.
   */
  _write(data: Uint8Array): void {
    this.data = new Uint8Array(data)
  }

  /**
   * Internal method to read data from the file.
   */
  _read(): Uint8Array {
    return new Uint8Array(this.data)
  }

  /**
   * Internal method to get file size.
   */
  _getSize(): number {
    return this.data.byteLength
  }

  // FileSystemHandle interface
  isSameEntry(other: FileSystemHandle): Promise<boolean> {
    return Promise.resolve(other.name === this.name && other.kind === this.kind)
  }

  queryPermission(): Promise<PermissionState> {
    return Promise.resolve('granted')
  }

  requestPermission(): Promise<PermissionState> {
    return Promise.resolve('granted')
  }

  remove(): Promise<void> {
    return Promise.resolve()
  }
}

/**
 * Mock writable stream for writing to OPFS files.
 */
class MockWritableStream {
  private fileHandle: MockFileHandle
  private chunks: Uint8Array[] = []
  private closed = false

  constructor(fileHandle: MockFileHandle) {
    this.fileHandle = fileHandle
  }

  async write(data: ArrayBuffer | Uint8Array): Promise<void> {
    if (this.closed) {
      throw new Error('Stream is closed')
    }
    const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data
    this.chunks.push(bytes)
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    
    // Concatenate all chunks
    const totalLength = this.chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
    const combined = new Uint8Array(totalLength)
    let offset = 0
    for (const chunk of this.chunks) {
      combined.set(chunk, offset)
      offset += chunk.byteLength
    }
    
    this.fileHandle._write(combined)
  }
}

/**
 * Mock directory handle that stores file handles in memory.
 */
export class MockDirectoryHandle implements FileSystemDirectoryHandle {
  readonly kind = 'directory' as const
  name: string
  private entries = new Map<string, MockFileHandle | MockDirectoryHandle>()

  constructor(name: string) {
    this.name = name
  }

  /**
   * Get a file handle, optionally creating it.
   */
  async getFileHandle(name: string, options?: { create?: boolean }): Promise<MockFileHandle> {
    const existing = this.entries.get(name)
    if (existing) {
      if (existing.kind !== 'file') {
        throw new DOMException('Not a file', 'TypeMismatchError')
      }
      return existing as MockFileHandle
    }
    
    if (options?.create) {
      const newHandle = new MockFileHandle(name)
      this.entries.set(name, newHandle)
      return newHandle
    }
    
    throw new DOMException(`File not found: ${name}`, 'NotFoundError')
  }

  /**
   * Get a directory handle, optionally creating it.
   */
  async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<MockDirectoryHandle> {
    const existing = this.entries.get(name)
    if (existing) {
      if (existing.kind !== 'directory') {
        throw new DOMException('Not a directory', 'TypeMismatchError')
      }
      return existing as MockDirectoryHandle
    }
    
    if (options?.create) {
      const newHandle = new MockDirectoryHandle(name)
      this.entries.set(name, newHandle)
      return newHandle
    }
    
    throw new DOMException(`Directory not found: ${name}`, 'NotFoundError')
  }

  /**
   * Remove an entry.
   */
  async removeEntry(name: string, options?: { recursive?: boolean }): Promise<void> {
    const entry = this.entries.get(name)
    if (!entry) {
      throw new DOMException(`Entry not found: ${name}`, 'NotFoundError')
    }
    
    if (entry.kind === 'directory' && !options?.recursive) {
      // Check if directory has entries
      const dir = entry as MockDirectoryHandle
      if (dir._hasEntries()) {
        throw new DOMException('Directory not empty', 'InvalidModificationError')
      }
    }
    
    this.entries.delete(name)
  }

  /**
   * Iterate over entries.
   */
  async *entries(): AsyncIterableIterator<[string, MockFileHandle | MockDirectoryHandle]> {
    for (const [name, handle] of this.entries) {
      yield [name, handle]
    }
  }

  /**
   * Iterate over keys (entry names).
   */
  async *keys(): AsyncIterableIterator<string> {
    for (const name of this.entries.keys()) {
      yield name
    }
  }

  /**
   * Iterate over values (handles).
   */
  async *values(): AsyncIterableIterator<MockFileHandle | MockDirectoryHandle> {
    for (const handle of this.entries.values()) {
      yield handle
    }
  }

  /**
   * Check if directory has any entries.
   */
  _hasEntries(): boolean {
    return this.entries.size > 0
  }

  /**
   * Get all entry names.
   */
  _getEntryNames(): string[] {
    return Array.from(this.entries.keys())
  }

  // Make entries iterable
  [Symbol.asyncIterator](): AsyncIterableIterator<[string, MockFileHandle | MockDirectoryHandle]> {
    return this.entries()
  }

  // FileSystemHandle interface
  isSameEntry(other: FileSystemHandle): Promise<boolean> {
    return Promise.resolve(other.name === this.name && other.kind === this.kind)
  }

  queryPermission(): Promise<PermissionState> {
    return Promise.resolve('granted')
  }

  requestPermission(): Promise<PermissionState> {
    return Promise.resolve('granted')
  }

  remove(): Promise<void> {
    return Promise.resolve()
  }
}

/**
 * Mock OPFS root directory.
 */
const mockOpfsRoot = new MockDirectoryHandle('root')

/**
 * Setup the global OPFS mock.
 * Call this in test setup to mock the browser OPFS API.
 */
export function setupOpfsMock(): MockDirectoryHandle {
  // Clear existing entries
  for (const name of mockOpfsRoot._getEntryNames()) {
    mockOpfsRoot['entries'].delete(name)
  }

  // Mock navigator.storage.getDirectory
  Object.defineProperty(global, 'navigator', {
    value: {
      ...(global as any).navigator,
      storage: {
        ...(global as any).navigator?.storage,
        getDirectory: jest.fn().mockResolvedValue(mockOpfsRoot),
      },
    },
    writable: true,
    configurable: true,
  })

  return mockOpfsRoot
}

/**
 * Reset the OPFS mock state.
 * Call this in beforeEach to ensure clean state between tests.
 */
export function resetOpfsMock(): MockDirectoryHandle {
  // Clear all entries from root
  for (const name of mockOpfsRoot._getEntryNames()) {
    ;(mockOpfsRoot as any).entries.delete(name)
  }
  return mockOpfsRoot
}

/**
 * Teardown the OPFS mock.
 * Call this in afterAll to clean up.
 */
export function teardownOpfsMock(): void {
  resetOpfsMock()
}

/**
 * Check if OPFS mock is properly set up.
 */
export function isOpfsMockAvailable(): boolean {
  return !!(global as any).navigator?.storage?.getDirectory
}
