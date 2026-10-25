import { useSyncExternalStore } from 'react'

export interface User {
  id: string
  email: string
  name: string
  picture: string
}

interface Session {
  token: string
  user: User
}

const KEY = 'traveler-er:session'
const API = import.meta.env.VITE_API_URL
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID

export const signInEnabled = Boolean(API && CLIENT_ID)

const read = (): Session | null => {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Session | null
    return s && typeof s.token === 'string' && typeof s.user?.id === 'string' ? s : null
  } catch {
    return null
  }
}

let session = read()
const listeners = new Set<() => void>()

const setSession = (next: Session | null) => {
  session = next
  try {
    if (next) localStorage.setItem(KEY, JSON.stringify(next))
    else localStorage.removeItem(KEY)
  } catch {
    // storage unavailable; stay signed in for this tab only
  }
  listeners.forEach((l) => l())
}

export const getSession = () => session

export const onSessionChange = (l: () => void) => {
  listeners.add(l)
  return () => void listeners.delete(l)
}

export const useSession = () => useSyncExternalStore(onSessionChange, getSession)

export const authHeaders = (): Record<string, string> => (session ? { Authorization: `Bearer ${session.token}` } : {})

/** Calls the worker with the sign-in token. A 401 means the session ended, so this device signs out (keeping its trips). */
export async function api(path: string, init: RequestInit = {}): Promise<Response> {
  const r = await fetch(`${API}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...authHeaders(), ...init.headers } })
  if (r.status === 401 && session) setSession(null)
  return r
}

interface Gsi {
  accounts: {
    id: {
      initialize(o: { client_id: string; callback: (r: { credential: string }) => void; auto_select?: boolean; ux_mode?: 'popup' }): void
      renderButton(el: HTMLElement, o: Record<string, unknown>): void
      disableAutoSelect(): void
    }
  }
}

let gsi: Promise<Gsi> | null = null

/** Loads Google Identity Services once, on demand. */
const loadGsi = () =>
  (gsi ??= new Promise<Gsi>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.onload = () => {
      const g = (window as unknown as { google?: Gsi }).google
      if (!g) return reject(new Error('Google sign-in failed to load'))
      g.accounts.id.initialize({ client_id: CLIENT_ID!, callback: (r) => void finishSignIn(r.credential), ux_mode: 'popup' })
      resolve(g)
    }
    s.onerror = () => ((gsi = null), reject(new Error("Couldn't load Google sign-in. Check your connection or ad blocker.")))
    document.head.appendChild(s)
  }))

let onError: (msg: string) => void = () => {}

/** Draws Google's own sign-in button into `el`. */
export async function renderSignIn(el: HTMLElement, error: (msg: string) => void) {
  onError = error
  const g = await loadGsi()
  g.accounts.id.renderButton(el, { theme: 'outline', size: 'large', shape: 'pill', text: 'signin_with', logo_alignment: 'left' })
}

/** Trades Google's ID token for a Traveler-er session; the worker verifies the token with Google's keys. */
async function finishSignIn(credential: string) {
  try {
    const r = await fetch(`${API}/api/auth/google`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ credential }) })
    const body = (await r.json().catch(() => ({}))) as Partial<Session> & { error?: string }
    if (!r.ok || !body.token || !body.user) throw new Error(body.error ?? `Sign-in failed (${r.status})`)
    setSession({ token: body.token, user: body.user })
  } catch (e) {
    onError((e as Error).message)
  }
}

/** Ends the session on the server too, so a copied token stops working. */
export async function signOut() {
  await api('/api/auth/logout', { method: 'POST' }).catch(() => {})
  setSession(null)
  ;(window as unknown as { google?: Gsi }).google?.accounts.id.disableAutoSelect()
}
