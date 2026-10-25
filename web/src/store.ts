import { useSyncExternalStore } from 'react'
import type { Booking, City, Day, Stop, Trip, Zone } from './types'
import { sampleTrip } from './sample'
import { distanceKm } from './geo'

const KEY = 'traveler-er:v1'

interface State {
  trips: Trip[]
  tripId: string | null
  dayId: string | null
}

const uid = () => crypto.randomUUID()

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const str = (x: unknown, fallback = '') => (typeof x === 'string' ? x : fallback)
const isDate = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && !isNaN(Date.parse(x))
const httpUrl = (x: unknown) => (typeof x === 'string' && /^https?:\/\//i.test(x.trim()) ? x.trim() : undefined)

const cleanStops = (list: unknown): Stop[] =>
  (Array.isArray(list) ? list : [])
    .filter((s): s is Stop => isObj(s) && typeof s.lat === 'number' && typeof s.lon === 'number' && typeof s.name === 'string')
    .map((s) => ({ ...s, id: str(s.id) || uid(), url: httpUrl(s.url) }))

const cleanZones = (d: Record<string, unknown>): Zone[] => {
  // Older saves had a single `zone` per day.
  const raw = Array.isArray(d.zones) ? d.zones : isObj(d.zone) ? [d.zone] : []
  return raw
    .filter((z): z is Zone => isObj(z) && typeof z.lat === 'number' && typeof z.lon === 'number' && typeof z.name === 'string')
    .map((z) => ({ ...z, id: str(z.id) || uid(), walkMinutes: [15, 30, 45, 60].includes(z.walkMinutes) ? z.walkMinutes : 30, arriveBy: z.arriveBy === 'drive' ? 'drive' : 'transit' }))
}

const cleanCities = (list: unknown): City[] =>
  (Array.isArray(list) ? list : [])
    .filter((c): c is City => isObj(c) && typeof c.lat === 'number' && typeof c.lon === 'number' && typeof c.name === 'string')
    .map((c) => ({ ...c, id: str(c.id) || uid() }))

/** Coerce untrusted JSON (old saves, import files) into a valid trip, or null if it isn't one. */
const cleanTrip = (x: unknown): Trip | null => {
  if (!isObj(x) || typeof x.id !== 'string' || !x.id || !isDate(x.startDate) || !isDate(x.endDate)) return null
  const cities = cleanCities(x.cities)
  const days = (Array.isArray(x.days) ? x.days : []).filter(isObj).filter((d) => isDate(d.date)).map((d): Day => {
    const { zone: _legacy, ...rest } = d
    void _legacy
    return {
      ...(rest as unknown as Day),
      id: str(d.id) || uid(),
      title: str(d.title),
      notes: str(d.notes),
      cityId: cities.some((c) => c.id === d.cityId) ? (d.cityId as string) : undefined,
      zones: cleanZones(d),
      stops: cleanStops(d.stops),
    }
  })
  const bookings = (Array.isArray(x.bookings) ? x.bookings : []).filter(isObj).map(
    (b): Booking => ({ ...(b as unknown as Booking), id: str(b.id) || uid(), title: str(b.title), deadline: isDate(b.deadline) ? b.deadline : undefined, status: b.status === 'booked' ? 'booked' : 'todo', url: httpUrl(b.url) }),
  )
  return { ...(x as unknown as Trip), name: str(x.name, 'Untitled trip'), cities, days, inbox: cleanStops(x.inbox), bookings }
}

const cleanTrips = (list: unknown[]): Trip[] => {
  const seen = new Set<string>()
  return list.map(cleanTrip).filter((t): t is Trip => !!t && !seen.has(t.id) && !!seen.add(t.id))
}

const load = (): State => {
  try {
    const raw = localStorage.getItem(KEY)
    const data: unknown = raw ? JSON.parse(raw) : null
    if (isObj(data) && Array.isArray(data.trips)) {
      const trips = cleanTrips(data.trips)
      const tripId = trips.some((t) => t.id === data.tripId) ? (data.tripId as string) : null
      const dayId = typeof data.dayId === 'string' ? data.dayId : null
      return { trips, tripId, dayId: tripId ? dayId : null }
    }
  } catch {
    // fall through to empty state
  }
  return { trips: [], tripId: null, dayId: null }
}

let state = load()
const listeners = new Set<() => void>()

const set = (next: State) => {
  state = next
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // storage unavailable; keep in memory
  }
  listeners.forEach((l) => l())
}

export const getState = () => state

export const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => void listeners.delete(l)
}

export const useStore = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )

