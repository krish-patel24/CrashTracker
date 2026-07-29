import Papa from 'papaparse';
import { resolveOperator } from './operatorMap.js';
import { geocodeCity } from './geocode.js';

const HERMAI_URL = 'https://api.hermai.ai/v1/fetch';

// The real dataset updates monthly at the source. This cache just avoids
// hammering hermai on every page load — it does not simulate real-time data.
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

let cache = { data: null, fetchedAt: 0, error: null };

export async function fetchCrashes({ force = false } = {}) {
  const isFresh = cache.data && Date.now() - cache.fetchedAt < CACHE_TTL_MS;
  if (isFresh && !force) return cache.data;

  const apiKey = process.env.HERMAI_API_KEY;
  if (!apiKey) {
    throw new Error('HERMAI_API_KEY is not set. Copy .env.example to .env and add your key.');
  }

  const site = process.env.HERMAI_SOURCE_SITE;
  const endpoint = process.env.HERMAI_SOURCE_ENDPOINT;

  const response = await fetch(HERMAI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({ site, endpoint })
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `hermai request failed (${response.status} ${response.statusText}). ` +
      `Double check site="${site}" / endpoint="${endpoint}" against your hermai catalog. ${body}`.trim()
    );
  }

  const payload = await response.json();
  // hermai's response shape may vary — check payload.data first, fall back to
  // common alternates. Log payload once during setup if none of these match.
  const csvText = payload.data ?? payload.csv ?? payload.result ?? payload.content;
  if (!csvText || typeof csvText !== 'string') {
    throw new Error(
      'Unexpected hermai response shape — inspect the raw payload and update ' +
      'the csvText lookup in lib/fetchCrashes.js'
    );
  }

  const parsed = Papa.parse(csvText.trim(), { header: true, skipEmptyLines: true });
  if (parsed.errors?.length) {
    console.warn(`CSV parse warnings (${parsed.errors.length}):`, parsed.errors.slice(0, 3));
  }

  const crashes = parsed.data
    .filter(row => (row.State || '').trim().toUpperCase() === 'CA')
    .filter(row => extractYear(row['Incident Date'] || row['Report Month'] || '') === '2026')
    .map(normalizeCrash)
    .filter(Boolean);

  cache = { data: crashes, fetchedAt: Date.now(), error: null };
  return crashes;
}

export function getCacheMeta() {
  return { fetchedAt: cache.fetchedAt, count: cache.data ? cache.data.length : 0 };
}

function extractYear(dateStr) {
  const match = String(dateStr).match(/(20\d{2})/);
  return match ? match[1] : null;
}

function normalizeCrash(row) {
  const make = (row.Make || '').trim();
  const city = (row.City || '').trim();
  const state = (row.State || '').trim();
  const dateRaw = (row['Incident Date'] || row['Report Month'] || '').trim();
  const narrative = (row.Narrative || row['Narrative Summary'] || '').trim();
  const severity = classifySeverity(row['Highest Injury Severity'] || row.Severity || '');
  // TODO: confirm the real column names for these two once you can see a raw row —
  // NHTSA's SGO schema usually has something like "CP Contact Area"/"Crash With"
  // and a pre-crash movement field, but the exact header text needs verifying.
  const crashWith = (row['Crash With'] || row['SV Contact Area'] || '').trim();
  const movement = (row['Movement'] || row['SV Pre-Crash Movement'] || '').trim();
  // TODO: confirm these header names against a real row too — same caveat as
  // above. Operating Entity / Reporting Entity are the SGO fields that name
  // who actually runs the vehicle; Make is only a last-resort fallback since
  // some chassis (e.g. Toyota) are used by more than one operator.
  const operatingEntity = (row['Operating Entity'] || '').trim();
  const reportingEntity = (row['Reporting Entity'] || '').trim();

  if (!city || !dateRaw) return null;

  const coords = geocodeCity(city, state);

  return {
    id: row['Report ID'] || row['SGO Report ID'] || randomId(),
    make,
    operator: resolveOperator({ operatingEntity, reportingEntity, make }),
    city: state ? `${city}, ${state}` : city,
    date: formatMonthYear(dateRaw), // month/year only — NHTSA redacts the exact day
    severity,
    crashWith: crashWith || null,
    movement: movement || null,
    narrative,
    lat: coords ? coords.lat : null,
    lng: coords ? coords.lng : null
  };
}

function classifySeverity(value) {
  const v = String(value).toLowerCase();
  if (v.includes('fatal')) return 'fatality';
  if (v.includes('serious') || v.includes('minor') || v.includes('injur')) return 'injury';
  return 'damage';
}

function formatMonthYear(dateRaw) {
  const d = new Date(dateRaw);
  if (isNaN(d)) return dateRaw; // fall back to the raw value if it doesn't parse
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

function randomId() {
  return 'SGO-' + Math.random().toString(36).slice(2, 9).toUpperCase();
}
