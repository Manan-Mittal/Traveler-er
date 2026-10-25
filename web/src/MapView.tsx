import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import type { Stop } from './types'

const style = () =>
  `https://tiles.openfreemap.org/styles/${window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'positron'}`

interface Props {
  stops: Stop[]
  zone: GeoJSON.Feature<GeoJSON.Polygon> | null
  route: [number, number][][]
  center?: { lat: number; lon: number }
  inZone: (s: Stop) => boolean | null
}

const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

export default function MapView({ stops, zone, route, center, inZone }: Props) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const markers = useRef<maplibregl.Marker[]>([])
  const ready = useRef(false)
  const latest = useRef({ zone, route })
  latest.current = { zone, route }

  const paint = () => {
    const m = map.current
    if (!m || !ready.current) return
    ;(m.getSource('zone') as maplibregl.GeoJSONSource).setData(latest.current.zone ?? empty)
    ;(m.getSource('route') as maplibregl.GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: latest.current.route.map((coordinates) => ({
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates },
      })),
    })
  }

  useEffect(() => {
    const m = new maplibregl.Map({
      container: el.current!,
      style: style(),
      center: [121.5654, 25.033],
      zoom: 11,
      attributionControl: { compact: true },
    })
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')
    m.on('load', () => {
      m.addSource('zone', { type: 'geojson', data: empty })
      m.addSource('route', { type: 'geojson', data: empty })
      m.addLayer({ id: 'zone-fill', type: 'fill', source: 'zone', paint: { 'fill-color': '#0a84ff', 'fill-opacity': 0.12 } })
      m.addLayer({ id: 'zone-line', type: 'line', source: 'zone', paint: { 'line-color': '#0a84ff', 'line-width': 2, 'line-dasharray': [2, 2] } })
      m.addLayer({ id: 'route-line', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#0a84ff', 'line-width': 4 } })
      ready.current = true
      paint()
    })
    map.current = m
    return () => {
      ready.current = false
      m.remove()
    }
  }, [])

  useEffect(paint, [zone, route])

  useEffect(() => {
    const m = map.current
    if (!m) return
    markers.current.forEach((x) => x.remove())
    markers.current = stops.map((s, i) => {
      const node = document.createElement('div')
      const outside = inZone(s) === false
      node.textContent = String(i + 1)
      node.style.cssText = `width:28px;height:28px;border-radius:50%;display:grid;place-items:center;font:600 13px -apple-system,system-ui;color:#fff;background:${outside ? '#ff9f0a' : '#0a84ff'};border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35)`
      return new maplibregl.Marker({ element: node }).setLngLat([s.lon, s.lat]).addTo(m)
    })
  }, [stops, zone, inZone])

  useEffect(() => {
    const m = map.current
    if (!m) return
    const pts: [number, number][] = stops.map((s) => [s.lon, s.lat])
    if (zone) zone.geometry.coordinates[0].forEach((c) => pts.push([c[0], c[1]]))
    if (pts.length > 1) {
      const b = new maplibregl.LngLatBounds(pts[0], pts[0])
      pts.forEach((p) => b.extend(p))
      m.fitBounds(b, { padding: { top: 80, bottom: 80, left: 440, right: 80 }, maxZoom: 16, duration: 700 })
    } else if (pts.length === 1) {
      m.flyTo({ center: pts[0], zoom: 14, duration: 700 })
    } else if (center) {
      m.flyTo({ center: [center.lon, center.lat], zoom: 13, duration: 700 })
    }
  }, [stops, zone, center])

  return <div ref={el} className="absolute inset-0" />
}
