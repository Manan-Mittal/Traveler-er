import { FAMOUS } from './fame.ts'
import { km, type Pace } from './run.ts'
import type { RawPick } from './curator.ts'
import type { Place, Zone } from './scout.ts'

export interface Accepted {
  place: Place
  why: string
  book: RawPick['book']
}

export interface Rejected {
  zoneKey: string
  name: string
  reason: string
}

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

const WANTS_FAMOUS = /\b(famous|iconic|classic|landmarks?|must|highlights|first[- ]time)\b/i

/**
 * Critic agent, grounding half: keep a pick only if it is a scouted place in the zone it was picked for,
 * isn't already in the trip or picked twice, and isn't world-famous when the traveller asked for hidden gems.
 */
export function ground(picks: RawPick[], ids: Map<string, Place>, labels: Map<string, Zone>, existing: string[], ask: string) {
  const seen = new Set(existing.map(norm))
  const accepted = new Map<string, Accepted[]>()
  const rejected: Rejected[] = []
  for (const p of picks) {
    const zone = labels.get(p.zone)
    const place = ids.get(p.id)
    if (!zone) continue
    const reject = (reason: string) => rejected.push({ zoneKey: zone.key, name: place?.name ?? p.id, reason })
    if (!place) reject('not in the scouted list')
    else if (place.zoneKey !== zone.key) reject('belongs to a different neighborhood')
    else if (seen.has(norm(place.name))) reject('already in the trip or picked twice')
    else if ((place.fame ?? 0) >= FAMOUS && !WANTS_FAMOUS.test(ask)) reject(`world-famous (${place.fame} Wikipedias)`)
    else {
      seen.add(norm(place.name))
      accepted.set(zone.key, [...(accepted.get(zone.key) ?? []), { place, why: p.why || 'A local favorite in this area.', book: p.book }])
    }
  }
  return { accepted, rejected }
}

/** Minutes people typically spend at each kind of place. */
export const dwell = (p: Place) =>
  p.tags.tourism === 'museum' ? 90 : ({ food: 60, cafe: 40, sight: 40, nature: 50, shop: 25 } as Record<string, number>)[p.category] ?? 30

const walkMin = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => (km(a, b) * 1.25 * 60) / 4.5
/** Between zones: a short ride plus waiting, or a walk if they touch. */
export const hopMin = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const d = km(a, b)
  return d < 1.5 ? walkMin(a, b) : (d * 1.4 * 60) / 25 + 10
}

const BUDGET: Record<Pace, number> = { relaxed: 6 * 60, balanced: 8 * 60, packed: 10 * 60 }

const dayMinutes = (zones: Zone[], accepted: Map<string, Accepted[]>) => {
  let total = 0
  zones.forEach((z, i) => {
    const stops = accepted.get(z.key) ?? []
    if (i > 0) total += hopMin(zones[i - 1], z)
    stops.forEach((s, j) => {
      total += dwell(s.place) + (j > 0 ? walkMin(stops[j - 1].place, s.place) : 0)
    })
  })
  return Math.round(total)
}

/**
 * Critic agent, pacing half: estimate each day's length (time at stops, walking between them, hops between zones)
 * and trim the last-ranked picks until the day fits the pace, keeping at least two per zone.
 */
export function pace(zones: Zone[], accepted: Map<string, Accepted[]>, p: Pace) {
  const rejected: Rejected[] = []
  const days: { dayIndex: number; minutes: number; warning?: string }[] = []
  const byDay = new Map<number, Zone[]>()
  for (const z of zones) byDay.set(z.dayIndex, [...(byDay.get(z.dayIndex) ?? []), z])
  for (const [dayIndex, dz] of byDay) {
    let minutes = dayMinutes(dz, accepted)
    while (minutes > BUDGET[p]) {
      const fullest = dz.map((z) => accepted.get(z.key) ?? []).sort((a, b) => b.length - a.length)[0]
      if (!fullest || fullest.length <= 2) break
      const cut = fullest.pop()!
      rejected.push({ zoneKey: cut.place.zoneKey, name: cut.place.name, reason: `trimmed so day ${dayIndex} fits a ${p} pace` })
      minutes = dayMinutes(dz, accepted)
    }
    const hours = Math.round(minutes / 6) / 10
    days.push({ dayIndex, minutes, warning: minutes > BUDGET[p] ? `About ${hours} hours, long for a ${p} day. Consider dropping a neighborhood.` : undefined })
  }
  return { rejected, days }
}
