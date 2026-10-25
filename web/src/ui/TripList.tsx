import { useRef, useState } from 'react'
import { actions } from '../store'
import type { Trip } from '../types'
import { Btn, Input, Row, Sub, Title } from './kit'
import { DateRangePicker } from './DatePicker'
import ImportList from './ImportList'
import { differenceInCalendarDays, parseISO } from 'date-fns'

const MAX_DAYS = 366
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export default function TripList({ trips }: { trips: Trip[] }) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const file = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState('')
  const [importing, setImporting] = useState(false)
  const length = start && end ? differenceInCalendarDays(parseISO(end), parseISO(start)) + 1 : 0
  const tooLong = length > MAX_DAYS
  const valid = name.trim() && start && end && end >= start && !tooLong
  const reset = () => (setAdding(false), setName(''), setStart(''), setEnd(''))

  if (importing) return <ImportList trips={trips} onClose={() => setImporting(false)} />

  return (
    <div className="space-y-5">
      <Title>Trips</Title>
      {trips.length === 0 && !adding && <Sub>Plan your first trip. Each day gets its own walkable zone on the map.</Sub>}
      <div>
        {trips.map((t) => (
          <Row key={t.id} onClick={() => actions.openTrip(t.id)}>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[16px] font-semibold">{t.name}</div>
              <Sub>
                {t.startDate} to {t.endDate} · {plural(t.days.length, 'day')}
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
        <div className="flex flex-wrap gap-2">
          <Btn kind="primary" onClick={() => setAdding(true)}>
            New trip
          </Btn>
          <Btn
            onClick={() => {
              const a = document.createElement('a')
              a.href = URL.createObjectURL(new Blob([actions.exportAll()], { type: 'application/json' }))
              a.download = 'traveler-er-trips.json'
              a.click()
            }}
          >
            Export
          </Btn>
          <Btn onClick={() => actions.addSampleTrip()}>Try the Taiwan sample</Btn>
          <Btn onClick={() => setImporting(true)}>Import Google Maps lists</Btn>
          <Btn onClick={() => file.current?.click()}>Import</Btn>
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
