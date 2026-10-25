import { useSyncExternalStore } from 'react'
import type { Booking, Day, Stop, Trip } from './types'

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

/** Coerce untrusted JSON (old saves, import files) into a valid trip, or null if it isn't one. */
const cleanTrip = (x: unknown): Trip | null => {
  if (!isObj(x) || typeof x.id !== 'string' || !x.id || !isDate(x.startDate) || !isDate(x.endDate)) return null
  const days = (Array.isArray(x.days) ? x.days : []).filter(isObj).filter((d) => isDate(d.date)).map(
    (d): Day => ({
      ...(d as unknown as Day),
      id: str(d.id) || uid(),
      title: str(d.title),
      notes: str(d.notes),
      stops: (Array.isArray(d.stops) ? d.stops : []).filter(
        (s): s is Stop => isObj(s) && typeof s.lat === 'number' && typeof s.lon === 'number' && typeof s.name === 'string',
      ).map((s) => ({ ...s, id: str(s.id) || uid() })),
    }),
  )
  const bookings = (Array.isArray(x.bookings) ? x.bookings : []).filter(isObj).map(
    (b): Booking => ({ ...(b as unknown as Booking), id: str(b.id) || uid(), title: str(b.title), deadline: isDate(b.deadline) ? b.deadline : undefined, status: b.status === 'booked' ? 'booked' : 'todo', url: httpUrl(b.url) }),
  )
  return { ...(x as unknown as Trip), name: str(x.name, 'Untitled trip'), days, bookings }
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
  createTrip(name: string, startDate: string, endDate: string) {
    const days: Day[] = dayList(startDate, endDate).map((date, i) => ({
      id: uid(),
      date,
      title: `Day ${i + 1}`,
      stops: [],
      notes: '',
    }))
    const trip: Trip = { id: uid(), name, startDate, endDate, days, bookings: [], createdAt: Date.now(), updatedAt: Date.now() }
    set({ trips: [trip, ...state.trips], tripId: trip.id, dayId: days[0]?.id ?? null })
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
