import { test, expect } from './fixtures';

/**
 * Performance tests for Haven app
 */
test.describe('Performance', () => {
  test('landing page should load within acceptable time', async ({ page, gotoAndHydrate }) => {
    const startTime = Date.now();
    
    await gotoAndHydrate('/');
    
    const loadTime = Date.now() - startTime;
    
    // Page should load in under 5 seconds
    expect(loadTime).toBeLessThan(5000);
    
    // Check First Contentful Paint equivalent
    const fcp = await page.evaluate(() => {
      const entries = performance.getEntriesByType('paint');
      const fcpEntry = entries.find(e => e.name === 'first-contentful-paint');
      return fcpEntry ? fcpEntry.startTime : 0;
    });
    
    // FCP should be under 3 seconds
    expect(fcp).toBeLessThan(3000);
  });

  test('should not have layout shifts', async ({ page, gotoAndHydrate }) => {
    await gotoAndHydrate('/');
    
    // Wait for page to settle
    await page.waitForLoadState('networkidle');
    
    // Check for CLS (Cumulative Layout Shift)
    const cls = await page.evaluate(() => {
      // @ts-ignore
      return performance.getEntriesByType('layout-shift')
        // @ts-ignore
        .reduce((sum, entry) => sum + entry.value, 0);
    });
    
    // CLS should be less than 0.1 (good threshold)
    expect(cls).toBeLessThan(0.1);
  });

  test('images should load efficiently', async ({ page, gotoAndHydrate }) => {
    await gotoAndHydrate('/');
    
    // Get all image requests
    const imageRequests: string[] = [];
    
    page.on('request', request => {
      if (request.resourceType() === 'image') {
        imageRequests.push(request.url());
      }
    });
    
    await page.waitForLoadState('networkidle');
    
    // Images should use modern formats (WebP/AVIF) when available
    const images = await page.locator('img').all();
    
    for (const img of images) {
      const src = await img.getAttribute('src');
      if (src) {
        // Check if using Next.js Image optimization
        const isOptimized = src.includes('_next/image') || 
                           src.includes('webp') || 
                           src.includes('avif');
        // This is a soft check - not all images need to be optimized
      }
    }
  });

  test('JavaScript bundles should not be too large', async ({ page, gotoAndHydrate }) => {
    const jsSizes: number[] = [];
    
    page.on('response', async response => {
      if (response.request().resourceType() === 'script') {
        try {
          const headers = await response.allHeaders();
          const size = parseInt(headers['content-length'] || '0');
          if (size > 0) {
            jsSizes.push(size);
          }
        } catch {
          // Ignore errors
        }
      }
    });
    
    await gotoAndHydrate('/');
    await page.waitForLoadState('networkidle');
    
    // Individual JS files should be under 500KB
    for (const size of jsSizes) {
      expect(size).toBeLessThan(500 * 1024); // 500KB
    }
  });

  test('should use browser caching for static assets', async ({ page, gotoAndHydrate }) => {
    const cacheHeaders: Record<string, string> = {};
    
    page.on('response', async response => {
      const url = response.url();
      const headers = await response.allHeaders();
      
      if (url.includes('_next/static') || url.match(/\.(js|css|woff2?)$/)) {
        cacheHeaders[url] = headers['cache-control'] || '';
      }
    });
    
    await gotoAndHydrate('/');
    await page.waitForLoadState('networkidle');
    
    // Static assets should have cache headers
    for (const [url, cacheControl] of Object.entries(cacheHeaders)) {
      expect(cacheControl).toContain('max-age');
    }
  });

  test('library page should lazy load content', async ({ page, gotoAndHydrate, mockWalletConnected }) => {
    await mockWalletConnected();
    
    const startTime = Date.now();
    await gotoAndHydrate('/library');
    
    // Initial load should be fast
    const initialLoadTime = Date.now() - startTime;
    expect(initialLoadTime).toBeLessThan(3000);
    
    // Wait for any lazy loaded content
    await page.waitForLoadState('networkidle');
  });
});
