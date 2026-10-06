// Helpers for building PostgREST `.or()` filter strings from untrusted input.
// Raw interpolation lets commas/parentheses inject extra filters and lets LIKE
// wildcards (`%`, `_`) in an email match other people's rows.

/** Quote a value so it is treated as a single literal inside an `.or()` filter */
export function orValue(value: string | number): string {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/** Case-insensitive exact-match value for `column.ilike.<value>` inside an `.or()` filter */
export function ilikeExact(value: string): string {
  return orValue(value.replace(/[\\%_]/g, (m) => `\\${m}`))
}

/** Keep only digits and a leading + for phone numbers */
export function cleanPhoneNumber(phone: string): string {
  return String(phone || '').trim().replace(/[^0-9+]/g, '')
}

/** All the formats a Bangladeshi mobile number may be stored in (01X…, 8801X…, +8801X…) */
export function phoneVariants(phone: string): string[] {
  const digits = String(phone || '').replace(/\D/g, '')
  if (!digits) return []
  const local = digits.startsWith('88') ? digits.slice(2) : digits
  return Array.from(new Set([local, `88${local}`, `+88${local}`]))
}
