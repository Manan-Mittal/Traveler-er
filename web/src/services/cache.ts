const mem = new Map<string, { at: number; value: unknown }>()
const last = new Map<string, number>()

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Cache JSON results in memory and localStorage; space out calls per host so public servers aren't hammered. */
export async function cachedJson<T>(key: string, ttlMs: number, run: () => Promise<T>, host = '', gapMs = 0): Promise<T> {
  const now = Date.now()
  const hit = mem.get(key)
  if (hit && now - hit.at < ttlMs) return hit.value as T
  try {
    const raw = localStorage.getItem('te-cache:' + key)
    if (raw) {
      const parsed = JSON.parse(raw) as { at: number; value: T }
      if (now - parsed.at < ttlMs) {
        mem.set(key, parsed)
        return parsed.value
      }
    }
  } catch {
    // ignore unreadable cache
  }
  if (host && gapMs) {
    const wait = (last.get(host) ?? 0) + gapMs - Date.now()
    last.set(host, Math.max(Date.now(), (last.get(host) ?? 0) + gapMs))
    if (wait > 0) await sleep(wait)
  }
  const value = await run()
  const entry = { at: Date.now(), value }
  mem.set(key, entry)
  try {
    localStorage.setItem('te-cache:' + key, JSON.stringify(entry))
  } catch {
    // cache is best effort
  }
  return value
}
