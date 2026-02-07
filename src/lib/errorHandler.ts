export interface AppError {
  type: 'network' | 'auth' | 'decryption' | 'playback' | 'unknown'
  message: string
  originalError?: Error
  recoverable: boolean
}

export function handleError(error: unknown): AppError {
  if (error instanceof Error) {
    // Network errors
    if (error.message.includes('fetch') || 
        error.message.includes('network') ||
        error.message.includes('Failed to fetch')) {
      return {
        type: 'network',
        message: 'Connection failed. Please check your internet connection.',
        originalError: error,
        recoverable: true,
      }
    }
    
    // Auth errors
    if (error.message.includes('wallet') ||
        error.message.includes('permission') ||
        error.message.includes('access control')) {
      return {
        type: 'auth',
        message: 'Authentication failed. Please check your wallet connection.',
        originalError: error,
        recoverable: true,
      }
    }
    
    // Decryption errors
    if (error.message.includes('decrypt') ||
        error.message.includes('Lit')) {
      return {
        type: 'decryption',
        message: 'Failed to decrypt video. Make sure you own this content.',
        originalError: error,
        recoverable: false,
      }
    }
    
    // Playback errors
    if (error.message.includes('play') ||
        error.message.includes('video') ||
        error.message.includes('media')) {
      return {
        type: 'playback',
        message: 'Failed to play video. The file may be corrupted.',
        originalError: error,
        recoverable: true,
      }
    }
  }
  
  return {
    type: 'unknown',
    message: 'An unexpected error occurred.',
    recoverable: true,
  }
}

// Retry mechanism with exponential backoff
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number
    initialDelay?: number
    maxDelay?: number
    shouldRetry?: (error: unknown) => boolean
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    shouldRetry = () => true,
  } = options

  let lastError: unknown

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      
      if (attempt === maxRetries || !shouldRetry(error)) {
        throw error
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(initialDelay * Math.pow(2, attempt), maxDelay)
      
      // Add some jitter to prevent thundering herd
      const jitter = Math.random() * 200
      
      await new Promise(resolve => setTimeout(resolve, delay + jitter))
    }
  }

  throw lastError
}

// Network status detection
export function isOnline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine
}

export function watchNetworkStatus(
  onChange: (online: boolean) => void
): () => void {
  if (typeof window === 'undefined') {
    return () => {}
  }

  const handleOnline = () => onChange(true)
  const handleOffline = () => onChange(false)

  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)

  return () => {
    window.removeEventListener('online', handleOnline)
    window.removeEventListener('offline', handleOffline)
  }
}
