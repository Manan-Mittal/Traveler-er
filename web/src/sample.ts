import type { Booking, Category, City, Day, Stop, Trip, Zone } from './types'
import { api } from './auth'

// A ready-made two-week Taiwan trip so new visitors can see multi-city days, zone hops and bookings without building one.
// The itinerary lives in the worker (worker/src/sample.ts) and is only sent to signed-in users.

type P = [name: string, lat: number, lon: number, category: Category, why?: string]
type Z = { name: string; lat: number; lon: number; walk?: Zone['walkMinutes']; by?: Zone['arriveBy']; stops?: P[] }
type D = { title: string; city: string; zones: Z[]; notes?: string }
export interface SampleData {
  start: string
  cities: Record<string, [number, number]>
  days: D[]
  bookings: [string, Booking['kind'], string | undefined, number | undefined][]
}

/** Fetches the sample itinerary. Needs a signed-in session. */
export async function fetchSample(): Promise<SampleData> {
  const r = await api('/api/sample')
  if (r.status === 401) throw new Error('Sign in to open the Taiwan sample.')
  if (r.status === 403) throw new Error('The Taiwan sample is private to its owner.')
  if (!r.ok) throw new Error('Couldn’t load the sample, try again in a moment.')
  return (await r.json()) as SampleData
}

/** A fresh copy of the sample trip with new ids, so it can be edited like any other trip. */
export function sampleTrip(data: SampleData): Trip {
  const uid = () => crypto.randomUUID()
  const cities: City[] = Object.entries(data.cities).map(([name, [lat, lon]]) => ({ id: uid(), name, lat, lon }))
  const cityId = (name: string) => cities.find((c) => c.name === name)!.id
  const start = Date.parse(`${data.start}T00:00:00Z`)
  const days: Day[] = data.days.map((d, i) => {
    const zones: Zone[] = d.zones.map((z) => ({ id: uid(), name: z.name, lat: z.lat, lon: z.lon, walkMinutes: z.walk ?? 30, arriveBy: z.by ?? 'transit' }))
    const stops: Stop[] = d.zones.flatMap((z, zi) =>
      (z.stops ?? []).map(([name, lat, lon, category, why]) => ({ id: uid(), name, lat, lon, category, why, notes: '', source: 'user' as const, zoneId: zones[zi].id })),
    )
    return { id: uid(), date: new Date(start + i * 86400_000).toISOString().slice(0, 10), title: d.title, cityId: cityId(d.city), zones, stops, notes: d.notes ?? '' }
  })
  const bookings: Booking[] = data.bookings.map(([title, kind, deadline, day]) => ({ id: uid(), title, kind, deadline, dayId: day === undefined ? undefined : days[day].id, status: 'todo' }))
  const now = Date.now()
  return { id: uid(), name: 'Taiwan sample trip', startDate: days[0].date, endDate: days[days.length - 1].date, cities, days, inbox: [], bookings, createdAt: now, updatedAt: now }
}
