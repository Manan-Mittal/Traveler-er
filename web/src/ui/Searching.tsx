import { useEffect, useState } from 'react'

const LINES = ['Scouting the neighborhood…', 'Skipping the tourist traps…', 'Asking the map for locals’ favorites…', 'Checking these places are real…']

/** A magnifying glass sweeping over a row of pins, with a changing line of text. Plain CSS, off when motion is reduced. */
export default function Searching() {
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % LINES.length), 2600)
    return () => clearInterval(t)
  }, [])
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-3 rounded-2xl bg-[var(--accent-soft)] px-4 py-3">
      <div className="searching relative h-9 w-24 shrink-0" aria-hidden>
        <div className="absolute inset-x-0 bottom-1 flex justify-between px-1">
          {[0, 1, 2, 3, 4].map((n) => (
            <span key={n} className="searching-dot h-2 w-2 rounded-full bg-[var(--accent)]" style={{ animationDelay: `${n * 0.18}s` }} />
          ))}
        </div>
        <svg className="searching-glass absolute left-0 top-0" width="30" height="30" viewBox="0 0 30 30" fill="none">
          <circle cx="12" cy="12" r="8" stroke="var(--accent)" strokeWidth="3" fill="var(--surface-solid)" fillOpacity="0.6" />
          <path d="M18.5 18.5 26 26" stroke="var(--accent)" strokeWidth="3.5" strokeLinecap="round" />
        </svg>
      </div>
      <p className="min-w-0 text-[14px] font-medium text-[var(--text)]">{LINES[i]}</p>
    </div>
  )
}
