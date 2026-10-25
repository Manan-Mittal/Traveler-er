# AI trip planner: architecture

The planner turns "4 days in Taipei, love tea, old streets and quiet temples, nothing TikTok-famous"
into a reviewable day-by-day plan: neighborhoods to walk, real local places inside each one,
the things you need to book, and the trains or flights between cities with realistic times.

It is a small multi-agent system with an orchestrator, built to three rules:

1. **The model only chooses; code checks.** Every place comes from open map data and is verified
   by id before it reaches the user. A model can't invent a place, a time, or a booking deadline.
2. **A person approves every change.** Agents return a proposal (a diff). Nothing is written to the
   trip until the user ticks what they want and presses Apply. There are two checkpoints.
3. **$0 to run.** OpenRouter `:free` models only, free Cloudflare Worker, free open-data APIs.
   That means a tight model-call budget, so models are used only where judgment is needed.

## Flow

```
             ┌──────────── checkpoint 1 ────────────┐      ┌────────── checkpoint 2 ──────────┐
 user ask ─▶ │ ORCHESTRATOR (LLM)  ─▶ Geocoder (code)│ ─▶  │ per city:                         │ ─▶ Apply
             │ day themes + neighborhoods per day    │      │  Scout ─▶ Fame ─▶ Curator (LLM)   │
             │ user keeps / drops each neighborhood  │      │        ─▶ Critic ─(retry once)─┘  │
             └───────────────────────────────────────┘      │  Logistics (bookings, pacing)     │
                                                             │ once: Travel (trains, flights)    │
                                                             │ user keeps / drops each change    │
                                                             └───────────────────────────────────┘
```

| Agent | Kind | Job | Tools / data |
| --- | --- | --- | --- |
| **Orchestrator** | LLM | Reads the ask and the trip (dates, cities, zones already planned) and writes the outline: a theme per day and 1 to 3 walkable neighborhoods for days that don't have one yet. Decides which days the other agents work on. | trip context only |
| **Geocoder** | code | Turns each neighborhood into coordinates and drops any that land far from that day's city. | Photon (OSM) |
| **Scout** | code | Collects every named place inside each neighborhood's walk radius in one query, plus travel-guide listings. | Overpass (OSM), Wikivoyage |
| **Fame** | code | Measures how famous each place is by how many Wikipedia language editions cover it. That number, not vibes, is the hype signal. | Wikidata sitelinks |
| **Curator** | LLM | Picks places per neighborhood for the user's interests and pace, preferring local, long-standing and low-fame spots, with one plain sentence each. Flags anything that likely needs a reservation or a timed ticket. | numbered candidate list |
| **Critic** | code | Rejects picks that aren't in the candidate list, sit outside the walk radius, repeat a place already in the trip, or are too famous for the ask. Trims days that are over the pace budget. If a neighborhood ends up thin, sends the rejections back to the Curator once. | geometry, rules |
| **Logistics** | code | Turns flags and OSM tags (`reservation=*`, `fee=*`) into booking to-dos with deadlines, and estimates the day's length from walking, time at each stop and hops between neighborhoods. | rules |
| **Travel** | code | Finds the train, bus or flight between consecutive cities on the real date, names the mode (for example high-speed rail) and adds a booking. Falls back to a flight above ~500 km with no rail. | Transitous (MOTIS) |

Only two roles call a model. The rest are deterministic, so they are cheap, testable and correct by construction.
That is a deliberate choice for a free tier, and the same split you would want with paid models.

## Human in the loop

- **Checkpoint 1, outline.** The user sees each day's theme and proposed neighborhoods and unticks
  any they don't want. Nothing is scouted for dropped ones, which also saves model calls.
- **Checkpoint 2, proposal.** Every new neighborhood, place and booking is a separate line with its
  reason and evidence (map source, fame, "reservation recommended", travel time). Dropping a
  neighborhood drops its places. Apply writes only the ticked lines, through the same store actions
  the user's own clicks use.
- The agent trace (which agent ran, which model answered, what was rejected and why) streams to the
  panel live, so the user can see why a place was or wasn't chosen.

## Grounding and safety

- **No invented places.** The Curator answers with candidate numbers. The Critic resolves numbers to
  scouted OSM or Wikivoyage entries and drops anything else.
- **Prompt injection.** Place names and guide text are untrusted. They are passed as a numbered data
  list, labeled as data, trimmed, and the model's output is parsed against a fixed schema. Agents have
  no tools that act: the worst a poisoned listing can do is be suggested, and the user still has to approve it.
- **No personal data to models.** Prompts contain place names, dates and the user's interests text,
  never account details. Free models may log prompts, which the panel says.
- **Abuse and quota.** Inputs are size-capped, requests are rate limited per client, the AI endpoints
  require sign-in once auth ships, and each run has a hard budget of model calls and subrequests.
- **Key handling.** The OpenRouter key lives only in the Worker as a secret. Only models whose id ends in
  `:free` and whose every price is zero can be called.

## Free-tier budget

| Limit | Value | How the design fits |
| --- | --- | --- |
| OpenRouter free models | ~20 calls/min, 50/day on an account without credits | A full 3-city plan uses about 4 model calls (1 outline + 1 per city), 7 at most with retries |
| Cloudflare Worker subrequests | 50 per request | The work is split into outline, one fill per city, and travel, each well under 50 |
| Worker CPU | 10 ms per request on the free plan | Waiting on network doesn't count; candidate lists are capped before parsing |
| Overpass / Photon / Transitous | fair use | One combined Overpass query per city, results cached in the Worker for an hour |

Model fallback: the Worker lists OpenRouter's current free models and tries the next one when a model
is rate limited, down, or returns something that doesn't parse. The trace shows which model answered.

## API

All three stream newline-delimited JSON: `{"type":"step",...}` lines while agents work, then one
`{"type":"result",...}` or `{"type":"error",...}`.

- `POST /api/agent/outline` `{ ask, pace, days: [{ index, date, city?, cityLat?, cityLon?, zones: [names] }] }`
  → `{ destination, days: [{ index, theme, zones: [{ name, lat, lon, walkMinutes, why }] }] }`
- `POST /api/agent/fill` `{ ask, pace, zones: [{ key, dayIndex, date, name, lat, lon, walkMinutes }], existing: [names] }`
  → `{ stops: [{ zoneKey, name, lat, lon, category, why, evidence }], bookings: [...], days: [{ dayIndex, minutes, warning? }] }`
- `POST /api/agent/travel` `{ legs: [{ fromName, fromLat, fromLon, toName, toLat, toLon, date, dayIndex }] }`
  → `{ legs: [{ ...summary, modes, minutes }], bookings: [...] }`

The web app orchestrates the HTTP calls (outline, then a fill per city, then travel) so each request
stays inside the Worker limits, but each agent's logic lives in the Worker and the iOS app can reuse it.

## Code map

- `worker/src/agents/` — one file per agent, plus `orchestrator.ts` (runs a stage, keeps the budget and trace)
- `worker/src/agents/*.test.ts` — Critic, Logistics, Fame and parsing tests run offline with `npm test`
- `web/src/agent/` — API client and planner state
- `web/src/ui/Planner.tsx` — the planner panel with the two review checkpoints

## What's next

- Show proposed places as ghost pins on the map during review.
- Persist the last proposal with the trip so a review can be finished later (needs saved trips).
- Per-user quota once sign-in ships.
- Opening hours check against the planned date (OSM `opening_hours`).
