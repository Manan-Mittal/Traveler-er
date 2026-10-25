# Security

How Traveler-er protects accounts, trips and the API keys, plus the audit done when sign-in was added (Oct 2026).

## How sign-in works

1. The site shows Google's own "Sign in with Google" button (Google Identity Services, popup mode).
2. Google returns a signed ID token to the page, which sends it once to `POST /api/auth/google`.
3. The Worker verifies the token itself: RS256 signature against Google's published keys, issuer,
   audience (our client id), expiry, and a verified email. Anything else is a 401.
4. The Worker creates a session: 32 random bytes, returned to the browser once. D1 stores only its
   SHA-256 hash, so a database leak can't be replayed. Sessions last 30 days and sign-out deletes them.
5. The browser sends the session as `Authorization: Bearer …`. It is kept in `localStorage` because the site
   (github.io) and API (workers.dev) are different sites, and Safari blocks the third-party cookies an
   httpOnly cookie would need. The Content Security Policy below is what keeps injected scripts from reading it.

## Data

- Trips are stored per user in D1 with primary key `(user_id, id)`, so two accounts can never read or overwrite
  each other's trips even with the same trip id. Every query is parameterised and filtered by the session's user.
- Deleting a trip leaves a small tombstone so other devices remove their copy instead of uploading it again.
- The Worker checks shape and size (1 MB per trip, 300 trips); the app re-validates every trip it loads
  (`cleanTrip` in `web/src/store.ts`), including links, which must be `http(s)`.

## Audit findings and fixes

| # | Finding | Risk | Fix |
|---|---|---|---|
| 1 | The origin check let through any request **without** an `Origin` header, so anyone with curl could call `/api/plan` and spend the OpenRouter free quota. | High | AI and list-import endpoints require sign-in. |
| 2 | Rate limiting was an in-memory counter per Worker instance, which resets often and differs per instance. | Medium | Per-user hourly quotas stored in D1 (assistant 40/h, list import 30/h, saves 1200/h). The per-IP limiter stays only for the sign-in endpoint. |
| 3 | Request bodies had no size limit. | Low | Every JSON body is capped (4 KB for planning, 8 KB for sign-in, 1.1 MB for a trip). |
| 4 | The shared-list import followed every redirect, so a Google open redirect could make the Worker fetch any site. | Low | Redirects are followed one hop at a time and stop as soon as one leaves Google's share hosts. |
| 5 | No Content Security Policy. | Medium (needed once a token is stored) | The built site has a CSP meta tag: scripts only from the site and Google sign-in, network calls only to the APIs the app uses, no plugins, no `<base>` hijack. |
| 6 | `fflate` 0.8.2 can loop forever on a malformed ZIP64 Takeout file. | Low | Upgraded to 0.8.3. |
| 7 | API responses could be cached by shared proxies. | Low | `Cache-Control: no-store` and `X-Content-Type-Options: nosniff` on every response. |

Checked and fine:

- **Secrets.** The OpenRouter key is a Worker secret (`wrangler secret put`), never in the repo or git history, and
  only reaches openrouter.ai. Only models whose every price is 0 can be called (`isFree`), so nothing can be billed.
  The Google client id and D1 database id are public identifiers, not secrets.
- **CORS.** An exact-match allowlist of origins with `Vary: Origin`; no wildcard and no credentials mode.
- **Prompt injection.** Place names from OpenStreetMap go into the prompt as data, the system prompt says to
  ignore instructions in them, and `verifyPicks` drops any answer that isn't one of the scouted places.
  Model text is shown as plain text by React, never as HTML.
- **XSS.** No `dangerouslySetInnerHTML` or `setHTML`; user links are limited to `http(s)`.

## Known limits / follow-ups

- `maplibre-gl` 5.x has an advisory in its HTML sanitizer (GHSA-jrc7-96c5-q579). The app never passes HTML to
  MapLibre (no popups); only the trusted OpenFreeMap attribution goes through it. Upgrading to 6.x needs its
  worker file served separately, so it's left for a map-focused change.
- `wrangler` (dev tool only, not shipped) pulls an `undici` with advisories; update when a fixed wrangler is out.
- Anyone with a Google account can sign in. If the app should be invite-only, add an email allowlist check in
  `createSession`.
- A session is a bearer token: if it leaks, it works until it expires or the user signs out on that device.
