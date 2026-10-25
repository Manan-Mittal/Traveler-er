import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Content Security Policy for the built site (GitHub Pages can't send headers, so it goes in a meta tag).
 * It limits where scripts can load from and where the app can send data, which keeps an injected
 * script from stealing the sign-in token. Add a host to connect-src when the app starts calling a new API.
 * Not used in dev, where Vite injects inline scripts.
 */
const csp = (api: string): Plugin => ({
  name: 'csp',
  apply: 'build',
  // Right after <meta charset>, ahead of every script.
  transformIndexHtml: (html) =>
    html.replace(
      '<meta charset="UTF-8" />',
      `$&\n    <meta http-equiv="Content-Security-Policy" content="${[
        "default-src 'self'",
        "script-src 'self' https://accounts.google.com/gsi/client",
        "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
        "img-src 'self' data: blob: https:",
        "font-src 'self' data:",
        `connect-src 'self' ${api} https://tiles.openfreemap.org https://photon.komoot.io https://valhalla1.openstreetmap.de https://api.transitous.org https://accounts.google.com/gsi/`,
        'frame-src https://accounts.google.com/gsi/',
        "worker-src 'self' blob:",
        "child-src 'self' blob:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; ')}" />\n    <meta name="referrer" content="strict-origin-when-cross-origin" />`,
    ),
})

export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react(), tailwindcss(), csp(process.env.VITE_API_URL ?? '')],
})
