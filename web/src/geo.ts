type Ring = number[][]

const inRing = (x: number, y: number, ring: Ring) => {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** True when the point sits inside the polygon's outer ring and outside its holes. */
export const inPolygon = (lon: number, lat: number, poly: GeoJSON.Polygon) => {
  const [outer, ...holes] = poly.coordinates
  return inRing(lon, lat, outer) && !holes.some((h) => inRing(lon, lat, h))
}

export const distanceKm = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const R = 6371
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLon = rad(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}
