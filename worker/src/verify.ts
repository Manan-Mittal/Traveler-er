export interface Candidate {
  id: string
  name: string
  lat: number
  lon: number
  category: string
  source: 'osm' | 'wikivoyage' | 'wikipedia'
}

export interface Pick {
  name: string
  why: string
  category?: string
}

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

/** The assistant may only suggest places that were actually scouted from map data. */
export function verifyPicks(picks: Pick[], candidates: Candidate[]) {
  const byName = new Map(candidates.map((c) => [norm(c.name), c]))
  const seen = new Set<string>()
  const kept: { candidate: Candidate; why: string }[] = []
  for (const p of picks) {
    const key = norm(p.name)
    if (!key || seen.has(key)) continue
    const hit = byName.get(key) ?? candidates.find((c) => norm(c.name).includes(key) || key.includes(norm(c.name)))
    if (!hit || seen.has(norm(hit.name))) continue
    seen.add(key)
    seen.add(norm(hit.name))
    kept.push({ candidate: hit, why: p.why.slice(0, 200) })
  }
  return kept
}

const HYPE = /\b(instagrammable|viral|tiktok|trending|must[- ]see|best in the world|top \d+|bucket list)\b/i
const CHAINS = /\b(starbucks|mcdonald'?s|kfc|burger king|subway|7-eleven|family ?mart|pizza hut|domino'?s)\b/i

/** Cheap pre-filter applied before the model ranks candidates. */
export const isHyped = (name: string) => HYPE.test(name) || CHAINS.test(name)
