import type { ButtonHTMLAttributes, ReactNode } from 'react'

export const Btn = ({ kind = 'plain', className = '', ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { kind?: 'plain' | 'primary' | 'ghost' }) => (
  <button
    {...p}
    className={`rounded-full px-4 py-2 text-[14px] font-medium transition active:scale-[0.97] disabled:opacity-40 ${
      kind === 'primary' ? 'bg-[var(--accent)] text-white' : kind === 'ghost' ? 'text-[var(--accent)]' : 'bg-[var(--accent-soft)] text-[var(--accent)]'
    } ${className}`}
  />
)

export const Row = ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
  <div
    onClick={onClick}
    className={`flex items-center gap-3 border-b border-[var(--line)] px-1 py-3 last:border-0 ${onClick ? 'cursor-pointer' : ''}`}
  >
    {children}
  </div>
)

export const Title = ({ children }: { children: ReactNode }) => (
  <h1 className="text-[28px] font-bold leading-tight tracking-tight break-words">{children}</h1>
)

export const Sub = ({ children }: { children: ReactNode }) => <p className="text-[13px] text-[var(--text-2)]">{children}</p>

export const Input = (p: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input
    {...p}
    className={`w-full rounded-xl bg-[var(--accent-soft)] px-3.5 py-2.5 text-[16px] outline-none placeholder:text-[var(--text-2)] focus:ring-2 focus:ring-[var(--accent)] ${p.className ?? ''}`}
  />
)

export const icon: Record<string, string> = {
  sight: '🏛️', food: '🍜', cafe: '☕', nature: '🌿', shop: '🛍️', stay: '🛏️', transit: '🚉', other: '📍',
}
