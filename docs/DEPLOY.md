# Deploying

## Website (free, GitHub Pages)

1. Merge to `main`.
2. Repo Settings > Pages > Source: **GitHub Actions**.
3. The site appears at https://manan-mittal.github.io/Traveler-er/ after the workflow finishes.

## Assistant API (free, Cloudflare Workers)

The website works without it. The assistant needs the Worker because it holds the OpenRouter key.

```sh
cd worker
npm install
npx wrangler login
npx wrangler secret put OPENROUTER_API_KEY   # paste the key when prompted; it is never stored in the repo
npx wrangler deploy
```

Then add the Worker URL to the site: repo Settings > Secrets and variables > Actions > Variables,
new variable `VITE_API_URL` = the `https://traveler-er-api.<you>.workers.dev` address, and re-run the Pages workflow.

## Sign-in and saved trips (free, Google + Cloudflare D1)

1. Google Cloud Console > APIs & Services > Credentials > Create OAuth client ID > Web application.
   Authorized JavaScript origins: `https://manan-mittal.github.io` and `http://localhost:5173`. No redirect URI.
2. Cloudflare dashboard > Storage & Databases > D1 > Create database `traveler-er`.
3. In `worker/wrangler.toml` set `GOOGLE_CLIENT_ID` and the D1 `database_id`, and in `.github/workflows/pages.yml`
   set `VITE_GOOGLE_CLIENT_ID` to the same client id. Both ids are public; neither is a secret.
4. Merge. The Worker creates its tables on first use.

Signed out, trips stay in the browser. Signing in uploads them and keeps them in sync across devices.
The assistant and shared-list import need sign-in, so strangers can't spend the OpenRouter quota.
See [SECURITY.md](SECURITY.md) for how it's protected.
