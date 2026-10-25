import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'

const style = () =>
  `https://tiles.openfreemap.org/styles/${window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'positron'}`

export default function MapView() {
  const el = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const map = new maplibregl.Map({
      container: el.current!,
      style: style(),
      center: [121.5654, 25.033],
      zoom: 11,
      attributionControl: { compact: true },
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')
    return () => map.remove()
  }, [])

  return <div ref={el} className="absolute inset-0" />
}
