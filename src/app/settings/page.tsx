import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { LibraryLayout } from '@/components/layout/LibraryLayout'

export default function SettingsPage() {
  return (
    <ProtectedRoute>
      <LibraryLayout>
        <div className="p-6 max-w-2xl">
          <h1 className="text-2xl font-bold mb-6">Settings</h1>
          
          <div className="space-y-6">
            <section className="p-6 bg-card rounded-lg border">
              <h2 className="text-lg font-semibold mb-4">Account</h2>
              <p className="text-muted-foreground">
                Your account is connected via your Web3 wallet. 
                Manage your wallet connection using the button in the header.
              </p>
            </section>
            
            <section className="p-6 bg-card rounded-lg border">
              <h2 className="text-lg font-semibold mb-4">Storage</h2>
              <p className="text-muted-foreground">
                Your videos are stored on IPFS and encrypted with Lit Protocol.
              </p>
            </section>
          </div>
        </div>
      </LibraryLayout>
    </ProtectedRoute>
  )
}
