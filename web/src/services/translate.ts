/**
 * Translates place and transit names written in another script (台北車站 → Taipei Main Station) with MyMemory,
 * a free translation API with no key. Its anonymous limit is about 5,000 characters a day, so names are
 * batched one per line into as few calls as possible and every result is kept in localStorage for good.
 */

/** The language a name is probably in, judged by its script. Latin script is left alone: it's readable as is for most travelers. */
const SCRIPTS: [RegExp, string][] = [
  [/[\p{Script=Hiragana}\p{Script=Katakana}]/u, 'ja'],
  [/\p{Script=Hangul}/u, 'ko'],
  [/\p{Script=Han}/u, 'zh-TW'],
  [/\p{Script=Cyrillic}/u, 'ru'],
  [/\p{Script=Greek}/u, 'el'],
  [/\p{Script=Thai}/u, 'th'],
  [/\p{Script=Arabic}/u, 'ar'],
  [/\p{Script=Hebrew}/u, 'he'],
  [/\p{Script=Devanagari}/u, 'hi'],
]
const LATIN_TARGETS = new Set(['en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'vi'])
const base = (code: string) => code.split('-')[0]

/** Source language to translate `text` from into `target`, or null when it's already readable. */
export function sourceOf(text: string, target: string): string | null {
  const src = SCRIPTS.find(([re]) => re.test(text))?.[1]
  if (!src || base(src) === base(target)) return null
  // Names like "台北101 Taipei 101" already carry a romanized form.
  if (LATIN_TARGETS.has(target) && /\p{Script=Latin}{4,}/u.test(text)) return null
  return src
}

/** Groups names into lines for one request each, keeping the query under MyMemory's 500-byte cap. */
export function chunk(texts: string[], maxBytes = 450): string[][] {
  const out: string[][] = []
  let cur: string[] = []
  let size = 0
  for (const t of texts) {
    const n = new TextEncoder().encode(t).length + 1
    if (cur.length && size + n > maxBytes) {
      out.push(cur)
      cur = []
      size = 0
    }
    cur.push(t)
    size += n
  }
  if (cur.length) out.push(cur)
  return out
}

const KEY = 'traveler-er:translations'
const MAX_SAVED = 3000
let saved: Record<string, string> = {}
try {
  saved = JSON.parse(localStorage.getItem(KEY) ?? '{}')
} catch {
  // no cache yet, or storage is off
}
const persist = () => {
  const keys = Object.keys(saved)
  if (keys.length > MAX_SAVED) for (const k of keys.slice(0, keys.length - MAX_SAVED)) delete saved[k]
  try {
    localStorage.setItem(KEY, JSON.stringify(saved))
  } catch {
    // cache is best effort
  }
}

const listeners = new Set<() => void>()
export const onTranslated = (l: () => void) => (listeners.add(l), () => void listeners.delete(l))

const keyOf = (text: string, target: string) => `${target}|${text}`
const queued = new Map<string, { text: string; src: string; target: string }>()
const failedAt = new Map<string, number>()
const asking = new Set<string>()
let pausedUntil = 0
let timer: ReturnType<typeof setTimeout> | undefined

/** The saved translation of `text`, or undefined. Asks for one in the background when it's missing. */
export function translation(text: string, target: string): string | undefined {
  const src = sourceOf(text, target)
  if (!src) return undefined
  const key = keyOf(text, target)
  if (key in saved) return saved[key] || undefined
  if (Date.now() < pausedUntil || Date.now() - (failedAt.get(key) ?? 0) < 10 * 60_000 || queued.has(key) || asking.has(key)) return undefined
  queued.set(key, { text, src, target })
  // Wait a moment so every name on screen goes out together.
  clearTimeout(timer)
  timer = setTimeout(() => void flush(), 150)
  return undefined
}

async function ask(lines: string[], src: string, target: string): Promise<string[] | null> {
  const q = encodeURIComponent(lines.join('\n'))
  const r = await fetch(`https://api.mymemory.translated.net/get?q=${q}&langpair=${src}|${target}`)
  const data = (await r.json().catch(() => null)) as { responseStatus?: number | string; responseData?: { translatedText?: string } } | null
  const status = Number(data?.responseStatus ?? r.status)
  if (status === 429 || status === 403) {
    // Out of free translations for today; try again in a few hours.
    pausedUntil = Date.now() + 3 * 3600_000
    return null
  }
  const text = data?.responseData?.translatedText
  if (!r.ok || status !== 200 || !text) return null
  const out = text.split('\n').map((s) => s.trim())
  return out.length === lines.length ? out : null
}

async function flush() {
  const jobs = [...queued.values()]
  for (const k of queued.keys()) asking.add(k)
  queued.clear()
  try {
    await translateAll(jobs)
  } finally {
    for (const j of jobs) asking.delete(keyOf(j.text, j.target))
  }
}

async function translateAll(jobs: { text: string; src: string; target: string }[]) {
  const groups = new Map<string, string[]>()
  for (const j of jobs) groups.set(`${j.src}|${j.target}`, [...(groups.get(`${j.src}|${j.target}`) ?? []), j.text])
  for (const [pair, texts] of groups) {
    const [src, target] = pair.split('|')
    for (const lines of chunk(texts)) {
      if (Date.now() < pausedUntil) return
      try {
        let out = await ask(lines, src, target)
        // If the lines came back merged or split, ask for each name on its own.
        if (!out && lines.length > 1 && Date.now() >= pausedUntil) {
          out = []
          for (const l of lines) {
            const one = await ask([l], src, target)
            if (!one) throw new Error('no translation')
            out.push(one[0])
          }
        }
        if (!out) throw new Error('no translation')
        // An empty string remembers "no useful translation" so it isn't asked again.
        lines.forEach((l, i) => (saved[keyOf(l, target)] = out[i] && out[i] !== l ? out[i] : ''))
        persist()
        listeners.forEach((f) => f())
      } catch {
        for (const l of lines) failedAt.set(keyOf(l, target), Date.now())
      }
    }
  }
}
