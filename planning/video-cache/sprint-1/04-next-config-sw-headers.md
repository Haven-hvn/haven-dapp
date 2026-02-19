# Task 1.4: Next.js Configuration for Service Worker

## Objective

Configure Next.js to properly serve the Service Worker file and set the required HTTP headers for Service Worker scope and Cache API usage.

## Background

Next.js requires specific configuration to serve a Service Worker from the root scope (`/`). The Service Worker file lives in `public/haven-sw.js` and needs to be served with the correct `Service-Worker-Allowed` header. Additionally, we need to ensure the synthetic `/haven/v/*` routes don't conflict with Next.js routing.

## Requirements

### `next.config.mjs` Changes

1. **Service Worker headers**: Add `Service-Worker-Allowed: /` header for `/haven-sw.js`
2. **Cache-Control for SW**: Set `Cache-Control: no-cache` for the SW file to ensure updates propagate
3. **Synthetic route handling**: Ensure `/haven/v/*` requests are not intercepted by Next.js routing (they should reach the Service Worker)

### Rewrites / Headers Configuration

```javascript
// next.config.mjs additions
const nextConfig = {
  // ... existing config
  
  async headers() {
    return [
      {
        source: '/haven-sw.js',
        headers: [
          {
            key: 'Service-Worker-Allowed',
            value: '/',
          },
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
        ],
      },
      {
        // Allow Cache API to store large responses
        source: '/haven/v/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store', // These are served by SW, not the server
          },
        ],
      },
    ]
  },
}
```

### Service Worker Provider Component

Create a provider component that registers the Service Worker at the app root level:

```typescript
// src/components/providers/ServiceWorkerProvider.tsx
'use client'

import { useServiceWorker } from '@/hooks/useServiceWorker'
import { createContext, useContext } from 'react'

interface ServiceWorkerContextValue {
  isReady: boolean
  isSupported: boolean
  error: Error | null
}

const ServiceWorkerContext = createContext<ServiceWorkerContextValue>({
  isReady: false,
  isSupported: false,
  error: null,
})

export function ServiceWorkerProvider({ children }: { children: React.ReactNode }) {
  const sw = useServiceWorker()
  
  return (
    <ServiceWorkerContext.Provider value={sw}>
      {children}
    </ServiceWorkerContext.Provider>
  )
}

export function useServiceWorkerContext() {
  return useContext(ServiceWorkerContext)
}
```

## Implementation Details

### Why No-Cache for SW File

Service Workers have a special update mechanism: the browser checks for byte-level changes to the SW file on each navigation. If we cache the SW file aggressively, updates won't propagate. Setting `no-cache` ensures the browser always checks for the latest version.

### Why `/haven/v/*` Doesn't Need a Next.js Route

The `/haven/v/*` URLs are synthetic — they only exist in the Cache API and are served by the Service Worker. They never reach the Next.js server. However, if the Service Worker is not yet active (first load), the browser might try to fetch these from the server. The `no-store` header ensures the server returns a clean 404 rather than caching an error response.

### Integration with App Layout

The `ServiceWorkerProvider` should be added to the root layout:

```typescript
// src/app/layout.tsx (modification)
import { ServiceWorkerProvider } from '@/components/providers/ServiceWorkerProvider'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <ServiceWorkerProvider>
          {/* existing providers */}
          {children}
        </ServiceWorkerProvider>
      </body>
    </html>
  )
}
```

## Acceptance Criteria

- [ ] `haven-sw.js` is served with `Service-Worker-Allowed: /` header
- [ ] `haven-sw.js` is served with `Cache-Control: no-cache` header
- [ ] `/haven/v/*` routes don't conflict with Next.js routing
- [ ] `ServiceWorkerProvider` is created and provides SW state via context
- [ ] Provider is integrated into the root layout
- [ ] No build errors or warnings from Next.js
- [ ] Service Worker registers successfully in development and production

## Dependencies

- Task 1.1 (Service Worker Setup)

## Estimated Effort

Small (2-3 hours)