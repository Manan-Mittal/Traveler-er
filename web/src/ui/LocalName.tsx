import { useSyncExternalStore } from 'react'
import { useLang } from '../lang'
import { onTranslated, translation } from '../services/translate'

/** A name in your language when it's written in another script, or undefined. */
function useTranslated(text = '') {
  const { lang } = useLang()
  return useSyncExternalStore(onTranslated, () => (text ? translation(text, lang) : undefined))
}

/** Shows a name in your language with the original after it, so it still matches the signs. */
export default function LocalName({ text }: { text?: string }) {
  const local = useTranslated(text)
  if (!local) return <>{text}</>
  return (
    <>
      {local} <span className="font-normal text-[var(--text-2)]">{text}</span>
    </>
  )
}
