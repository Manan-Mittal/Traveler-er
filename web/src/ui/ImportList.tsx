import { useEffect, useRef, useState } from 'react'
import { actions } from '../store'
import type { Trip } from '../types'
import { readTakeout } from '../import/files'
import { resolvePlaces } from '../import/resolve'
import { flag, groupPlaces, type CountryGroup } from '../import/group'
import { addToTrip } from '../import/apply'
import type { RawPlace } from '../import/takeout'
import { fetchSharedList, sharedListsEnabled } from '../import/sharedList'
import { DateRangePicker } from './DatePicker'
import { Btn, Input, Sub } from './kit'

const plural = (n: number, word: string, many = word + 's') => `${n} ${n === 1 ? word : many}`

type Stage = { kind: 'pick'; error?: string } | { kind: 'working'; done: number; total: number } | { kind: 'review'; groups: CountryGroup[]; missing: RawPlace[]; notes: string[] }

/** Import Google Maps saved lists from a Takeout export and file them into trips by country and city. */
export default function ImportList({ trips, onClose }: { trips: Trip[]; onClose: () => void }) {
  const [stage, setStage] = useState<Stage>({ kind: 'pick' })
  const [dragging, setDragging] = useState(false)
  const [link, setLink] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const abort = useRef<AbortController | null>(null)
  const stop = useRef(false)
  useEffect(() => () => abort.current?.abort(), [])

  const resolve = async (places: RawPlace[], skipped: string[] = []) => {
    if (!places.length) return setStage({ kind: 'pick', error: 'That list has no places in it.' })
    abort.current = new AbortController()
    stop.current = false
    setStage({ kind: 'working', done: 0, total: places.length })
    const { found, missing, lookupFailed } = await resolvePlaces(places, (done, total) => setStage({ kind: 'working', done, total }), abort.current.signal, () => stop.current)
    const notes = [
      ...(lookupFailed ? ["The place lookup service didn't answer for some places, so their city or location may be missing. Try again in a few minutes."] : []),
      ...(skipped.length ? [`Couldn't read ${skipped.join(', ')}.`] : []),
      ...(stop.current && missing.length ? [`Stopped early, so some places weren't looked up yet. Import the same file again later to finish; places already found load instantly.`] : []),
    ]
    setStage({ kind: 'review', groups: groupPlaces(found), missing, notes })
  }
  const fail = (e: unknown) => (e as Error).name !== 'AbortError' && setStage({ kind: 'pick', error: (e as Error).message })

  const run = async (files: File[]) => {
    if (!files.length) return
    try {
      const { places, skipped } = await readTakeout(files)
      if (!places.length) {
        setStage({ kind: 'pick', error: skipped.length ? `Couldn't read ${skipped.join(', ')}.` : 'No saved places in those files. Pick the Saved folder or Saved Places.json from your Takeout export.' })
        return
      }
      await resolve(places, skipped)
    } catch (e) {
      fail(e)
    }
  }

  const runLink = async () => {
    setStage({ kind: 'working', done: 0, total: 0 })
    try {
      await resolve(await fetchSharedList(link))
    } catch (e) {
      fail(e)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[22px] font-bold tracking-tight">Import Google Maps lists</h2>
        <Btn kind="ghost" className="-mr-3" onClick={onClose}>
          {stage.kind === 'review' ? 'Done' : 'Cancel'}
        </Btn>
      </div>

      {stage.kind === 'pick' && (
        <>
          {sharedListsEnabled && (
            <form className="space-y-2" onSubmit={(e) => (e.preventDefault(), runLink())}>
              <label className="block text-[13px] font-semibold uppercase tracking-wide text-[var(--text-2)]" htmlFor="gmaps-link">
                Paste a shared list link
              </label>
              <div className="flex gap-2">
                <Input id="gmaps-link" inputMode="url" placeholder="https://maps.app.goo.gl/…" value={link} onChange={(e) => setLink(e.target.value)} />
                <Btn kind="primary" type="submit" disabled={!/^https:\/\/\S+$/.test(link.trim())}>
                  Import
                </Btn>
              </div>
              <Sub>In Google Maps, open the list, tap Share, and copy the link. The list has to be shared, not private.</Sub>
            </form>
          )}
          {sharedListsEnabled && <div className="text-center text-[12px] font-medium uppercase tracking-wide text-[var(--text-2)]">or import everything from Takeout</div>}
          <ol className="space-y-1.5 text-[14px] text-[var(--text-2)]">
            <li>
              1. Open{' '}
              <a className="font-medium text-[var(--accent)]" href="https://takeout.google.com/settings/takeout/custom/saved,maps" target="_blank" rel="noreferrer">
                Google Takeout
              </a>{' '}
              with <b>Saved</b> and <b>Maps (your places)</b> selected.
            </li>
            <li>2. Export once, then download the .zip Google emails you (usually a few minutes).</li>
            <li>3. Drop the .zip here, or individual list .csv files.</li>
          </ol>
          <button
            onClick={() => input.current?.click()}
            onDragOver={(e) => (e.preventDefault(), setDragging(true))}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => (e.preventDefault(), setDragging(false), run([...e.dataTransfer.files]))}
            className={`grid w-full place-items-center gap-1 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition ${dragging ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--line)]'}`}
          >
            <span className="text-[28px]">🗺️</span>
            <span className="text-[15px] font-semibold">Choose Takeout file</span>
            <span className="text-[12px] text-[var(--text-2)]">.zip, .csv or Saved Places.json · stays on your device</span>
          </button>
          <input ref={input} type="file" accept=".zip,.csv,.json" multiple hidden onChange={(e) => (run([...(e.target.files ?? [])]), (e.target.value = ''))} />
          {stage.error && <p className="text-[13px] text-[var(--danger)]">{stage.error}</p>}
        </>
      )}

      {stage.kind === 'working' && (
        <div className="space-y-2 py-4">
          <div className="h-2 overflow-hidden rounded-full bg-[var(--accent-soft)]">
            <div className="h-full rounded-full bg-[var(--accent)] transition-all" style={{ width: `${stage.total ? (stage.done / stage.total) * 100 : 5}%` }} />
          </div>
          <Sub>{stage.total ? `Finding where your places are… ${stage.done} of ${stage.total}` : 'Opening your list…'}</Sub>
          {stage.total > 20 && (
            <Btn onClick={() => (stop.current = true)}>Stop here and review what's found</Btn>
          )}
        </div>
      )}

      {stage.kind === 'review' && (
        <>
          <Sub>
            Found {plural(stage.groups.reduce((n, g) => n + g.count, 0), 'place')} in {plural(stage.groups.length, 'country', 'countries')}. Pick a trip for each; places land in its Saved places so you can drop them into days.
          </Sub>
          {stage.notes.map((n) => (
            <p key={n} className="text-[13px] text-[var(--danger)]">{n}</p>
          ))}
          {stage.groups.map((g) => (
            <CountryCard key={g.countryCode || g.country} group={g} trips={trips} />
          ))}
          {stage.missing.length > 0 && (
            <details className="text-[13px] text-[var(--text-2)]">
              <summary className="cursor-pointer">Couldn't place {plural(stage.missing.length, 'place')}</summary>
              <p className="mt-1">{stage.missing.map((p) => p.name).join(', ')}</p>
            </details>
          )}
        </>
      )}
    </div>
  )
}

