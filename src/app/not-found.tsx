import Link from 'next/link'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-muted flex items-center justify-center">
          <Search className="w-10 h-10 text-muted-foreground" />
        </div>
        
        <h1 className="text-4xl font-bold mb-2">404</h1>
        <h2 className="text-xl font-medium mb-4">Page Not Found</h2>
        <p className="text-muted-foreground mb-6 max-w-sm">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        
        <Button asChild>
          <Link href="/library">
            Go to Library
          </Link>
        </Button>
      </div>
    </div>
  )
}
