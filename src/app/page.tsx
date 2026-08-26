import Link from 'next/link'
import { ConnectButton } from '@/components/auth/ConnectButton'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { ArrowRight } from 'lucide-react'
import { UpcomingDrops } from '@/components/drops/UpcomingDrops'
import { Mark } from '@/components/mark/Mark'

/**
 * Landing Page — the front sheet of the Record.
 *
 * An institutional document, not a product page: statement headline with an
 * editorial clause, sealed actions, numbered feature register, and the
 * upcoming drops set as a plate. The four public networks run as a continuous
 * ledger strip beneath the fold.
 *
 * Two-column layout:
 * - Left: hero content with CTA and feature register
 * - Right: "Upcoming Video Drops" — embedded token-gated events widget
 *   filtered to Pepe ERC20 (0x6982508145454ce325ddbe47a25d4ec3d2311933)
 */
export default function LandingPage() {
  return (
    <div className="min-h-dvh bg-surface text-fg">
      {/* Masthead */}
      <nav className="masthead">
        <div className="mx-auto max-w-[1200px] px-6 h-16 flex items-center justify-between gap-6 safe-area-x">
          <div className="lockup min-w-0">
            <Mark size={20} />
            <span className="wordmark">Haven</span>
            <span className="lockup-rule hidden sm:block" aria-hidden="true" />
            <span className="lockup-descriptor hidden sm:grid">
              <span className="label">Sovereign Media</span>
              <span className="label text-fg-5 text-[0.625rem]">Protocol</span>
            </span>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <ThemeToggle />
            <ConnectButton />
          </div>
        </div>
      </nav>

      {/* Act I — the argument */}
      <main className="relative">
        <section className="act border-b border-line">
          <div className="mx-auto max-w-[1200px] px-6 pt-16 pb-14 md:pt-24 md:pb-20">
            <div className="flex flex-col lg:flex-row gap-12 lg:gap-16 items-start">

              {/* Left column — hero + feature register */}
              <div className="flex-1 min-w-0">
                <p className="seal-mark mb-8">
                  <span className="pip net-haven" aria-hidden="true" />
                  Decentralized Video Library
                </p>

                <h1 className="statement-display mb-7 [font-size:clamp(2.5rem,1rem+4.6vw,5.25rem)]">
                  Your Videos,{' '}
                  <em className="voice-editorial overprint">Decentralized</em>
                </h1>

                <p className="lede max-w-xl mb-10">
                  Access your encrypted video library from anywhere using your
                  Web3 wallet. No centralized servers. Just your content,
                  secured by blockchain.
                </p>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 mb-16">
                  <Link href="/library" className="action action-sealed group">
                    Open Library
                    <ArrowRight className="w-3.5 h-3.5 transition-transform duration-300 group-hover:translate-x-1" />
                  </Link>
                  <Link href="/publish" className="action action-keyline">
                    Publish a Drip
                  </Link>
                  <a
                    href="https://haven-hvn.github.io/docs/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="label link-rule self-center py-2 sm:py-0"
                  >
                    Learn More
                  </a>
                </div>

                {/* Feature register */}
                <div className="grid xs:grid-cols-3 gap-px bg-line border border-line crop-marks">
                  <FeatureCell
                    folio="01"
                    title="Encrypted Storage"
                    description="Your videos are encrypted end-to-end. Only your wallet can decrypt them."
                  />
                  <FeatureCell
                    folio="02"
                    title="Universal Access"
                    description="Stream your videos from IPFS anywhere in the world, on any device."
                  />
                  <FeatureCell
                    folio="03"
                    title="Own Your Data"
                    description="No accounts, no passwords. Your wallet is your identity and key."
                  />
                </div>
              </div>

              {/* Right column — Upcoming Video Drops (Events Widget) */}
              <div className="w-full lg:w-[400px] xl:w-[440px] shrink-0">
                <div className="lg:sticky lg:top-24 panel-double">
                  {/* Plate head */}
                  <div className="px-5 py-4 border-b border-line flex items-baseline gap-3">
                    <span className="folio">IV</span>
                    <div className="min-w-0 flex-1">
                      <h2 className="statement-subtitle text-fg">
                        Upcoming Video Drops
                      </h2>
                      <p className="label mt-2 text-fg-4 normal-case tracking-[0.04em] whitespace-normal">
                        Mint.club tokens launched via Haven drip (Arkiv L3)
                      </p>
                    </div>
                    <span className="pip net-haven self-center" aria-hidden="true" />
                  </div>

                  {/* Drip drops via Arkiv L3 */}
                  <div className="bg-surface-raised/60 p-3">
                    <UpcomingDrops />
                  </div>
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* Protocol ledger strip */}
        <section className="border-b border-line py-5 overflow-hidden" aria-hidden="true">
          <Marquee />
        </section>
      </main>

      {/* Colophon */}
      <footer className="border-line">
        <div className="mx-auto max-w-[1200px] px-6 py-10 safe-area-x">
          <div className="rule-engraved mb-8" aria-hidden="true" />
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="lockup">
              <Mark size={16} />
              <span className="wordmark text-small">Haven</span>
            </div>
            <div className="flex items-center gap-8">
              <a
                href="https://github.com/Haven-hvn"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Haven on GitHub"
                className="text-fg-4 hover:text-seal-text transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-5 h-5"
                >
                  <path d="M12 .297a12 12 0 0 0-3.794 23.39c.6.111.82-.261.82-.577v-2.02c-3.338.726-4.043-1.416-4.043-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.09-.745.083-.73.083-.73 1.205.085 1.84 1.237 1.84 1.237 1.07 1.834 2.807 1.304 3.492.997.108-.775.418-1.304.762-1.604-2.665-.303-5.467-1.333-5.467-5.932 0-1.311.469-2.382 1.236-3.221-.124-.304-.536-1.524.117-3.176 0 0 1.008-.323 3.3 1.23a11.47 11.47 0 0 1 6.006 0c2.291-1.553 3.297-1.23 3.297-1.23.655 1.652.243 2.872.12 3.176.77.839 1.235 1.91 1.235 3.221 0 4.61-2.807 5.625-5.48 5.921.43.372.814 1.102.814 2.222v3.293c0 .319.216.694.825.576A12.003 12.003 0 0 0 12 .297z" />
                </svg>
              </a>
              <a
                href="https://x.com/havenplay3r"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Haven on X"
                className="text-fg-4 hover:text-seal-text transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-5 h-5"
                >
                  <path d="M18.901 1H22.58l-8.04 9.19L24 23h-7.406l-5.8-7.584L4.15 23H.47l8.6-9.832L0 1h7.594l5.243 6.926L18.901 1zM17.61 20.8h2.04L6.48 3.09H4.29L17.61 20.8z" />
                </svg>
              </a>
            </div>
            <p className="label text-fg-5">
              Arkiv · ICP · EVM · Filecoin — no private backend
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}

