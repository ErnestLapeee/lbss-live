# Deploying LBSS to Railway

When hosting the **web app** (Next.js) on Railway, it must know the **API URL** so it can load teams, seasons, stats, games, etc. If this is not set, the site will load but show **no teams**, **no seasons**, and **no statistics** because every server-side API call will fail (the app defaults to `http://localhost:3002`, which does not exist on Railway’s servers).

## Required: Set `NEXT_PUBLIC_API_URL` on the Web Service

1. In the **Railway dashboard**, open the project and select the **web** service (the one that runs the Next.js app).
2. Go to **Variables** (or **Settings → Environment**).
3. Add:
   - **Name:** `NEXT_PUBLIC_API_URL`
   - **Value:** The public URL of your **API** service, e.g. `https://your-api-service.up.railway.app`  
     (No trailing slash. You find this in your API service’s Railway settings under “Public URL” or “Domains”.)
4. **Redeploy** the web service so the new variable is picked up.

After this, the web app will call your API correctly and teams, seasons, and statistics should appear (assuming the API and database are running and have data).

## Recommended: `INTERNAL_API_URL` on the Web service (reduces egress)

The browser loads data through `/api/proxy/...`, which calls the API from the web container. If that hop uses the **public** API URL, Railway bills **network egress twice** (API → web → browser).

1. In Railway, open the **API** service and copy its **private** URL (Settings → Networking → Private URL), e.g. `http://lbss-live.railway.internal:3002`.
2. On the **web** service, add:
   - **Name:** `INTERNAL_API_URL`
   - **Value:** that private URL (no trailing slash)
3. Redeploy the web service.

Server-side fetches and the API proxy will use the private network. **`NEXT_PUBLIC_API_URL`** stays the public API URL (used by the browser for WebSocket live scoring only).

## Optional: API service environment variables

On the **API** service in Railway, ensure at least:

- **`DATABASE_URL`** — PostgreSQL connection string (usually added by linking a PostgreSQL plugin).
- **`WEB_URL`** — Public URL of your web app (e.g. `https://your-web.up.railway.app`) so CORS allows the frontend.
- **`ADMIN_URL`** — Public URL of the admin app (if deployed separately).
- **`SESSION_SECRET`** — A random string for admin session cookies.

## Bot / scraper protection (built into the app)

- **`/robots.txt`** tells well-behaved crawlers not to fetch `/api/` (including `/api/proxy/...`).
- **Rate limits** (~100 requests/minute per IP, tighter on heavy stats/game-list routes) on public API routes and the web proxy return `429` when exceeded.
- **Cache headers** on stats, standings, and game lists reduce repeat API work when bots or monitors re-hit the same URLs.

These measures stop runaway egress from aggressive scrapers; they do not block normal visitors or live-game pages.

## Summary

| Service | Variable | Purpose |
|--------|----------|--------|
| **Web** | `NEXT_PUBLIC_API_URL` | **Required.** Public API URL (WebSocket + fallback). |
| **Web** | `INTERNAL_API_URL` | **Recommended.** Private API URL for SSR and `/api/proxy` (lower egress). |
| API | `DATABASE_URL` | PostgreSQL connection. |
| API | `WEB_URL` | CORS: allow requests from the web app. |
| API | `ADMIN_URL` | CORS: allow requests from the admin app. |
| API | `SESSION_SECRET` | Admin session signing. |

Without `NEXT_PUBLIC_API_URL` on the web service, you will see “No teams registered yet”, empty season dropdowns, and no statistics even if the API and database are working.
