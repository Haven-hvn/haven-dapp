"use client";

import ContextProvider from "@/context";
import { HavenAolProvider } from "@/components/providers/HavenAolProvider";
import { Header } from "@/components/layout/Header";
import Link from "next/link";
import { UpcomingDrops } from "@/components/drops/UpcomingDrops";
import { Mark } from "@/components/mark/Mark";
import { Check, Play } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

/*
 * Landing — taste-skill direction "product-performs" (seed 7h8x-3k46-dqz8-nznp).
 * Idea: Haven's own live drops feed becomes the working fragment the page is
 * built around; the features prove their claims with cropped pieces of the
 * product's real interface.
 * Type: League Spartan (display) + Figtree (text). Palette: Haven's ember on
 * a low-chroma bone ground (dealt proportions, subject's colours).
 */

const FEATURES = [
  {
    id: "encrypt",
    title: "Encrypted, end to end",
    paragraphs: [
      "Every video is sealed before it leaves your device. Haven-AOL derives the gate key inside an ICP VetKD enclave, and only your wallet's signature can release it.",
      "Not even Haven can read your library.",
    ],
    fragment: (
      <div className="lp-frag-video" data-testid="fragment-decrypt">
        <div className="lp-frag-thumb" aria-hidden="true">
          <span className="lp-frag-lock">E2E</span>
        </div>
        <div className="lp-frag-body">
          <p className="lp-frag-title">POLYCAT — Genesis Drop</p>
          <p className="lp-frag-meta">
            bafybeigdyrztg…q6a · 412 MB · sealed
          </p>
          <button type="button" className="lp-frag-action lp-frag-action-accent">
            Decrypt with wallet
          </button>
        </div>
      </div>
    ),
  },
  {
    id: "stream",
    title: "Streams from anywhere",
    paragraphs: [
      "Videos live on IPFS, pinned by Filecoin deals, and gate on EVM contracts. The player streams pieces as they arrive and caches them locally.",
      "Open the same library on desktop, phone, or a fresh browser — the network is the backend.",
    ],
    fragment: (
      <div className="lp-frag-player" data-testid="fragment-stream">
        <div className="lp-frag-player-bar">
          <span className="lp-frag-dot" aria-hidden="true" />
          <span className="lp-frag-play" aria-hidden="true"><Play className="lp-frag-ic" strokeWidth={2.2} /></span>
          <div className="lp-frag-progress" aria-hidden="true">
            <div className="lp-frag-progress-fill" />
          </div>
          <span className="lp-frag-time">18:04</span>
        </div>
        <div className="lp-frag-player-meta">
          <p className="lp-frag-title">Neon Nights — Act II</p>
          <p className="lp-frag-meta">
            streaming · ipfs://bafy…k3m · gate 4 · base
          </p>
        </div>
      </div>
    ),
  },
  {
    id: "identity",
    title: "You are the account",
    paragraphs: [
      "No email, no password, no profile. Connect a wallet and Haven mints your access from an EIP-712 signature.",
      "Publish a drip and its gate tokens launch on a mint.club bonding curve — holders stream, everyone else waits.",
    ],
    fragment: (
      <div className="lp-frag-id" data-testid="fragment-identity">
        <div className="lp-frag-id-row">
          <span className="lp-frag-avatar" aria-hidden="true">0x</span>
          <div>
            <p className="lp-frag-title">0x44f2…0044</p>
            <p className="lp-frag-meta">entity registry · Arkiv L3</p>
          </div>
          <span className="lp-frag-check" aria-hidden="true"><Check className="lp-frag-ic" strokeWidth={2.6} /></span>
        </div>
        <div className="lp-frag-id-gate">
          <p className="lp-frag-meta">EIP-712 holder gate</p>
          <p className="lp-frag-state">verified · no account created</p>
        </div>
      </div>
    ),
  },
];

