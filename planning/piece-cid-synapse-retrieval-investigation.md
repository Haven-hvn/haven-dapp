# Sync & retrieval analysis (haven-cli + haven-dapp)

**Date:** 2026-05-17  
**Scope:** “Fully sync’d” retrieval, FOC validity, `haven download` CLI, and **haven-dapp** playback (`piece_cid` / Synapse-only path).

**Terminology:** [**Filecoin Onchain Cloud (FOC)**](https://www.filecoin.cloud/) on **FVM** (FWSS, Filecoin Pay, optional Filecoin Beam). Not legacy Filecoin Network PoRep deals or Filfox. **PDP** = Proof of Data Possession on SPs, not a “deal object” on legacy explorers.

**Rejected for dapp playback:** IPFS gateway fallback. Ops may use IPFS CAR root + decrypt for legacy rows.

---

## Executive summary

Two videos were marked “fully sync’d” in the haven-cli database. Investigation showed:

1. **FOC retrievability not verified** — Arkiv has valid `piece_cid` strings; Synapse download fails (nothing to resolve on the FOC path for these rows). This is **not** disproved by Filfox/IPFS-on-piece-CID checks (wrong probes for FOC).
2. **IPFS CAR root is real** — `bafy…` roots return HTTP 200; out-of-band `curl` + decrypt worked (ops only).
3. **Pipeline `completed` is misleading** — pipeline finished; FOC commit + retrievability were not verified.
4. **`haven download` CLI fails on large files** — 60s JS bridge timeout + in-memory buffering (uses **IPFS root**, not `piece_cid`).
5. **`synapse.getStatus` is hardcoded** — must not be used for FOC truth.
6. **Dapp Synapse-only path fails for these rows** — expected if the piece was never committed on FOC; **plus** dapp uses throwaway address for resolution (fixable for future verified uploads).

**Root cause:** Upload/sync success = IPFS CAR root + `piece_cid` on Arkiv, **without** proving `executeUpload` committed on FOC (`complete`, non-empty `copies`) or smoke-testing `piece_cid` retrieval.

**Best retrieval mechanism (dapp):** Synapse by **`piece_cid`**, with **`resolvePieceUrl` using `entity.owner`** (not throwaway `client.account.address`). **`providerAddress` on Arkiv is optional** (SDK shortcut only), not required.

**Incident (IMG_9019):** `0x7478c473d6ba628b267d65cf34bea179d5b9de2587ce822de41e16d376a4cc60` — https://explorer.braga.hoodi.arkiv.network/entity/0x7478c473d6ba628b267d65cf34bea179d5b9de2587ce822de41e16d376a4cc60

---

## 1. What “fully sync’d” means (and doesn’t)

| Step | Status | What it proves | What it doesn’t prove |
|------|--------|----------------|----------------------|
| Download | `completed` | File from BitTorrent | — |
| Encryption | `completed` | Haven-AOL encryption | — |
| Upload | `completed` | IPFS CAR root; piece CID obtained/derived | FOC commit on FWSS; piece on SP |
| Sync | `completed` | Arkiv entity on-chain | `piece_cid` retrievable via Synapse |
| Analysis | `skipped` | VLM off | — |

`overall_status = 'completed'` only means the pipeline **ran to the end**.

---

## 2. What’s real vs. not verified

### Real: IPFS CAR root

| Video | CID | Size | HTTP |
|-------|-----|------|------|
| IMG_9019 | `bafybeifmvntlqomtshjufe7f2d7dyvfmclqehmad5wlluyfpysfwvobt7m` | ~396 MB | 200 |
| U5A5 | `bafybeibvj6gurtnsjpqoqvjgupm7e2olsucypuinpbp24mohs6tgrxwara` | ~579 MB | 200 |

### Real: Arkiv entities

| Video | Entity key | TX (truncated) | Block |
|-------|------------|----------------|-------|
| IMG_9019 | `0x7478c473…` | `0xbd11637c…` | 529144 |
| U5A5 | `0x2671d040…` | `0xefa451de…` | 529504 |

Owner: `0xb24ca10fb6907a2d94b0dc5dbea6b5e379d19ffd`.

**On entity:** `piece_cid`, `encryption_metadata`, `cid_encryption_metadata` (gate JSON includes plaintext IPFS root for IMG_9019).  
**Not required for playback:** `service_provider`, `data_set_id` on Arkiv (see §3.5).

### Not verified: FOC (Synapse / FWSS)

| Check | IMG_9019 | U5A5 |
|-------|----------|------|
| `videos.filecoin_data_set_id` | `None` | `None` |
| `videos.filecoin_uploaded_at` | `None` | `None` |
| Synapse `storage.download(piece_cid)` (throwaway client) | Fail | Fail |
| Upload `complete` + `copies[]` in logs | Unknown | Unknown |

**Non-evidence for FOC:** Filfox 404; `bafkzcib…` on IPFS gateways (403) — wrong layers.

### Fake / misleading (haven-cli)

- **`synapse.getStatus`** — hardcoded in `js-services/synapse-wrapper.ts` (~815–843).
- **`UploadJob.target = "ipfs"`** — hardcoded in `upload_step.py` (~1002); code still calls Synapse upload.

---

## 3. Retrieval architecture (Synapse SDK)

### 3.1 `piece_cid` vs IPFS root CID

| | IPFS content CID | Piece CID |
|--|------------------|-----------|
| Format | `bafy…` | `bafkzcib…` (FRC-0069) |
| Identifies | IPFS CAR root | FOC piece on SP |
| Created | Helia / CAR build | FWSS upload + commit via Synapse |
| Typical retrieval | `https://ipfs.io/ipfs/{cid}` | SP PDP API; optional Filecoin Beam |

**Two layers (why results differ):**

```text
bafy… (IPFS)     →  filecoin-pin pin     →  haven-cli curl worked
bafkzcib… (FOC)  →  Synapse / FWSS       →  dapp logs: not there (these rows)
```

### 3.2 How `storage.download({ pieceCid })` works

From `StorageManager.download` (`synapse-sdk` → `storage/manager.ts`):

```text
if providerAddress → direct PDP URL (skips resolvers)
if context         → context.download() (skips resolvers)
else:
  Piece.resolvePieceUrl({ client, address: client.account.address, pieceCid, resolvers })
    → pSome (first success):
        1. filbeamResolver (if withCDN): HEAD https://<address>.<domain>/<pieceCid>
        2. chainResolver: getPdpDataSets({ address }) → findPieceOnProviders()
        3. providersResolver: findPieceOnProviders(knownProviders)
  → Piece.downloadAndValidate({ url, expectedPieceCid })
```

**Critical:** `address` in `resolvePieceUrl` is **`client.account.address`** (the caller). `chainResolver` only sees datasets where the payer matches that address.

There is **no DHT** — `findPieceOnProviders` parallel-probes known SP endpoints (concurrency 5).

### 3.3 Does the viewer pay?

**No** for direct SP (PDP) retrieval. Uploader prepays storage via Filecoin Pay on FVM. `findPiece` / `downloadAndValidate` do not open viewer payment rails.

**Filecoin Beam (optional):** uploader-funded egress quota. **402** on Beam → fall back to SP PDP **if the piece exists on FOC**. Not pay-per-view for viewers.

### 3.4 Can you retrieve with only `piece_cid`?

**Yes**, via the resolver chain, if **`address` is the uploader (entity owner)**, not a throwaway key:

1. FilBeam: `https://<owner>.<domain>/<pieceCid>`
2. Chain: `getPdpDataSets({ address: owner })` → probe SPs
3. Providers: only if you already know which SPs to scan

### 3.5 Does the SDK require `providerAddress` or `dataSetId`?

**No.**

```typescript
interface StorageManagerDownloadOptions {
  context?: StorageContext      // optional
  providerAddress?: Address   // optional — skips resolvers
  // pieceCid required; resolver chain is default
}
```

- **`dataSetId`** — not a download parameter; use for **upload verification / DB** only.
- **`providerAddress`** — optional optimization (skip resolver chain). **Not required** if owner-aware resolution works.

### 3.6 What the dapp should do

**Current (broken for viewers):**

```typescript
Synapse.create({ throwaway key })
await synapse.storage.download({ pieceCid })
// resolvePieceUrl uses throwaway → no datasets → all resolvers fail
```

**Fixed (product path):**

```typescript
// Wrapper: resolvePieceUrl + downloadAndValidate with OWNER address
await resolvePieceUrl({
  address: entityOwner,  // from Arkiv — not throwaway
  client: synapse.client,
  pieceCid,
  resolvers: [filbeamResolver?, chainResolver, …],
})
await downloadAndValidate({ url, expectedPieceCid: pieceCid })
```

Optional: `storage.download({ pieceCid, providerAddress })` only if you **choose** to store SP on Arkiv for faster/direct path — not the default requirement.

**haven-cli “download worked”** uses **IPFS root CID** via gateway in `synapse-wrapper.download` — **unrelated** to dapp `piece_cid` / Synapse playback.

---

## 4. Upload: intended vs. likely actual

### Intended

```text
encrypt → CAR root_cid → checkUploadReadiness
  → executeUpload → Synapse commit on FVM
  → { copies[], complete, dataSetId, pieceCid, … }
  → DB: filecoin_data_set_id, filecoin_uploaded_at
  → Arkiv: piece_cid
  → smoke: Synapse download(piece_cid) with owner address
```

### Likely (IMG_9019 / U5A5)

```text
encrypt → CAR root (IPFS real)
  → executeUpload may not have committed (complete? copies?)
  → pipeline still completed
  → piece_cid on Arkiv without verified FOC retrievability
```

---

## 5. What worked vs. didn’t

| Path | Result | Mechanism |
|------|--------|-----------|
| `haven download cid` | Fail | IPFS gateway + 60s bridge + RAM buffer |
| Dapp playback | Fail | FOC path empty for piece + throwaway address |
| `curl` IPFS root + Python decrypt | OK | Ops only — **not** `piece_cid` |

---

## 6. Root cause summary

| Priority | Cause |
|----------|--------|
| **Primary** | Upload/sync “completed” without verified FOC commit / retrievability |
| **Secondary** | Dapp uses throwaway address in `resolvePieceUrl` — should use **`entity.owner`** |
| **Tertiary** | CLI download timeout + buffering (IPFS path) |
| **Quaternary** | Fake `getStatus`, misleading `UploadJob.target`, bad playback error mapping |

---

## 7. Fix plan

### Phase A — Upload truth (haven-cli) **blocking**

| Task | Detail |
|------|--------|
| Verify FOC before `completed` | `complete: true`, non-empty `copies` from upload result |
| Persist to DB | `filecoin_data_set_id`, `filecoin_uploaded_at` when verified |
| Smoke test | Synapse retrieval by `piece_cid` using **uploader** address (or owner-aware wrapper) |
| Real `getStatus` | Replace hardcoded stub |
| Fail pipeline on miss | No completed upload/sync if piece not retrievable on FOC |
| Wallet preflight | tFIL / USDFC on calibration |
| Fix `UploadJob.target` | e.g. `filecoin` |
| Re-upload | IMG_9019, U5A5 |

**Not required for playback:** storing `service_provider` on Arkiv (optional ops optimization only).

### Phase B — CLI download (haven-cli)

| Task | Detail |
|------|--------|
| `--timeout` (default 3600s) | `haven download cid` → JS bridge |
| Streaming write in JS | No full-file RAM buffer |

### Phase 0 — Dapp UX (haven-dapp)

| Task | Detail |
|------|--------|
| Playback error mapping | Synapse ≠ “wallet signature rejected” |
| Log on failure | `piece_cid`, `entity.owner` used for resolution |

### Phase 1 — Dapp owner-aware resolution (haven-dapp)

Depends on Phase A for new content; legacy rows need re-upload.

| Task | Detail |
|------|--------|
| Owner-aware `resolvePieceUrl` | `address: entity.owner` from Arkiv |
| Then `downloadAndValidate` | Same `piece_cid` |
| No throwaway-only `storage.download` | Do not rely on `client.account.address` for catalog |
| **Do not require** `providerAddress` on Arkiv | Unless you want an optional fast path later |

### Phase 2 — Ops (haven-cli)

| Task | Detail |
|------|--------|
| Log `copies`, `complete` per upload | |
| Dataset / rail health | Uploader wallet |
| Filecoin Beam policy | `withCDN` only if product wants CDN |

### Phase 3 — Longer term

`planning/encrypted-piece-cid-on-arkiv.md` — after retrieval works.

---

## 8. Success criteria

- [ ] Pipeline does not mark upload/sync `completed` without verified FOC retrievability
- [ ] `synapse.getStatus` / `haven download info` reflect real state
- [ ] New upload: dapp fetches via **`piece_cid` + owner address** (Synapse only)
- [ ] Wallet prompt only for Haven-AOL content decrypt
- [ ] Legacy rows (IMG_9019, U5A5): **re-upload required**
- [ ] No IPFS gateway fallback in dapp

---

## 9. Open questions

1. Did `executeUpload` return `complete: true` or only a `pieceCid` for IMG_9019?
2. Was wallet `0xb24ca10f…` blocked by `checkUploadReadiness` while pipeline still completed?
3. After verified re-upload, does **owner-only** resolution work in the browser (WSS RPC for `getPdpDataSets`)?
4. Does Filecoin Beam 402 block only CDN, with SP fallback working once piece exists?

---

## 10. Reference

| Doc | URL |
|-----|-----|
| Filecoin Onchain Cloud | https://www.filecoin.cloud/ |
| PDP | https://github.com/FilOzone/pdp |

| Area | Path |
|------|------|
| JS bridge timeout | `haven-cli/haven_cli/js_runtime/manager.py`, `bridge.py` |
| Download CLI | `haven-cli/haven_cli/cli/download.py` |
| Fake `getStatus` | `haven-cli/js-services/synapse-wrapper.ts` (~815–843) |
| Gateway `download` (IPFS) | `haven-cli/js-services/synapse-wrapper.ts` (~890+) |
| Upload step | `haven-cli/haven_cli/pipeline/steps/upload_step.py` |
| Dapp Synapse | `haven-dapp/src/lib/synapse.ts` |
| Dapp fetch | `haven-dapp/src/services/ipfsService.ts` |
| Diagnostic script | `haven-dapp/scripts/diagnose-piece-retrieval.mts` |
| `StorageManager.download` | `@filoz/synapse-sdk` → `storage/manager.ts` |
| `resolvePieceUrl` | `@filoz/synapse-core/piece/resolve-piece-url.ts` |
| `findPiece` | `@filoz/synapse-core/sp/find-piece.ts` |
| Arkiv entity (IMG_9019) | https://explorer.braga.hoodi.arkiv.network/entity/0x7478c473d6ba628b267d65cf34bea179d5b9de2587ce822de41e16d376a4cc60 |
