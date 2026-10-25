/** Lets any part of the UI ask the map to fly somewhere, such as tapping a city chip. */
type Target = { lat: number; lon: number; zoom?: number }
const listeners = new Set<(t: Target) => void>()

export const focusMap = (t: Target) => listeners.forEach((l) => l(t))
export const onFocusMap = (l: (t: Target) => void) => (listeners.add(l), () => void listeners.delete(l))
