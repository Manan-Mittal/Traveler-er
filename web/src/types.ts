export type Category = 'sight' | 'food' | 'cafe' | 'nature' | 'shop' | 'stay' | 'transit' | 'other'

export interface Stop {
  id: string
  name: string
  lat: number
  lon: number
  category: Category
  notes: string
  source: 'user' | 'assistant' | 'import'
  why?: string
  zoneId?: string
  cityId?: string
  listName?: string
  url?: string
}

export interface City {
  id: string
  name: string
  lat: number
  lon: number
}

export interface Zone {
  id: string
  name: string
  lat: number
  lon: number
  walkMinutes: 15 | 30 | 45 | 60
  /** How you get here from the previous zone of the day. */
  arriveBy?: 'transit' | 'drive'
}

export interface Day {
  id: string
  date: string
  title: string
  cityId?: string
  zones: Zone[]
  stops: Stop[]
  notes: string
}

export type BookingKind = 'flight' | 'train' | 'lodging' | 'ticket' | 'restaurant' | 'other'

export interface Booking {
  id: string
  title: string
  kind: BookingKind
  dayId?: string
  deadline?: string
  url?: string
  status: 'todo' | 'booked'
}

export interface Trip {
  id: string
  name: string
  startDate: string
  endDate: string
  /** Cities for a country or multi-city trip; empty for a single-destination trip. */
  cities: City[]
  days: Day[]
  /** Places saved to the trip (for example imported lists) that aren't in a day yet. */
  inbox: Stop[]
  bookings: Booking[]
  createdAt: number
  updatedAt: number
}
