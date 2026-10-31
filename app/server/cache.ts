// A small TTL cache for read endpoints, keyed on the endpoint and its query parameters.
//
//   const airports = cached('airports', 600, (params) => getAirports(params.get('month')));
//
// The pending promise is cached, so identical requests arriving together share one warehouse query.
// Failures are not cached. On a serverless host each warm instance has its own cache; the CDN cache headers
// set in app.ts are what spare the warehouse there.

type Loader<T> = (params: URLSearchParams) => Promise<T>;

const caches: Map<string, { expires: number; value: Promise<unknown> }>[] = [];
const MAX_ENTRIES = 256;

export function cached<T>(endpoint: string, ttlSeconds: number, load: Loader<T>): Loader<T> {
  const cache = new Map<string, { expires: number; value: Promise<unknown> }>();
  caches.push(cache);

  return (params) => {
    const sorted = new URLSearchParams([...params].sort(([a], [b]) => a.localeCompare(b)));
    const key = `${endpoint}?${sorted}`;
    const now = Date.now();
    const hit = cache.get(key);
    if (hit && hit.expires > now) return hit.value as Promise<T>;

    const value = load(params);
    value.catch(() => cache.delete(key));
    if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value!);    // drop the oldest entry
    cache.set(key, { expires: now + ttlSeconds * 1000, value });
    return value;
  };
}

export function clearAll(): void {
  for (const cache of caches) cache.clear();
}
