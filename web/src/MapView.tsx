import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import type { Stop } from './types'
import type { ZoneGeo } from './useDayGeo'

import { isDark } from './theme'

const style = () => `https://tiles.openfreemap.org/styles/${isDark() ? 'dark' : 'positron'}`

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
  /** Where the phone bottom sheet's top edge sits, as a fraction of the height. */
  sheetTop: number
}

// The idle world map: a dot hops between cities along a dotted trail, then starts over.
const HOP_CITIES: [number, number][] = [[-122.4, 37.8], [-74, 40.7], [-0.1, 51.5], [55.3, 25.2], [121.5, 25], [139.7, 35.7]]
const HOP_MS = 1100
const PAUSE_MS = 450
const hopArc = (a: [number, number], b: [number, number]): [number, number][] =>
  Array.from({ length: 31 }, (_, i) => {
    const t = i / 30
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t + Math.sin(Math.PI * t) * Math.min(14, Math.abs(b[0] - a[0]) * 0.25)]
  })
const HOP_LEGS = HOP_CITIES.slice(1).map((c, i) => hopArc(HOP_CITIES[i], c))
const point = (c: [number, number]): GeoJSON.Feature => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: c } })
const line = (coordinates: [number, number][]): GeoJSON.Feature => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } })

const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

// Keep in sync with the <aside> classes in App.tsx: a left sidebar on wide or landscape screens, a bottom sheet from 45% down otherwise.
const panelPadding = (w: number, h: number, sheetTop: number) =>
  w >= 768 || w > h
    ? { top: 0, bottom: 0, left: Math.min(400, w * 0.5) + 12, right: 0 }
    : { top: 0, bottom: Math.round(h * (1 - sheetTop)), left: 0, right: 0 }

