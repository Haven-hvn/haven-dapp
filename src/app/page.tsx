import Link from 'next/link'
import { ConnectButton } from '@/components/auth/ConnectButton'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { ArrowRight, Shield, Video, Lock } from 'lucide-react'

/**
 * Landing Page
 * 
 * Minimalist dark-first design aligned with haven-player aesthetic.
 * Clean, focused, and aesthetically minimal.
 */
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white relative overflow-hidden">
      {/* Subtle gradient background */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0A0A0F] via-[#0d1117] to-[#0A0A0F]" />
      
      {/* Ambient glow effects */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#00F5FF]/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-[#FF00E5]/5 rounded-full blur-3xl pointer-events-none" />
      
      {/* Navigation */}
      <nav className="relative z-10 border-b border-white/[0.06] bg-[#0A0A0F]/50 backdrop-blur-xl sticky top-0">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Logo icon */}
            <img src="/favicon.ico" alt="Haven" className="w-8 h-8 rounded-lg" />
            <span className="text-lg font-semibold tracking-tight">Haven</span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <ConnectButton />
          </div>
        </div>
      </nav>
      
      {/* Hero */}
      <main className="relative z-10 max-w-5xl mx-auto px-6 py-24 md:py-32">
        <div className="text-center max-w-2xl mx-auto">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.04] border border-white/[0.08] text-sm text-[#00F5FF] mb-8">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00F5FF] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00F5FF]"></span>
            </span>
            Decentralized Video Library
          </div>
          
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6 leading-[1.1]">
            Your Videos,{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00F5FF] to-[#FF00E5]">
              Decentralized
            </span>
          </h1>
          
          <p className="text-lg md:text-xl text-white/60 mb-10 leading-relaxed max-w-xl mx-auto">
            Access your encrypted video library from anywhere using your Web3 wallet. 
            No centralized servers. Just your content, secured by blockchain.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/library"
              className="group inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-white text-[#0A0A0F] font-medium hover:bg-white/90 transition-all duration-300 hover:shadow-lg hover:shadow-white/10"
            >
              Open Library
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </Link>
            <a 
              href="https://github.com/haven-project" 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg border border-white/10 text-white/80 font-medium hover:bg-white/[0.04] hover:border-white/20 transition-all duration-300"
            >
              Learn More
            </a>
          </div>
        </div>
        
        {/* Features - Minimalist cards */}
        <div className="grid md:grid-cols-3 gap-4 mt-24">
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
      
      {/* Footer */}
      <footer className="relative z-10 border-t border-white/[0.06] py-8">
        <div className="max-w-5xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-white/40">
          <p>© 2026 Haven. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <a href="#" className="hover:text-white/60 transition-colors">Privacy</a>
            <a href="#" className="hover:text-white/60 transition-colors">Terms</a>
            <a href="#" className="hover:text-white/60 transition-colors">GitHub</a>
          </div>
        </div>
      </footer>
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
    <div className="group p-6 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:border-[#00F5FF]/30 hover:bg-white/[0.05] transition-all duration-300">
      <div className="w-10 h-10 rounded-lg bg-[#00F5FF]/10 flex items-center justify-center mb-4 group-hover:bg-[#00F5FF]/20 transition-colors">
        <Icon className="w-5 h-5 text-[#00F5FF]" />
      </div>
      <h3 className="text-base font-semibold mb-2 text-white/90">{title}</h3>
      <p className="text-sm text-white/50 leading-relaxed">{description}</p>
    </div>
  )
}
