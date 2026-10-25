import { cachedJson } from './cache'

interface Itinerary {
  duration?: number
  transfers?: number
}

// Failed lookups aren't cached, so remember them briefly to avoid retrying on every reorder.
const failedAt = new Map<string, number>()
const RETRY_AFTER_MS = 10 * 60 * 1000

/**
 * Door-to-door public transit time between two points on a given day, from Transitous (open, global).
 * Returns null when no transit option is found or the service is unreachable.
 */
export async function transitMinutes(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
  date: string,
): Promise<{ minutes: number; transfers: number } | null> {
  const first = await lookup(a, b, date)
  if (first) return first
  // Timetables usually don't reach months ahead, so retry on the same weekday within the coming week; schedules repeat weekly.
  const soon = sameWeekdayAhead(date)
  return soon && soon !== date ? lookup(a, b, soon) : null
}

function sameWeekdayAhead(date: string): string | null {
  const t = Date.parse(`${date}T00:00:00Z`)
  if (Number.isNaN(t)) return null
  const today = Math.floor(Date.now() / 86400_000) * 86400_000
  const diff = (((t - today) / 86400_000) % 7 + 7) % 7
  return new Date(today + (diff || 7) * 86400_000).toISOString().slice(0, 10)
}

async function lookup(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
  date: string,
): Promise<{ minutes: number; transfers: number } | null> {
  // 10:00 local at the origin. Longitude gives the zone to within an hour, which is plenty for a transit estimate.
  const time = new Date(Date.parse(`${date}T10:00:00Z`) - Math.round(a.lon / 15) * 3600_000).toISOString()
  const params = new URLSearchParams({
    fromPlace: `${a.lat},${a.lon}`,
    toPlace: `${b.lat},${b.lon}`,
    time,
    numItineraries: '1',
  })
  const key = `transit:${a.lat.toFixed(4)},${a.lon.toFixed(4)}>${b.lat.toFixed(4)},${b.lon.toFixed(4)}:${date}`
  if (Date.now() - (failedAt.get(key) ?? 0) < RETRY_AFTER_MS) return null
  try {
    const data = await cachedJson(
      `transit:${a.lat.toFixed(4)},${a.lon.toFixed(4)}>${b.lat.toFixed(4)},${b.lon.toFixed(4)}:${date}`,
      7 * 24 * 3600 * 1000,
      async () => {
        const r = await fetch(`https://api.transitous.org/api/v5/plan?${params}`)
        if (!r.ok) throw new Error(`Transit failed (${r.status})`)
        return (await r.json()) as { itineraries?: Itinerary[] }
      },
      'transitous',
      600,
    )
    const it = data.itineraries?.[0]
    if (!it?.duration) return null
    return { minutes: Math.round(it.duration / 60), transfers: it.transfers ?? 0 }
  } catch {
    failedAt.set(key, Date.now())
    return null
  }
}

/** Minutes to add on top of a transit ride for walking to the stop, waiting and delays. */
export const TRANSIT_BUFFER_MIN = 10