export default function LandingPage() {
  const pathname = usePathname();

  /*
   * The landing runs with html.lp-page (landing-scoped CSS hooks). Because
   * Next.js client navigation does not re-run inline scripts, the classes
   * are managed by this effect: added when the landing is mounted, removed
   * on unmount so they never leak onto app routes.
   */
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("lp-js", "lp-page");
    return () => {
      root.classList.remove("lp-js", "lp-page");
    };
  }, []);

  /* Scroll reveals — re-observed on every pathname change so navigating
     back to the landing re-arms them for the freshly mounted elements. */
  useEffect(() => {
    if (pathname !== "/") return;
    if (!("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("lp-in");
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.15 },
    );
    document.querySelectorAll(".lp-reveal").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [pathname]);

  return (
    <ContextProvider>
      <HavenAolProvider>
        <Header />
        <main id="main" className="lp">
          {/* ── Hero: the claim, and the product performing it ─────────── */}
          <section className="lp-hero">
            <div className="lp-container">
              <div className="lp-hero-grid">
                <div className="lp-hero-copy">
                  <h1 className="lp-h1">Your videos, on your keys.</h1>
                  <p className="lp-lede">
                    Haven stores your videos sealed across IPFS and Filecoin.
                    Your wallet is the only key — no accounts, no servers, no
                    platform between you and your library.
                  </p>
                  <div className="lp-actions">
                    <Link href="/library" className="lp-btn lp-btn-primary">
                      Open Library
                    </Link>
                    <Link href="/publish" className="lp-btn lp-btn-ghost">
                      Publish a Drip
                    </Link>
                  </div>
                </div>
                <div className="lp-hero-frag" data-ui aria-label="Live upcoming drops from the Haven network">
                  <div className="lp-frag-head">
                    <span className="lp-frag-live" aria-hidden="true" />
                    Live drops
                    <span className="lp-frag-head-meta">Arkiv L3 · gate 4</span>
                  </div>
                  <UpcomingDrops />
                </div>
              </div>
            </div>
          </section>

          {/* ── Features: each claim proved by a piece of the product ──── */}
          <section className="lp-features" aria-labelledby="lp-features-title">
            <div className="lp-container">
              <h2 id="lp-features-title" className="lp-h2">
                What Haven does
              </h2>
              <div className="lp-feature-list">
                {FEATURES.map((f) => (
                  <article key={f.id} className="lp-feature">
                    <div className="lp-feature-frag lp-reveal" data-ui aria-label={`${f.title} interface fragment`}>
                      {f.fragment}
                    </div>
                    <div className="lp-feature-copy lp-reveal">
                      <h3 className="lp-h3">{f.title}</h3>
                      {f.paragraphs.map((p, i) => (
                        <p key={i} className="lp-body">
                          {p}
                        </p>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>

          {/* ── CTA: the plain offer ────────────────────────────────────── */}
          <section className="lp-cta" aria-labelledby="lp-cta-title">
            <div className="lp-container">
              <p className="lp-statement">Publish your first drip.</p>
              <p className="lp-cta-sub">
                Gate it with any ERC-20, mint it on a bonding curve, and keep
                every key. Your library opens with the wallet you already own.
              </p>
              <div className="lp-actions lp-actions-center">
                <Link href="/publish" className="lp-btn lp-btn-primary">
                  Publish a Drip
                </Link>
                <Link href="/settings" className="lp-btn lp-btn-ghost">
                  Connect a Wallet
                </Link>
              </div>
            </div>
          </section>
        </main>
        <footer className="lp-footer">
          <div className="lp-container lp-footer-grid">
            <div className="lp-footer-brand">
              <span className="lp-footer-mark" aria-hidden="true">
                <Mark size={22} />
              </span>
              <p className="lp-body">
                Haven is a sovereign video library. No accounts, no servers,
                no platform. Your keys.
              </p>
            </div>
            <nav className="lp-footer-nav" aria-label="Site">
              <Link href="/library">Library</Link>
              <Link href="/publish">Publish</Link>
              <Link href="/community">Community</Link>
              <Link href="/settings">Settings</Link>
              <a href="https://github.com/Haven-hvn/haven-dapp">GitHub</a>
            </nav>
            <div className="lp-footer-proto">
              <p className="lp-footer-line">Arkiv · ICP · EVM · Filecoin</p>
              <p className="lp-footer-line">no private backend</p>
            </div>
          </div>
        </footer>
      </HavenAolProvider>
    </ContextProvider>
  );
}
