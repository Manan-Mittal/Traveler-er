import { useSyncExternalStore } from 'react'

/** Languages offered for place and transit names. Codes are what MyMemory and GTFS use. */
export const LANGUAGES: [string, string][] = [
  ['en', 'English'],
  ['es', 'Español'],
  ['fr', 'Français'],
  ['de', 'Deutsch'],
  ['it', 'Italiano'],
  ['pt', 'Português'],
  ['nl', 'Nederlands'],
  ['ru', 'Русский'],
  ['hi', 'हिन्दी'],
  ['ar', 'العربية'],
  ['ja', '日本語'],
  ['ko', '한국어'],
  ['zh-CN', '简体中文'],
  ['zh-TW', '繁體中文'],
  ['th', 'ไทย'],
  ['vi', 'Tiếng Việt'],
]

const KEY = 'traveler-er:lang'
const listeners = new Set<() => void>()

/** The browser's language, mapped onto one we offer (English if none match). */
const fromBrowser = () => {
  for (const tag of navigator.languages ?? [navigator.language]) {
    const exact = LANGUAGES.find(([c]) => c.toLowerCase() === tag.toLowerCase())
    if (exact) return exact[0]
    if (/^zh-(hk|mo|hant)/i.test(tag)) return 'zh-TW'
    const base = LANGUAGES.find(([c]) => c.split('-')[0] === tag.split('-')[0].toLowerCase())
    if (base) return base[0]
  }
  return 'en'
}

const read = () => {
  try {
    const v = localStorage.getItem(KEY)
    return v && LANGUAGES.some(([c]) => c === v) ? v : ''
  } catch {
    return ''
  }
}
/** '' means follow the browser. */
let chosen = read()

/** The language names are shown in right now. */
export const lang = () => chosen || fromBrowser()

export function setLang(code: string) {
  chosen = code
  try {
    if (code) localStorage.setItem(KEY, code)
    else localStorage.removeItem(KEY)
  } catch {
    /* private mode: the choice just lasts for this visit */
  }
  listeners.forEach((l) => l())
}

const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l))

/** The chosen setting ('' for automatic) and the language it resolves to. */
export const useLang = () => ({ chosen: useSyncExternalStore(subscribe, () => chosen), lang: useSyncExternalStore(subscribe, lang) })
