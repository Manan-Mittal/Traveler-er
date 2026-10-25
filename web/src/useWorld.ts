import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { useStore } from './store'
import { useVisited, visitedActions } from './visited'
import { summarize, toCountries, type Country } from './world'

let loading: Promise<{ fc: GeoJSON.FeatureCollection; countries: Country[] }> | null = null

/** Fetches the country outlines once, the first time someone opens "Where I've been". */
const loadCountries = () =>
  (loading ??= fetch(`${import.meta.env.BASE_URL}countries.json`)
    .then((r) => (r.ok ? (r.json() as Promise<GeoJSON.FeatureCollection>) : Promise.reject(new Error(`Couldn't load the world map (${r.status})`))))
    .then((fc) => ({ fc, countries: toCountries(fc) }))
    .catch((e: Error) => ((loading = null), Promise.reject(e))))

/** Country outlines plus everything this person has visited, from past trips and their own marks. */
export function useWorld(enabled: boolean) {
  const { trips } = useStore()
  const visited = useVisited()
  const [data, setData] = useState<Awaited<ReturnType<typeof loadCountries>> | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!enabled || data) return
    let stale = false
    loadCountries()
      .then((d) => !stale && (setData(d), setError('')))
      .catch((e: Error) => !stale && setError(e.message))
    return () => void (stale = true)
  }, [enabled, data])

  const today = format(new Date(), 'yyyy-MM-dd')
  const summary = useMemo(() => (data ? summarize(data.countries, trips, visited, today) : null), [data, trips, visited, today])

  /** Flips a country between visited and not. */
  const toggle = (id: string) => {
    if (!summary) return
    const from = summary.countries.get(id)
    visitedActions.setCountry(id, !from, !!from?.length)
  }

  return { data, summary, error, toggle }
}
