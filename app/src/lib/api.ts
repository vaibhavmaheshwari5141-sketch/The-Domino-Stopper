// Typed access to the API (server/). Paths are the API routes, for example apiGet<HealthResponse>('/api/health').
// VITE_API_BASE_URL is empty by default, so requests go to /api on the same origin (the Vite server in development,
// the Netlify Function in production).

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');

export type QueryValue = string | number | boolean | null | undefined;
export type QueryParams = Record<string, QueryValue | QueryValue[]>;

export class ApiError extends Error {
  readonly status: number;
  readonly path: string;

  constructor(status: number, message: string, path: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.path = path;
  }
}

/** Builds the request URL. null/undefined params are dropped; arrays become repeated keys (?a=1&a=2). */
export function buildUrl(path: string, params?: QueryParams): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== null && item !== undefined) search.append(key, String(item));
    }
  }
  const query = search.toString();
  return `${API_BASE_URL}${path}${query ? `?${query}` : ''}`;
}

export async function apiGet<T>(path: string, params?: QueryParams, init?: { signal?: AbortSignal }): Promise<T> {
  const res = await fetch(buildUrl(path, params), { headers: { Accept: 'application/json' }, signal: init?.signal });
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body: unknown = await res.json();
      if (body && typeof body === 'object' && 'detail' in body && typeof body.detail === 'string') message = body.detail;
    } catch {
      // not JSON; keep the status text
    }
    throw new ApiError(res.status, message, path);
  }
  return (await res.json()) as T;
}

// Response types, shared with the server
export type * from '../../shared/api-types';