export default function MapView({ stops, zones, route, links, center, inZone, colorOf, sheetTop }: Props) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const markers = useRef<maplibregl.Marker[]>([])
  const labels = useRef<maplibregl.Marker[]>([])
  const ready = useRef(false)
  const [tilesDown, setTilesDown] = useState(false)
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
      center: [10, 25],
      zoom: 1.6,
      attributionControl: false,
    })
    // On a phone held upright the bottom sheet covers the bottom edge, so the credit sits at the top instead.
    m.addControl(new maplibregl.AttributionControl({ compact: true }), el.current!.clientWidth < 768 && el.current!.clientHeight > el.current!.clientWidth ? 'top-left' : 'bottom-right')
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    // Start with the attribution folded to its "i" button; it still opens on tap, as the map data licenses require.
    const foldAttribution = () => {
      const a = m.getContainer().querySelector('.maplibregl-ctrl-attrib')
      a?.classList.remove('maplibregl-compact-show')
      a?.removeAttribute('open')
    }
    m.once('idle', foldAttribution)
    // If the tile style can't be fetched, 'load' never fires and nothing would draw. Swap in a plain style so zones and routes still show.
    let fellBack = false
    m.on('error', (e) => {
      const url = String((e.error as { url?: string } | undefined)?.url ?? '')
      if (fellBack || ready.current || !url.includes('/styles/')) return
      fellBack = true
      setTilesDown(true)
      m.setStyle({ version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#dfe6ee' } }] })
    })
    m.on('style.load', () => {
      foldAttribution()
      m.addSource('zone', { type: 'geojson', data: empty })
      m.addSource('route', { type: 'geojson', data: empty })
      m.addSource('link', { type: 'geojson', data: empty })
      m.addLayer({ id: 'zone-fill', type: 'fill', source: 'zone', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.14 } })
      m.addLayer({ id: 'zone-line', type: 'line', source: 'zone', paint: { 'line-color': ['get', 'color'], 'line-width': 2, 'line-dasharray': [2, 2] } })
      m.addLayer({ id: 'link-line', type: 'line', source: 'link', layout: { 'line-cap': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 3, 'line-dasharray': [0.5, 2.5] } })
      m.addLayer({ id: 'route-line', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#0a84ff', 'line-width': 4 } })
      m.addSource('hop-line', { type: 'geojson', data: empty })
      m.addSource('hop-city', { type: 'geojson', data: empty })
      m.addSource('hop-dot', { type: 'geojson', data: empty })
      const hidden = { visibility: 'none' } as const
      m.addLayer({ id: 'hop-line', type: 'line', source: 'hop-line', layout: { ...hidden, 'line-cap': 'round' }, paint: { 'line-color': '#0a84ff', 'line-width': 2.5, 'line-dasharray': [0.5, 2.5] } })
      m.addLayer({ id: 'hop-city', type: 'circle', source: 'hop-city', layout: hidden, paint: { 'circle-radius': 4, 'circle-color': '#fff', 'circle-stroke-color': '#0a84ff', 'circle-stroke-width': 2 } })
      m.addLayer({ id: 'hop-halo', type: 'circle', source: 'hop-dot', layout: hidden, paint: { 'circle-radius': 14, 'circle-color': '#0a84ff', 'circle-opacity': 0.2, 'circle-blur': 0.8 } })
      m.addLayer({ id: 'hop-dot', type: 'circle', source: 'hop-dot', layout: hidden, paint: { 'circle-radius': 6, 'circle-color': '#0a84ff', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2.5 } })
      ready.current = true
      paint()
      m.fire('hop-ready')
    })
    map.current = m
    return () => {
      ready.current = false
      m.remove()
    }
  }, [])

  useEffect(paint, [zones, route, links])

  const idle = stops.length === 0 && zones.length === 0 && !center
  useEffect(() => {
    const m = map.current
    if (!m) return
    const layers = ['hop-line', 'hop-city', 'hop-halo', 'hop-dot']
    const show = (v: 'visible' | 'none') => layers.forEach((id) => m.getLayer(id) && m.setLayoutProperty(id, 'visibility', v))
    let raf = 0
    const run = () => {
      cancelAnimationFrame(raf)
      if (!idle) return show('none')
      show('visible')
      const src = (id: string) => m.getSource(id) as maplibregl.GeoJSONSource
      src('hop-city').setData({ type: 'FeatureCollection', features: HOP_CITIES.map(point) })
      const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (still) {
        src('hop-line').setData({ type: 'FeatureCollection', features: [line(HOP_LEGS.flat())] })
        return
      }
      const cycle = HOP_LEGS.length * (HOP_MS + PAUSE_MS) + 700
      const t0 = performance.now()
      const tick = (now: number) => {
        const t = Math.max(0, now - t0) % cycle
        const leg = Math.min(HOP_LEGS.length - 1, Math.floor(t / (HOP_MS + PAUSE_MS)))
        const within = t - leg * (HOP_MS + PAUSE_MS)
        const hopping = within < HOP_MS && t < HOP_LEGS.length * (HOP_MS + PAUSE_MS)
        const k = hopping ? within / HOP_MS : 1
        const eased = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2
        const arc = HOP_LEGS[leg]
        const upto = Math.round(eased * (arc.length - 1))
        const here = arc[upto]
        const done = HOP_LEGS.slice(0, leg).flat()
        src('hop-line').setData({ type: 'FeatureCollection', features: [line([...done, ...arc.slice(0, upto + 1)])] })
        src('hop-dot').setData({ type: 'FeatureCollection', features: [point(here)] })
        // The dot squashes as it lands and the halo breathes while it waits.
        m.setPaintProperty('hop-dot', 'circle-radius', hopping ? 6 : 6 + 2 * Math.sin(((within - HOP_MS) / PAUSE_MS) * Math.PI))
        m.setPaintProperty('hop-halo', 'circle-radius', hopping ? 14 : 14 + 10 * Math.sin(((within - HOP_MS) / PAUSE_MS) * Math.PI))
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    }
    m.on('hop-ready', run)
    if (ready.current) run()
    return () => {
      cancelAnimationFrame(raf)
      m.off('hop-ready', run)
    }
  }, [idle])

  const fitKey = JSON.stringify([stops.map((s) => [s.lat, s.lon]), zones.map((g) => [g.zone.lat, g.zone.lon, !!g.polygon]), center && [center.lat, center.lon], sheetTop])

  useEffect(() => {
    const m = map.current
    if (!m) return
    markers.current.forEach((x) => x.remove())
    markers.current = stops.map((s, i) => {
      const node = document.createElement('div')
      const outside = inZone(s) === false
      node.textContent = String(i + 1)
      node.style.cssText = `z-index:2;width:28px;height:28px;border-radius:50%;display:grid;place-items:center;font:600 13px -apple-system,system-ui;color:#fff;background:${colorOf(s)};border:2px solid ${outside ? '#ff9f0a' : '#fff'};box-shadow:0 2px 8px rgba(0,0,0,.35)`
      return new maplibregl.Marker({ element: node }).setLngLat([s.lon, s.lat]).addTo(m)
    })
    // Pins that land on top of each other get fanned out into a small ring, and snap back together as you zoom in.
    const spread = () => {
      const ms = markers.current
      const px = ms.map((x) => m.project(x.getLngLat()))
      const seen = new Set<number>()
      ms.forEach((x) => x.setOffset([0, 0]))
      px.forEach((p, i) => {
        if (seen.has(i)) return
        const group = px.flatMap((q, j) => (!seen.has(j) && Math.hypot(p.x - q.x, p.y - q.y) < 26 ? [j] : []))
        group.forEach((j) => seen.add(j))
        if (group.length < 2) return
        const r = group.length === 2 ? 15 : 14 + group.length * 3
        group.forEach((j, k) => {
          const ang = (2 * Math.PI * k) / group.length - Math.PI / 2 + (group.length === 2 ? Math.PI / 2 : 0)
          ms[j].setOffset([Math.cos(ang) * r, Math.sin(ang) * r])
        })
      })
    }
    spread()
    m.on('zoomend', spread)
    return () => void m.off('zoomend', spread)
  }, [stops, zones, inZone, colorOf])

  // Name tags at the center of each zone.
  useEffect(() => {
    const m = map.current
    if (!m) return
    labels.current.forEach((x) => x.remove())
    labels.current = zones.map((g) => {
      const node = document.createElement('div')
      node.textContent = g.zone.name
      node.style.cssText = `pointer-events:none;z-index:1;padding:3px 10px;border-radius:999px;font:600 12px -apple-system,system-ui;color:#fff;background:${g.color};box-shadow:0 2px 8px rgba(0,0,0,.3);white-space:nowrap;max-width:180px;overflow:hidden;text-overflow:ellipsis`
      // Stops often sit right at the zone center, so the tag hangs off the top of the walk area (or above the center until it loads).
      const ring = g.polygon?.geometry.coordinates[0]
      const top = ring?.reduce((a, b) => (b[1] > a[1] ? b : a))
      return new maplibregl.Marker({ element: node, anchor: 'bottom', offset: top ? [0, -4] : [0, -20] })
        .setLngLat(top ? [g.zone.lon, top[1]] : [g.zone.lon, g.zone.lat])
        .addTo(m)
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
    m.setPadding(panelPadding(m.getContainer().clientWidth, m.getContainer().clientHeight, sheetTop))
    if (pts.length > 1) {
      const b = new maplibregl.LngLatBounds(pts[0], pts[0])
      pts.forEach((p) => b.extend(p))
      m.fitBounds(b, { padding: 40, maxZoom: 16, duration: 700 })
    } else if (pts.length === 1) {
      m.flyTo({ center: pts[0], zoom: 14, duration: 700 })
    } else if (center) {
      m.flyTo({ center: [center.lon, center.lat], zoom: 13, duration: 700 })
    } else {
      // Nothing to show yet: a calm view of the whole world, centered on the part not covered by the panel.
      {
        // Zoom so the whole hop route (about 275 degrees of longitude) fits in the part of the map the panel leaves free.
        const pad = panelPadding(m.getContainer().clientWidth, m.getContainer().clientHeight, sheetTop)
        const free = m.getContainer().clientWidth - pad.left - pad.right - 48
        const zoom = Math.max(0.3, Math.min(3, Math.log2((free * 360) / (275 * 512))))
        m.easeTo({ center: [9, 32], zoom, duration: 700 })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey])

  // maplibre's own CSS forces position: relative on the map element, so the absolute layer lives on a wrapper.
  return (
    <div className="absolute inset-0 bg-[var(--bg)]">
      <div ref={el} className="h-full w-full" />
      {tilesDown && (
        <div role="status" className="glass pointer-events-none absolute left-1/2 top-[max(0.75rem,env(safe-area-inset-top))] -translate-x-1/2 px-3 py-1.5 text-[12px] md:left-[calc(50%+200px)]">
          Map tiles couldn't load, so the base map is blank. Areas and routes still show.
        </div>
      )}
    </div>
  )
}
