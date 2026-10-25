import { useEffect, useState } from 'react'
import { searchPlaces, type Place } from '../services/geocode'
import { Input, icon } from './kit'

export default function Search({ near, placeholder, onPick }: { near?: { lat: number; lon: number }; placeholder: string; onPick: (p: Place) => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Place[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([])
      return
    }
    let stale = false
    const t = setTimeout(() => {
      searchPlaces(q, near)
        .then((r) => !stale && (setResults(r), setError('')))
        .catch((e: Error) => !stale && setError(e.message))
    }, 350)
    return () => {
      stale = true
      clearTimeout(t)
    }
  }, [q, near?.lat, near?.lon])

  return (
    <div className="relative">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} />
      {error && <p className="mt-1 text-[12px] text-[var(--danger)]">{error}</p>}
      {results.length > 0 && (
        <div className="mt-2 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface-solid)]">
          {results.map((r, i) => (
            <button
              key={i}
              className="flex w-full items-start gap-3 border-b border-[var(--line)] px-3 py-2.5 text-left last:border-0 hover:bg-[var(--accent-soft)]"
              onClick={() => {
                onPick(r)
                setQ('')
                setResults([])
              }}
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
