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

## Optional: API service environment variables

On the **API** service in Railway, ensure at least:

- **`DATABASE_URL`** — PostgreSQL connection string (usually added by linking a PostgreSQL plugin).
- **`WEB_URL`** — Public URL of your web app (e.g. `https://your-web.up.railway.app`) so CORS allows the frontend.
- **`SESSION_SECRET`** — A random string for admin session cookies.

## Summary

| Service | Variable | Purpose |
|--------|----------|--------|
| **Web** | `NEXT_PUBLIC_API_URL` | **Required.** Tells the Next.js app where the API is (teams, seasons, stats, games). |
| API | `DATABASE_URL` | PostgreSQL connection. |
| API | `WEB_URL` | CORS: allow requests from the web app. |
| API | `SESSION_SECRET` | Admin session signing. |

Without `NEXT_PUBLIC_API_URL` on the web service, you will see “No teams registered yet”, empty season dropdowns, and no statistics even if the API and database are working.