const dayList = (start: string, end: string): string[] => {
  const out: string[] = []
  const d = new Date(start + 'T00:00:00Z')
  const last = new Date(end + 'T00:00:00Z')
  while (d <= last && out.length < 366) {
    out.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return out
}

const updateTrip = (id: string, fn: (t: Trip) => Trip) =>
  set({ ...state, trips: state.trips.map((t) => (t.id === id ? { ...fn(t), updatedAt: Date.now() } : t)) })

export const actions = {
  /** Swaps in trips merged from the cloud (validated like any untrusted input), keeping the open trip if it still exists. */
  replaceTrips(list: unknown[]) {
    const trips = cleanTrips(list)
    const open = trips.some((t) => t.id === state.tripId)
    set({ trips, tripId: open ? state.tripId : null, dayId: open ? state.dayId : null })
  },
  /** Forgets every trip on this device (used on sign-out). */
  clearAll() {
    set({ trips: [], tripId: null, dayId: null })
  },
  exportAll(): string {
    return JSON.stringify({ app: 'traveler-er', version: 1, trips: state.trips }, null, 2)
  },
  /** Adds trips from an export file, skipping ones already here. Returns how many were added and skipped. */
  importAll(text: string): { added: number; skipped: number } {
    const data: unknown = JSON.parse(text)
    if (!isObj(data) || data.app !== 'traveler-er' || !Array.isArray(data.trips)) throw new Error('Not a Traveler-er export file')
    const have = new Set(state.trips.map((t) => t.id))
    const fresh = cleanTrips(data.trips).filter((t) => !have.has(t.id))
    set({ ...state, trips: [...fresh, ...state.trips] })
    return { added: fresh.length, skipped: data.trips.length - fresh.length }
  },
  /** Returns the new trip's id. */
  createTrip(name: string, startDate: string, endDate: string): string {
    const days: Day[] = dayList(startDate, endDate).map((date, i) => ({
      id: uid(),
      date,
      title: `Day ${i + 1}`,
      zones: [],
      stops: [],
      notes: '',
    }))
    const trip: Trip = { id: uid(), name, startDate, endDate, cities: [], days, inbox: [], bookings: [], createdAt: Date.now(), updatedAt: Date.now() }
    set({ trips: [trip, ...state.trips], tripId: trip.id, dayId: days[0]?.id ?? null })
    return trip.id
  },
  /** Adds an editable copy of the built-in Taiwan sample trip and opens it. */
  addSampleTrip() {
    const trip = sampleTrip()
    set({ trips: [trip, ...state.trips], tripId: trip.id, dayId: trip.days[0].id })
  },
  deleteTrip(id: string) {
    set({ trips: state.trips.filter((t) => t.id !== id), tripId: null, dayId: null })
  },
  openTrip(id: string | null) {
    const t = state.trips.find((x) => x.id === id)
    set({ ...state, tripId: id, dayId: t?.days[0]?.id ?? null })
  },
  openDay(id: string | null) {
    set({ ...state, dayId: id })
  },
  patchDay(tripId: string, dayId: string, patch: Partial<Day>) {
    updateTrip(tripId, (t) => ({ ...t, days: t.days.map((d) => (d.id === dayId ? { ...d, ...patch } : d)) }))
  },
  /** Returns the new city's id. */
  addCity(tripId: string, city: Omit<City, 'id'>): string {
    const id = uid()
    updateTrip(tripId, (t) => ({ ...t, cities: [...t.cities, { ...city, id }] }))
    return id
  },
  removeCity(tripId: string, cityId: string) {
    updateTrip(tripId, (t) => ({
      ...t,
      cities: t.cities.filter((c) => c.id !== cityId),
      days: t.days.map((d) => (d.cityId === cityId ? { ...d, cityId: undefined } : d)),
      inbox: t.inbox.map((s) => (s.cityId === cityId ? { ...s, cityId: undefined } : s)),
    }))
  },
  setDayCity(tripId: string, dayId: string, cityId: string | undefined) {
    updateTrip(tripId, (t) => ({ ...t, days: t.days.map((d) => (d.id === dayId ? { ...d, cityId } : d)) }))
  },
  /**
   * Gives days without a city one, leaving days that already have a city alone. A day with areas goes to the
   * city nearest its first area; the rest are spread over the cities in order, as evenly as possible.
   */
  splitDaysAcrossCities(tripId: string) {
    updateTrip(tripId, (t) => {
      const n = t.cities.length
      if (n === 0) return t
      const nearest = (p: { lat: number; lon: number }) => {
        const c = t.cities.reduce((best, c) => (distanceKm(c, p) < distanceKm(best, p) ? c : best))
        return distanceKm(c, p) < 150 ? c.id : undefined
      }
      const days = t.days.map((d) => (d.cityId || !d.zones[0] ? d : { ...d, cityId: nearest(d.zones[0]) }))
      const open = days.flatMap((d, i) => (d.cityId ? [] : [i]))
      open.forEach((dayIndex, k) => (days[dayIndex] = { ...days[dayIndex], cityId: t.cities[Math.min(n - 1, Math.floor((k * n) / open.length))].id }))
      return { ...t, days }
    })
  },
  /** Returns the new zone's id. */
  addZone(tripId: string, dayId: string, zone: Omit<Zone, 'id'>): string {
    const id = uid()
    updateTrip(tripId, (t) => ({
      ...t,
      days: t.days.map((d) => (d.id === dayId ? { ...d, zones: [...d.zones, { ...zone, id }] } : d)),
    }))
    return id
  },
  patchZone(tripId: string, dayId: string, zoneId: string, patch: Partial<Omit<Zone, 'id'>>) {
    updateTrip(tripId, (t) => ({
      ...t,
      days: t.days.map((d) => (d.id === dayId ? { ...d, zones: d.zones.map((z) => (z.id === zoneId ? { ...z, ...patch } : z)) } : d)),
    }))
  },
  removeZone(tripId: string, dayId: string, zoneId: string) {
    updateTrip(tripId, (t) => ({
      ...t,
      days: t.days.map((d) =>
        d.id === dayId ? { ...d, zones: d.zones.filter((z) => z.id !== zoneId), stops: d.stops.filter((s) => s.zoneId !== zoneId) } : d,
      ),
    }))
  },
  moveZone(tripId: string, dayId: string, from: number, to: number) {
    updateTrip(tripId, (t) => ({
      ...t,
      days: t.days.map((d) => {
        if (d.id !== dayId || to < 0 || to >= d.zones.length) return d
        const zones = [...d.zones]
        zones.splice(to, 0, zones.splice(from, 1)[0])
        return { ...d, zones }
      }),
    }))
  },
  /** Saves places to the trip without putting them in a day yet. */
  addToInbox(tripId: string, stops: Omit<Stop, 'id'>[]) {
    updateTrip(tripId, (t) => ({ ...t, inbox: [...t.inbox, ...stops.map((s) => ({ ...s, id: uid() }))] }))
  },
  removeFromInbox(tripId: string, stopId: string) {
    updateTrip(tripId, (t) => ({ ...t, inbox: t.inbox.filter((s) => s.id !== stopId) }))
  },
  /** Moves a place from the inbox into a day (and optionally one of its zones). */
  assignFromInbox(tripId: string, stopId: string, dayId: string, zoneId?: string) {
    updateTrip(tripId, (t) => {
      const stop = t.inbox.find((s) => s.id === stopId)
      if (!stop) return t
      return {
        ...t,
        inbox: t.inbox.filter((s) => s.id !== stopId),
        days: t.days.map((d) => (d.id === dayId ? { ...d, stops: [...d.stops, { ...stop, zoneId, cityId: d.cityId ?? stop.cityId }] } : d)),
      }
    })
  },
  addStop(tripId: string, dayId: string, stop: Omit<Stop, 'id'>) {
    updateTrip(tripId, (t) => ({
      ...t,
      days: t.days.map((d) => (d.id === dayId ? { ...d, stops: [...d.stops, { ...stop, id: uid() }] } : d)),
    }))
  },
  removeStop(tripId: string, dayId: string, stopId: string) {
    updateTrip(tripId, (t) => ({
      ...t,
      days: t.days.map((d) => (d.id === dayId ? { ...d, stops: d.stops.filter((s) => s.id !== stopId) } : d)),
    }))
  },
  moveStop(tripId: string, dayId: string, from: number, to: number) {
    updateTrip(tripId, (t) => ({
      ...t,
      days: t.days.map((d) => {
        if (d.id !== dayId || to < 0 || to >= d.stops.length) return d
        const stops = [...d.stops]
        stops.splice(to, 0, stops.splice(from, 1)[0])
        return { ...d, stops }
      }),
    }))
  },
  addBooking(tripId: string, b: Omit<Booking, 'id'>) {
    updateTrip(tripId, (t) => ({ ...t, bookings: [...t.bookings, { ...b, id: uid() }] }))
  },
  toggleBooking(tripId: string, id: string) {
    updateTrip(tripId, (t) => ({
      ...t,
      bookings: t.bookings.map((b) => (b.id === id ? { ...b, status: b.status === 'todo' ? 'booked' : 'todo' } : b)),
    }))
  },
  removeBooking(tripId: string, id: string) {
    updateTrip(tripId, (t) => ({ ...t, bookings: t.bookings.filter((b) => b.id !== id) }))
  },
}
