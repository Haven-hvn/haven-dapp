# Haven Token Dashboard — MVP Build Specification

> **Status:** Locked. 
>
> **Scope:** Minimum viable public read-only "treasury at a glance" page.
> Anyone can visit `/dashboard/tokens` and immediately see how much FIL,
> tFIL, USDFC, Filecoin-Pay deposit, and Warm-Storage allowance the Haven
> project has across mainnet + Calibration. **No wallet connection. No
> back-end. No sign-up.** Public RPCs only.

---

## Table of contents

1. [Executive summary](#1-executive-summary)
2. [Problem statement](#2-problem-statement)
3. [Hard constraints — non-negotiable](#3-hard-constraints--non-negotiable)
4. [In scope (MVP rows)](#4-in-scope-mvp-rows)
5. [Out of scope (explicitly deferred)](#5-out-of-scope-explicitly-deferred)
6. [Environment configuration](#6-environment-configuration)
7. [Architecture overview](#7-architecture-overview)
8. [Module specifications](#8-module-specifications)
9. [Data model](#9-data-model)
10. [Contract addresses & ABI surface](#10-contract-addresses--abi-surface)
11. [Public RPC endpoints](#11-public-rpc-endpoints)
12. [UI / UX specification](#12-ui--ux-specification)
13. [Implementation phases (engineer-day breakdown)](#13-implementation-phases-engineer-day-breakdown)
14. [Definition of done](#14-definition-of-done)
15. [Testing strategy](#15-testing-strategy)
16. [Risks & mitigations](#16-risks--mitigations)
17. [Open items requiring stakeholder decision](#17-open-items-requiring-stakeholder-decision)
18. [Appendix A — Resolved research record](#18-appendix-a--resolved-research-record)
19. [Appendix B — Reference documents](#19-appendix-b--reference-documents)
20. [Appendix C — Post-MVP backlog (NOT BUILT)](#20-appendix-c--post-mvp-backlog-not-built)

---

## 1. Executive summary

| | |
|---|---|
| **What** | A new public read-only page at `/dashboard/tokens` inside the existing `haven-dapp` Next.js app. |
| **Why** | Today the Haven team finds out about depleted FIL / tFIL / USDFC / Filecoin-Pay deposits *from failed uploads*. We need one URL anyone can pull up to see all monitored balances at a glance. |
| **Who reads it** | Engineering, ops, ecosystem partners, community auditors. **No login.** |
| **How it reads** | Direct on-chain reads via public Glif and Ethereum RPCs using `viem`. No back-end, no proxy, no secrets, no wallet, no signing. |
| **What it monitors** | Six rows (see §4). All are queryable from a single pinned Haven address (`NEXT_PUBLIC_HAVEN_TREASURY_ADDRESS`) via public RPCs. |
| **Auto-refresh** | TanStack Query `refetchInterval: 30_000` + `refetchOnWindowFocus`. |
| **Effort** | 1 day plumbing + 1 day UI + 0.5 day docs/smoke = **2.5 engineer-days**. |
| **Risk** | Low. Read-only, no privileged data, no new infrastructure. Worst case: one row shows an error state. |

---

## 2. Problem statement

The Haven project pays for storage and gas across **three** independent
financial surfaces:

| Surface                                | Pays for                                              | Today's monitoring                |
|----------------------------------------|-------------------------------------------------------|------------------------------------|
| Filecoin mainnet (FIL)                 | Filecoin gas (PDP proofs, deal creation)              | `cast balance` from a laptop      |
| Filecoin Calibration (tFIL)            | Testnet gas for staging uploads                       | Block explorer                    |
| USDFC on Filecoin (mainnet + calib)    | Filecoin-Pay deposits → Warm-Storage rails            | `stg.usdfc.net` + manual math     |
| Filecoin-Pay deposit (USDFC)           | Storage rail funding                                  | `pay.filecoin.cloud` console      |
| Filecoin Warm-Storage operator approval| Storage rail lockup allowance                         | Same console, buried              |
| Ethereum mainnet (ETH)                 | Gas for EIP-712 gate auth flows on `mainnet`          | `cast balance`                    |

Five of these can be checked with public on-chain reads given Haven's
public addresses. **This dashboard exposes those five.** (Canister cycles
on ICP needs a Motoko code change and is deferred — see §20-A.)

---

## 3. Hard constraints — non-negotiable

These are stones, not pebbles. If a future change request violates one,
it gets deferred to Post-MVP.

1. **PUBLIC.** No wallet connect. No login. No gating. Anyone with the URL
   sees the same numbers. This is the defining differentiator from the
   v1/v2 plans.
2. **READ-ONLY.** No write transactions. No "top up" button. No
   "renew approval" button. We surface the numbers and link to the
   FilOzone explorer / wallet flow somewhere else.
3. **ZERO INFRASTRUCTURE.** No graph-node, no back-end API, no proxies,
   no Postgres, no secrets. Public RPCs and direct contract reads.
4. **HAVEN IS A USER.** The dashboard reads balances *for the specific
   Haven treasury address(es) we pin*. It is not a generic block
   explorer.
5. **SIX ROWS, ONE PAGE.** No drill-downs, no tabs, no sparklines, no
   filters, no presets, no URL routing.
6. **NO NEW DEPENDENCIES OUTSIDE WHAT `haven-dapp` ALREADY DECLARES.**
   `viem`, `@tanstack/react-query`, `@filoz/synapse-core` (peer of
   already-installed `@filoz/synapse-sdk`), Radix, Tailwind. **No
   wagmi/Reown on this page.**

If a feature requires (a) a new canister method, (b) GraphQL codegen,
(c) a wallet signature, (d) historical bucketing, (e) cross-row
analytics, (f) wallet connection — it is **not** in the MVP.

---

## 4. In scope (MVP rows)

Six rows. All driven by env-var-pinned Haven addresses. All read via
`viem` `readContract` / `getBalance`. **No wallet connection at any
point.**

| # | Row label                              | Chain                    | Source call                                                                                                                              | Alert threshold (display only) |
|---|----------------------------------------|--------------------------|------------------------------------------------------------------------------------------------------------------------------------------|--------------------------------|
| 1 | Haven FIL wallet (mainnet)             | Filecoin (314)           | `publicClient.getBalance({ address: HAVEN_TREASURY })`                                                                                  | `< 1 FIL`                      |
| 2 | Haven tFIL wallet (Calibration)        | Filecoin Calibration (314159) | `publicClient.getBalance({ address: HAVEN_TREASURY })`                                                                              | `< 5 tFIL`                     |
| 3 | Haven USDFC balance (mainnet)          | Filecoin (314)           | `readContract({ address: USDFC_MAINNET, abi: erc20, functionName: 'balanceOf', args: [HAVEN_TREASURY] })`                              | `< 25 USDFC`                   |
| 4 | Haven USDFC balance (Calibration)      | Filecoin Calibration     | `readContract({ address: USDFC_CALIB,   abi: erc20, functionName: 'balanceOf', args: [HAVEN_TREASURY] })`                              | `< 25 USDFC`                   |
| 5 | Filecoin-Pay deposit (USDFC, mainnet)  | Filecoin (314)           | `readContract({ address: FILECOIN_PAY_V1_MAINNET, abi: filecoinPayAbi, functionName: 'accounts', args: [USDFC_MAINNET, HAVEN_TREASURY] })` → returns `{ funds, lockupCurrent, lockupRate, lockupLastSettledAt }`; display `funds - lockupCurrent` as **free balance** | `< 2 USDFC free`               |
| 6 | Warm-Storage operator approval (USDFC, mainnet) | Filecoin (314)  | `readContract({ address: FILECOIN_PAY_V1_MAINNET, abi: filecoinPayAbi, functionName: 'operatorApprovals', args: [USDFC_MAINNET, HAVEN_TREASURY, FWSS_MAINNET] })` → returns `{ isApproved, rateAllowance, lockupAllowance, rateUsage, lockupUsage, maxLockupPeriod }`; display `isApproved` + `lockupAllowance - lockupUsage` headroom + `maxLockupPeriod` (in seconds → days) | Renew when `lockupAllowance - lockupUsage < 5 USDFC` OR `maxLockupPeriod < 7 days` |

**Optional 7th row** (ship if `NEXT_PUBLIC_HAVEN_ETHEREUM_ADDRESS` is set):

| 7 | Haven ETH wallet (gate auth gas)       | Ethereum mainnet (1)     | `publicClient.getBalance({ address: HAVEN_ETHEREUM })`                                                                                  | `< 0.01 ETH`                   |

That's it. **Six rows, plus an optional seventh.** No sparklines, no
"days remaining" annotations, no fiat values, no historical chart.

### What each row renders

```
┌──────────────────────────────────────────────────────────────┐
│ Haven FIL wallet (mainnet)                       12.43 FIL   │
│ 0x1234…abcd  •  glif.io ↗                                    │
└──────────────────────────────────────────────────────────────┘
```

- **Top line:** label + balance (4 decimal places for native, 2 for
  USDFC).
- **Bottom line:** truncated address + explorer link.
- **Below threshold:** the whole card gets an amber border, the number
  goes amber, and a small `⚠ low` chip appears.
- **On error:** the number is replaced with "—" and the card gets a
  muted-red border with a small `error` chip; underlying error message
  is in a `title` attribute for hover (not a tooltip component — that's
  extra UI; the native `title` is fine).

---

## 5. Out of scope (explicitly deferred)

Every item below is documented design work from the v1/v2 plan that we
are deliberately not building. They are catalogued in §20 (Post-MVP
backlog) for future scheduling.

- ❌ Wallet-connected "view as me" mode (the page is public; no
  per-visitor view).
- ❌ Haven-AOL canister cycle balance (row 8 in v2) — needs new Motoko
  method.
- ❌ Filecoin-Pay subgraph rows: rails, approvals, settlements,
  locked-vs-free per token, classifyInput search — needs GraphQL
  codegen + degraded-mode handling.
- ❌ Gate-token coverage matrix — content audit, not a treasury metric.
- ❌ Burn-rate / "days remaining" projections — needs 14 days of
  snapshot history before the first useful projection.
- ❌ SIWE / EIP-712 signing gate — there's nothing to gate (public).
- ❌ Global address/CID search bar (`classifyInput`).
- ❌ Self-host / team / creator preset views.
- ❌ URL params (`?evm=`, `?arkiv=`, `?icp=`, `?tokens=`, `?view=`).
- ❌ Threshold persistence in `zustand` / localStorage. Thresholds are
  hard-coded constants in `src/lib/dashboard/tokens.ts`.
- ❌ Snapshot ring buffer in `localStorage`.
- ❌ Degraded-mode banner (no subgraph means no degraded mode).
- ❌ Fiat estimates (USD column). Drift risk + zero-infra constraint.
- ❌ `HAVEN-METRIC-DEFINITIONS.md` — six rows fit one
  `docs/treasury-dashboard.md` section.
- ❌ `graphql-codegen` in CI.
- ❌ Playwright e2e tests for this page (manual smoke test only).
- ❌ Notifications / PagerDuty / email alerts.
- ❌ Arkiv balances (mainnet DNS does not yet resolve — see §17).

---

## 6. Environment configuration

The dashboard reads from environment variables at build time. All
variables are `NEXT_PUBLIC_*` (safe to inline in client bundle — they're
just public addresses and RPC URLs).

| Variable                                          | Required? | Default                                            | Used by                                       |
|---------------------------------------------------|-----------|----------------------------------------------------|-----------------------------------------------|
| `NEXT_PUBLIC_HAVEN_TREASURY_ADDRESS`              | **Yes**   | (none — page renders empty state if absent)        | Rows 1–6                                      |
| `NEXT_PUBLIC_HAVEN_ETHEREUM_ADDRESS`              | No        | falls back to `NEXT_PUBLIC_HAVEN_TREASURY_ADDRESS` | Row 7 (hidden entirely if both are absent)    |
| `NEXT_PUBLIC_FILECOIN_RPC_URL_MAINNET`            | No        | `https://api.node.glif.io/rpc/v1`                  | Rows 1, 3, 5, 6                               |
| `NEXT_PUBLIC_FILECOIN_RPC_URL_CALIBRATION`        | No        | `https://api.calibration.node.glif.io/rpc/v1`      | Rows 2, 4                                     |
| `NEXT_PUBLIC_ETHEREUM_RPC_URL`                    | No        | `https://cloudflare-eth.com`                       | Row 7                                         |

**Empty-state behaviour:** if `NEXT_PUBLIC_HAVEN_TREASURY_ADDRESS` is
not set at build time, the page renders a single instructional card
("Treasury address not configured — set `NEXT_PUBLIC_HAVEN_TREASURY_ADDRESS`")
rather than blowing up. This is the only "missing config" UI in the
dashboard.

The actual Haven treasury address that gets baked in at deploy time is
an **open item — see §17.1**.

---

## 7. Architecture overview

```
┌─ /dashboard/tokens (Next.js app-router page, "use client") ─────┐
│                                                                  │
│  <TokenDashboard>                                                │
│  ├── <Header>                                                    │
│  │   ├── Title "Haven Treasury"                                  │
│  │   ├── Last-updated timestamp                                  │
│  │   └── Manual refresh button                                   │
│  └── <RowList>                                                   │
│      └── <Row>  × 6 (or 7)                                       │
│                                                                  │
│  TanStack Query, refetchInterval: 30_000, refetchOnFocus: true   │
│  Single QueryClientProvider scoped to this page (no global       │
│  Wagmi/Reown context required).                                  │
└─────────────────┬────────────────────────────────────────────────┘
                  │
   ┌──────────────┼──────────────┬─────────────────┐
   ▼              ▼              ▼                 ▼
networks.ts   tokens.ts      reads.ts          format.ts
- chain        - row config   - getNativeBalance   - formatTokenAmount
  metadata     - thresholds    - getErc20Balance   - formatDuration
- public RPC   - explorer      - getPayAccount     - truncateAddress
  URLs           link tpl      - getServiceApproval
- publicClient                  (all three return a
  per chain                     normalised
                                RowFetchResult)
```

Three pure data modules + one format util + one page component + one
row component. That's the whole tree.

**No global state.** No `zustand` store. No context provider on this
page beyond the page-local `QueryClientProvider`. The page is a leaf.

**No Wagmi/Reown imports** in any file under `src/lib/dashboard/` or
`src/app/dashboard/tokens/` or `src/components/dashboard/`. The
project-wide `wagmiAdapter` in `src/config/index.ts` is left untouched.

---

## 8. Module specifications

### 8.1 `src/lib/dashboard/networks.ts`

Defines the two Filecoin chains and one Ethereum chain we read from, and
exports memoised `viem` `PublicClient` instances. **One file. ~60
lines.**

```ts
import { createPublicClient, http, type PublicClient } from 'viem'
import { mainnet } from 'viem/chains'

export const FILECOIN_MAINNET = {
  id: 314,
  name: 'Filecoin',
  nativeCurrency: { name: 'Filecoin', symbol: 'FIL', decimals: 18 },
  rpcUrls: {
    default: {
      http: [
        process.env.NEXT_PUBLIC_FILECOIN_RPC_URL_MAINNET ??
          'https://api.node.glif.io/rpc/v1',
      ],
    },
  },
  blockExplorers: {
    default: { name: 'Filfox', url: 'https://filfox.info/en' },
  },
} as const

export const FILECOIN_CALIBRATION = {
  id: 314159,
  name: 'Filecoin Calibration',
  nativeCurrency: { name: 'testFIL', symbol: 'tFIL', decimals: 18 },
  rpcUrls: {
    default: {
      http: [
        process.env.NEXT_PUBLIC_FILECOIN_RPC_URL_CALIBRATION ??
          'https://api.calibration.node.glif.io/rpc/v1',
      ],
    },
  },
  blockExplorers: {
    default: { name: 'Filfox Calibration', url: 'https://calibration.filfox.info/en' },
  },
} as const

export type DashboardChainId = 1 | 314 | 314159

const clients = new Map<DashboardChainId, PublicClient>()

export function getPublicClient(chainId: DashboardChainId): PublicClient {
  const cached = clients.get(chainId)
  if (cached) return cached

  const client = (() => {
    switch (chainId) {
      case 1:
        return createPublicClient({
          chain: mainnet,
          transport: http(process.env.NEXT_PUBLIC_ETHEREUM_RPC_URL ?? 'https://cloudflare-eth.com'),
        })
      case 314:
        return createPublicClient({ chain: FILECOIN_MAINNET, transport: http() })
      case 314159:
        return createPublicClient({ chain: FILECOIN_CALIBRATION, transport: http() })
    }
  })()

  clients.set(chainId, client)
  return client
}
```

### 8.2 `src/lib/dashboard/tokens.ts`

Row configuration. Static. One source of truth for labels, thresholds,
addresses, and explorer link templates. **One file. ~120 lines.**

```ts
import type { Address } from 'viem'
import { parseUnits } from 'viem'

// USDFC + Filecoin-Pay + Warm-Storage addresses from gap research
// (planning/gap-research/outputs/g2-g8-filecoin-addresses.json).
// Source of truth: @filoz/synapse-core@0.5.1 chains module.
export const USDFC_MAINNET: Address     = '0x80B98d3aa09ffff255c3ba4A241111Ff1262F045'
export const USDFC_CALIBRATION: Address = '0xb3042734b608a1B16e9e86B374A3f3e389B4cDf0'
export const FILECOIN_PAY_V1_MAINNET: Address     = '0x23b1e018F08BB982348b15a86ee926eEBf7F4DAa'
export const FILECOIN_PAY_V1_CALIBRATION: Address = '0x09a0fDc2723fAd1A7b8e3e00eE5DF73841df55a0'
export const FWSS_MAINNET: Address     = '0x8408502033C418E1bbC97cE9ac48E5528F371A9f'
export const FWSS_CALIBRATION: Address = '0x02925630df557F957f70E112bA06e50965417CA0'

export type RowKind =
  | 'native-fil-mainnet'
  | 'native-fil-calibration'
  | 'erc20-usdfc-mainnet'
  | 'erc20-usdfc-calibration'
  | 'pay-deposit-usdfc-mainnet'
  | 'pay-approval-fwss-usdfc-mainnet'
  | 'native-eth-mainnet'

export interface RowConfig {
  kind: RowKind
  label: string
  chainId: 1 | 314 | 314159
  symbol: 'FIL' | 'tFIL' | 'USDFC' | 'ETH'
  decimals: 18 | 6     // USDFC = 6 if launched as USDC-equivalent? confirm in §17.4
  alertBelow: bigint   // raw units
  explorer: (addr: Address) => string
}

// NOTE re USDFC decimals: USDFC is an 18-decimal ERC-20 (synapse-core
// abi confirms standard 18). Set to 18 in row configs below.

export const ROWS: RowConfig[] = [
  {
    kind: 'native-fil-mainnet',
    label: 'Haven FIL wallet (mainnet)',
    chainId: 314,
    symbol: 'FIL',
    decimals: 18,
    alertBelow: parseUnits('1', 18),
    explorer: (a) => `https://filfox.info/en/address/${a}`,
  },
  {
    kind: 'native-fil-calibration',
    label: 'Haven tFIL wallet (Calibration)',
    chainId: 314159,
    symbol: 'tFIL',
    decimals: 18,
    alertBelow: parseUnits('5', 18),
    explorer: (a) => `https://calibration.filfox.info/en/address/${a}`,
  },
  {
    kind: 'erc20-usdfc-mainnet',
    label: 'Haven USDFC balance (mainnet)',
    chainId: 314,
    symbol: 'USDFC',
    decimals: 18,
    alertBelow: parseUnits('25', 18),
    explorer: (a) => `https://filfox.info/en/address/${a}`,
  },
  {
    kind: 'erc20-usdfc-calibration',
    label: 'Haven USDFC balance (Calibration)',
    chainId: 314159,
    symbol: 'USDFC',
    decimals: 18,
    alertBelow: parseUnits('25', 18),
    explorer: (a) => `https://calibration.filfox.info/en/address/${a}`,
  },
  {
    kind: 'pay-deposit-usdfc-mainnet',
    label: 'Filecoin-Pay deposit (USDFC, mainnet)',
    chainId: 314,
    symbol: 'USDFC',
    decimals: 18,
    alertBelow: parseUnits('2', 18),
    explorer: () => `https://filecoin-pay-explorer.vercel.app/mainnet`,
  },
  {
    kind: 'pay-approval-fwss-usdfc-mainnet',
    label: 'Warm-Storage operator approval (USDFC, mainnet)',
    chainId: 314,
    symbol: 'USDFC',
    decimals: 18,
    alertBelow: parseUnits('5', 18),
    explorer: () => `https://filecoin-pay-explorer.vercel.app/mainnet/operators/${FWSS_MAINNET.toLowerCase()}`,
  },
]
```

The optional ETH row is appended dynamically in the page if
`NEXT_PUBLIC_HAVEN_ETHEREUM_ADDRESS` resolves to a non-empty address.

### 8.3 `src/lib/dashboard/reads.ts`

The actual on-chain read functions. **One file. ~150 lines.** All
functions are `async`, return a normalised `RowFetchResult`, and throw
on contract revert (TanStack Query turns the throw into row error
state).

```ts
import type { Address } from 'viem'
import { erc20Abi } from 'viem'
import { getPublicClient, type DashboardChainId } from './networks'
import {
  FILECOIN_PAY_V1_MAINNET,
  FILECOIN_PAY_V1_CALIBRATION,
  USDFC_MAINNET,
  USDFC_CALIBRATION,
  FWSS_MAINNET,
} from './tokens'

export interface RowFetchResult {
  /** Primary number we show. Native balance for getBalance rows; raw
   *  ERC-20 units for balanceOf rows; `funds - lockupCurrent` for the
   *  pay-deposit row; `lockupAllowance - lockupUsage` for the
   *  approval row. */
  primary: bigint
  /** Optional secondary fact for the approval row only (max lockup
   *  period in seconds). */
  secondarySeconds?: bigint
  /** isApproved boolean for the approval row only. */
  isApproved?: boolean
  /** Unix millis when this fetch resolved. */
  fetchedAt: number
}

const FILECOIN_PAY_ACCOUNTS_ABI = [
  {
    type: 'function',
    name: 'accounts',
    stateMutability: 'view',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'owner', type: 'address' },
    ],
    outputs: [
      { name: 'funds', type: 'uint256' },
      { name: 'lockupCurrent', type: 'uint256' },
      { name: 'lockupRate', type: 'uint256' },
      { name: 'lockupLastSettledAt', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'operatorApprovals',
    stateMutability: 'view',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'payer', type: 'address' },
      { name: 'operator', type: 'address' },
    ],
    outputs: [
      { name: 'isApproved', type: 'bool' },
      { name: 'rateAllowance', type: 'uint256' },
      { name: 'lockupAllowance', type: 'uint256' },
      { name: 'rateUsage', type: 'uint256' },
      { name: 'lockupUsage', type: 'uint256' },
      { name: 'maxLockupPeriod', type: 'uint256' },
    ],
  },
] as const

export async function getNativeBalance(
  chainId: DashboardChainId,
  address: Address,
): Promise<RowFetchResult> {
  const balance = await getPublicClient(chainId).getBalance({ address })
  return { primary: balance, fetchedAt: Date.now() }
}

export async function getErc20Balance(
  chainId: DashboardChainId,
  token: Address,
  owner: Address,
): Promise<RowFetchResult> {
  const balance = await getPublicClient(chainId).readContract({
    address: token,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [owner],
  })
  return { primary: balance, fetchedAt: Date.now() }
}

export async function getPayDepositFree(
  chainId: 314 | 314159,
  owner: Address,
): Promise<RowFetchResult> {
  const payAddress  = chainId === 314 ? FILECOIN_PAY_V1_MAINNET     : FILECOIN_PAY_V1_CALIBRATION
  const usdfc       = chainId === 314 ? USDFC_MAINNET                : USDFC_CALIBRATION
  const [funds, lockupCurrent] = await getPublicClient(chainId).readContract({
    address: payAddress,
    abi: FILECOIN_PAY_ACCOUNTS_ABI,
    functionName: 'accounts',
    args: [usdfc, owner],
  })
  const free = funds > lockupCurrent ? funds - lockupCurrent : 0n
  return { primary: free, fetchedAt: Date.now() }
}

export async function getFwssApproval(
  owner: Address,
): Promise<RowFetchResult> {
  const [isApproved, , lockupAllowance, , lockupUsage, maxLockupPeriod] =
    await getPublicClient(314).readContract({
      address: FILECOIN_PAY_V1_MAINNET,
      abi: FILECOIN_PAY_ACCOUNTS_ABI,
      functionName: 'operatorApprovals',
      args: [USDFC_MAINNET, owner, FWSS_MAINNET],
    })
  const headroom = lockupAllowance > lockupUsage ? lockupAllowance - lockupUsage : 0n
  return {
    primary: headroom,
    secondarySeconds: maxLockupPeriod,
    isApproved,
    fetchedAt: Date.now(),
  }
}
```

### 8.4 `src/lib/dashboard/format.ts`

Three pure functions, fully unit-tested. **One file. ~60 lines.**

```ts
import { formatUnits } from 'viem'

export function formatTokenAmount(
  raw: bigint,
  decimals: number,
  fractionDigits: number = decimals === 18 ? 4 : 2,
): string {
  const asString = formatUnits(raw, decimals)
  const [intPart, fracPart = ''] = asString.split('.')
  const padded = (fracPart + '0'.repeat(fractionDigits)).slice(0, fractionDigits)
  return fractionDigits > 0 ? `${intPart}.${padded}` : intPart
}

export function formatDuration(seconds: bigint): string {
  const total = Number(seconds)
  if (!Number.isFinite(total) || total <= 0) return '0s'
  const days  = Math.floor(total / 86_400)
  const hours = Math.floor((total % 86_400) / 3_600)
  if (days >= 1)  return `${days}d ${hours}h`
  if (hours >= 1) return `${hours}h`
  const minutes = Math.floor((total % 3_600) / 60)
  return `${minutes}m`
}

export function truncateAddress(addr: string, head = 6, tail = 4): string {
  if (!addr.startsWith('0x') || addr.length <= head + tail + 2) return addr
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`
}
```

**Unit-test contract (vitest):**

| Input                                    | Expected             |
|------------------------------------------|----------------------|
| `formatTokenAmount(1_000_000_000_000_000_000n, 18)` | `"1.0000"` |
| `formatTokenAmount(123456n, 18, 6)`      | `"0.000000"`         |
| `formatTokenAmount(25_500_000_000_000_000_000n, 18, 2)` | `"25.50"` |
| `formatDuration(0n)`                     | `"0s"`               |
| `formatDuration(3600n)`                  | `"1h"`               |
| `formatDuration(86400n * 7n + 3600n * 5n)` | `"7d 5h"`          |
| `truncateAddress('0x1234567890abcdef1234567890abcdef12345678')` | `"0x1234…5678"` |
| `truncateAddress('0x123')`               | `"0x123"`            |

### 8.5 `src/app/dashboard/tokens/page.tsx`

Client component (`'use client'`). Hosts a local `QueryClientProvider`
so this page doesn't depend on app-wide provider wiring. **One file. ~80
lines.**

Responsibilities:

1. Read `NEXT_PUBLIC_HAVEN_TREASURY_ADDRESS` (and optionally
   `NEXT_PUBLIC_HAVEN_ETHEREUM_ADDRESS`) at module top.
2. If treasury address missing → render `<EmptyState>` and return early.
3. Otherwise render header + a list of `<Row>` components, one per
   entry in `ROWS` (plus the optional ETH row).
4. Each `<Row>` is its own TanStack Query consumer keyed by `(rowKind,
   treasuryAddress)`, with `refetchInterval: 30_000`,
   `refetchOnWindowFocus: true`, `staleTime: 25_000`.
5. The header includes a single "Refresh all" button which calls
   `queryClient.invalidateQueries({ queryKey: ['dashboard'] })`.

### 8.6 `src/components/dashboard/Row.tsx`

Presentational. **One file. ~120 lines.** Props:

```ts
interface RowProps {
  row: RowConfig
  address: Address
}
```

Behaviour:

1. Calls `useQuery` with the right reader from `reads.ts` based on
   `row.kind`.
2. Renders the label, balance number (via `formatTokenAmount`), symbol,
   truncated address, explorer link, and amber/red state.
3. For the approval row, also renders a sub-line "max lockup: 7d 5h"
   from `formatDuration(secondarySeconds)`.
4. Loading state: skeleton block (~24px height) for the number.
5. Error state: number replaced by `—`, `error` chip, native
   `title="..."` for the message.

### 8.7 Files touched / created — exhaustive list

| Path                                                  | Action     | Notes                                              |
|-------------------------------------------------------|------------|----------------------------------------------------|
| `src/lib/dashboard/networks.ts`                       | **CREATE** | §8.1                                               |
| `src/lib/dashboard/tokens.ts`                         | **CREATE** | §8.2                                               |
| `src/lib/dashboard/reads.ts`                          | **CREATE** | §8.3                                               |
| `src/lib/dashboard/format.ts`                         | **CREATE** | §8.4                                               |
| `src/types/dashboard.ts`                              | **CREATE** | §9                                                 |
| `src/app/dashboard/tokens/page.tsx`                   | **CREATE** | §8.5                                               |
| `src/components/dashboard/Row.tsx`                    | **CREATE** | §8.6                                               |
| `src/components/dashboard/EmptyState.tsx`             | **CREATE** | Single instructional card for missing env config   |
| `tests/lib/dashboard/format.test.ts`                  | **CREATE** | Unit tests per §8.4 table                          |
| `docs/treasury-dashboard.md`                          | **CREATE** | §15 user-facing doc                                |
| `.env.example`                                        | **EDIT**   | Add the four `NEXT_PUBLIC_*` vars from §6          |
| `src/config/index.ts`                                 | **DO NOT TOUCH** | Wagmi/Reown config for *other* pages is unrelated |
| `package.json`                                        | **DO NOT TOUCH** | All deps already present                      |

Total new TypeScript LOC budget: **~600 lines** (incl. tests and EmptyState).

---

## 9. Data model

```ts
// src/types/dashboard.ts

import type { Address } from 'viem'
import type { RowKind } from '@/lib/dashboard/tokens'

export interface DashboardRowState {
  kind: RowKind
  label: string
  chainId: 1 | 314 | 314159
  symbol: string
  decimals: number
  address: Address
  alertBelow: bigint
  primary: bigint | null
  secondarySeconds?: bigint
  isApproved?: boolean
  fetchedAt: number | null
  status: 'loading' | 'ok' | 'low' | 'error'
  errorMessage?: string
  explorerUrl: string
}
```

Note: this type is computed-from-config + query-result inside `Row.tsx`.
We do not maintain a global state object — it lives in TanStack Query
caches and gets materialised on render.

---

## 10. Contract addresses & ABI surface

All addresses below are pinned in `src/lib/dashboard/tokens.ts` and
sourced from `@filoz/synapse-core@0.5.1` (the peer dep of the already-
installed `@filoz/synapse-sdk@0.41.0`). Re-verified empirically in
`planning/gap-research/outputs/g2-g8-filecoin-addresses.json` on
2026-06-29.

### 10.1 USDFC ERC-20 (18 decimals)

| Chain                    | Address                                       |
|--------------------------|-----------------------------------------------|
| Filecoin mainnet (314)   | `0x80B98d3aa09ffff255c3ba4A241111Ff1262F045`  |
| Filecoin Calibration     | `0xb3042734b608a1B16e9e86B374A3f3e389B4cDf0`  |

ABI: viem's exported `erc20Abi` covers `balanceOf(address)` and `decimals()`.

### 10.2 Filecoin Pay V1

| Chain                    | Address                                       |
|--------------------------|-----------------------------------------------|
| Filecoin mainnet (314)   | `0x23b1e018F08BB982348b15a86ee926eEBf7F4DAa`  |
| Filecoin Calibration     | `0x09a0fDc2723fAd1A7b8e3e00eE5DF73841df55a0`  |

Functions we read:

```solidity
function accounts(IERC20 token, address owner) external view returns (
  uint256 funds,
  uint256 lockupCurrent,
  uint256 lockupRate,
  uint256 lockupLastSettledAt
);

function operatorApprovals(IERC20 token, address payer, address operator) external view returns (
  bool isApproved,
  uint256 rateAllowance,
  uint256 lockupAllowance,
  uint256 rateUsage,
  uint256 lockupUsage,
  uint256 maxLockupPeriod
);
```

(Hand-rolled ABI in `reads.ts` rather than importing the full ABI to
keep the bundle small.)

### 10.3 Filecoin Warm-Storage Service (operator address)

| Chain                    | Address                                       |
|--------------------------|-----------------------------------------------|
| Filecoin mainnet (314)   | `0x8408502033C418E1bbC97cE9ac48E5528F371A9f`  |
| Filecoin Calibration     | `0x02925630df557F957f70E112bA06e50965417CA0`  |

Used as the `operator` argument in `operatorApprovals(...)`. We do
**not** call any function on FWSS itself in the MVP.

---

## 11. Public RPC endpoints

All three endpoints below are public, unauthenticated, free, and have
been used in production by both `haven-dapp` and FilOzone's own explorer.

| Chain                | Default URL                                          | Override env var                              |
|----------------------|------------------------------------------------------|------------------------------------------------|
| Filecoin mainnet     | `https://api.node.glif.io/rpc/v1`                    | `NEXT_PUBLIC_FILECOIN_RPC_URL_MAINNET`        |
| Filecoin Calibration | `https://api.calibration.node.glif.io/rpc/v1`        | `NEXT_PUBLIC_FILECOIN_RPC_URL_CALIBRATION`    |
| Ethereum mainnet     | `https://cloudflare-eth.com`                         | `NEXT_PUBLIC_ETHEREUM_RPC_URL`                |

Glif rate limit (as of 2026): generous public quota; six reads every 30
seconds × N concurrent visitors is well under the limit. If we ever hit
it we point the override env var at a paid Ankr / Alchemy / Quicknode
endpoint without code changes.

---

## 12. UI / UX specification

### 12.1 Page layout

```
┌─────────────────────────────────────────────────────────────────┐
│  Haven Treasury                                                  │
│  Public read-only view of the Haven project's monitored          │
│  balances. Updates every 30 seconds.        Last updated 12s ago │
│                                                       [ Refresh ] │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Haven FIL wallet (mainnet)                12.4321 FIL   │   │
│  │  0x1234…5678  •  Filfox ↗                                │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Haven tFIL wallet (Calibration)          124.8741 tFIL  │   │
│  │  0x1234…5678  •  Filfox Calibration ↗                    │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ⚠ ┌──────────────────────────────────────────────────────┐    │
│    │  Haven USDFC balance (mainnet)        12.40 USDFC ⚠  │    │
│    │  0x1234…5678  •  Filfox ↗            below threshold │    │
│    └──────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Filecoin-Pay deposit (USDFC, mainnet)   148.00 USDFC    │   │
│  │  Free balance after lockup  •  Pay explorer ↗            │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Warm-Storage operator approval (USDFC, mainnet)         │   │
│  │  Approved  •  35.00 USDFC headroom  •  max 30d 0h        │   │
│  │  Operator: 0x8408…1A9f  •  Pay explorer ↗                │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Haven ETH wallet (gate auth gas)             0.4231 ETH │   │
│  │  0x1234…5678  •  Etherscan ↗                             │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 12.2 States

| Row state    | Visual                                                                   |
|--------------|--------------------------------------------------------------------------|
| Loading      | Skeleton bar where the number would be. Address line still visible.      |
| OK           | White card, neutral text.                                                |
| Low          | Amber border + amber number + small `⚠ low` chip next to the number.     |
| Error        | Muted-red border, number replaced by `—`, `error` chip, `title=` tooltip. |

### 12.3 Styling

- Tailwind classes only. No new global CSS.
- Cards: existing `<Card>` from `src/components/ui/card.tsx`.
- Buttons: existing `<Button>` from `src/components/ui/button.tsx`.
- Skeleton: existing `<Skeleton>` from `src/components/ui/skeleton.tsx`.
- Dark-mode: inherits the dapp's existing `next-themes` provider; we do
  not add any dark-mode logic on this page.

### 12.4 Accessibility

- Each card uses `<section aria-label={row.label}>`.
- Loading skeleton has `aria-busy="true"` on the section.
- Error chip's `title` attribute is mirrored as `<span class="sr-only">`
  so screen readers get the message without hover.
- Refresh button has `aria-label="Refresh all balances"`.

### 12.5 No navigation changes

We do **not** add this page to the main navigation. It's reachable at
`/dashboard/tokens` directly. Once we know who actually uses it we can
decide to add a link.

---

## 13. Implementation phases (engineer-day breakdown)

### P1 — Plumbing (1 engineer-day)

- [ ] Create `src/lib/dashboard/networks.ts` per §8.1.
- [ ] Create `src/lib/dashboard/tokens.ts` per §8.2 with all six row
      configs and pinned addresses from §10.
- [ ] Create `src/lib/dashboard/reads.ts` per §8.3 with the four reader
      functions.
- [ ] Create `src/lib/dashboard/format.ts` per §8.4.
- [ ] Create `src/types/dashboard.ts` per §9.
- [ ] Create `tests/lib/dashboard/format.test.ts` with the 8 cases from
      the §8.4 table.
- [ ] Edit `.env.example` to document the four env vars from §6.

**Manual verification at end of P1:**

```bash
cd haven-dapp-main
npx vitest run tests/lib/dashboard/format.test.ts
# All 8 tests green.

# Sanity check addresses & reads from a Node REPL:
node --experimental-vm-modules -e "
  import('./src/lib/dashboard/reads.js').then(async (m) => {
    const r = await m.getNativeBalance(314, '0x0000000000000000000000000000000000000000')
    console.log('zero balance:', r.primary)
  })
"
```

### P2 — UI (1 engineer-day)

- [ ] Create `src/components/dashboard/EmptyState.tsx`.
- [ ] Create `src/components/dashboard/Row.tsx` per §8.6.
- [ ] Create `src/app/dashboard/tokens/page.tsx` per §8.5.
- [ ] Smoke-test in `npm run dev` against the pinned treasury address
      from §17.1 (set the env var locally before starting dev server).
- [ ] Verify all six rows render numbers within 5 s. Verify amber state
      appears when a threshold is crossed (temporarily set
      `alertBelow` very high to trigger it).
- [ ] Verify error state appears when the RPC URL is set to a bogus
      value.

### P3 — Docs & ship (0.5 engineer-day)

- [ ] Write `haven-dapp-main/docs/treasury-dashboard.md` per §15.
- [ ] Add the `.env.example` entries from §6.
- [ ] Run `npm run lint` and `npm run type-check`. Both green.
- [ ] Open PR titled `feat(dashboard): public read-only treasury page`.
- [ ] PR description includes a screenshot of the page in OK state and
      a screenshot with one row in amber state (use a freshly-deployed
      Calibration test address to demonstrate).

### Total: 2.5 engineer-days. Single SDE.

---

## 14. Definition of done

The PR is mergeable when every box below is checked:

- [ ] `/dashboard/tokens` is reachable in production without auth, on
      every browser the existing dapp supports.
- [ ] Cold-load TTI ≤ 1.5 s on a mid-tier laptop with Glif RPC up.
- [ ] All six rows resolve to a number or an error state within 5 s of
      page load.
- [ ] Below-threshold rows show amber treatment (number + border + chip).
- [ ] The approval row shows `isApproved` + headroom + `maxLockupPeriod`
      formatted as `Nd Mh`.
- [ ] Auto-refresh fires every 30 seconds and on window focus.
- [ ] Manual refresh button forces a re-fetch.
- [ ] When `NEXT_PUBLIC_HAVEN_TREASURY_ADDRESS` is unset, the page
      renders the configured empty state (no crashes, no infinite
      spinner).
- [ ] When `NEXT_PUBLIC_HAVEN_ETHEREUM_ADDRESS` is unset and is also
      absent as a fallback, the ETH row is omitted entirely.
- [ ] No wagmi, Reown, AppKit, or wallet-connect imports appear in any
      file under `src/lib/dashboard/`, `src/app/dashboard/tokens/`, or
      `src/components/dashboard/`.
- [ ] `npm run lint` clean. `npm run type-check` clean.
- [ ] Unit tests for `format.ts` pass.
- [ ] `docs/treasury-dashboard.md` exists with one paragraph per row.

---

## 15. Testing strategy

### 15.1 Unit (automated, in CI via vitest)

Only `format.ts`. See §8.4 for the 8-row test table. The on-chain
readers are intentionally not unit-tested in the MVP — their behaviour
is "viem does its job"; testing them means standing up RPC mocks which
is a P-next investment (see §20-J).

### 15.2 Integration (manual smoke, recorded in PR description)

Run twice — once with `NEXT_PUBLIC_HAVEN_TREASURY_ADDRESS` set to the
real Haven address, once with it unset.

1. **Real address:** All six rows render numbers. Open Filfox in a new
   tab, paste the same address — numbers match (allowing for one block
   of latency).
2. **Unset address:** Page renders the empty state instructional card.

### 15.3 Edge cases to manually verify

| Scenario                                  | Expected                                                       |
|-------------------------------------------|----------------------------------------------------------------|
| RPC down (point env var at `http://127.0.0.1:9/`) | Affected rows show error chip with native tooltip       |
| Treasury has never used Filecoin Pay      | Row 5 shows `0.0000 USDFC` (the `accounts(...)` call returns zeros for unfunded accounts) |
| Treasury has never approved FWSS          | Row 6 shows `Not approved` chip instead of headroom + duration |
| `maxLockupPeriod` is 0                    | Row 6 secondary line shows `0s`                               |
| `lockupCurrent > funds` (shouldn't happen) | Row 5 clamps `free` to `0n`, no negative number on screen   |

### 15.4 Out of scope for MVP

- Playwright e2e — see §20-J.
- Cross-browser visual regression — manual eyeball check in Chrome,
  Firefox, Safari.
- Performance benchmarking — see §16 for the budget; we don't measure
  beyond it.

---

## 16. Risks & mitigations

| # | Risk                                                                 | Likelihood | Impact   | Mitigation                                                             |
|---|----------------------------------------------------------------------|------------|----------|------------------------------------------------------------------------|
| 1 | Glif RPC rate-limits at high traffic                                 | Low        | Medium   | Override via `NEXT_PUBLIC_FILECOIN_RPC_URL_*`. Visible failure mode (error chip), not a silent break. |
| 2 | Filecoin Pay V1 ABI changes in a future upgrade                      | Low        | High     | Pin `@filoz/synapse-sdk@0.41.0` already in `package.json`. Pin `@filoz/synapse-core@0.5.1` peer. Add an "ABI version: 1" comment in `reads.ts`. |
| 3 | USDFC address rotation on Filecoin                                   | Very low   | High     | Same — addresses are read from a pinned package version, not the live SDK. |
| 4 | Treasury address typo in env var                                     | Medium     | Medium   | Reader functions throw on `0x` parse failure → row error state, not silent zero. Validate format at module top with a `typeof === 'string' && /^0x[0-9a-fA-F]{40}$/.test(addr)` check. |
| 5 | Browser CORS rejects Glif from production domain                     | Very low   | Medium   | Glif allows `*` CORS. If a future Glif config rejects us we move to Ankr public RPC (same env-var override). |
| 6 | TanStack Query hammer (every tab/visitor refetches independently)    | Low        | Low      | 30 s cadence × 6 reads × N visitors is well under Glif quota. If N grows large we add per-row cache stickier or a `staleTime` of 25 s (already in §8.5 spec). |
| 7 | Page indexed by search engines surfaces an outdated balance forever  | Very low   | Low      | Page is dynamic-rendered (`'use client'`). Crawlers see the loading skeleton, which is acceptable. Optional: add `<meta name="robots" content="noindex">`. |

---

## 17. Open items requiring stakeholder decision

These are the only outstanding questions. Each has a recommended
default; if the team agrees with the default the SDM can authorise
implementation without further input. If the team disagrees, the
decision blocks P3 ship, not P1/P2 implementation.

### 17.1 Haven treasury address — what gets baked into the production build?

**Question:** What `0x…` should `NEXT_PUBLIC_HAVEN_TREASURY_ADDRESS`
resolve to for the `haven.video` production deployment?

**Why it matters:** This is the one piece of project-specific
information not derivable from public sources. Without it the page
renders the empty state.

**Recommended default:** TPM / SDM provides the address as a deploy
secret in Vercel (or wherever `haven-dapp` deploys). The SDE codes
against `NEXT_PUBLIC_HAVEN_TREASURY_ADDRESS=0xdead…beef` in their local
`.env` while developing, and the real value is set in the deployment
environment.

**Blocks:** Production ship, not implementation. Code is complete with
or without the answer; deploy hardcodes the value.

### 17.2 Should the optional ETH row ship in v1?

**Question:** Row 7 (Ethereum mainnet ETH for gate-auth gas) is gated
behind `NEXT_PUBLIC_HAVEN_ETHEREUM_ADDRESS`. Is that env var being set?

**Recommended default:** Set it to the same address as the treasury
address (assuming Haven uses one EOA across chains). If gate-auth is
funded from a different address, set this one independently. If nobody
knows, ship without it (the row is hidden) and add later.

**Blocks:** Nothing. The row is purely additive.

### 17.3 Should `<meta name="robots" content="noindex">` be set?

**Question:** Do we want this public page indexed by search engines?

**Recommended default:** **Yes, set `noindex`.** Treasury balances
change frequently; a Google snippet stuck on yesterday's number is more
confusing than discoverable. Auditors will find the page through the
project README or direct links.

**Blocks:** Nothing — a one-line addition to `page.tsx`.

### 17.4 USDFC decimals — confirm 18, not 6

**Question:** USDFC is marketed as a "USD-equivalent" stablecoin but
the on-chain ABI from `@filoz/synapse-core` declares it as a standard
18-decimal ERC-20. The `display` UX treats $1 USDFC = `1.0000` not
`1.00`. Confirm we want to render 4 decimal places, not 2.

**Recommended default:** Render USDFC with **2 decimal places** even
though the underlying token is 18-decimal — it reads more naturally
(`148.00 USDFC` not `148.0000`). `formatTokenAmount(raw, 18, 2)` does
this; it's a display-only choice.

**Blocks:** Nothing — one constant in the row config.

---

## 18. Appendix A — Resolved research record

The following questions were investigated and answered during the
2026-06-29 gap-research pass. They are **closed** for the MVP. Full
evidence in `planning/gap-research/outputs/`.

| ID  | Question                                              | Resolution                                                                                       |
|-----|-------------------------------------------------------|--------------------------------------------------------------------------------------------------|
| G2  | USDFC ERC-20 addresses on Filecoin                    | ✅ Mainnet `0x80B9…F045`, Calibration `0xb304…cDf0`. Source: `@filoz/synapse-core@0.5.1`.        |
| G8  | Warm-Storage operator address                         | ✅ Mainnet `0x8408…1A9f`, Calibration `0x0292…7CA0`. Source: same.                                |
| G11 | Fiat display                                          | ✅ Not shown in MVP. Drift risk + zero-infra constraint.                                          |
| G13 | Wagmi/Reown Filecoin chain support                    | ✅ **Moot** — the MVP doesn't use wagmi/Reown on this page (public, no wallet connect).          |
| —   | Filecoin Pay V1 contract addresses                    | ✅ Mainnet `0x23b1…4DAa`, Calibration `0x09a0…55a0`. Source: same npm package.                   |
| —   | `accounts` + `operatorApprovals` ABI shape            | ✅ Hand-rolled in `reads.ts`; verified against `@filoz/synapse-core/pay/operator-approvals.d.ts`. |

The following gaps were **deferred** to Post-MVP (§20): G1, G3, G4, G5,
G6, G7, G9, G10, G12, G14. None of them block the MVP.

---

## 19. Appendix B — Reference documents

The MVP supersedes the v1/v2 planning. The earlier docs remain as
research artefacts but are not authoritative for implementation.

| Doc                                                  | Role now                                                  |
|------------------------------------------------------|-----------------------------------------------------------|
| `planning/token-dashboard.md` (v3)                   | Historical — earlier MVP draft (private/wallet-connected) |
| `planning/filecoin-pay-explorer-analysis.md`         | Reference — Filecoin-Pay subgraph mechanics for Post-MVP §D |
| `planning/open-gaps.md`                              | Closed — see Appendix A and §17 for current status        |
| `planning/gap-research/notes/SUMMARY.md`             | Evidence — empirical findings backing Appendix A           |
| `planning/gap-research/outputs/g2-g8-filecoin-addresses.json` | Source — addresses pinned in `tokens.ts`           |
| `planning/gap-research/outputs/g14-goldsky-introspection.json` | Reference — for Post-MVP §D subgraph integration |

**This document (`MVP-TOKEN-DASHBOARD-SPEC.md`) is the single source of
truth for the MVP build.** If you read something contradictory in any
other planning doc, this one wins.

---

## 20. Appendix C — Post-MVP backlog (NOT BUILT)

Listed for context only. Nothing below is in scope. Each item carries
its own design notes from the v2 plan and is queued behind production
usage data.

| Phase | Title                                                | Cost     | Trigger to build                                     |
|-------|------------------------------------------------------|----------|------------------------------------------------------|
| §A    | Haven-AOL canister cycle balance                     | 1.5 days | Motoko PR landed on `haven-aol-main/src/backend/main.mo` |
| §B    | Burn-rate "days remaining" projections               | 1 day    | After 14 days of snapshot data accumulated client-side |
| §C    | Arkiv entity-owner balance                           | 0.5 day  | `mainnet.arkiv.network` DNS starts resolving         |
| §D    | Filecoin Pay subgraph rows (rails, approvals, settlements) | 2 days | Real demand from ops for per-rail visibility   |
| §E    | Gate-token coverage matrix                           | 1 day    | Content audit becomes an ops priority                |
| §F    | EIP-712 gate for private cycle row                   | 0.5 day  | After §A lands                                       |
| §G    | URL-param contract + presets                         | 1 day    | Self-hosters / external auditors request shareable URLs |
| §H    | Threshold persistence + alert toasts                 | 0.5 day  | Per-user editable thresholds requested               |
| §I    | CoinGecko fiat adapter                               | 0.5 day  | Fiat column actually requested                       |
| §J    | Playwright e2e + visual regression                   | 1 day    | After §D introduces subgraph dependency               |
| §K    | Full `HAVEN-METRIC-DEFINITIONS.md`                   | 0.5 day  | When row count > 10                                  |
| §L    | `/dashboard/[network]/...` URL-segment routing       | 0.5 day  | After §G adds multiple presets                       |

**Total deferred:** ~10 engineer-days. Land in priority order **only if
production usage justifies it.** If the MVP page sits unused for a
month, none of A–L need to ship.

---

**END OF SPEC.** Implementation may begin immediately upon SDM approval.
The MVP requires no further design input — the four items in §17 are
configuration decisions that do not gate code.
