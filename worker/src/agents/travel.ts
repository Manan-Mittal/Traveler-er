import { bookBy, km, type Run } from './run.ts'
import type { BookingDraft } from './logistics.ts'

export interface Leg {
  dayIndex: number
  date: string
  fromName: string
  fromLat: number
  fromLon: number
  toName: string
  toLat: number
  toLon: number
}

export interface LegPlan {
  dayIndex: number
  fromName: string
  toName: string
  km: number
  minutes: number
  mode: 'rail' | 'high-speed rail' | 'bus' | 'ferry' | 'flight' | 'drive' | 'transit'
  summary: string
  /** Transit lines used, for example "THSR 803" or "Tze-Chiang 112". */
  lines: string[]
  estimate: boolean
}

interface MotisLeg {
  mode: string
  routeShortName?: string
  displayName?: string
  tripShortName?: string
}
interface Itinerary {
  duration?: number
  transfers?: number
  legs?: MotisLeg[]
}

const MODE: Record<string, LegPlan['mode']> = {
  HIGHSPEED_RAIL: 'high-speed rail',
  LONG_DISTANCE: 'rail',
  NIGHT_RAIL: 'rail',
  REGIONAL_FAST_RAIL: 'rail',
  REGIONAL_RAIL: 'rail',
  RAIL: 'rail',
  COACH: 'bus',
  BUS: 'bus',
  FERRY: 'ferry',
  AIRPLANE: 'flight',
}
// Most significant first: the trip is "high-speed rail" if any part of it is.
const RANK: LegPlan['mode'][] = ['flight', 'high-speed rail', 'rail', 'ferry', 'bus', 'transit']

const hm = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m` : `${min} min`)

/** Reads the fastest Transitous itinerary into a leg plan. Exported for tests. */
export function fromItineraries(leg: Leg, its: Itinerary[]): LegPlan | null {
  const best = its.filter((i) => i.duration).sort((a, b) => a.duration! - b.duration!)[0]
  if (!best) return null
  const modes = (best.legs ?? []).map((l) => MODE[l.mode] ?? 'transit').filter((m) => m)
  const transitLegs = (best.legs ?? []).filter((l) => l.mode !== 'WALK')
  const mode = RANK.find((m) => modes.includes(m)) ?? 'transit'
  const minutes = Math.round(best.duration! / 60)
  const lines = transitLegs.map((l) => (l.displayName ?? [l.routeShortName, l.tripShortName].filter(Boolean).join(' ')).trim()).filter(Boolean).slice(0, 4)
  const changes = best.transfers ? ` · ${best.transfers} change${best.transfers > 1 ? 's' : ''}` : ''
  return { dayIndex: leg.dayIndex, fromName: leg.fromName, toName: leg.toName, km: Math.round(km(...pts(leg))), minutes, mode, summary: `${cap(mode)} · ${hm(minutes)}${changes}`, lines, estimate: false }
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1)
const pts = (l: Leg) => [{ lat: l.fromLat, lon: l.fromLon }, { lat: l.toLat, lon: l.toLon }] as const

/** Timetables rarely reach months ahead; schedules repeat weekly, so fall back to the same weekday next week. */
const sameWeekdaySoon = (d: string) => {
  const t = Date.parse(d + 'T00:00:00Z')
  const today = Math.floor(Date.now() / 86400_000) * 86400_000
  const diff = ((((t - today) / 86400_000) % 7) + 7) % 7
  return new Date(today + (diff || 7) * 86400_000).toISOString().slice(0, 10)
}

async function transitous(leg: Leg, d: string): Promise<Itinerary[]> {
  // 09:00 at the origin; longitude gives the time zone to within an hour.
  const time = new Date(Date.parse(`${d}T09:00:00Z`) - Math.round(leg.fromLon / 15) * 3600_000).toISOString()
  const q = new URLSearchParams({ fromPlace: `${leg.fromLat},${leg.fromLon}`, toPlace: `${leg.toLat},${leg.toLon}`, time, numItineraries: '3' })
  const r = await fetch(`https://api.transitous.org/api/v5/plan?${q}`, { signal: AbortSignal.timeout(15_000) })
  if (!r.ok) return []
  return ((await r.json()) as { itineraries?: Itinerary[] }).itineraries ?? []
}

/** Travel agent: the real way between consecutive cities, plus the trains and flights worth booking. */
export async function planTravel(run: Run, legs: Leg[], today?: string): Promise<{ legs: LegPlan[]; bookings: BookingDraft[] }> {
  const plans: LegPlan[] = []
  const bookings: BookingDraft[] = []
  for (const leg of legs.slice(0, 8)) {
    const dist = km(...pts(leg))
    let plan: LegPlan | null = null
    try {
      plan = fromItineraries(leg, await transitous(leg, leg.date))
      if (!plan) plan = fromItineraries(leg, await transitous(leg, sameWeekdaySoon(leg.date)))
    } catch {
      // fall through to an estimate
    }
    if (!plan || (plan.mode !== 'flight' && dist > 1200 && plan.minutes > 12 * 60)) plan = estimate(leg, dist)
    plans.push(plan)
    run.step('Travel', `${leg.fromName} → ${leg.toName}: ${plan.summary}${plan.estimate ? ' (estimate)' : ''}`)
    if (plan.mode === 'flight') {
      bookings.push({
        title: `Flight ${leg.fromName} → ${leg.toName}`,
        kind: 'flight',
        dayIndex: leg.dayIndex,
        deadline: bookBy(leg.date, 42, today),
        url: `https://www.google.com/travel/flights?q=${encodeURIComponent(`Flights from ${leg.fromName} to ${leg.toName} on ${leg.date}`)}`,
        why: `${plan.summary}${plan.estimate ? ' (estimate incl. airport time)' : ''}. Fares climb closer to the date.`,
      })
    } else if (plan.mode === 'high-speed rail' || (plan.mode === 'rail' && plan.minutes >= 90)) {
      bookings.push({
        title: `${cap(plan.mode)} ${leg.fromName} → ${leg.toName}`,
        kind: 'train',
        dayIndex: leg.dayIndex,
        deadline: bookBy(leg.date, 14, today),
        why: `${plan.summary}${plan.lines.length ? ` (${plan.lines.join(', ')})` : ''}. Reserved seats sell out on weekends and holidays.`,
      })
    }
  }
  return { legs: plans, bookings }
}

/** No timetable found: fly when it's far, otherwise a road estimate. */
export function estimate(leg: Leg, dist: number): LegPlan {
  const base = { dayIndex: leg.dayIndex, fromName: leg.fromName, toName: leg.toName, km: Math.round(dist), lines: [], estimate: true }
  if (dist > 500) {
    const minutes = Math.round((dist / 750) * 60 + 150)
    return { ...base, mode: 'flight', minutes, summary: `Flight · about ${hm(minutes)} door to door` }
  }
  const minutes = Math.round(((dist * 1.3) / 60) * 60)
  return { ...base, mode: 'drive', minutes, summary: `Drive or bus · about ${hm(minutes)}` }
}
