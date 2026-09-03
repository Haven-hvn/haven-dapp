/**
 * Shared MIME enum — mirrors ARKIV_FORMAT 2.0.0 §MIME enum and
 * `haven_cli.services.arkiv_sync.MIME_TO_ENUM`.
 *
 * The `mime` attribute stores the enum int (one word instead of a 128 B
 * string slot); readers map back to a MIME string for viewer dispatch.
 * Extend by appending — never renumber.
 *
 * @module lib/mime-enum
 */

export const MIME_TO_ENUM: Record<string, number> = {
  'video/mp4': 1,
  'video/webm': 2,
  'video/quicktime': 3,
  'audio/mpeg': 4,
  'audio/wav': 5,
  'audio/ogg': 6,
  'image/png': 7,
  'image/jpeg': 8,
  'image/webp': 9,
  'image/gif': 10,
  'image/svg+xml': 11,
  'text/plain': 12,
  'text/markdown': 13,
  'application/pdf': 14,
}

export const ENUM_TO_MIME: Record<number, string> = Object.fromEntries(
  Object.entries(MIME_TO_ENUM).map(([mime, id]) => [id, mime])
)

/** Map a MIME string (params stripped, case-insensitive) to the enum int. */
export function mimeToEnum(mimeType: string | null | undefined): number | undefined {
  if (!mimeType) return undefined
  return MIME_TO_ENUM[mimeType.split(';')[0].trim().toLowerCase()]
}

/** Map the enum int back to a MIME string for viewer dispatch. */
export function enumToMime(value: unknown): string | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value)) return undefined
  return ENUM_TO_MIME[value]
}
