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
