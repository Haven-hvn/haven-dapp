import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const root = dirname(fileURLToPath(import.meta.url))

/** @type {import('vitest').UserConfig} */
export default {
  test: {
    environment: 'node',
  },
  resolve: {
    alias: {
      'haven-aol': join(root, 'haven-aol-main/packages/typescript/src/index.ts'),
    },
  },
}
