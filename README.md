# CrashTracker

California robotaxi crash reports, sourced from NHTSA's Standing General Order (SGO)
filings via hermai, with vehicle Make mapped back to the actual operator (Waymo, Zoox).

**To access the website, visit https://crash-tracker.vercel.app/**

## Setup

```bash
npm install
cp .env.example .env
# edit .env and add your HERMAI_API_KEY
npm start
```

## Tech Stack

**Backend**

Node.js — runtime
Express — web server / routing
dotenv — loads .env config into process.env
Papaparse — CSV parsing

**Data source**

Hermai API — turns NHTSA's Standing General Order (SGO) filings into a queryable API = backend calls it server-side with your key

**Frontend**

Plain HTML/CSS/JavaScript

**Data/config files**

data/cityGeocode.json — static city → lat/lng lookup table
lib/operatorMap.js — maps vehicle Operating/Reporting Entity to operator names (Waymo/Zoox)
.env — holds HERMAI_API_KEY, HERMAI_SOURCE_SITE, HERMAI_SOURCE_ENDPOINT, CRON_SECRET

**Hosting / infra**

Vercel — hosting, serverless function deployment of the Express app, and Vercel Cron for the scheduled daily refresh (vercel.json)
Git/GitHub — version control and the source Vercel deploys from

**Project structure**

```
server.js              Express app + /api/crashes route
lib/fetchCrashes.js     hermai call, CSV parse, CA/2026 filter, caching
lib/operatorMap.js      Make -> operator mapping (Jaguar/Zeekr -> Waymo, etc.)
lib/geocode.js          City -> lat/lng lookup
data/cityGeocode.json   Coordinate table, extend as needed
public/                 Static frontend (index.html, style.css, app.js)
```

