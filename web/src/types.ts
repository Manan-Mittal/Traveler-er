export type Category = 'sight' | 'food' | 'cafe' | 'nature' | 'shop' | 'stay' | 'transit' | 'other'

export interface Stop {
  id: string
  name: string
  lat: number
  lon: number
  category: Category
  notes: string
  source: 'user' | 'assistant'
  why?: string
}

export interface Zone {
  name: string
  lat: number
  lon: number
  walkMinutes: 15 | 30 | 45 | 60
}

export interface Day {
  id: string
  date: string
  title: string
  zone?: Zone
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
  days: Day[]
  bookings: Booking[]
  createdAt: number
  updatedAt: number
}
