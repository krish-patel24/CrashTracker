# CrashTracker

California robotaxi crash reports, sourced from NHTSA's Standing General Order (SGO)
filings via hermai, with vehicle Make mapped back to the actual operator (Waymo, Zoox).

## Setup

```bash
npm install
cp .env.example .env
# edit .env and add your HERMAI_API_KEY
npm start
```

Visit `http://localhost:3000`.

## Before you deploy — please verify these

1. **Confirm the hermai site/endpoint.** `.env.example` ships with a best-guess
   `HERMAI_SOURCE_SITE` / `HERMAI_SOURCE_ENDPOINT`. Hit
   `GET https://api.hermai.ai/v1/catalog/<site>` with your key first to confirm
   the real endpoint name and field names before trusting the output.

2. **Confirm the CSV column names.** `lib/fetchCrashes.js` guesses at column
   names like `Incident Date`, `Highest Injury Severity`, `Narrative`. Log one
   raw row the first time you connect and adjust `normalizeCrash()` in that
   file to match the actual headers.

3. **Check the response payload shape.** `payload.data` is assumed to hold the
   raw CSV string. If hermai wraps it differently, update the `csvText` lookup
   at the top of `fetchCrashes()`.

4. **City-level geocoding only.** NHTSA does not publish street addresses (a
   deliberate privacy redaction), so `data/cityGeocode.json` places pins at
   city centers. Cities not in that lookup table are still listed in the
   sidebar but won't get a map pin — add more cities to the table as needed
   rather than guessing coordinates.

5. **Month/year dates only, by design.** NHTSA also redacts the exact day.
   Don't "fix" this by inventing a specific date — it isn't in the source data.

6. **Numbers will change.** The dataset updates monthly, and NHTSA itself
   warns totals can shift as filings post or get corrected. Don't hardcode a
   headline count anywhere in copy — always read it live from the API.

## Deploying (Vercel)

`vercel.json` is set up to run `server.js` as a serverless function and to
hit `/api/cron/refresh` on a schedule (daily at 08:00 UTC — adjust the cron
string if you want a different cadence; the source data itself only updates
monthly, so daily is just a safety margin).

In the Vercel project's **Settings → Environment Variables**, add:

- `HERMAI_API_KEY`
- `HERMAI_SOURCE_SITE`
- `HERMAI_SOURCE_ENDPOINT`
- `CRON_SECRET` — any random string; Vercel sends it back as a Bearer token
  so the refresh route can confirm the request really came from Vercel Cron

**One caveat:** the cache in `lib/fetchCrashes.js` lives in memory. On a
normal Node host (Render, Railway, a VM, etc.) that's fine — one process,
one cache, cron keeps it warm. On Vercel's serverless functions there's no
guarantee two requests hit the same warm instance, so the cache can still
get dropped between requests even with cron running. It's not broken, just
not as sticky as on a persistent server. If you want the cache to reliably
survive across requests on Vercel, the fix is to swap the in-memory `cache`
object in `lib/fetchCrashes.js` for something shared, like Vercel KV or
Upstash Redis — happy to wire that up if you end up needing it.

## Project structure

```
server.js              Express app + /api/crashes route
lib/fetchCrashes.js     hermai call, CSV parse, CA/2026 filter, caching
lib/operatorMap.js      Make -> operator mapping (Jaguar/Zeekr -> Waymo, etc.)
lib/geocode.js          City -> lat/lng lookup
data/cityGeocode.json   Coordinate table, extend as needed
public/                 Static frontend (index.html, style.css, app.js)
```
