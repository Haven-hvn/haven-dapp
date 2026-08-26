import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-surface text-fg">
      <div className="text-center crop-marks p-10 max-w-md">
        <p className="folio mb-6">404</p>
        <h1 className="statement-headline [font-size:clamp(2rem,1.2rem+3vw,3.5rem)] mb-4">
          Page <em className="voice-editorial overprint">not found</em>
        </h1>
        <p className="lede mb-8 max-w-sm mx-auto">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Button asChild size="lg">
          <Link href="/library">Go to Library</Link>
        </Button>
      </div>
    </div>
  )
}
