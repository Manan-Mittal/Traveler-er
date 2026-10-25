import type { Day, Stop, Zone } from './types'
import { distanceKm } from './geo'

export const ZONE_COLORS = ['#0a84ff', '#bf5af2', '#30d158', '#ff9f0a', '#ff375f', '#64d2ff']
export const zoneColor = (index: number) => (index < 0 ? '#8e8e93' : ZONE_COLORS[index % ZONE_COLORS.length])

/** The zone a stop belongs to: the one it was added to, else the nearest zone center. */
export function zoneIdOf(stop: Stop, zones: Zone[]): string | undefined {
  if (stop.zoneId && zones.some((z) => z.id === stop.zoneId)) return stop.zoneId
  let best: Zone | undefined
  let bestKm = Infinity
  for (const z of zones) {
    const km = distanceKm(stop, z)
    if (km < bestKm) [best, bestKm] = [z, km]
  }
  return best?.id
}

/** Stops in itinerary order: grouped by zone in the order of the day's zones, original order kept inside each zone. */
export function orderedStops(day: Day): Stop[] {
  const groups = new Map<string | undefined, Stop[]>()
  for (const s of day.stops) {
    const id = zoneIdOf(s, day.zones)
    groups.set(id, [...(groups.get(id) ?? []), s])
  }
  return [undefined, ...day.zones.map((z) => z.id)].flatMap((id) => groups.get(id) ?? [])
}
