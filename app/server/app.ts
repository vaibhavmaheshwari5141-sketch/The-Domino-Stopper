// The API as one web-standard handler: (Request) => Promise<Response>.
// The same handler runs inside the Vite dev server (server/dev.ts) and as a Netlify Function
// (netlify/functions/api.ts); other hosts (Vercel, Cloudflare) need only a two-line adapter.

import type { ErrorResponse } from '../shared/api-types.ts';
import { cached } from './cache.ts';
import type { Config } from './config.ts';
import { DataAccessError, type DataSource, UnknownTableError, setDataSource } from './db.ts';
import { HttpError } from './http.ts';
import { getHealth } from './routes/health.ts';
import { getMeta } from './routes/meta.ts';
import { airportImpactParams, getAirportImpact, getOverview, overviewParams } from './routes/overview.ts';
import * as aircraftDay from './routes/aircraftDay.ts';
import * as airports from './routes/airports.ts';
import * as propagation from './routes/propagation.ts';
import * as datasets from './routes/datasets.ts';
import * as planner from './routes/planner.ts';
import * as risk from './routes/risk.ts';
import * as simulator from './routes/simulator.ts';

export type ApiHandler = (req: Request) => Promise<Response>;

type Loader = (params: URLSearchParams) => Promise<unknown>;

interface RouteDef {
  /** Path after /api/, with `:name` for a path parameter (passed to the route as a query parameter). */
  path: string;
  load: Loader;
  /** Validates and normalises the parameters (throws HttpError 400); its result is also the cache key. */
  params?: (params: URLSearchParams) => URLSearchParams;
  cache?: boolean;           // cache in memory and on the CDN (default true)
  csv?: boolean;             // load returns { filename, body } and is sent as a CSV download
}

interface Route extends RouteDef {
  pattern: RegExp;
  names: string[];
}

