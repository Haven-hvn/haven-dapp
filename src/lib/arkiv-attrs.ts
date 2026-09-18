/**
 * Arkiv attribute-shape helpers (SDK 0.8.x).
 *
 * SDK 0.8 reads attributes back as a map of *tagged* values
 * (`Record<string, { type, value }>` — see `@arkiv-network/sdk/attr`),
 * while 0.7 used `{ key, value: string|number }[]`. Writers still pass
 * *bare* values (string → `str`, number → `i32`), which keeps the exact
 * wire types 0.7 wrote — and keeps CLI-written entities (Python SDK,
 * `str`/`int` only) query-compatible with dapp-written ones. Do NOT
 * switch writers to tagged constructors (`addr()`/`bytes32()`/`key()`)
 * unilaterally: comparisons are type-exact, so that would fragment
 * discovery by writer until every surface cuts over together.
 *
 * @module lib/arkiv-attrs
 */

/** Attribute type tags the SDK can read back (incl. system-only `bytes`). */
const ATTR_TAGS = new Set([
  'bool',
  'i32',
  'u64',
  'u256',
  'dec',
  'bytes32',
  'str',
  'addr',
  'key',
  'bytes',
])

/** Tagged SDK attribute value shape (`{ type, value }`, symbol branding ignored). */
export interface TaggedArkivValue {
  type: string
  value: unknown
}

/**
 * True when `raw` looks like a tagged SDK attribute value.
 * Accepts plain `{ type, value }` fixtures too (no symbol branding required).
 */
export function isTaggedArkivValue(raw: unknown): raw is TaggedArkivValue {
  if (typeof raw !== 'object' || raw === null) return false
  const type = (raw as Record<string, unknown>).type
  return typeof type === 'string' && ATTR_TAGS.has(type) && 'value' in raw
}

/**
 * Unwrap one attribute value to its bare form.
 * Tagged values yield `.value`; anything else passes through untouched.
 */
export function unwrapArkivValue(raw: unknown): unknown {
  return isTaggedArkivValue(raw) ? raw.value : raw
}

/**
 * Normalize entity attributes to a plain record.
 *
 * Accepts the SDK 0.8 map (`Record<name, tagged>`), the legacy 0.7
 * array (`[{ key, value }]`), or `undefined` — always returns a fresh
 * `Record<string, unknown>` with values unwrapped.
 */
export function toAttributeRecord(attrs: unknown): Record<string, unknown> {
  if (!attrs) return {}
  if (Array.isArray(attrs)) {
    const out: Record<string, unknown> = {}
    for (const item of attrs) {
      if (
        item &&
        typeof item === 'object' &&
        typeof (item as Record<string, unknown>).key === 'string'
      ) {
        const { key, value } = item as { key: string; value: unknown }
        out[key] = unwrapArkivValue(value)
      }
    }
    return out
  }
  if (typeof attrs === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(attrs as Record<string, unknown>)) {
      out[key] = unwrapArkivValue(value)
    }
    return out
  }
  return {}
}

/** Legacy builder entry (kept so pure builders stay unit-testable without the SDK). */
export interface LegacyAttributeEntry {
  key: string
  value: string | number | boolean | bigint
}

/**
 * Publisher adapter: legacy `[{ key, value }]` builders → SDK 0.8
 * bare-value map. Bare values keep the exact wire types 0.7 wrote
 * (`str`/`i32`) — see the module note before reaching for tagged
 * constructors.
 */
export function toAttributeInputs(
  attrs: readonly LegacyAttributeEntry[]
): Record<string, string | number | boolean | bigint> {
  const out: Record<string, string | number | boolean | bigint> = {}
  for (const { key, value } of attrs) {
    out[key] = value
  }
  return out
}
