import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchCrashes, getCacheMeta } from './lib/fetchCrashes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/crashes', async (req, res) => {
  try {
    const force = req.query.refresh === 'true';
    const data = await fetchCrashes({ force });
    res.json({ crashes: data, meta: getCacheMeta() });
  } catch (err) {
    console.error('Failed to fetch crash data:', err.message);
    res.status(502).json({ error: 'Unable to fetch crash data', detail: err.message });
  }
});

// Scheduled refresh. Two ways this gets triggered:
//  1. Vercel Cron (see vercel.json) hits this route on a schedule. Vercel
//     signs those requests with `Authorization: Bearer <CRON_SECRET>`, using
//     whatever value you set for CRON_SECRET in your project's env vars — so
//     set CRON_SECRET there too, not just HERMAI_API_KEY.
//  2. Anywhere else, use whatever your host's own cron/scheduler feature is,
//     configured to hit this same URL on the schedule you want.
// Without CRON_SECRET set, this route is disabled rather than left open.
app.get('/api/cron/refresh', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return res.status(503).json({ error: 'CRON_SECRET is not configured' });
  }
  if (req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const data = await fetchCrashes({ force: true });
    res.json({ refreshed: true, meta: getCacheMeta(), count: data.length });
  } catch (err) {
    console.error('Scheduled refresh failed:', err.message);
    res.status(502).json({ error: 'Refresh failed', detail: err.message });
  }
});

// Vercel deploys this file as a serverless function (see vercel.json) and
// calls the exported app directly, so only start a traditional listener
// when running it yourself (npm start / npm run dev).
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`CrashTracker running at http://localhost:${PORT}`);
  });
}

export default app;
