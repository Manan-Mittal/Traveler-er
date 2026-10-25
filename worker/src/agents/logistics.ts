import { bookBy } from './run.ts'
import type { Accepted } from './critic.ts'
import type { Zone } from './scout.ts'

export interface BookingDraft {
  title: string
  kind: 'flight' | 'train' | 'restaurant' | 'ticket' | 'other'
  dayIndex?: number
  deadline?: string
  url?: string
  why: string
}

/**
 * Logistics agent: turns the curator's flags and OSM's `reservation` / `fee` tags into booking to-dos.
 * Deadlines are rules, not model guesses: a week ahead for required tables, three days for recommended ones and tickets.
 */
export function bookingsFor(zone: Zone, picks: Accepted[], today?: string): BookingDraft[] {
  const out: BookingDraft[] = []
  for (const { place, book } of picks) {
    const res = place.tags.reservation
    const eats = place.category === 'food' || place.category === 'cafe'
    if (res === 'required' || res === 'yes' || res === 'recommended') {
      out.push({
        title: `Reserve ${place.name}`,
        kind: eats ? 'restaurant' : 'ticket',
        dayIndex: zone.dayIndex,
        deadline: bookBy(zone.date, res === 'recommended' ? 3 : 7, today),
        why: `OpenStreetMap lists reservations as ${res}.`,
      })
    } else if (book !== 'none') {
      out.push({
        title: book === 'reserve' ? `Reserve ${place.name}` : `Tickets for ${place.name}`,
        kind: book === 'reserve' ? 'restaurant' : 'ticket',
        dayIndex: zone.dayIndex,
        deadline: bookBy(zone.date, 3, today),
        why: book === 'reserve' ? 'Usually needs a table booked; worth checking.' : 'May need a timed ticket or sell out; worth checking.',
      })
    }
  }
  return out
}
