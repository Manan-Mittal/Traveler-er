import { useEffect, useRef, useState } from 'react'
import { renderSignIn, signInEnabled, useSession } from '../auth'
import { signOutAndClear, useSyncStatus } from '../sync'
import { Btn, Sub } from './kit'

const LABEL = { off: '', syncing: 'Saving…', saved: 'Saved to your account', offline: 'Offline, will retry', error: '' }

/** Sign in with Google to keep trips in the cloud; signed out, trips stay in this browser only. */
export default function Account() {
  const session = useSession()
  const { status, message } = useSyncStatus()
  const button = useRef<HTMLDivElement>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!session && button.current) renderSignIn(button.current, setError).catch((e: Error) => setError(e.message))
  }, [session])

  if (!signInEnabled) return null
  if (!session)
    return (
      // Distinct keys so React never reuses this DOM for the signed-in row: Google fills the button div itself, and a reused div kept its button.
      <div key="signed-out" className="space-y-2 rounded-2xl bg-[var(--accent-soft)] p-3">
        <Sub>Sign in to save trips to your account, open them on any device, and use the assistant. Trips already in this browser come with you.</Sub>
        {/* Google draws the button in an iframe; a light color-scheme stops it getting a white box in dark mode. */}
        <div ref={button} className="min-h-[44px] w-[260px] max-w-full" style={{ colorScheme: "light" }} />
        {error && <p className="text-[12px] text-[var(--danger)]">{error}</p>}
      </div>
    )
  const { user } = session
  return (
    <div key="signed-in" className="flex items-center gap-3">
      {user.picture ? (
        <img src={user.picture} alt="" referrerPolicy="no-referrer" className="h-8 w-8 shrink-0 rounded-full" />
      ) : (
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--accent-soft)] text-[14px] font-semibold">{(user.name || user.email)[0]?.toUpperCase()}</div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-medium">{user.name || user.email}</div>
        <p className={`truncate text-[12px] ${status === 'error' ? 'text-[var(--danger)]' : 'text-[var(--text-2)]'}`}>{status === 'error' ? message : LABEL[status]}</p>
      </div>
      <Btn kind="ghost" onClick={() => confirm('Sign out? Your trips stay in your account but are removed from this browser.') && void signOutAndClear()}>
        Sign out
      </Btn>
    </div>
  )
}
