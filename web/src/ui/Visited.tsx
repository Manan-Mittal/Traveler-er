import { useMemo, useState } from 'react'
import { signInEnabled, useSession } from '../auth'
import { flag } from '../import/group'
import { visitedActions } from '../visited'
import { CONTINENTS } from '../world'
import type { useWorld } from '../useWorld'
import Search from './Search'
import { Btn, Input, Sub, Title } from './kit'

const pct = (n: number) => (n === 0 ? '0' : n < 0.1 ? '<0.1' : n < 10 ? n.toFixed(1) : Math.round(n).toString())

const Stat = ({ value, label }: { value: string; label: string }) => (
  <div className="rounded-2xl bg-[var(--accent-soft)] px-3 py-2.5">
    <div className="text-[24px] font-bold leading-tight tracking-tight">{value}</div>
    <div className="text-[12px] text-[var(--text-2)]">{label}</div>
  </div>
)

const Heading = ({ children }: { children: string }) => <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[var(--text-2)]">{children}</h2>

/** Account-level "Where I've been": countries and cities from past trips plus ones marked by hand. */
export default function Visited({ world, onClose }: { world: ReturnType<typeof useWorld>; onClose: () => void }) {
  const session = useSession()
  const { data, summary, error, toggle } = world
  const [q, setQ] = useState('')

  const byContinent = useMemo(() => {
    if (!data || !summary) return []
    const groups = new Map<string, { id: string; name: string; iso: string; trips: string[] }[]>()
    for (const c of data.countries) {
      const trips = summary.countries.get(c.id)
      if (!trips) continue
      groups.set(c.continent, [...(groups.get(c.continent) ?? []), { id: c.id, name: c.name, iso: c.iso, trips }])
    }
    return [...groups.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])).map(([k, list]) => [k, list.sort((a, b) => a.name.localeCompare(b.name))] as const)
  }, [data, summary])

  const matches = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!data || !summary || t.length < 2) return []
    return data.countries.filter((c) => !summary.countries.has(c.id) && c.name.toLowerCase().includes(t)).slice(0, 6)
  }, [data, summary, q])

  return (
    <div className="space-y-5">
      <Btn kind="ghost" className="-ml-3" onClick={onClose}>
        ‹ Trips
      </Btn>
      <div>
        <Title>Where I've been</Title>
        <Sub>Past trips count on their own. Tap a country on the map to mark or unmark it.</Sub>
      </div>
      {error && <p className="text-[13px] text-[var(--danger)]">{error}</p>}
      {!summary ? (
        !error && <Sub>Loading the world…</Sub>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Stat value={String(summary.countries.size)} label={summary.countries.size === 1 ? 'country' : 'countries'} />
            <Stat value={`${pct(summary.landPct)}%`} label="of the world's land" />
            <Stat value={`${summary.continents.size}/${CONTINENTS}`} label="continents" />
            <Stat value={String(summary.cities.length)} label={summary.cities.length === 1 ? 'city' : 'cities'} />
          </div>
          {signInEnabled && !session && <Sub>Sign in from the trips page to keep this list in your account and see it on any device.</Sub>}

          <section className="space-y-2" aria-label="Countries">
            <Heading>Countries</Heading>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Add a country" aria-label="Add a country" />
            {matches.length > 0 && (
              <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface-solid)]">
                {matches.map((c) => (
                  <button key={c.id} className="flex w-full items-center gap-3 border-b border-[var(--line)] px-3 py-2.5 text-left text-[14px] last:border-0 hover:bg-[var(--accent-soft)]" onClick={() => (toggle(c.id), setQ(''))}>
                    <span aria-hidden>{flag(c.iso)}</span>
                    {c.name}
                  </button>
                ))}
              </div>
            )}
            {byContinent.length === 0 && <Sub>Nothing yet. Add a country above, or finish a trip.</Sub>}
            {byContinent.map(([continent, list]) => (
              <div key={continent} className="space-y-1.5 pt-1">
                <div className="text-[12px] font-medium text-[var(--text-2)]">
                  {continent} · {list.length}
                </div>
                <div className="flex flex-wrap gap-2">
                  {list.map((c) => (
                    <span
                      key={c.id}
                      title={c.trips.length ? `From ${c.trips.join(', ')}` : 'Marked by you'}
                      className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft)] py-1 pl-3 pr-1 text-[13px] font-medium"
                    >
                      <span aria-hidden>{flag(c.iso)}</span>
                      {c.name}
                      <button className="grid h-6 w-6 place-items-center rounded-full text-[var(--text-2)]" aria-label={`Remove ${c.name}`} onClick={() => toggle(c.id)}>
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </section>

          <section className="space-y-2" aria-label="Cities">
            <Heading>Cities</Heading>
            <Search placeholder="Add a city, e.g. Lisbon" onPick={(p) => visitedActions.addCity({ name: p.name, lat: p.lat, lon: p.lon })} />
            {summary.cities.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {summary.cities.map((c) =>
                  c.trip ? (
                    <span key={c.id} title={`From ${c.trip}`} className="rounded-full bg-[var(--accent-soft)] px-3 py-1 text-[13px] font-medium">
                      {c.name}
                    </span>
                  ) : (
                    <span key={c.id} className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft)] py-1 pl-3 pr-1 text-[13px] font-medium">
                      {c.name}
                      <button className="grid h-6 w-6 place-items-center rounded-full text-[var(--text-2)]" aria-label={`Remove ${c.name}`} onClick={() => visitedActions.removeCity(c.id)}>
                        ✕
                      </button>
                    </span>
                  ),
                )}
              </div>
            )}
            {summary.cities.some((c) => c.trip) && <Sub>Cities without a ✕ come from your trips; edit the trip to change them.</Sub>}
          </section>
        </>
      )}
    </div>
  )
}
