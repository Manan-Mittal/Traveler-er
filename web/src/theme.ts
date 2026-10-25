import { useSyncExternalStore } from 'react'

export type Theme = 'system' | 'light' | 'dark'
const KEY = 'traveler-er:theme'
const listeners = new Set<() => void>()

const read = (): Theme => {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}
let current = read()

const apply = () => {
  if (current === 'system') document.documentElement.removeAttribute('data-theme')
  else document.documentElement.setAttribute('data-theme', current)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDark() ? '#000000' : '#f5f5f7')
}

/** Whether the app is showing its dark palette right now. */
export const isDark = () => current === 'dark' || (current === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

export function setTheme(t: Theme) {
  current = t
  try {
    t === 'system' ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, t)
  } catch {
    /* private mode: the choice just lasts for this visit */
  }
  apply()
  listeners.forEach((l) => l())
}

apply()
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  apply()
  listeners.forEach((l) => l())
})

const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l))

/** The chosen theme and whether it currently resolves to dark. */
export const useTheme = () => {
  const theme = useSyncExternalStore(subscribe, () => current)
  const dark = useSyncExternalStore(subscribe, isDark)
  return { theme, dark }
}
