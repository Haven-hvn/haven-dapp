import Link from 'next/link'
import { ConnectButton } from '@/components/auth/ConnectButton'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { ArrowRight, Shield, Video, Lock } from 'lucide-react'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted">
      {/* Navigation */}
      <nav className="border-b bg-background/50 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-gradient-to-br from-blue-500 to-purple-600" />
            <span className="text-xl font-bold">Haven</span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <ConnectButton />
          </div>
        </div>
      </nav>
      
      {/* Hero */}
      <main className="max-w-7xl mx-auto px-4 py-20">
        <div className="text-center max-w-3xl mx-auto">
          <h1 className="text-5xl font-bold tracking-tight mb-6">
            Your Videos, <span className="text-primary">Decentralized</span>
          </h1>
          <p className="text-xl text-muted-foreground mb-8">
            Access your encrypted video library from anywhere using your Web3 wallet.
            No centralized servers. No data harvesting. Just your content, secured by blockchain.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link
              href="/library"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
            >
              Open Library
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
        
        {/* Features */}
        <div className="grid md:grid-cols-3 gap-8 mt-20">
          <FeatureCard
            icon={Lock}
            title="Encrypted Storage"
            description="Your videos are encrypted using Lit Protocol. Only your wallet can decrypt them."
          />
          <FeatureCard
            icon={Video}
            title="Universal Access"
            description="Stream your videos from IPFS anywhere in the world, on any device."
          />
          <FeatureCard
            icon={Shield}
            title="Own Your Data"
            description="No accounts, no passwords. Your wallet is your identity and key."
          />
        </div>
      </main>
    </div>
  )
}

function FeatureCard({ 
  icon: Icon, 
  title, 
  description 
}: { 
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string 
}) {
  return (
    <div className="p-6 rounded-xl bg-card border hover:border-primary/50 transition-colors">
      <Icon className="w-10 h-10 text-primary mb-4" />
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-muted-foreground">{description}</p>
    </div>
  )
}
