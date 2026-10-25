import { useEffect, useState } from 'react'
import { searchPlaces, type Place } from '../services/geocode'
import { Input, icon } from './kit'

export default function Search({ near, placeholder, onPick }: { near?: { lat: number; lon: number }; placeholder: string; onPick: (p: Place) => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Place[]>([])
  const [error, setError] = useState('')
  const [empty, setEmpty] = useState(false)

  useEffect(() => {
    setEmpty(false)
    if (q.trim().length < 2) {
      setResults([])
      setError('')
      return
    }
    let stale = false
    const t = setTimeout(() => {
      searchPlaces(q, near)
        .then((r) => !stale && (setResults(r), setError(''), setEmpty(r.length === 0)))
        .catch((e: Error) => !stale && (setResults([]), setError(e.message)))
    }, 350)
    return () => {
      stale = true
      clearTimeout(t)
    }
  }, [q, near?.lat, near?.lon])

  const pick = (r: Place) => {
    onPick(r)
    setQ('')
    setResults([])
  }

  return (
    <div className="relative">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label={placeholder} onKeyDown={(e) => e.key === 'Enter' && results[0] && pick(results[0])} />
      {empty && <p className="mt-1 text-[12px] text-[var(--text-2)]">No places found. Not on OpenStreetMap? Paste its Google Maps link here.</p>}
      {error && <p className="mt-1 text-[12px] text-[var(--danger)]">{error}</p>}
      {results.length > 0 && (
        <div className="mt-2 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface-solid)]">
          {results.map((r, i) => (
            <button
              key={i}
              className="flex w-full items-start gap-3 border-b border-[var(--line)] px-3 py-2.5 text-left last:border-0 hover:bg-[var(--accent-soft)]"
              onClick={() => pick(r)}
            >
              <span>{icon[r.category]}</span>
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-medium">{r.name}</span>
                <span className="block truncate text-[12px] text-[var(--text-2)]">{r.detail}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
