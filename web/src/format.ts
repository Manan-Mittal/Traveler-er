import { format, isSameMonth, isSameYear, parseISO } from 'date-fns'

/** "Nov 9 – 21, 2026", or "Nov 28 – Dec 3, 2026" when the trip crosses a month. */
export function formatRange(start: string, end: string) {
  const a = parseISO(start)
  const b = parseISO(end)
  if (Number.isNaN(+a) || Number.isNaN(+b)) return `${start} to ${end}`
  if (start === end) return format(a, 'MMM d, yyyy')
  if (isSameMonth(a, b)) return `${format(a, 'MMM d')} – ${format(b, 'd, yyyy')}`
  return isSameYear(a, b) ? `${format(a, 'MMM d')} – ${format(b, 'MMM d, yyyy')}` : `${format(a, 'MMM d, yyyy')} – ${format(b, 'MMM d, yyyy')}`
}

/** "Mon, Nov 9" for a day heading, "Nov 9" in compact form. */
export function formatDay(date: string, long = false) {
  const d = parseISO(date)
  return Number.isNaN(+d) ? date : format(d, long ? 'EEE, MMM d' : 'MMM d')
}
