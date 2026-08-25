# Haven V4 — MarketCap-Gated Drip (Web-Only Uploader) — Design

Spec: `/root/haven-v4-marketcap-drip.md`

## Scope decision (revised)

- **haven-dapp**: only modified repo. Full V4 publisher + reader lock UI.
- **haven-cli**: reference only (streaming-encrypt format ported, not imported).
- **haven-aol**: unchanged. No canister V4 endpoint. Web-only V4 rides the
  deployed v1 per-CID gate (`requestDecryptionKey`).

## Key deviation from spec §Onchain enforcement

Without a canister change there is no on-chain market-cap check. Enforcement:

| Layer | What enforces |
|---|---|
| Token holding | Canister v1 gate: reader must hold `gate_threshold` of `gate_token` (unchanged). |
| Market-cap unlock | dapp reader UI: decrypt button disabled until live cap >= target. |

Per-chunk key independence still holds because each chunk's IBE identity is
`SHA256("accessol:" + chain + ":" + token + ":" + threshold + ":" + cid_i)` —
the CID differs per chunk. If/when the canister grows `requestDecryptionKeyV4`,
the stored records already carry every field needed
(`market_cap_target_usd`, `oracle_address`, `gate_version="v4"`).

## Publisher pipeline (one drag-drop)

```
file ──split(n ranges)──▶ per chunk i:
  1. havenStreamEncrypt(range_i, key_i)          → haven-cli chunked format
     [12B base_iv][u32 idx LE][u32 len LE][GCM ct]…  (1 MiB subchunks,
     per-subchunk IV = base_iv XOR be64(idx) @ bytes[4..12])
     ⇒ existing chunked-decrypt.ts plays it back unchanged.
  2. synapse.storage.upload(encrypted_i)         → pieceCid_i (wallet-funded)
  3. wrapAesKey(key_i, SHA256("accessol:chain:token:threshold:cid_i"))
     via @icp-sdk/vetkeys IbeCiphertext.encrypt(dpk, …); dpk from canister
     getVetKDPublicKey query (cached singleton).
  4. arkivWallet.createEntity({
       payload: JSON(v1 gate metadata ⊕ v4 fields),
       contentType: 'application/json',
       attributes: { project:'haven', type:'video', title, is_encrypted:1,
         piece_cid, cid_hash, gate_token, gate_chain, gate_threshold:i32,
         gate_version:'v4', market_cap_target_usd: dec, drip_index:i32,
         drip_total:i32, drip_id:str, oracle_address:str, content_mime_type },
       expires: ExpirationTime.fromDays(3650) })
```

Payload JSON = exact v1 `{version:1,cid,chain,tokenAddress,threshold,encryptedAesKey}`
plus v4 extras (`marketCapTargetUsd`, `dripIndex`, `dripTotal`, `dripId`,
`oracleAddress`). `isGateMetadata` ignores unknown keys, so today's parser and
tomorrow's canister both see everything. Attributes are the filterable surface
(`arkiv_query` on `market_cap_target_usd >= X`, `drip_index`, etc.).

## Reader

- `parse-arkiv-video.ts` maps v4 attrs/payload → `Video.drip?: DripInfo`.
- `useMarketCap(token)` polls mint.club bonding-curve math:
  `cap = currentSupply × usdRate` (getDetail + getUsdRate).
- Locked state: "Unlocks at $T (now $current)" + disabled play until met.
- Unlocked: existing v1 decrypt path untouched.
- `DripRings` concentric SVG rings show `k/n unlocked` grouping by `dripId`.

## Mint integration (decision: yes)

The gate_token is a mint.club bonding-curve token. Publish flow offers:
1. Pick an existing mint (symbol → CREATE2 address via SDK, verified `exists()`),
2. or paste any ERC-20 address.
Live preview uses the same SDK path readers use, so publisher and reader agree
on the unlock math. `oracle_address` attr stores the bond contract for future
on-chain enforcement. Inline token creation stays out of scope (fee +
reserve-token selection); the picker deep-links to creation instead.

## New modules (all under src/lib/v4 unless noted)

- drip-plan.ts — pure planning/validation (targets ascending, byte ranges)
- streaming-encrypt.ts — browser port of haven-cli encrypt_file_streaming
- ibe-wrap.ts — VetKD dpk cache + IBE wrap
- synapse-upload.ts — wallet-connected Synapse upload + payment prep
- market-cap.ts — mint.club cap math (+ manual override hook point)
- arkiv-publish.ts — entity builder + wallet client for Braga writes
- src/hooks/useMarketCap.ts — polling hook
- src/app/publish/page.tsx + src/components/publish/* — UI
- src/components/video/DripRings.tsx, DripLockNotice.tsx — reader UI

## Test plan (vitest, no network)

- drip-plan: range math, ascending validation, presets.
- streaming-encrypt: roundtrip through existing `decryptChunkedFile`
  (byte-compat proof), IV derivation parity vs Python algorithm.
- ibe-wrap: derivation-input construction matches v1 preimage exactly.
- arkiv-publish: attrs/payload builders (pure parts), metadata JSON passes
  `parseAnyGateMetadata`.
- parse-arkiv-video: v4 mapping from synthetic entities.

## Revision — staged per-unlock-stage publishing (implemented)

The one-shot "publish everything on one drag-drop" flow was replaced by a
STAGED workflow: each market-cap rung ("first mkt cap, then second, …") is
its own upload, from any wallet, at any time.

### Model (`src/lib/v4/drip-session.ts`)

A `DripSession` is created once and freezes everything cross-upload
consistency needs: shared `dripId`, contiguous byte ranges, SHA-256
commitment of the FULL source file, gate snapshot, per-stage plans +
committed results. Stages publish strictly in order
(`nextPublishableIndex` — no gaps, no stranded middle chunks). Results are
a contiguous prefix; manifests re-validate all of this fail-closed.

### Why different uploaders are cryptographically safe

IBE wrapping needs only PUBLIC inputs (canister dpk + the v4 identity
chain/token/threshold/epoch/target/cid). Each stage generates its own fresh
AES key, wraps it to its own identity, zeroizes it. No key material ever
crosses uploaders or machines. Per-stage epochs are recorded in metadata
and replayed by readers during derivation.

### Workflow UI

- Browse screen: local sessions with tick marks ("2/3 stages"), resume,
  delete, import hand-off kit.
- Create screen: drop film → configure ladder → "lock in plan" (hashes
  file, persists session, uploads nothing yet).
- Session screen: StageChecklist (done ✓ / up-next / locked rows with
  uploader badges), StageRunner for exactly ONE stage (re-attach source →
  SHA-256 verify badge → encrypt/pin/index pipeline → check mark moves),
  live market preview, HandoffPanel (export/import manifest + watch link).
- `published_by` attribute records which wallet released each stage.

### Hand-off kits

Manifest JSON = session state minus secrets (there are none). Teammate
imports kit + original film; bytes are hash-verified against the
commitment before any upload can start.

### Tests

- drip-session.test.ts: creation/commitment, sequential commits, source
  verification, manifest tamper matrix, localStorage roundtrip, naming.
- arkiv-publish.test.ts: `published_by` attr presence/lowercasing/omission.
