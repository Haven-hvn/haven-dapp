'use client'

/**
 * Library Query State Hook
 *
 * Syncs library UI state (search query, filters, pagination, view mode,
 * sorting) to URL search params. This makes filtered library views
 * shareable, bookmarkable, and restores correctly on refresh / back navigation.
 *
 * Design:
 *  - Single source of truth is the URL (via useSearchParams).
 *  - Setters use router.replace (no history bloat, no scroll jump).
 *  - Page resets to 1 whenever query/filters/sort change.
 *  - Supports static export (`output: "export"`) — all logic is client-side.
 *  - No Suspense required in the hook itself; caller must wrap in Suspense
 *    per Next.js `useSearchParams` contract.
 *
 * Query param schema:
 *  - q         search string (default: "")
 *  - encrypted 1 if VideoFilters.encrypted === true
 *  - ai        1 if VideoFilters.hasAiData === true
 *  - view      grid | list (default: grid)
 *  - page      1-based integer (default: 1)
 *  - sort      date | title | duration | createdAt (default: date)
 *  - order     asc | desc (default: desc)
 *
 * @module hooks/useLibraryQueryState
 */

import { useCallback, useMemo } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import type { VideoFilters, ViewMode } from '@/types'
import type { VideoSortField, SortOrder } from '@/hooks/useVideoSearch'

export interface LibraryQueryState {
  searchQuery: string
  filters: VideoFilters
  viewMode: ViewMode
  page: number
  sortBy: VideoSortField
  sortOrder: SortOrder
}

export interface LibraryQueryActions {
  setSearchQuery: (value: string) => void
  setFilters: (filters: VideoFilters) => void
  setViewMode: (mode: ViewMode) => void
  setPage: (page: number) => void
  setSortBy: (field: VideoSortField) => void
  setSortOrder: (order: SortOrder) => void
  clearAll: () => void
}

const VALID_VIEWS: ViewMode[] = ['grid', 'list']
const VALID_SORTS: VideoSortField[] = ['date', 'title', 'duration', 'createdAt']
const VALID_ORDERS: SortOrder[] = ['asc', 'desc']

function parsePage(raw: string | null): number {
  if (!raw) return 1
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n) || n < 1) return 1
  return n
}

export function useLibraryQueryState(): LibraryQueryState & LibraryQueryActions {
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()

  const state = useMemo<LibraryQueryState>(() => {
    const q = searchParams.get('q') ?? ''
    const encrypted = searchParams.get('encrypted')
    const ai = searchParams.get('ai')
    const viewRaw = searchParams.get('view')
    const sortRaw = searchParams.get('sort')
    const orderRaw = searchParams.get('order')

    const filters: VideoFilters = {}
    if (encrypted === '1') filters.encrypted = true
    if (ai === '1') filters.hasAiData = true

    const viewMode: ViewMode =
      viewRaw && (VALID_VIEWS as string[]).includes(viewRaw) ? (viewRaw as ViewMode) : 'grid'

    const sortBy: VideoSortField =
      sortRaw && (VALID_SORTS as string[]).includes(sortRaw) ? (sortRaw as VideoSortField) : 'date'

    const sortOrder: SortOrder =
      orderRaw && (VALID_ORDERS as string[]).includes(orderRaw) ? (orderRaw as SortOrder) : 'desc'

    return {
      searchQuery: q,
      filters,
      viewMode,
      page: parsePage(searchParams.get('page')),
      sortBy,
      sortOrder,
    }
  }, [searchParams])

  const replaceParams = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const next = new URLSearchParams(searchParams.toString())
      mutate(next)
      const qs = next.toString()
      const url = qs ? `${pathname}?${qs}` : pathname
      router.replace(url, { scroll: false })
    },
    [searchParams, pathname, router]
  )

  const setSearchQuery = useCallback(
    (value: string) => {
      replaceParams((params) => {
        if (value) params.set('q', value)
        else params.delete('q')
        params.delete('page')
      })
    },
    [replaceParams]
  )

  const setFilters = useCallback(
    (filters: VideoFilters) => {
      replaceParams((params) => {
        if (filters.encrypted) params.set('encrypted', '1')
        else params.delete('encrypted')
        if (filters.hasAiData) params.set('ai', '1')
        else params.delete('ai')
        params.delete('page')
      })
    },
    [replaceParams]
  )

  const setViewMode = useCallback(
    (mode: ViewMode) => {
      replaceParams((params) => {
        if (mode === 'grid') params.delete('view')
        else params.set('view', mode)
      })
    },
    [replaceParams]
  )

  const setPage = useCallback(
    (page: number) => {
      replaceParams((params) => {
        if (page <= 1) params.delete('page')
        else params.set('page', String(page))
      })
    },
    [replaceParams]
  )

  const setSortBy = useCallback(
    (field: VideoSortField) => {
      replaceParams((params) => {
        if (field === 'date') params.delete('sort')
        else params.set('sort', field)
        params.delete('page')
      })
    },
    [replaceParams]
  )

  const setSortOrder = useCallback(
    (order: SortOrder) => {
      replaceParams((params) => {
        if (order === 'desc') params.delete('order')
        else params.set('order', order)
        params.delete('page')
      })
    },
    [replaceParams]
  )

  const clearAll = useCallback(() => {
    router.replace(pathname, { scroll: false })
  }, [router, pathname])

  return {
    ...state,
    setSearchQuery,
    setFilters,
    setViewMode,
    setPage,
    setSortBy,
    setSortOrder,
    clearAll,
  }
}
