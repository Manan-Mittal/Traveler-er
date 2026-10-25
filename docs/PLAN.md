# Traveler-er — implementation plan

A trip planner where every day is a walkable zone on a map, with an assistant that drafts
local, non-hyped plans and works out bookings and realistic transit time.

## Principles

- **Calm, Apple-like UI.** System font stack (`-apple-system, SF Pro`), lots of white space,
  one accent color, full-bleed map, content in a floating sheet. Light and dark mode.
- **Open data only.** OpenStreetMap ecosystem, no Google APIs, no keys in the browser.
- **The assistant proposes, the user decides.** Drafts are never saved, booked or shared
  without an explicit click.
- **API-first.** The browser talks to a small JSON API so a SwiftUI app can reuse it.

## Architecture

```
web/ (React + Vite + TS)  ──>  OSM public APIs (Photon, Overpass, Valhalla, Transitous, Wikivoyage)
          │
          └──> worker/ (Cloudflare Worker)  ──>  OpenRouter (free models only)
                     └── D1 (trips sync, later)
```

Phase 1 stores trips in the browser (localStorage) with JSON export/import and is deployed
to GitHub Pages (free URL: manan-mittal.github.io/Traveler-er). The Worker is needed only for the assistant (it holds the OpenRouter key).
When a Cloudflare account exists, the site moves to Cloudflare Pages + Access and trips sync
to D1.

## Data model (`web/src/types.ts`)

```ts
Trip     { id, name, startDate, endDate, homeCurrency?, days: Day[], bookings: Booking[], createdAt, updatedAt }
Day      { id, date, title, zone?: Zone, stops: Stop[], notes }
Zone     { name, lat, lon, walkMinutes: 15|30|45|60 }      // isochrone fetched on demand, cached
Stop     { id, name, lat, lon, category, osmId?, time?, durationMin?, notes, source: 'user'|'assistant', why? }
Booking  { id, title, kind: 'flight'|'train'|'lodging'|'ticket'|'restaurant'|'other',
           dayId?, deadline?, url?, status: 'todo'|'booked', confirmation? }
Leg      { fromStopId, toStopId, mode: 'walk'|'transit'|'drive', minutes, km }  // computed, cached
```

## Web app layout

- `MapView` — MapLibre GL, OpenFreeMap `positron` style (dark: `dark`). Shows the selected
  day's stops as numbered pins, its walk zone polygon, and the route line.
- `Sheet` — floating panel (left on desktop, bottom sheet on mobile) with three levels:
  Trips list → Trip (day strip + bookings) → Day (zone, stops, legs).
- `SearchBar` — Photon autocomplete biased to the map center; add result as stop or zone.
- `DayZoneEditor` — pick a town, choose walk minutes, shows "inside zone / outside zone"
  badge per stop (point-in-polygon on the isochrone).
- `LegRow` — between stops: walk time from Valhalla, transit time from Transitous when the
  walk is > 25 min, with a 10 min buffer added to transit.
- `Bookings` — checklist with deadline, link, status toggle.
- `Assistant` — chat-like panel; returns a draft shown as ghost pins; per-stop keep/skip;
  "Apply" writes kept stops into the day.

## Services (`web/src/services/`)

| file | API | notes |
| --- | --- | --- |
| `geocode.ts` | `https://photon.komoot.io/api/?q=&lat=&lon=&limit=8` | GeoJSON features |
| `isochrone.ts` | `https://valhalla1.openstreetmap.de/isochrone?json=` | pedestrian, `polygons:true` |
| `route.ts` | `https://valhalla1.openstreetmap.de/route?json=` | `trip.summary.time` (s), `length` (km) |
| `transit.ts` | `https://api.transitous.org/api/v1/plan` | best effort, fall back gracefully |
| `places.ts` | `https://overpass-api.de/api/interpreter` | POIs around a zone |
| `wikivoyage.ts` | `https://en.wikivoyage.org/w/api.php?...&origin=*` | See / Do / Eat sections |
| `assistant.ts` | `${VITE_API_URL}/api/plan` | the Worker |

All fetches go through `cachedFetch` (in-memory + localStorage TTL cache) and a per-host
throttle (1 req/s for Nominatim/Overpass-style public servers).

## Worker (`worker/`)

- `GET /api/models` — OpenRouter `/api/v1/models`, filtered to `pricing.prompt == "0"` and
  `pricing.completion == "0"`, cached 1 h.
- `POST /api/plan` — body `{ destination, days, dates?, interests, pace, avoid }`.
  Pipeline:
  1. **Brief** (model) → normalized JSON: towns per day, interests.
  2. **Scout** (code) → Overpass POIs around each town + Wikivoyage See/Do/Eat listings.
  3. **Rank** (model) → picks with a one-line `why`, hype filter rules in the prompt:
     prefer local-language names, long-standing places, neighborhood spots; avoid chains,
     "viral", "instagrammable", top-10 list staples unless asked.
  4. **Verify** (code) → keep only picks that match a scouted OSM element (name fuzzy match
     + distance < 300 m). Never return a place that wasn't in the scouted set.
  5. **Logistics** (model + code) → booking flags (timed entry, reservations, trains,
     flights) with suggested deadlines.
  Returns a draft; nothing is saved server side.
- Free-model fallback chain on 429/5xx. JSON-mode prompts, validated with zod.
- Security: key from `env.OPENROUTER_API_KEY` secret; CORS allow-list from `env.ALLOWED_ORIGINS`;
  per-IP rate limit (KV or in-memory); web text wrapped and labeled as untrusted data in prompts;
  no personal data sent.

## Milestones

1. Skeleton: Vite app, design tokens, map, Pages deploy workflow.
2. Trips + days + stops (local storage), sheet UI, search.
3. Day zones with walk isochrones, inside/outside badges.
4. Legs: walk + transit times between stops.
5. Bookings checklist.
6. Worker + assistant with draft review.
7. Import/export, seed Taiwan + Whiteface trips.
8. Cloudflare Pages + Access + D1 sync; then SwiftUI port.
