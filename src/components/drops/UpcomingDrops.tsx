'use client'
import { useEffect, useState } from 'react'
import { createArkivClient, parseEntityPayload } from '@/lib/arkiv'
import { parseDripInfo } from '@/lib/parse-arkiv-video'
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

function tokenLogoUrl(gateToken: string, chain: string): string {
  return `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/${chain}/assets/${gateToken}/logo.png`
}

export function UpcomingDrops() {
  const [drops, setDrops] = useState<DropItem[] | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const client = createArkivClient()
        // Query v4 drip entities via Arkiv - filter gate_version = v4
        const result: any = await (client as any).query('gate_version = "v4"', { resultsPerPage: 12, includeData: { payload: true, attributes: true, metadata: true } })
        const entities: any[] = result?.entities ?? []
        if (entities.length === 0) throw new Error('no drips')
        const items: DropItem[] = entities.map((e: any) => {
          const attrs: Record<string, unknown> = {}
          for (const a of (e.attributes ?? [])) attrs[a.key] = a.value
          let payloadData: Record<string, unknown> = {}
          try {
            const raw = e.payload ? Buffer.from(e.payload).toString('utf-8') : ''
            // SDK payload is Uint8Array; if string try base64/json
            if (typeof e.payload === 'string') payloadData = parseEntityPayload<Record<string, unknown>>(e.payload) ?? {}
            else if (e.payload instanceof Uint8Array) payloadData = JSON.parse(Buffer.from(e.payload).toString('utf-8') || '{}')
          } catch {}
          const data = { ...attrs, ...payloadData }
          const drip = parseDripInfo(data, payloadData)
          return {
            id: String(e.key ?? drip?.dripId ?? Math.random()),
            title: String(data.title ?? 'Untitled Drop'),
            gateToken: String(drip?.gateToken ?? data.gate_token ?? ''),
            gateChain: String(drip?.gateChain ?? data.gate_chain ?? 'base'),
            marketCapTargetUsd: drip?.marketCapTargetUsd ?? Number(data.market_cap_target_usd ?? 0),
            dripIndex: drip?.dripIndex ?? 0,
            dripTotal: drip?.dripTotal ?? 1,
            dripId: drip?.dripId ?? String(e.key),
            creatorHandle: data.creator_handle as string | undefined,
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
      <div className="grid gap-3">
        {items.map((item) => (
          <a
            key={item.id}
            href={mintClubUrl(item)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex gap-3 p-3 border border-line bg-surface hover:bg-surface-raised transition-colors group"
          >
            {/* token logo */}
            <div className="w-12 h-12 rounded bg-line shrink-0 overflow-hidden flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={tokenLogoUrl(item.gateToken, item.gateChain || 'base')}
                alt=""
                className="w-full h-full object-cover"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-fg truncate group-hover:underline">{item.title}</p>
              <p className="label text-fg-5 mt-0.5">Stage {item.dripIndex + 1}/{item.dripTotal} · unlocks at {formatUsdCompact(item.marketCapTargetUsd)}</p>
              <p className="label text-fg-5 truncate">{item.gateToken.slice(0, 10)}… · {item.gateChain}</p>
            </div>
            <span className="label text-fg-4 self-center shrink-0">Trade →</span>
          </a>
        ))}
      </div>
      <p className="label text-fg-5 mt-3">Tokens are mint.club bonding-curve tokens launched via Haven drip (gate_version v4).</p>
    </div>
  )
}
