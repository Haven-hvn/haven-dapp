import Link from 'next/link'
import { ConnectButton } from '@/components/auth/ConnectButton'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { ArrowRight, Shield, Video, Lock, Calendar } from 'lucide-react'
import { TokenGatedEventsEmbed } from '@/components/events/TokenGatedEventsEmbed'

/**
 * Landing Page
 * 
 * Two-column layout:
 * - Left: Hero content with CTA and feature cards
 * - Right: "Upcoming Video Drops" — embedded token-gated events widget
 *   filtered to Pepe ERC20 (0x6982508145454ce325ddbe47a25d4ec3d2311933)
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
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/favicon.ico" alt="Haven" className="w-8 h-8 rounded-lg" />
            <span className="text-lg font-semibold tracking-tight">Haven</span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <ConnectButton />
          </div>
        </div>
      </nav>
      
      {/* Main Content — Two Column Layout */}
      <main className="relative z-10 max-w-7xl mx-auto px-6 py-16 md:py-24">
        <div className="flex flex-col lg:flex-row gap-12 lg:gap-16 items-start">
          
          {/* Left Column — Hero + Features */}
          <div className="flex-1 min-w-0">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.04] border border-white/[0.08] text-sm text-[#00F5FF] mb-8">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00F5FF] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00F5FF]"></span>
              </span>
              Decentralized Video Library
            </div>
            
            <h1 className="text-4xl md:text-5xl lg:text-5xl font-bold tracking-tight mb-6 leading-[1.1]">
              Your Videos,{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00F5FF] to-[#FF00E5]">
                Decentralized
              </span>
            </h1>
            
            <p className="text-lg text-white/60 mb-10 leading-relaxed max-w-xl">
              Access your encrypted video library from anywhere using your Web3 wallet. 
              No centralized servers. Just your content, secured by blockchain.
            </p>
            
            <div className="flex flex-col sm:flex-row items-start gap-4 mb-16">
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
            
            {/* Features - Minimalist cards */}
            <div className="grid sm:grid-cols-3 gap-4">
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
          </div>
          
          {/* Right Column — Upcoming Video Drops (Events Widget) */}
          <div className="w-full lg:w-[400px] xl:w-[440px] flex-shrink-0">
            <div className="sticky top-24 rounded-2xl bg-white/[0.03] border border-white/[0.06] overflow-hidden">
              {/* Widget Header */}
              <div className="px-5 py-4 border-b border-white/[0.06] flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-[#FF00E5]/10 flex items-center justify-center">
                  <Calendar className="w-4.5 h-4.5 text-[#FF00E5]" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-white/90">Upcoming Video Drops</h2>
                  <p className="text-xs text-white/40">Token-gated events for PEPE holders</p>
                </div>
                <div className="ml-auto">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FF00E5] opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-[#FF00E5]"></span>
                  </span>
                </div>
              </div>
              
              {/* Embedded Events Widget */}
              <div className="p-1">
                <TokenGatedEventsEmbed
                  filterContract="0x6982508145454ce325ddbe47a25d4ec3d2311933"
                  filterChain="ethereum"
                  theme="dark"
                  compact={true}
                />
              </div>
            </div>
          </div>
          
        </div>
      </main>
      
      {/* Footer */}
      <footer className="relative z-10 border-t border-white/[0.06] py-8">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-white/40">
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
    <div className="group p-5 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:border-[#00F5FF]/30 hover:bg-white/[0.05] transition-all duration-300">
      <div className="w-10 h-10 rounded-lg bg-[#00F5FF]/10 flex items-center justify-center mb-4 group-hover:bg-[#00F5FF]/20 transition-colors">
        <Icon className="w-5 h-5 text-[#00F5FF]" />
      </div>
      <h3 className="text-base font-semibold mb-2 text-white/90">{title}</h3>
      <p className="text-sm text-white/50 leading-relaxed">{description}</p>
    </div>
  )
}