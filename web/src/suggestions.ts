import type { Booking, BookingKind, Trip } from './types'

export interface Suggestion {
  key: string
  title: string
  kind: BookingKind
  dayId?: string
  deadline?: string
  why: string
}

const shiftDays = (date: string, days: number) => {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Rule-based reminders about what usually needs booking, based on what the trip contains. */
export function suggestBookings(trip: Trip): Suggestion[] {
  const out: Suggestion[] = []
  const have = (kind: BookingKind) => trip.bookings.some((b: Booking) => b.kind === kind)

  if (!have('flight')) out.push({ key: 'flight', title: 'Flights', kind: 'flight', deadline: shiftDays(trip.startDate, -60), why: 'Fares usually rise inside two months of departure.' })
  if (!have('lodging')) out.push({ key: 'lodging', title: 'Lodging for the whole trip', kind: 'lodging', deadline: shiftDays(trip.startDate, -45), why: 'Best-located places go first.' })

  for (const day of trip.days) {
    for (const s of day.stops) {
      if (s.category === 'sight') {
        out.push({ key: `t-${s.id}`, title: `Check if ${s.name} needs a timed ticket`, kind: 'ticket', dayId: day.id, deadline: shiftDays(day.date, -14), why: `Day ${trip.days.indexOf(day) + 1}. Popular sights often sell out.` })
      } else if (s.category === 'food') {
        out.push({ key: `r-${s.id}`, title: `Reserve ${s.name}`, kind: 'restaurant', dayId: day.id, deadline: shiftDays(day.date, -7), why: `Day ${trip.days.indexOf(day) + 1}. Small places fill up, ask about walk-ins too.` })
      }
    }
  }

  const today = new Date().toISOString().slice(0, 10)
  for (const s of out) {
    if (s.deadline && s.deadline < today) {
      s.deadline = undefined
      s.why += ' The usual lead time has passed, so book soon.'
    }
  }

  const planned = new Set(trip.bookings.map((b) => b.title.toLowerCase()))
  return out.filter((s) => !planned.has(s.title.toLowerCase()))
}
