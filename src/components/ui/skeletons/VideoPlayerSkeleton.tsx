import { Skeleton } from '@/components/ui/skeleton'

export function VideoPlayerSkeleton() {
  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="h-16 border-b flex items-center px-4">
        <Skeleton className="h-4 w-32" />
      </div>
      
      {/* Video area */}
      <div className="flex-1 flex items-center justify-center">
        <Skeleton className="w-full max-w-4xl aspect-video" />
      </div>
      
      {/* Info */}
      <div className="p-4 border-t space-y-2">
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-4 w-1/4" />
      </div>
    </div>
  )
}

export function VideoInfoSkeleton() {
  return (
    <div className="space-y-4 p-4">
      <Skeleton className="h-8 w-2/3" />
      <div className="flex gap-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-28" />
      </div>
      <Skeleton className="h-20 w-full" />
    </div>
  )
}
