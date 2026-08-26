'use client'

import { Suspense } from 'react'
import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function AuthCallbackContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    // Handle any callback parameters if needed
    const redirect = searchParams.get('redirect')
    
    // Redirect to library or specified redirect path
    if (redirect) {
      router.push(redirect)
    } else {
      router.push('/library')
    }
  }, [router, searchParams])

  return (
    <div className="flex h-screen items-center justify-center bg-surface">
      <div className="text-center flex items-center gap-4">
        <span className="pip net-haven w-2.5 h-2.5" aria-hidden="true" />
        <p className="label">Completing authentication</p>
      </div>
    </div>
  )
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          <span className="pip net-haven w-2.5 h-2.5" aria-hidden="true" />
          <p className="label">Loading</p>
        </div>
      </div>
    }>
      <AuthCallbackContent />
    </Suspense>
  )
}
