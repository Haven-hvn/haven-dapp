"use client";

/**
 * Web Vitals Reporting Component
 * 
 * Reports Core Web Vitals metrics to the console in development
 * and can be extended to send to analytics services in production.
 * 
 * @module components/analytics/WebVitals
 */

import { useReportWebVitals } from "next/web-vitals";
import { useEffect } from "react";

type WebVitalMetric = {
  id: string;
  name: string;
  startTime: number;
  value: number;
  label: "web-vital" | "custom";
  navigationType?: string;
};

interface LayoutShiftEntry extends PerformanceEntry {
  hadRecentInput: boolean;
  value: number;
}

/**
 * Web Vitals monitoring component.
 * Reports performance metrics for monitoring and optimization.
 */
export function WebVitals(): null {
  useReportWebVitals((metric: WebVitalMetric) => {
    // Log metrics in development
    if (process.env.NODE_ENV === "development") {
      console.log("[Web Vitals]", metric.name, metric.value);
    }
  });

  // Performance Observer for additional metrics
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Observe paint metrics
    if ("PerformanceObserver" in window) {
      try {
        const paintObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (process.env.NODE_ENV === "development") {
              console.log(`[Performance] ${entry.name}: ${entry.startTime}`);
            }
          }
        });
        paintObserver.observe({ entryTypes: ["paint"] });

        // Observe layout shifts
        const clsObserver = new PerformanceObserver((list) => {
          let clsValue = 0;
          for (const entry of list.getEntries()) {
            const layoutShiftEntry = entry as LayoutShiftEntry;
            if (!layoutShiftEntry.hadRecentInput) {
              clsValue += layoutShiftEntry.value;
            }
          }
          if (process.env.NODE_ENV === "development" && clsValue > 0) {
            console.log(`[Performance] CLS: ${clsValue}`);
          }
        });
        clsObserver.observe({ entryTypes: ["layout-shift"] });

        return () => {
          paintObserver.disconnect();
          clsObserver.disconnect();
        };
      } catch {
        // PerformanceObserver not supported
      }
    }
  }, []);

  return null;
}
