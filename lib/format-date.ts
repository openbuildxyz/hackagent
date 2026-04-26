// Deterministic date formatting for SSR/CSR parity.
// `Date.prototype.toLocaleString` diverges between Node ICU and V8, surfacing
// as React #418 hydration errors (see OPE-98). Format manually so output
// matches across runtimes.

import type { Locale } from '@/lib/i18n'

const EN_MONTHS_LONG = ['January','February','March','April','May','June','July','August','September','October','November','December']
const EN_MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function pad(n: number) { return n < 10 ? '0' + n : String(n) }

// Use UTC getters for SSR/CSR parity. Local-time getters can still diverge
// when the Vercel server and the browser run in different time zones.

// `YYYY-MM-DD HH:mm` (zh) / `MMM D, YYYY HH:mm` (en)
export function formatDate(iso: string, locale?: Locale | string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  if (locale === 'zh') {
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
  }
  return `${EN_MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

// `MM-DD HH:mm` — compact form for dense tables.
export function formatDateShort(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

// `YYYY年M月D日` (zh) / `Month D, YYYY` (en) — date only, used on event detail headers.
export function formatDateLong(iso: string, locale?: Locale | string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  if (locale === 'zh') {
    return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日`
  }
  return `${EN_MONTHS_LONG[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`
}

// `M月D日` (zh) / `Mon D` (en) — compact date-only card label.
export function formatMonthDay(iso: string, locale?: Locale | string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  if (locale === 'zh') return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日`
  return `${EN_MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}`
}
