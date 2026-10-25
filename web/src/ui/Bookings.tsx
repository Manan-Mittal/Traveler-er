import { useState } from 'react'
import { actions } from '../store'
import type { BookingKind, Trip } from '../types'
import { Btn, Input, Row, Sub } from './kit'

const KINDS: BookingKind[] = ['flight', 'train', 'lodging', 'ticket', 'restaurant', 'other']
const emoji: Record<BookingKind, string> = { flight: '✈️', train: '🚆', lodging: '🛏️', ticket: '🎟️', restaurant: '🍽️', other: '📌' }

export default function Bookings({ trip }: { trip: Trip }) {
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<BookingKind>('ticket')
  const [deadline, setDeadline] = useState('')
  const [url, setUrl] = useState('')
  const sorted = [...trip.bookings].sort((a, b) => Number(a.status === 'booked') - Number(b.status === 'booked') || (a.deadline ?? '9').localeCompare(b.deadline ?? '9'))

  return (
    <section className="space-y-2">
      <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[var(--text-2)]">To book</h2>
      <div>
        {sorted.map((b) => (
          <Row key={b.id}>
            <input type="checkbox" checked={b.status === 'booked'} onChange={() => actions.toggleBooking(trip.id, b.id)} className="h-5 w-5 accent-[var(--accent)]" />
            <div className="min-w-0 flex-1">
              <div className={`truncate text-[15px] ${b.status === 'booked' ? 'text-[var(--text-2)] line-through' : 'font-medium'}`}>
                {emoji[b.kind]} {b.title}
              </div>
              <Sub>
                {b.deadline ? `Book by ${b.deadline}` : 'No deadline'}
                {b.url && (
                  <>
                    {' · '}
                    <a href={b.url} target="_blank" rel="noreferrer" className="text-[var(--accent)]">
                      Open link
                    </a>
                  </>
                )}
              </Sub>
            </div>
            <button className="px-1 text-[var(--text-2)]" onClick={() => actions.removeBooking(trip.id, b.id)}>✕</button>
          </Row>
        ))}
      </div>
      <div className="space-y-2">
        <Input placeholder="What needs booking?" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="flex gap-2">
          <select value={kind} onChange={(e) => setKind(e.target.value as BookingKind)} className="rounded-xl bg-[var(--accent-soft)] px-3 py-2.5 text-[15px] outline-none">
            {KINDS.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
          <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </div>
        <Input placeholder="Link (optional)" value={url} onChange={(e) => setUrl(e.target.value)} />
        <Btn
          disabled={!title.trim()}
          onClick={() => {
            const safe = /^https?:\/\//i.test(url.trim()) ? url.trim() : undefined
            actions.addBooking(trip.id, { title: title.trim(), kind, deadline: deadline || undefined, url: safe, status: 'todo' })
            setTitle(''); setDeadline(''); setUrl('')
          }}
        >
          Add
        </Btn>
      </div>
    </section>
  )
}
