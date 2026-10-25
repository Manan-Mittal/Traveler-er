import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import type { Stop } from './types'
import type { ZoneGeo } from './useDayGeo'

const style = () =>
  `https://tiles.openfreemap.org/styles/${window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'positron'}`

export interface MapLink {
  from: [number, number]
  to: [number, number]
  /** Real route shape when known (driving); otherwise a straight line between the two zones. */
  shape?: [number, number][]
  color: string
}

interface Props {
  stops: Stop[]
  zones: ZoneGeo[]
  route: [number, number][][]
  links: MapLink[]
  center?: { lat: number; lon: number }
  inZone: (s: Stop) => boolean | null
  colorOf: (s: Stop) => string
}

// Great-circle-ish arcs between far-apart cities, drawn as a dotted route that drifts around the idle globe.
const WORLD_ARCS: [number, number][] = [
  [-74, 40.7], [-0.1, 51.5], [55.3, 25.2], [121.5, 25], [139.7, 35.7], [-122.4, 37.8], [-74, 40.7],
]
const arc = (a: [number, number], b: [number, number]): [number, number][] =>
  Array.from({ length: 25 }, (_, i) => {
    const t = i / 24
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t + Math.sin(Math.PI * t) * 8]
  })
const worldLine: GeoJSON.Feature = {
  type: 'Feature',
  properties: {},
  geometry: { type: 'LineString', coordinates: WORLD_ARCS.slice(1).flatMap((p, i) => arc(WORLD_ARCS[i], p)) },
}

const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

// Keep in sync with the <aside> classes in App.tsx: a left sidebar on wide or landscape screens, a bottom sheet from 45% down otherwise.
const panelPadding = (w: number, h: number) =>
  w >= 768 || w > h
    ? { top: 0, bottom: 0, left: Math.min(400, w * 0.5) + 12, right: 0 }
    : { top: 0, bottom: Math.round(h * 0.55), left: 0, right: 0 }

