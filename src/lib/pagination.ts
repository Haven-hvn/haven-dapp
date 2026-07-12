/**
 * Client-side pagination helpers.
 *
 * @module lib/pagination
 */

export const LIBRARY_PAGE_SIZE = 10

export type PageToken = number | 'ellipsis'

/**
 * Total number of pages for `itemCount` items at `pageSize` per page.
 */
export function getPageCount(itemCount: number, pageSize: number): number {
  if (pageSize <= 0) {
    return 1
  }
  return Math.max(1, Math.ceil(itemCount / pageSize))
}

/**
 * Clamp page into [1, pageCount].
 */
export function clampPage(page: number, pageCount: number): number {
  if (pageCount <= 0) {
    return 1
  }
  return Math.min(Math.max(1, page), pageCount)
}

/**
 * Slice items for a 1-based page index.
 */
export function slicePage<T>(items: T[], page: number, pageSize: number): T[] {
  const pageCount = getPageCount(items.length, pageSize)
  const safePage = clampPage(page, pageCount)
  const start = (safePage - 1) * pageSize
  return items.slice(start, start + pageSize)
}

/**
 * Inclusive display range for UI copy (e.g. "Showing 11–20 of 45").
 */
export function getPageItemRange(
  itemCount: number,
  page: number,
  pageSize: number
): { start: number; end: number } {
  if (itemCount === 0) {
    return { start: 0, end: 0 }
  }
  const pageCount = getPageCount(itemCount, pageSize)
  const safePage = clampPage(page, pageCount)
  const start = (safePage - 1) * pageSize + 1
  const end = Math.min(safePage * pageSize, itemCount)
  return { start, end }
}

/**
 * Page numbers to render (e.g. 1 … 4 5 6 … 12).
 */
export function getVisiblePageTokens(
  currentPage: number,
  totalPages: number
): PageToken[] {
  if (totalPages <= 1) {
    return totalPages === 1 ? [1] : []
  }

  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }

  const pages = new Set<number>([
    1,
    totalPages,
    currentPage,
    currentPage - 1,
    currentPage + 1,
  ])

  const sorted = [...pages]
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b)

  const tokens: PageToken[] = []
  let previous = 0

  for (const page of sorted) {
    if (previous > 0 && page - previous > 1) {
      tokens.push('ellipsis')
    }
    tokens.push(page)
    previous = page
  }

  return tokens
}
