import { cachedJson } from './cache'

interface Itinerary {
  duration?: number
  transfers?: number
}

/**
 * Door-to-door public transit time between two points on a given day, from Transitous (open, global).
 * Returns null when no transit option is found or the service is unreachable.
 */
export async function transitMinutes(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
  date: string,
): Promise<{ minutes: number; transfers: number } | null> {
  const time = `${date}T10:00:00Z`
  const params = new URLSearchParams({
    fromPlace: `${a.lat},${a.lon}`,
    toPlace: `${b.lat},${b.lon}`,
    time,
    numItineraries: '1',
  })
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
    return null
  }
}

/** Minutes to add on top of a transit ride for walking to the stop, waiting and delays. */
export const TRANSIT_BUFFER_MIN = 10