/**
 * A numbered cell of the feature register. Hairline-divided, not carded.
 */
function FeatureCell({
  folio,
  title,
  description,
}: {
  folio: string
  title: string
  description: string
}) {
  return (
    <div className="group bg-surface p-5 transition-colors duration-300 hover:bg-seal-wash">
      <p className="folio mb-4">{folio}</p>
      <h3 className="statement-subtitle text-fg mb-2">{title}</h3>
      <p className="text-small leading-relaxed text-fg-3">{description}</p>
    </div>
  )
}

/**
 * The four public networks as a continuous ledger strip. Duplicated track,
 * translated exactly -50% — never shows a seam.
 */
const LEDGER_ENTRIES = [
  ['ARKIV', 'entity registry · 0x44…0044', 'net-arkiv'],
  ['ICP', 'vetkd gating · dciac-…qlzuq', 'net-icp'],
  ['EVM', 'holder gates · eip-712', 'net-evm'],
  ['FILECOIN', 'archival pin · ipfs cids', 'net-filecoin'],
] as const

function Marquee() {
  const entries = [...LEDGER_ENTRIES, ...LEDGER_ENTRIES]
  return (
    <div className="marquee">
      <div className="marquee-track">
        {entries.map(([name, detail, hue], i) => (
          <span
            key={i}
            className="flex items-baseline gap-3 px-8 whitespace-nowrap"
          >
            <span className={`net-dot ${hue}`} style={{ marginTop: '-2px' }} />
            <span className="label label-ink">{name}</span>
            <span className="label text-fg-5">{detail}</span>
            <span className="text-seal pl-6 select-none" aria-hidden="true">
              ·
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}
