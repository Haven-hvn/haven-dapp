import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default {
  test: {
    environment: 'node',
    /**
     * Heavy roundtrips (multi-MiB AES-GCM through WebCrypto under vitest
     * instrumentation) can take tens of seconds on constrained runners.
     */
    testTimeout: 60_000,
    hookTimeout: 30_000,
    // Playwright specs and the sibling haven-aol checkout have their own
    // runners; vitest only owns src/**.
    exclude: ['**/node_modules/**', 'e2e/**', 'haven-aol/**'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      // The haven-aol SDK ships as a sibling workspace checkout consumed via
      // tsconfig paths; vitest needs an explicit alias for the same target.
      'haven-aol': resolve(
        __dirname,
        'haven-aol/packages/typescript/src/index.ts'
      ),
    },
  },
}