function CountryCard({ group, trips }: { group: CountryGroup; trips: Trip[] }) {
  const [picked, setPicked] = useState(() => new Set(group.cities.map((c) => c.name)))
  const [target, setTarget] = useState<string>('new')
  const singleCity = group.cities.length === 1
  const [name, setName] = useState(singleCity ? group.cities[0].name : group.country)
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [result, setResult] = useState('')
  const chosen = group.cities.filter((c) => picked.has(c.name))
  const count = chosen.reduce((n, c) => n + c.places.length, 0)
  const ready = count > 0 && (target !== 'new' || (name.trim() && start && end))

  const save = () => {
    const existing = trips.find((t) => t.id === target)
    // createTrip opens the new trip; go straight back so the other countries stay on screen.
    const trip = existing ?? { id: actions.createTrip(name.trim(), start, end), cities: [], inbox: [], days: [] }
    actions.openTrip(null)
    const { added, skipped } = addToTrip(trip, chosen)
    setResult(`Added ${plural(added, 'place')} to ${existing?.name ?? name.trim()}${skipped ? ` (${skipped} already there)` : ''}.`)
  }

  return (
    <section className="space-y-3 rounded-2xl bg-[var(--surface-solid)] p-4 shadow-[var(--shadow)]">
      <div className="flex items-center gap-3">
        <span className="text-[30px] leading-none">{flag(group.countryCode)}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[17px] font-semibold">{group.country}</div>
          <Sub>
            {plural(group.count, 'place')} · {plural(group.cities.length, 'city', 'cities')}
          </Sub>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {group.cities.map((c) => {
          const on = picked.has(c.name)
          return (
            <button
              key={c.name}
              aria-pressed={on}
              disabled={!!result}
              onClick={() => setPicked((s) => (s.delete(c.name) || s.add(c.name), new Set(s)))}
              className={`rounded-full px-3 py-1 text-[13px] font-medium transition ${on ? 'bg-[var(--accent)] text-white' : 'bg-[var(--accent-soft)] text-[var(--text-2)] line-through'}`}
            >
              {c.name} <span className="opacity-70">{c.places.length}</span>
            </button>
          )
        })}
      </div>
      {result ? (
        <p className="text-[14px] font-medium text-[var(--good)]">✓ {result}</p>
      ) : (
        <>
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            aria-label={`Trip for ${group.country}`}
            className="w-full rounded-xl bg-[var(--accent-soft)] px-3 py-2.5 text-[15px] outline-none focus:ring-2 focus:ring-[var(--accent)]"
          >
            <option value="new">New trip</option>
            {trips.map((t) => (
              <option key={t.id} value={t.id}>
                Add to {t.name}
              </option>
            ))}
          </select>
          {target === 'new' && (
            <div className="space-y-2">
              <Input placeholder="Trip name" value={name} onChange={(e) => setName(e.target.value)} />
              <DateRangePicker start={start} end={end} onChange={(a, b) => (setStart(a), setEnd(b))} />
            </div>
          )}
          <Btn kind="primary" className="w-full" disabled={!ready} onClick={save}>
            Add {plural(count, 'place')}
          </Btn>
        </>
      )}
    </section>
  )
}
