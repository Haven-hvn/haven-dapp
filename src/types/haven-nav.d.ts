/**
 * Ambient declarations for the static-export navigation shims.
 *
 * On IPFS gateways that serve directory listings instead of resolving
 * `index.html`, clicks on extensionless links that land before React
 * hydrates would hit a gateway listing page. The early-click guard queues
 * such clicks until the app can route them client-side.
 */

export {}

declare global {
  interface Window {
    /** Set once React has hydrated and the router can accept navigations. */
    __havenHydrated?: boolean
    /** Queued navigation from a pre-hydration click (guard script). */
    __havenPendingNav?: { path: string; fallback: string } | null
  }
}
