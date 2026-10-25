import { useRef, useState } from 'react'
import { actions } from '../store'
import type { Trip } from '../types'
import { Btn, Input, Row, Sub, Title } from './kit'

export default function TripList({ trips }: { trips: Trip[] }) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const file = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState('')
  const valid = name.trim() && start && end && end >= start

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
                {t.startDate} to {t.endDate} · {t.days.length} days
              </Sub>
            </div>
            <span className="text-[var(--text-2)]">›</span>
          </Row>
        ))}
      </div>
      {adding ? (
        <div className="space-y-2">
          <Input autoFocus placeholder="Trip name, e.g. Taiwan" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="flex gap-2">
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            <Input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Btn kind="primary" disabled={!valid} onClick={() => (actions.createTrip(name.trim(), start, end), setAdding(false))}>
              Create trip
            </Btn>
            <Btn kind="ghost" onClick={() => setAdding(false)}>
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
                actions.importAll(await f.text())
                setMsg('Imported.')
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
