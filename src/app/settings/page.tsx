import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { LibraryLayout } from '@/components/layout/LibraryLayout'

/**
 * Settings Page
 *
 * The account record: three numbered panels — Account, Storage, Cache — set
 * as keyline entries in a register.
 */
export default function SettingsPage() {
  return (
    <ProtectedRoute>
      <LibraryLayout>
        <div className="p-6 max-w-3xl">
          <header className="section-head mb-8">
            <div className="section-head-meta">
              <span className="folio">04</span>
              <span className="section-head-rule" aria-hidden="true" />
              <h1 className="statement-title text-fg">Settings</h1>
            </div>
            <span className="section-head-annotation label hidden sm:block">
              Account &amp; custody
            </span>
          </header>

          <div className="border border-line divide-y divide-line bg-card">
            <section className="p-6">
              <p className="folio mb-3">01</p>
              <h2 className="statement-subtitle mb-2 text-fg">Account</h2>
              <p className="text-small text-fg-3 leading-relaxed max-w-[60ch]">
                Your account is connected via your Web3 wallet.
                Manage your wallet connection using the button in the header.
              </p>
            </section>

            <section className="p-6">
              <p className="folio mb-3">02</p>
              <h2 className="statement-subtitle mb-2 text-fg">Storage</h2>
              <p className="text-small text-fg-3 leading-relaxed max-w-[60ch]">
                Your videos are stored on IPFS and encrypted end-to-end.
                They are accessible only through your connected wallet.
              </p>
            </section>

            <section className="p-6">
              <p className="folio mb-3">03</p>
              <h2 className="statement-subtitle mb-2 text-fg">Cache</h2>
              <p className="text-small text-fg-3 leading-relaxed max-w-[60ch]">
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
