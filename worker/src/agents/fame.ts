import { UA } from '../scout.ts'
import type { Run } from './run.ts'
import type { Place } from './scout.ts'

/**
 * Fame agent: how many Wikipedia language editions cover each place, from Wikidata.
 * A temple with 80 language editions is world-famous; a tea house with none is a local spot.
 */
export async function measureFame(run: Run, places: Place[]): Promise<void> {
  const ids = [...new Set(places.flatMap((p) => (p.wikidata ? [p.wikidata] : [])))].slice(0, 100)
  if (ids.length === 0) return
  const counts = new Map<string, number>()
  for (let i = 0; i < ids.length; i += 50) {
    try {
      const r = await fetch(`https://www.wikidata.org/w/api.php?action=wbgetentities&props=sitelinks&format=json&ids=${ids.slice(i, i + 50).join('|')}`, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(10_000),
      })
      if (!r.ok) continue
      const data = (await r.json()) as { entities?: Record<string, { sitelinks?: Record<string, unknown> }> }
      for (const [id, e] of Object.entries(data.entities ?? {})) {
        counts.set(id, Object.keys(e.sitelinks ?? {}).filter((k) => k.endsWith('wiki') && k !== 'commonswiki').length)
      }
    } catch {
      // fame is a hint; carry on without it
    }
  }
  for (const p of places) if (p.wikidata && counts.has(p.wikidata)) p.fame = counts.get(p.wikidata)
  const famous = places.filter((p) => (p.fame ?? 0) >= FAMOUS).length
  run.step('Fame', `Checked ${counts.size} places on Wikidata; ${famous} are internationally famous`)
}

/** Covered by this many Wikipedias or more: the kind of place every list already has. */
export const FAMOUS = 40

export const fameLabel = (fame?: number) => (fame == null ? 'no wiki' : fame >= FAMOUS ? 'world-famous' : fame >= 10 ? 'well known' : 'local')
