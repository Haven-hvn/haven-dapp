"use client";

/**
 * Video Card Component
 * 
 * Displays a video thumbnail with metadata in a card format.
 * Includes encryption indicator, AI analysis indicator, and hover effects.
 * Uses next/image for optimized image loading.
 * 
 * @module components/library/VideoCard
 */

import Link from "next/link";
import Image from "next/image";
import { Lock, Sparkles } from "lucide-react";
import type { Video } from "@/types";
import { formatDuration, formatDate } from "@/lib/format";

interface VideoCardProps {
  /** Video data to display */
  video: Video;
}

/**
 * Video card component for grid view.
 * Displays video thumbnail with duration badge, encryption/AI indicators,
 * and video metadata.
 */
export function VideoCard({ video }: VideoCardProps) {
  const formattedDuration = formatDuration(video.duration);
  const formattedDate = formatDate(video.createdAt);

  return (
    <Link
      href={`/watch?v=${encodeURIComponent(video.id)}`}
      className="block group touch-manipulation"
    >
      <div className="relative rounded-lg overflow-hidden border bg-card hover:bg-accent/50 transition-colors">
        {/* Thumbnail */}
        <div className="aspect-video relative bg-muted">
          {video.thumbnailUrl ? (
            <Image
              src={video.thumbnailUrl}
              alt={video.title}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 25vw"
              className="object-cover"
              loading="lazy"
              placeholder="blur"
              blurDataURL="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxIDEiPjxyZWN0IHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiMzMzMiLz48L3N2Zz4="
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <VideoPlaceholder />
            </div>
          )}

          {/* Duration badge */}
          <div className="absolute bottom-2 right-2 px-2 py-1 text-xs font-medium bg-black/70 text-white rounded">
            {formattedDuration}
          </div>

          {/* Encryption indicator */}
          {video.isEncrypted && (
            <div
              className="absolute top-2 left-2 p-1.5 bg-black/70 rounded-full touch-manipulation"
              title="Encrypted"
            >
              <Lock className="w-4 h-4 text-white" />
            </div>
          )}

          {/* AI indicator */}
          {video.hasAiData && (
            <div
              className="absolute top-2 right-2 p-1.5 bg-purple-500/80 rounded-full touch-manipulation"
              title="AI Analysis Available"
            >
              <Sparkles className="w-4 h-4 text-white" />
            </div>
          )}

          {/* Hover overlay with play button */}
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm">
              <PlayIcon className="w-6 h-6 text-white ml-1" />
            </div>
          </div>
        </div>

        {/* Info */}
        <div className="p-2 sm:p-3">
          <h3
            className="font-medium line-clamp-2 text-sm sm:text-base"
            title={video.title}
          >
            {video.title}
          </h3>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            {formattedDate}
          </p>
        </div>
      </div>
    </Link>
  );
}

/**
 * Placeholder icon for videos without thumbnails.
 */
function VideoPlaceholder() {
  return (
    <svg
      className="w-12 h-12 text-muted-foreground/50"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <rect width="18" height="12" x="3" y="6" rx="2" />
      <path d="m9 12 4-2v4l-4-2Z" />
    </svg>
  );
}

/**
 * Play button icon for hover state.
 */
function PlayIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="m8 5 14 7-14 7V5Z" />
    </svg>
  );
}
