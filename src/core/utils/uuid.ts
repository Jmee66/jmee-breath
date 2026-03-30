/**
 * Generateur UUID v4 cross-platform.
 *
 * Utilise `crypto.randomUUID()` quand disponible (navigateurs modernes),
 * sinon fallback vers `crypto.getRandomValues()` (iOS < 15.4, anciens Android).
 */
export function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Fallback UUID v4 via getRandomValues (support universel)
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  // Version 4
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  // Variant 10xx
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
