import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { LibraryLayout } from '@/components/layout/LibraryLayout'

/**
 * Settings Page
 * 
 * User settings and preferences. Minimalist design aligned with
 * the Liquid Glass aesthetic.
 */
export default function SettingsPage() {
  return (
    <ProtectedRoute>
      <LibraryLayout>
        <div className="p-6 max-w-2xl">
          <div className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight text-white/90">Settings</h1>
            <p className="text-sm text-white/50 mt-1">Manage your preferences and account</p>
          </div>
          
          <div className="space-y-4">
            <section className="p-6 bg-white/[0.03] rounded-xl border border-white/[0.06] hover:border-white/[0.08] transition-colors">
              <h2 className="text-base font-semibold mb-2 text-white/90">Account</h2>
              <p className="text-sm text-white/50 leading-relaxed">
                Your account is connected via your Web3 wallet. 
                Manage your wallet connection using the button in the header.
              </p>
            </section>
            
            <section className="p-6 bg-white/[0.03] rounded-xl border border-white/[0.06] hover:border-white/[0.08] transition-colors">
              <h2 className="text-base font-semibold mb-2 text-white/90">Storage</h2>
              <p className="text-sm text-white/50 leading-relaxed">
                Your videos are stored on IPFS and encrypted with Lit Protocol.
                They are accessible only through your connected wallet.
              </p>
            </section>

            <section className="p-6 bg-white/[0.03] rounded-xl border border-white/[0.06] hover:border-white/[0.08] transition-colors">
              <h2 className="text-base font-semibold mb-2 text-white/90">Cache</h2>
              <p className="text-sm text-white/50 leading-relaxed">
                Videos are cached locally for instant playback. 
                Cache is automatically managed and encrypted.
              </p>
            </section>
          </div>
        </div>
      </LibraryLayout>
    </ProtectedRoute>
  )
}
