# V4 curve-pricing dapp changes (implemented, uncommitted working tree)

The canister is Bond-only (`haven-aol/docs/v4-bond-mode-changes.md`
§10): no feed path exists, so the wizard has no oracle field and seals
whole-ETH targets. This doc records what changed and the shipping
constraint. It supersedes the earlier "post–Bond-mode follow-up" framing
— there is no follow-up; this ships WITH the canister.

## 1. What changed (all in the working tree, uncommitted)

- `src/components/publish/CreateWizard.tsx`
  - Ladder: per-rung amount sliders snapping to `RUNG_USD_STOPS`
    (`$1M–$1B`), bounds clamped so rungs stay strictly ascending by
    construction; free-text target entry removed; per-rung dual display
    (`$5M ≈ 1,542 ETH`) via `useEthUsd`, `≈ … ETH` while loading.
  - Gate: oracle input deleted. Committed oracle derives from
    `bondAddress`; gate arms on resolved token + Bond present + threshold.
    Unconfigured chain blocks arming with an explicit message
    (`gate-curve-pricing` stamp when priced).
  - Seal: `sealTargetsUsdToReserve(targetsUsd, ethUsd)` at seal minute;
    null rate blocks sealing (fail closed). Manifest `Unlocks @` prints
    the exact enforced ETH bars + USD intent + seal-minute USD/ETH rate.
- `src/lib/v4/drip-plan.ts`: `RUNG_USD_STOPS`, `nearestStopIndexBelow`,
  `firstStopIndexAbove`, `nextStopAbove`, `TargetUnit`,
  `sealedTargetOf` (sealed-first, legacy-USD fallback),
  `sealTargetsUsdToReserve` (null on missing rate / unsafe / collision).
- `src/lib/v4/market-cap.ts`: `fetchEthUsd` (SDK WETH rate, null-safe).
- `src/hooks/useMarketCap.ts`: `useEthUsd` (60s poll).
- `src/lib/v4/drip-session.ts`: `createDripSessionFromSlates` requires
  `sealed: { targets, unit }` (validated, stamped per stage); parse
  round-trips valid sealed fields, tolerates absence, rejects
  malformed-present.
- `src/lib/v4/arkiv-publish.ts`: gate metadata + IBE derivation use
  `sealedTargetOf(plan)`; `mcap_usd` + series `targets` stay USD
  (discovery/display). Reader untouched (opaque passthrough).
- `haven-aol-client.ts` / `haven-aol-auth.ts`: unit comments only.

## 2. Shipping constraint (load-bearing)

Canister + wizard ship in the SAME release train — no window in either
direction:

- Old wizard + new canister: seals USD numbers the canister reads as ETH
  → every gate bricked (fail-closed, but bricked).
- New wizard + old canister: seals ETH numbers a USD canister reads as
  dollars → rungs open ~1000× early (fail-OPEN — worse).

Deploy order: canister first, wizard the same train, staging end-to-end
(mint → seal → rung unlock on a fresh token) before either goes live.
Legacy sessions (no sealed fields, feed oracles) fail closed against the
new canister — correct, nothing to migrate (v4 unreleased).

## 3. Read side (implemented, same tree)

The lock screen already notified (target / live / % / `$X to go` /
progress bar / refresh / fail-closed) — all of it preview math in USD
intent. Two unit-honesty gaps closed:

- `MarketCapNotReached` decrypt error formatted whole-USD (`$1,542 of
  $1,563`) while both fields are whole ETH → now renders
  `1,542 ETH … 1,563 ETH` (`haven-aol-errors.ts`).
- `parseDripInfo` reads the sealed bar from the part payload's gate record
  (Bond oracle only) into `DripInfo.marketCapTarget`/`targetUnit`;
  `DripLockNotice` prints the enforced bar under the intent line.
  Attribute-only parses (discovery) show intent only — honestly, since the
  sealed value isn't on hand.

## 4. Still open

- `MarketPreview` / `UpcomingDrops` still speak USD intent only —
  acceptable (display), but a dual-display pass would match the wizard's
  honesty.
- A future chain with a novel (non-CREATE2) Bond needs hints +
  `setBondConfig` before the wizard arms there; the gate-blocking copy
  covers the state, and `isKnownBondAddress` documents the fallback.