export function createApiHandler(config: Config, source: DataSource): ApiHandler {
  setDataSource(source);
  const ttl = config.cacheTtlSeconds;

  const defs: RouteDef[] = [
    { path: 'health', load: () => getHealth(), cache: false },
    { path: 'meta', load: () => getMeta() },
    { path: 'overview', load: getOverview, params: overviewParams },
    { path: 'overview/airports', load: getAirportImpact, params: airportImpactParams },
    { path: 'planner/dates', load: planner.getDates, params: planner.datesParams },
    { path: 'planner/summary', load: planner.getSummary, params: planner.summaryParams },
    { path: 'planner/turnarounds', load: planner.getTurnarounds, params: planner.turnaroundsParams },
    { path: 'planner/turnaround/:turn_id', load: planner.getDetail, params: planner.detailParams },
    { path: 'planner/airports', load: planner.getAirports, params: planner.airportsParams },
    { path: 'planner/export', load: planner.getExport, params: planner.exportParams, csv: true },
    { path: 'aircraft-day/aircraft', load: aircraftDay.getAircraftList, params: aircraftDay.listParams },
    { path: 'aircraft-day', load: aircraftDay.getAircraftDay, params: aircraftDay.dayParams },
    { path: 'simulator/strategies', load: simulator.getStrategies, params: simulator.strategiesParams },
    { path: 'simulator/sweep', load: simulator.getSweep, params: simulator.sweepParams },
    { path: 'simulator/daily', load: simulator.getDaily, params: simulator.dailyParams },
    { path: 'simulator/allocation', load: simulator.getAllocation, params: simulator.allocationParams },
    { path: 'risk/summary', load: risk.getSummary, params: risk.summaryParams },
    { path: 'risk/heatmap', load: risk.getHeatmap, params: risk.heatmapParams },
    { path: 'risk/trend', load: risk.getTrend, params: risk.airportParams },
    { path: 'risk/by-ground-time', load: risk.getByGroundTime, params: risk.airportParams },
    { path: 'risk/model-quality', load: () => risk.getModelQuality() },
    { path: 'risk/top-turnarounds', load: risk.getTopTurnarounds, params: risk.topParams },
    { path: 'risk/airports', load: risk.getAirports, params: risk.rangeParams },
    { path: 'airports/list', load: airports.getList, params: airports.listParams },
    { path: 'airports/network-scatter', load: airports.getScatter, params: airports.scatterParams },
    { path: 'airports/:code/profile', load: airports.getProfile, params: airports.codeParams },
    { path: 'airports/:code/monthly', load: airports.getMonthly, params: airports.codeParams },
    { path: 'airports/:code/hourly', load: airports.getHourly, params: airports.codeParams },
    { path: 'airports/:code/buffer', load: airports.getBuffer, params: airports.bufferParams },
    { path: 'propagation/curve', load: propagation.getCurve },
    { path: 'propagation/segments', load: propagation.getSegments, params: propagation.segmentParams },
    { path: 'propagation/by-leg', load: propagation.getByLeg, params: propagation.legParams },
    { path: 'propagation/kpis', load: propagation.getKpis },
    { path: 'propagation/calculate', load: propagation.getCalculate, params: propagation.calculateParams },
    // The list caches its parts itself (sample tables are looked for again while none are found)
    { path: 'datasets', load: () => datasets.getDatasets(), cache: false },
    { path: 'datasets/:name/schema', load: datasets.getSchema, params: datasets.nameParams },
    { path: 'datasets/:name/preview', load: datasets.getPreview, params: datasets.previewParams },
    { path: 'datasets/:name/download', load: datasets.getDownload, params: datasets.downloadParams, csv: true },
    { path: 'datasets/:name/profile', load: datasets.getProfile, params: datasets.nameParams },
  ];
  const routes: Route[] = defs.map((d) => {
    const names: string[] = [];
    const pattern = new RegExp(`^${d.path.replace(/:(\w+)/g, (_, n: string) => (names.push(n), '([^/]+)'))}$`);
    return { ...d, load: d.cache === false ? d.load : cached(d.path, ttl, d.load), pattern, names };
  });

  return async (req) => {
    const url = new URL(req.url);
    // Accept /api/<route> and the Netlify rewrite target /.netlify/functions/api/<route>
    const name = url.pathname.replace(/^\/(?:\.netlify\/functions\/)?api\/?/, '').replace(/\/+$/, '');
    const cors = corsHeaders(req.headers.get('origin'), config.corsOrigins);

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method !== 'GET') return json(405, { detail: 'Only GET is supported' }, cors);

    let route: Route | undefined;
    const params = new URLSearchParams(url.searchParams);
    for (const r of routes) {
      const m = r.pattern.exec(name);
      if (!m) continue;
      route = r;
      try {
        r.names.forEach((n, i) => params.set(n, decodeURIComponent(m[i + 1])));
      } catch {
        return json(400, { detail: 'Malformed path' }, cors);
      }
      break;
    }
    if (!route) return json(404, { detail: `No API route /api/${name}` }, cors);

    try {
      // Validated, normalised parameters only: the cache key holds known values, never raw input
      const body = await route.load(route.params ? route.params(params) : new URLSearchParams());
      const cacheHdrs = cacheHeaders(route.cache === false ? 0 : ttl);
      if (route.csv) {
        const { filename, body: text } = body as { filename: string; body: string };
        return new Response(text, {
          status: 200,
          headers: { ...cors, ...cacheHdrs, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"` },
        });
      }
      return json(200, body, { ...cors, ...cacheHdrs });
    } catch (err) {
      if (err instanceof HttpError) return json(err.status, { detail: err.message }, cors);
      if (err instanceof UnknownTableError) return json(400, { detail: err.message }, cors);
      // Full detail goes to the server log only; the browser gets a short message
      console.error(`API /api/${name} failed:`, err instanceof Error ? err.message : err);
      const detail = err instanceof DataAccessError ? 'The data source is unavailable. See the server log.' : 'Internal error';
      return json(err instanceof DataAccessError ? 503 : 500, { detail }, cors);
    }
  };
}

function json(status: number, body: unknown | ErrorResponse, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

/** CORS headers for allowed origins only. Same-origin calls (the normal set-up) do not need them. */
function corsHeaders(origin: string | null, allowed: string[]): Record<string, string> {
  if (!origin || !allowed.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Accept, Content-Type',
    Vary: 'Origin',
  };
}

/** Browsers revalidate every time; the CDN keeps successful answers for the TTL, so most visits never reach Databricks. */
function cacheHeaders(seconds: number): Record<string, string> {
  if (seconds <= 0) return {};
  const cdn = `public, max-age=${seconds}, stale-while-revalidate=${seconds}`;
  return {
    'Cache-Control': 'public, max-age=0, must-revalidate',
    'CDN-Cache-Control': cdn,
    'Netlify-CDN-Cache-Control': `${cdn}, durable`,
  };
}
