const mem = new Map<string, { at: number; value: unknown }>()
const queues = new Map<string, Promise<void>>()

/** Wait for this host's turn; a request aborted while queued gives its turn straight to the next one. */
async function throttle(host: string, gapMs: number, signal?: AbortSignal) {
  const prev = queues.get(host) ?? Promise.resolve()
  let release!: () => void
  const mine = new Promise<void>((r) => (release = r))
  queues.set(host, prev.then(() => mine))
  await prev
  if (signal?.aborted) {
    release()
    throw new DOMException('Aborted', 'AbortError')
  }
  setTimeout(release, gapMs)
}

/** Cache JSON results in memory and localStorage; space out calls per host so public servers aren't hammered. */
export async function cachedJson<T>(key: string, ttlMs: number, run: () => Promise<T>, host = '', gapMs = 0, signal?: AbortSignal): Promise<T> {
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
  if (host && gapMs) await throttle(host, gapMs, signal)
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
