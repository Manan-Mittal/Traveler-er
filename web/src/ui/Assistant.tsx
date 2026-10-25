import { useState } from 'react'
import { actions } from '../store'
import type { Day } from '../types'
import { assistantEnabled, draftDay, type DraftStop } from '../services/assistant'
import { Btn, Input, Row, Sub, icon } from './kit'

export default function Assistant({ tripId, day }: { tripId: string; day: Day }) {
  const [interests, setInterests] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState<DraftStop[] | null>(null)
  const [keep, setKeep] = useState<Set<number>>(new Set())

  if (!day.zone) return null

  const ask = async () => {
    setBusy(true)
    setError('')
    try {
      const stops = await draftDay(day.zone!, interests, 5)
      setDraft(stops)
      setKeep(new Set(stops.map((_, i) => i)))
      if (stops.length === 0) setError('Nothing found in this zone. Try a longer walk time.')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const apply = () => {
    draft?.forEach((s, i) => {
      if (keep.has(i)) actions.addStop(tripId, day.id, { name: s.name, lat: s.lat, lon: s.lon, category: s.category, notes: '', source: 'assistant', why: s.why })
    })
    setDraft(null)
  }

  return (
    <section className="space-y-2">
      <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[var(--text-2)]">Local picks</h2>
      {!assistantEnabled ? (
        <Sub>The assistant isn't connected yet. It will suggest real, lesser-known places inside this zone.</Sub>
      ) : draft && draft.length > 0 ? (
        <div className="space-y-2">
          <Sub>Review the draft. Nothing is added until you apply it.</Sub>
          <div>
            {draft.map((s, i) => (
              <Row key={i}>
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-[var(--accent)]"
                  checked={keep.has(i)}
                  onChange={() => setKeep((k) => (k.has(i) ? new Set([...k].filter((x) => x !== i)) : new Set(k).add(i)))}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-medium">
                    {icon[s.category] ?? '📍'} {s.name}
                  </div>
                  <Sub>{s.why}</Sub>
                </div>
              </Row>
            ))}
          </div>
          <div className="flex gap-2">
            <Btn kind="primary" disabled={keep.size === 0} onClick={apply}>
              Add {keep.size} to day
            </Btn>
            <Btn kind="ghost" onClick={() => setDraft(null)}>
              Discard
            </Btn>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <Input aria-label="What are you into?" placeholder="What are you into? e.g. old temples, tea, quiet cafes" value={interests} onChange={(e) => setInterests(e.target.value)} />
          <Btn kind="primary" disabled={busy} onClick={ask}>
            {busy ? 'Looking…' : `Suggest places near ${day.zone.name}`}
          </Btn>
        </div>
      )}
      {error && <p className="text-[12px] text-[var(--danger)]">{error}</p>}
    </section>
  )
}
