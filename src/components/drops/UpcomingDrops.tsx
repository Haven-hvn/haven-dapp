'use client'
import { useEffect, useState } from 'react'
import { normalizeCid } from '@/lib/ipfs'
import { createArkivClient, parseEntityPayload } from '@/lib/arkiv'
import { parseDripInfo, type DripSeriesMeta } from '@/lib/parse-arkiv-video'
import { toNetworkKey } from '@/lib/gate-chains'
import { formatUsdCompact } from '@/lib/v4/drip-plan'

interface DropItem {
  id: string
  title: string
  gateToken: string
  gateChain: string
  marketCapTargetUsd: number
  dripIndex: number
  dripTotal: number
  dripId: string
  thumbnailUrl?: string
  creatorHandle?: string
}

const DEMO_DROPS: DropItem[] = [
  { id: 'demo-1', title: 'POLYCAT — Genesis Drop', gateToken: '0x1111111111111111111111111111111111111111', gateChain: 'polygon', marketCapTargetUsd: 1_000_000, dripIndex: 0, dripTotal: 3, dripId: 'demo-polycat', creatorHandle: 'polycat' },
  { id: 'demo-2', title: 'Neon Nights — Act II', gateToken: '0x2222222222222222222222222222222222222222', gateChain: 'base', marketCapTargetUsd: 5_000_000, dripIndex: 1, dripTotal: 3, dripId: 'demo-neon', creatorHandle: 'haven' },
  { id: 'demo-3', title: 'Midnight Archive', gateToken: '0x3333333333333333333333333333333333333333', gateChain: 'base', marketCapTargetUsd: 10_000_000, dripIndex: 2, dripTotal: 3, dripId: 'demo-midnight', creatorHandle: 'haven' },
]

function mintClubUrl(item: DropItem): string {
  const chain = item.gateChain?.toLowerCase() || 'base'
  // Use token address form; for known demo symbol use polygon/POLYCAT
  if (item.id === 'demo-1') return 'https://mint.club/token/polygon/POLYCAT'
  return `https://mint.club/token/${chain}/${item.gateToken}`
}

function trustwalletLogo(gateToken: string, chain: string): string {
  return `https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/${chain}/assets/${gateToken}/logo.png`
}
function ipfsToHttp(u?: string): string | null {
  if (!u) return null
  if (u.startsWith('ipfs://')) return `https://ipfs.io/ipfs/${normalizeCid(u)}`
  if (u.startsWith('ipfs/')) return `https://ipfs.io/${u.replace(/^ipfs\//,'')}`
  return u
}

function TokenLogo({ item }: { item: DropItem }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    async function resolve() {
      // For POLYCAT demo use SDK to get real IPFS logo — works even if not on TrustWallet
      if (item.id === 'demo-1') {
        try {
          const { mintclub } = await import('@mint.club/v2-sdk')
          const h = mintclub.network('polygon' as any).token('POLYCAT')
          // try metadata logo first
          let logo: string | null = null
          try {
            const md: any = await (h as any).getMetadata?.() ?? await (h as any).getTokenMetadata?.()
            logo = md?.logo ?? md?.image ?? md?.properties?.image ?? null
          } catch {}
          const http = ipfsToHttp(logo ?? undefined)
          if (http && !cancelled) { setSrc(http); return }
          // fallback: real address -> trustwallet cdn
          try { const addr = await h.getTokenAddress(); if (addr && !cancelled) { setSrc(trustwalletLogo(addr, 'polygon')); return } } catch {}
        } catch {}
      }
      if (!cancelled) setSrc(trustwalletLogo(item.gateToken, (item.gateChain || 'base').toLowerCase()))
    }
    resolve()
    return () => { cancelled = true }
  }, [item.gateToken, item.gateChain, item.id])
  if (!src) return <div className="w-full h-full bg-line animate-pulse" />
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className="w-full h-full object-cover"
      onError={(e) => {
        const img = e.currentTarget as HTMLImageElement
        // fallback to initials blockie instead of hiding
        img.style.display = 'none'
        const fallback = img.nextElementSibling as HTMLElement | null
        if (fallback) fallback.style.display = 'flex'
      }}
    />
  )
}

