import { Redis } from '@upstash/redis';

// Vercel's standalone "KV" product was discontinued — existing KV stores were
// migrated to Upstash Redis, and new projects add Redis via the Vercel
// Marketplace ("Upstash for Redis" integration), which injects these two
// env vars automatically. Locally (or on any deploy without that connected),
// fall back to a plain in-memory Map — fine for a single long-running
// process, but note this fallback has the same "doesn't survive across
// instances" limitation the in-memory cache always had on serverless.
const hasUpstash = Boolean(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
);
const redis = hasUpstash ? Redis.fromEnv() : null;

const memoryStore = new Map();

export async function cacheGet(key) {
  if (redis) return (await redis.get(key)) ?? null;
  return memoryStore.get(key) ?? null;
}

export async function cacheSet(key, value, ttlSeconds) {
  if (redis) {
    await redis.set(key, value, { ex: ttlSeconds });
    return;
  }
  memoryStore.set(key, value);
}

export function cacheBackend() {
  return redis ? 'upstash-redis' : 'in-memory';
}
