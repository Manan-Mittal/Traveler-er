import { useRef, useState } from 'react'
import { actions } from '../store'
import type { Trip } from '../types'
import { Btn, Input, Row, Sub, Title } from './kit'
import { formatRange } from '../format'
import { DateRangePicker } from './DatePicker'
import ImportList from './ImportList'
import Account from './Account'
import { useSession } from '../auth'
import { LANGUAGES, setLang, useLang } from '../lang'
import { differenceInCalendarDays, parseISO } from 'date-fns'

const MAX_DAYS = 366
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export default function TripList({ trips, onWorld }: { trips: Trip[]; onWorld: () => void }) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const file = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState('')
  const [importing, setImporting] = useState(false)
  const session = useSession()
  const { chosen, lang } = useLang()
  const length = start && end ? differenceInCalendarDays(parseISO(end), parseISO(start)) + 1 : 0
  const tooLong = length > MAX_DAYS
  const valid = name.trim() && start && end && end >= start && !tooLong
  const reset = () => (setAdding(false), setName(''), setStart(''), setEnd(''))

  if (importing) return <ImportList trips={trips} onClose={() => setImporting(false)} />

  return (
    <div className="space-y-5">
      <Account />
      <button onClick={onWorld} className="flex min-h-11 w-full items-center gap-3 rounded-2xl bg-[var(--accent-soft)] px-4 py-3 text-left">
        <span aria-hidden className="text-[22px]">🌍</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold">Where I've been</span>
          <span className="block text-[12px] text-[var(--text-2)]">Countries, continents and cities you've visited</span>
        </span>
        <span className="text-[var(--text-2)]">›</span>
      </button>
      <label className="flex items-center justify-between gap-3 text-[13px] text-[var(--text-2)]">
        <span>Show place names in</span>
        <select
          value={chosen}
          onChange={(e) => setLang(e.target.value)}
          className="min-h-9 rounded-lg bg-[var(--accent-soft)] px-2 text-[14px] text-[var(--text)] pointer-coarse:min-h-11"
        >
          <option value="">Automatic ({LANGUAGES.find(([c]) => c === lang)?.[1]})</option>
          {LANGUAGES.map(([c, label]) => (
            <option key={c} value={c}>{label}</option>
          ))}
        </select>
      </label>
      <Title>Trips</Title>
      {trips.length === 0 && !adding && <Sub>Plan your first trip. Each day gets its own walkable zone on the map.</Sub>}
      <div>
        {trips.map((t) => (
          <Row key={t.id} onClick={() => actions.openTrip(t.id)}>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[16px] font-semibold">{t.name}</div>
              <Sub>
                {formatRange(t.startDate, t.endDate)} · {plural(t.days.length, 'day')}
              </Sub>
            </div>
            <span className="text-[var(--text-2)]">›</span>
          </Row>
        ))}
      </div>
      {adding ? (
        <div className="space-y-2">
          <label className="block text-[13px] font-semibold text-[var(--text-2)]" htmlFor="trip-name">Name your trip</label>
          <Input id="trip-name" autoFocus placeholder="e.g. Summer in Taiwan" value={name} onChange={(e) => setName(e.target.value)} />
          <Sub>Just a label. You'll pick the places and cities after you create it.</Sub>
          <div className="pt-1 text-[13px] font-semibold text-[var(--text-2)]">When</div>
          <DateRangePicker start={start} end={end} onChange={(a, b) => (setStart(a), setEnd(b))} />
          {tooLong && <p className="text-[12px] text-[var(--danger)]">Trips can be at most {MAX_DAYS} days. Pick a shorter range.</p>}
          <div className="flex gap-2">
            <Btn kind="primary" disabled={!valid} onClick={() => (actions.createTrip(name.trim(), start, end), reset())}>
              Create trip
            </Btn>
            <Btn kind="ghost" onClick={reset}>
              Cancel
            </Btn>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <Btn kind="primary" className="w-full" onClick={() => setAdding(true)}>
            New trip
          </Btn>
          <div className="overflow-hidden rounded-2xl bg-[var(--accent-soft)]">
            {[
              [session ? 'Try the Taiwan sample' : 'Try the Taiwan sample (sign in first)', () => (setMsg(''), actions.addSampleTrip().catch((e: Error) => setMsg(e.message)))],
              ['Import Google Maps lists', () => setImporting(true)],
              ['Import a trips file', () => file.current?.click()],
              [
                'Export all trips',
                () => {
                  const a = document.createElement('a')
                  a.href = URL.createObjectURL(new Blob([actions.exportAll()], { type: 'application/json' }))
                  a.download = 'traveler-er-trips.json'
                  a.click()
                },
              ],
            ].map(([label, run]) => (
              <button key={label as string} onClick={run as () => void} className="flex min-h-11 w-full items-center justify-between border-b border-[var(--line)] px-4 py-2.5 text-left text-[15px] text-[var(--accent)] last:border-0">
                {label as string}
                <span className="text-[var(--text-2)]">›</span>
              </button>
            ))}
          </div>
          <input
            ref={file}
            type="file"
            accept="application/json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0]
              if (!f) return
              try {
                const { added, skipped } = actions.importAll(await f.text())
                setMsg(added === 0 ? 'Nothing new to import: those trips are already here.' : `Imported ${plural(added, 'trip')}${skipped ? `, ${skipped} already here` : ''}.`)
              } catch (err) {
                setMsg((err as Error).message)
              }
              e.target.value = ''
            }}
          />
        </div>
      )}
      {msg && <Sub>{msg}</Sub>}
    </div>
  )
}
