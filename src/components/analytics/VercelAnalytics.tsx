/**
 * Vercel Analytics Component
 * 
 * Integrates Vercel Analytics and Speed Insights for performance monitoring.
 * This component is a no-op if the environment variables are not set.
 * 
 * @module components/analytics/VercelAnalytics
 */

import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";

/**
 * Vercel Analytics wrapper component.
 * Includes both Analytics and Speed Insights for comprehensive monitoring.
 */
export function VercelAnalytics() {
  return (
    <>
      <Analytics />
      <SpeedInsights />
    </>
  );
}