export function UpcomingDrops() {
  const [drops, setDrops] = useState<DropItem[] | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const client = createArkivClient()
        // Query v4 drip PART entities (attributes only — never select payload
        // for list rows) and join each distinct drip_id to its series header
        // once for title/total/token/chain.
        //
        // NOTE: single-equality queries + client-side `grp` filtering — the
        // pinned SDK (0.7.0) predates the AND/STARTSWITH/tagged-literal
        // dialect documented in the spec cookbook.
        const result: any = await (client as any).query(
          'gate_type = 4',
          { resultsPerPage: 24, includeData: { payload: false, attributes: true, metadata: true } }
        )
        const entities: any[] = (result?.entities ?? []).filter((e: any) =>
          (e.attributes ?? []).some(
            (a: any) => a.key === 'grp' && a.value === 'haven.video.drip.part'
          )
        )
        if (entities.length === 0) throw new Error('no drips')
        const parts = entities.map((e: any) => {
          const attrs: Record<string, unknown> = {}
          for (const a of (e.attributes ?? [])) attrs[a.key] = a.value
          return { key: String(e.key), attrs }
        })
        // One series fetch per distinct drip_id.
        const dripIds = [...new Set(parts.map((p) => String(p.attrs.drip_id ?? '')))].filter(Boolean)
        const seriesById = new Map<string, DripSeriesMeta & { creator?: string }>()
        await Promise.all(
          dripIds.map(async (dripId) => {
            try {
              const s: any = await (client as any).query(`drip_id = "${dripId}"`, {
                resultsPerPage: 5,
                includeData: { payload: true, attributes: true, metadata: false },
              })
              const se = (s?.entities ?? []).find((e: any) =>
                (e.attributes ?? []).some(
                  (a: any) => a.key === 'grp' && a.value === 'haven.video.drip.series'
                )
              )
              if (!se) return
              const sattrs: Record<string, unknown> = {}
              for (const a of (se.attributes ?? [])) sattrs[a.key] = a.value
              let spayload: Record<string, unknown> = {}
              try {
                if (typeof se.payload === 'string') spayload = parseEntityPayload<Record<string, unknown>>(se.payload) ?? {}
                else if (se.payload instanceof Uint8Array) spayload = JSON.parse(Buffer.from(se.payload).toString('utf-8') || '{}')
              } catch {}
              seriesById.set(dripId, {
                title: String(sattrs.title ?? ''),
                dripTotal: Number(sattrs.drip_total ?? 1),
                gateToken: String(sattrs.gate_token ?? ''),
                gateChain: sattrs.gate_chain as string | number | undefined,
                creator: typeof spayload.creator === 'string' ? spayload.creator : undefined,
              })
            } catch {}
          })
        )
        const items: DropItem[] = parts.map(({ key, attrs }) => {
          const dripId = String(attrs.drip_id ?? '')
          const series = seriesById.get(dripId)
          const drip = parseDripInfo(attrs, {}, series)
          const networkKey = toNetworkKey(drip?.gateChain) ?? 'base'
          return {
            id: key,
            title: series?.title || 'Untitled Drop',
            gateToken: drip?.gateToken ?? '',
            gateChain: networkKey,
            marketCapTargetUsd: drip?.marketCapTargetUsd ?? 0,
            dripIndex: drip?.dripIndex ?? 0,
            dripTotal: drip?.dripTotal ?? 1,
            dripId: drip?.dripId ?? key,
            creatorHandle: series?.creator,
          }
        }).filter((d: DropItem) => d.marketCapTargetUsd > 0)
        if (!cancelled) setDrops(items.length ? items : DEMO_DROPS)
      } catch {
        if (!cancelled) setDrops(DEMO_DROPS)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const items = drops ?? DEMO_DROPS
  const isDemo = drops === null || (drops.length > 0 && drops[0].id.startsWith('demo-'))

  return (
    <div data-testid="upcoming-drops">
      {isDemo && drops !== null && (
        <p className="label text-fg-5 px-1 pb-2">Demo preview — Arkiv L3 (braga.hoodi.arkiv.network) is indexing haven drips</p>
      )}
      <div className="grid gap-3 max-h-[520px] overflow-y-auto pr-1">
        {items.map((item) => (
          <a
            key={item.id}
            href={mintClubUrl(item)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex gap-3 p-3 border border-line bg-surface hover:bg-surface-raised transition-colors group"
          >
            {/* token logo — on-chain IPFS first, trustwallet fallback, initials fallback */}
            <div className="w-12 h-12 rounded bg-line shrink-0 overflow-hidden flex items-center justify-center text-[10px] font-bold text-fg-4">
              <TokenLogo item={item} />
              <span style={{ display: 'none' }} className="w-full h-full items-center justify-center bg-seal-wash">{item.title.slice(0, 2).toUpperCase()}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-fg break-words whitespace-normal line-clamp-2 group-hover:underline" title={item.title}>{item.title}</p>
              <p className="label text-fg-5 mt-0.5">Stage {item.dripIndex + 1}/{item.dripTotal} · unlocks at {formatUsdCompact(item.marketCapTargetUsd)}</p>
              <p className="label text-fg-5 break-all whitespace-normal text-[11px] leading-snug" title={item.gateToken}>{item.gateToken} · {item.gateChain}</p>
            </div>
            <span className="label text-fg-4 self-center shrink-0">Trade →</span>
          </a>
        ))}
      </div>
      <p className="label text-fg-5 mt-3">Tokens are mint.club bonding-curve tokens launched via Haven drip (gate_type 4).</p>
    </div>
  )
}
