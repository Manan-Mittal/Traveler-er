import { useSyncExternalStore } from 'react'
import type { Booking, Day, Stop, Trip } from './types'

const KEY = 'traveler-er:v1'

interface State {
  trips: Trip[]
  tripId: string | null
  dayId: string | null
}

const uid = () => crypto.randomUUID()

const load = (): State => {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as State
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
  while (d <= last && out.length < 60) {
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
  importAll(text: string) {
    const data = JSON.parse(text) as { app?: string; trips?: Trip[] }
    if (data.app !== 'traveler-er' || !Array.isArray(data.trips)) throw new Error('Not a Traveler-er export file')
    const have = new Set(state.trips.map((t) => t.id))
    set({ ...state, trips: [...data.trips.filter((t) => !have.has(t.id)), ...state.trips] })
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