export default function MapView({ stops, zones, route, links, center, inZone, colorOf }: Props) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const markers = useRef<maplibregl.Marker[]>([])
  const labels = useRef<maplibregl.Marker[]>([])
  const ready = useRef(false)
  const idleRef = useRef(true)
  const spin = useRef<{ on: boolean; raf: number; stopped: boolean }>({ on: false, raf: 0, stopped: false })
  const latest = useRef({ zones, route, links })
  latest.current = { zones, route, links }

  const paint = () => {
    const m = map.current
    if (!m || !ready.current) return
    const { zones: zs, route: rs, links: ls } = latest.current
    ;(m.getSource('zone') as maplibregl.GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: zs.flatMap((z) => (z.polygon ? [{ ...z.polygon, properties: { color: z.color } }] : [])),
    })
    ;(m.getSource('route') as maplibregl.GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: rs.map((coordinates) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } })),
    })
    ;(m.getSource('link') as maplibregl.GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: ls.map((l) => ({ type: 'Feature', properties: { color: l.color }, geometry: { type: 'LineString', coordinates: l.shape ?? [l.from, l.to] } })),
    })
  }

  useEffect(() => {
    const m = new maplibregl.Map({
      container: el.current!,
      style: style(),
      center: [10, 22],
      zoom: 1.3,
      attributionControl: { compact: true },
    })
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    // Start with the attribution folded to its "i" button; it still opens on tap, as the map data licenses require.
    const foldAttribution = () => {
      const a = m.getContainer().querySelector('.maplibregl-ctrl-attrib')
      a?.classList.remove('maplibregl-compact-show')
      a?.removeAttribute('open')
    }
    m.once('idle', foldAttribution)
    m.on('load', () => {
      foldAttribution()
      m.addSource('zone', { type: 'geojson', data: empty })
      m.addSource('route', { type: 'geojson', data: empty })
      m.addSource('link', { type: 'geojson', data: empty })
      m.addLayer({ id: 'zone-fill', type: 'fill', source: 'zone', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.14 } })
      m.addLayer({ id: 'zone-line', type: 'line', source: 'zone', paint: { 'line-color': ['get', 'color'], 'line-width': 2, 'line-dasharray': [2, 2] } })
      m.addLayer({ id: 'link-line', type: 'line', source: 'link', layout: { 'line-cap': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 3, 'line-dasharray': [0.5, 2.5] } })
      m.addLayer({ id: 'route-line', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#0a84ff', 'line-width': 4 } })
      m.setProjection({ type: 'globe' })
      m.addSource('world', { type: 'geojson', data: worldLine })
      m.addLayer({ id: 'world-line', type: 'line', source: 'world', layout: { 'line-cap': 'round', visibility: idleRef.current ? 'visible' : 'none' }, paint: { 'line-color': '#0a84ff', 'line-width': 2.5, 'line-dasharray': [0.5, 2.5] } })
      ready.current = true
      paint()
    })
    map.current = m
    const stopSpin = () => (spin.current.stopped = true)
    for (const ev of ['mousedown', 'touchstart', 'wheel'] as const) m.on(ev, stopSpin)
    return () => {
      cancelAnimationFrame(spin.current.raf)
      ready.current = false
      m.remove()
    }
  }, [])

  useEffect(paint, [zones, route, links])

  useEffect(() => {
    const m = map.current
    if (!m) return
    markers.current.forEach((x) => x.remove())
    markers.current = stops.map((s, i) => {
      const node = document.createElement('div')
      const outside = inZone(s) === false
      node.textContent = String(i + 1)
      node.style.cssText = `width:28px;height:28px;border-radius:50%;display:grid;place-items:center;font:600 13px -apple-system,system-ui;color:#fff;background:${colorOf(s)};border:2px solid ${outside ? '#ff9f0a' : '#fff'};box-shadow:0 2px 8px rgba(0,0,0,.35)`
      return new maplibregl.Marker({ element: node }).setLngLat([s.lon, s.lat]).addTo(m)
    })
  }, [stops, zones, inZone, colorOf])

  // Name tags at the center of each zone.
  useEffect(() => {
    const m = map.current
    if (!m) return
    labels.current.forEach((x) => x.remove())
    labels.current = zones.map((g) => {
      const node = document.createElement('div')
      node.textContent = g.zone.name
      node.style.cssText = `pointer-events:none;padding:3px 10px;border-radius:999px;font:600 12px -apple-system,system-ui;color:#fff;background:${g.color};box-shadow:0 2px 8px rgba(0,0,0,.3);white-space:nowrap;max-width:180px;overflow:hidden;text-overflow:ellipsis`
      return new maplibregl.Marker({ element: node }).setLngLat([g.zone.lon, g.zone.lat]).addTo(m)
    })
  }, [zones])

  useEffect(() => {
    const m = map.current
    if (!m) return
    const pts: [number, number][] = stops.map((s) => [s.lon, s.lat])
    for (const g of zones) {
      pts.push([g.zone.lon, g.zone.lat])
      g.polygon?.geometry.coordinates[0].forEach((c) => pts.push([c[0], c[1]]))
    }
    // The map keeps this padding, so later camera moves center on the visible part rather than under the panel.
    m.setPadding(panelPadding(m.getContainer().clientWidth, m.getContainer().clientHeight))
    if (pts.length > 1) {
      const b = new maplibregl.LngLatBounds(pts[0], pts[0])
      pts.forEach((p) => b.extend(p))
      m.fitBounds(b, { padding: 40, maxZoom: 16, duration: 700 })
    } else if (pts.length === 1) {
      m.flyTo({ center: pts[0], zoom: 14, duration: 700 })
    } else if (center) {
      m.flyTo({ center: [center.lon, center.lat], zoom: 13, duration: 700 })
    }

    // Nothing to show: rest on a slowly turning globe with a dotted route drifting around it, until the user touches the map.
    const idle = pts.length === 0 && !center
    const s = spin.current
    const setWorldLine = (v: 'visible' | 'none') => {
      if (m.getLayer('world-line')) m.setLayoutProperty('world-line', 'visibility', v)
    }
    cancelAnimationFrame(s.raf)
    s.on = idle
    idleRef.current = idle
    if (!idle) {
      setWorldLine('none')
      return
    }
    s.stopped = false
    m.setPadding({ top: 0, bottom: 0, left: 0, right: 0 })
    m.flyTo({ center: [m.getCenter().lng, 22], zoom: 1.3, duration: 900 })
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let frame = 0
    setWorldLine('visible')
    const tick = () => {
      if (!s.on || s.stopped) return
      frame++
      m.jumpTo({ center: [m.getCenter().lng + 0.06, m.getCenter().lat] })
      s.raf = requestAnimationFrame(tick)
    }
    s.raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(s.raf)
  }, [stops, zones, center])

  // maplibre's own CSS forces position: relative on the map element, so the absolute layer lives on a wrapper.
  return (
    <div className="absolute inset-0">
      <div ref={el} className="h-full w-full" />
    </div>
  )
}
