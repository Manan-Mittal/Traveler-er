import type { Booking, Category, Trip, Zone } from '../types'

export type Pace = 'relaxed' | 'balanced' | 'packed'

export interface OutlineZone {
  name: string
  lat: number
  lon: number
  walkMinutes: Zone['walkMinutes']
  why: string
}
export interface Outline {
  destination: string
  days: { index: number; theme: string; zones: OutlineZone[] }[]
}

export interface DraftStop {
  zoneKey: string
  name: string
  lat: number
  lon: number
  category: Category
  why: string
  url?: string
  evidence: string[]
}
export interface DraftBooking {
  title: string
  kind: Booking['kind']
  dayIndex?: number
  deadline?: string
  url?: string
  why: string
}
export interface Fill {
  stops: DraftStop[]
  bookings: DraftBooking[]
  days: { dayIndex: number; minutes: number; warning?: string }[]
  rejected: { zoneKey: string; name: string; reason: string }[]
}
export interface TravelLeg {
  dayIndex: number
  fromName: string
  toName: string
  minutes: number
  mode: string
  summary: string
  lines: string[]
  estimate: boolean
}
export interface Travel {
  legs: TravelLeg[]
  bookings: DraftBooking[]
}

/** A zone the planner works on: one already in the trip (key = its id) or one the outline proposed. */
export interface PlanZone {
  key: string
  dayIndex: number
  date: string
  name: string
  lat: number
  lon: number
  walkMinutes: number
  existing: boolean
  cityId?: string
  why?: string
}

export const outlineRequest = (trip: Trip, ask: string, pace: Pace) => ({
  ask,
  pace,
  days: trip.days.map((d, i) => {
    const city = trip.cities.find((c) => c.id === d.cityId)
    return { index: i + 1, date: d.date, city: city && { name: city.name, lat: city.lat, lon: city.lon }, zones: d.zones.map((z) => z.name) }
  }),
})

/** Every zone the outline proposed plus the trip's own zones that are still light on places. */
export function planZones(trip: Trip, outline: Outline): PlanZone[] {
  return trip.days.flatMap((d, i) => {
    const dayIndex = i + 1
    const own = d.zones
      .filter((z) => d.stops.filter((s) => s.zoneId === z.id).length < 2)
      .map((z): PlanZone => ({ key: z.id, dayIndex, date: d.date, name: z.name, lat: z.lat, lon: z.lon, walkMinutes: z.walkMinutes, existing: true, cityId: d.cityId }))
    const proposed = (outline.days.find((x) => x.index === dayIndex)?.zones ?? []).map(
      (z, j): PlanZone => ({ key: `new-${dayIndex}-${j}`, dayIndex, date: d.date, name: z.name, lat: z.lat, lon: z.lon, walkMinutes: z.walkMinutes, existing: false, cityId: d.cityId, why: z.why }),
    )
    return [...own, ...proposed]
  })
}

/** Groups zones by city, at most `size` per request, so each Worker call stays inside the free-plan limits. */
export function fillBatches(zones: PlanZone[], size = 6): PlanZone[][] {
  const byCity = new Map<string, PlanZone[]>()
  for (const z of zones) byCity.set(z.cityId ?? '', [...(byCity.get(z.cityId ?? '') ?? []), z])
  return [...byCity.values()].flatMap((group) => Array.from({ length: Math.ceil(group.length / size) }, (_, i) => group.slice(i * size, (i + 1) * size)))
}

export const knownNames = (trip: Trip) => [...trip.days.flatMap((d) => d.stops.map((s) => s.name)), ...trip.inbox.map((s) => s.name)].slice(0, 300)

/** City changes between consecutive days, plus the trip in and out when the traveller says where they're coming from. */
export function travelLegs(trip: Trip, zones: PlanZone[], from?: { name: string; lat: number; lon: number }) {
  const legs = []
  const place = (cityId?: string) => trip.cities.find((c) => c.id === cityId)
  for (let i = 1; i < trip.days.length; i++) {
    const a = place(trip.days[i - 1].cityId)
    const b = place(trip.days[i].cityId)
    if (a && b && a.id !== b.id) legs.push({ dayIndex: i + 1, date: trip.days[i].date, fromName: a.name, fromLat: a.lat, fromLon: a.lon, toName: b.name, toLat: b.lat, toLon: b.lon })
  }
  // Without cities, the first and last neighborhoods stand in for where the trip starts and ends.
  const first = place(trip.days[0]?.cityId) ?? trip.days[0]?.zones[0] ?? zones[0]
  const last = place(trip.days.at(-1)?.cityId) ?? trip.days.at(-1)?.zones[0] ?? zones.at(-1)
  if (from && first) legs.unshift({ dayIndex: 1, date: trip.startDate, fromName: from.name, fromLat: from.lat, fromLon: from.lon, toName: first.name, toLat: first.lat, toLon: first.lon })
  if (from && last) legs.push({ dayIndex: trip.days.length, date: trip.endDate, fromName: last.name, fromLat: last.lat, fromLon: last.lon, toName: from.name, toLat: from.lat, toLon: from.lon })
  return legs.slice(0, 8)
}
