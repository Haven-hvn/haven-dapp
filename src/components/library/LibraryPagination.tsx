'use client'

/**
 * Numbered page navigation for the video library (1, 2, 3 …).
 *
 * @module components/library/LibraryPagination
 */

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getVisiblePageTokens, type PageToken } from '@/lib/pagination'
import { cn } from '@/lib/utils'

export interface LibraryPaginationProps {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
  className?: string
}

export function LibraryPagination({
  currentPage,
  totalPages,
  onPageChange,
  className,
}: LibraryPaginationProps) {
  if (totalPages <= 1) {
    return null
  }

  const tokens = getVisiblePageTokens(currentPage, totalPages)

  return (
    <nav
      className={cn('flex items-center justify-center gap-1', className)}
      aria-label="Library pagination"
    >
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-9 w-9 shrink-0"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
        aria-label="Previous page"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <PageNumberButtons
        tokens={tokens}
        currentPage={currentPage}
        onPageChange={onPageChange}
      />

      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-9 w-9 shrink-0"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
        aria-label="Next page"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </nav>
  )
}

function PageNumberButtons({
  tokens,
  currentPage,
  onPageChange,
}: {
  tokens: PageToken[]
  currentPage: number
  onPageChange: (page: number) => void
}) {
  return (
    <div className="flex items-center gap-1">
      {tokens.map((token, index) =>
        token === 'ellipsis' ? (
          <span
            key={`ellipsis-${index}`}
            className="px-2 text-sm text-muted-foreground select-none"
            aria-hidden
          >
            …
          </span>
        ) : (
          <Button
            key={token}
            type="button"
            variant={token === currentPage ? 'secondary' : 'outline'}
            size="sm"
            className="min-w-9 h-9 px-3"
            onClick={() => onPageChange(token)}
            aria-label={`Page ${token}`}
            aria-current={token === currentPage ? 'page' : undefined}
          >
            {token}
          </Button>
        )
      )}
    </div>
  )
}
