import { useEffect, useRef, useState } from 'react'
import { DayPicker, type DateRange } from 'react-day-picker'
import { format, parseISO } from 'date-fns'
import 'react-day-picker/style.css'

const iso = (d: Date) => format(d, 'yyyy-MM-dd')
const label = (s: string) => format(parseISO(s), 'MMM d, yyyy')

function Popover({ text, placeholder, align = 'left', children }: { text: string; placeholder: string; align?: 'left' | 'right'; children: (close: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    pop.current?.scrollIntoView({ block: 'nearest' })
    pop.current?.focus({ preventScroll: true })
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      trigger.current?.focus()
    }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  return (
    <div ref={box} className="relative min-w-0 flex-1">
      <button
        ref={trigger}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`w-full rounded-xl bg-[var(--accent-soft)] px-3.5 py-2.5 text-left text-[15px] ${text ? '' : 'text-[var(--text-2)]'}`}
      >
        {text || placeholder}
      </button>
      {open && <div ref={pop} role="dialog" aria-label={placeholder} tabIndex={-1} className={`date-pop glass absolute top-full z-20 mt-2 p-3 ${align === 'right' ? 'right-0' : 'left-0'}`}>{children(() => setOpen(false))}</div>}
    </div>
  )
}

export function DateRangePicker({ start, end, onChange }: { start: string; end: string; onChange: (start: string, end: string) => void }) {
  const selected: DateRange | undefined = start ? { from: parseISO(start), to: end ? parseISO(end) : undefined } : undefined
  return (
    <Popover text={start && end ? (start === end ? label(start) : `${label(start)} → ${label(end)}`) : start ? `${label(start)} → pick end` : ''} placeholder="Choose trip dates">
      {(close) => (
        <DayPicker
          mode="range"
          numberOfMonths={1}
          selected={selected}
          defaultMonth={selected?.from}
          onDayClick={(day) => {
            const d = iso(day)
            // First click sets the start; the next click sets the end (the same day makes a one-day trip).
            if (!start || end || d < start) return onChange(d, '')
            onChange(start, d)
            close()
          }}
        />
      )}
    </Popover>
  )
}

export function DatePicker({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <Popover text={value ? label(value) : ''} placeholder={placeholder} align="right">
      {(close) => (
        <DayPicker
          mode="single"
          selected={value ? parseISO(value) : undefined}
          defaultMonth={value ? parseISO(value) : undefined}
          onSelect={(d) => {
            onChange(d ? iso(d) : '')
            close()
          }}
        />
      )}
    </Popover>
  )
}
