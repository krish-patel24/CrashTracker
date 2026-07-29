import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CITY_COORDS = JSON.parse(
  readFileSync(path.join(__dirname, '..', 'data', 'cityGeocode.json'), 'utf-8')
);

// NHTSA does not publish street-level addresses (that's a deliberate privacy
// redaction), so the best we can honestly do is place a pin at the city center.
// Returns null for cities not in the lookup table rather than guessing.
export function geocodeCity(city, state) {
  const key = `${(city || '').trim().toUpperCase()}|${(state || '').trim().toUpperCase()}`;
  const coords = CITY_COORDS[key];
  return coords ? { lat: coords[0], lng: coords[1] } : null;
}
