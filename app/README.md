# The Domino Stopper: Network Schedule Planner

Web platform for the **Buffer Delay Allocation Engine** (ANCP capstone, Team T19). It shows the results of the engine to a
network schedule planner. All analysis runs in Databricks; the app only reads the finished consumption tables.

> Simulation on public BTS data. Not connected to airline systems.

## How it works

```
Databricks (workspace.bufferengine)          This app (TypeScript only, no Python)
┌───────────────────────────────┐            ┌─────────────────────────────────────────────┐
│ notebooks 01-08 build the     │   SQL over │ API: server/  (fixed, parameterised SELECTs) │
│ 21 gold_* consumption tables  │◄───HTTPS───┤   runs as a Netlify Function in production, │
│ and sample_* input tables     │  REST API  │   inside the Vite dev server locally        │
│ SQL warehouse (serverless)    │            │                    ▲ /api/*                 │
└───────────────────────────────┘            │ React app: src/    │ same origin, JSON       │
                                             └─────────────────────────────────────────────┘
```

- **Databricks** is the single source of data. Anything a page needs is precomputed into a table in
  `workspace.bufferengine` by a notebook; the app never runs Python, models or the optimiser.
- **The API** (`server/`) is a thin TypeScript layer. A browser cannot hold the Databricks token, so a server-side piece is
  required; it runs fixed SQL through the
  [Databricks SQL Statement Execution API](https://docs.databricks.com/api/statement-execution/v1/statement-execution)
  with plain `fetch` (no driver), caches results, and returns JSON. The token stays on the server.
- **The React app** (`src/`) calls `/api/...` on its own origin, so there is no CORS set-up and no API URL to configure.
- **Local fallback:** with `DATA_MODE=local` the same API reads notebook 08's parquet files with DuckDB instead, for
  development and as a demo fallback when Databricks is unavailable (for example, the Free Edition daily quota is used up).
  This mode exists only on a laptop; the deployed site always reads Databricks.

## Requirements

- Node.js 22.18 or newer (tested with Node 24 on Windows 11)
- For live data: a Databricks SQL warehouse with the `workspace.bufferengine` tables (notebook 08), and a personal access token

## Set up (PowerShell)

```powershell
npm install
Copy-Item .env.example .env
notepad .env
```

### Databricks mode (default)

In `.env`:

```
DATA_MODE=databricks
DATABRICKS_SERVER_HOSTNAME=dbc-xxxxxxxx-xxxx.cloud.databricks.com
DATABRICKS_HTTP_PATH=/sql/1.0/warehouses/xxxxxxxxxxxxxxxx
DATABRICKS_TOKEN=dapi...
```

- Hostname and HTTP path: *SQL Warehouses → your warehouse → Connection details*.
- Token: *Settings → Developer → Access tokens → Generate new token*. Give it an expiry date and keep it out of chats and screenshots.
- The token's user needs `SELECT` on `workspace.bufferengine` (`USE CATALOG` / `USE SCHEMA` included). Nothing more.

The first request after the warehouse has been idle can take 10 to 30 seconds while it starts; later ones are fast.

### Local mode (parquet files)

Copy notebook 08's `consumption_tables/parquet` folder into this folder (it is git-ignored) and set `DATA_MODE=local`.
In Databricks the files are in the Volume at `/Volumes/workspace/default/bufferengine/consumption/parquet/`.
To use another folder, set `LOCAL_DATA_DIR`.

The Input Data page also shows the input samples from `databricks/03_input_tables_sample.py`. In Databricks mode it finds
the `sample_*` tables in the schema; in local mode it reads every `*.csv` or `*.parquet` file in `LOCAL_INPUT_DIR`
(default `../../exports/samples`) as `sample_<name>`, dropping a trailing `_sample` from the file name.

## Run

```powershell
npm run dev          # app + API on http://localhost:5173
```

- http://localhost:5173/api/health → `{"status": "ok", "data_mode": "databricks", "database_ok": true}`
- http://localhost:5173/api/meta → latest engine run (`gold_engine_run_log`) and the table catalog (`gold_table_catalog`)
- http://localhost:5173/api/overview?budget=5 → Overview page: headline KPIs (`gold_kpi_headline`), strategy comparison
  (`gold_sim_strategy`), monthly network trend (`gold_network_daily`), and a summary and five insights written from the KPIs
- `/api/overview/airports?budget=5[&from=2026-01&to=2026-08]` → Overview airport map (months optional and inclusive; the
  score is recomputed for the period): every airport in `gold_dim_airport` with its coordinates from
  `ref_airports_tz` (notebook 01, OurAirports), delay measures from `gold_airport_month` (all months), the engine plan from
  `gold_buffer_plan_airport`, and a 0–100 delay impact score (weighted percentile rank: late departures 35%, knock-on delay
  per turnaround 25%, share of network knock-on delay 40%; weights in `IMPACT_COMPONENTS`, `shared/api-types.ts`). The
  basemap is US state outlines bundled from `us-atlas`, so the map needs no tile server or API key.
- `/api/planner/...` → Buffer Planner (`gold_buffer_recommendation` joined to `gold_ml_predictions`, always filtered by day and
  budget, paged on the server; `gold_buffer_plan_daily` for day totals):
  `dates?budget=5`, `summary?date=2026-03-15&budget=5[&airport=DFW]`, `airports?date=…`,
  `turnarounds?date=…&budget=…[&airport&risk_band&show&very_short&search&sort&order&limit&offset]`,
  `turnaround/{turn_id}?budget=5` (detail, all budgets, pass-through curve) and `export?…` (CSV, up to 5,000 rows).
  Every parameter is checked against an allowed list (`server/params.ts`); anything else is refused with 400.
- `/api/aircraft-day/aircraft?date=…&budget=5[&airport&search&limit&selected]` → aircraft flying that day, most buffer first;
  `/api/aircraft-day?tail=N156UW&date=2026-03-15&budget=5` → one aircraft's chain of flights and stops (404 with a message
  when it has no turnarounds that day). Stops that do not connect are marked as a break; missing flights are never invented.
- `/api/simulator/...` → Scenario Simulator: `strategies?budget=5&day_type=all days`, `sweep?day_type=…`,
  `daily?budget=5&strategies=Engine (our method),Spread evenly` (with a monthly roll-up) and
  `allocation?budget=5&grouping=Inbound-risk fifth` (top 15 for `Airport`, with a sentence describing the pattern).
  Budget, day type, grouping and strategy names are checked against allowed lists; "No buffer" is never returned.
- `/api/risk/...` → Risk Forecast (`gold_ml_predictions` and the model tables): `summary?start=&end=&airport=`,
  `heatmap?start=&end=&metric=p_late15|pred_inbound_delay_min&top=20` (cells under 30 turnarounds come back empty),
  `trend?airport=`, `by-ground-time?airport=`, `model-quality`, `top-turnarounds?date=&airport=&limit=20` and `airports?start=&end=`.
  Dates default to the test period (2026-01-01 to 2026-08-31).
- `/api/airports/...` → Airport Insights (`gold_dim_airport`, `gold_airport_month`, `gold_airport_hour`,
  `gold_buffer_plan_airport`): `list?search=&sort=departures|dep_late15_rate|median_ground_min|propagated_delay_min&top10=1&min_departures=1000`,
  `network-scatter?min_turnarounds=1000`, and per airport `DFW/profile`, `DFW/monthly`, `DFW/hourly` and `DFW/buffer?budget=5`.
  An unknown airport code gets a 404; a malformed one a 400. Monthly figures are combined as weighted averages.
- `/api/propagation/...` → Delay Propagation (`gold_passthrough_curve`, `gold_delay_by_leg`, `gold_kpi_headline`,
  `gold_engine_run_log.curve_points`): `curve`, `segments?segment_type=Airport type|Time of day|Disruption|Period|All turnarounds|all`,
  `by-leg?period=all|train|validate|test`, `kpis`, and `calculate?ground_min=60&inbound_delay_min=30&extra_min=15` (linear
  interpolation on the smoothed curve; inputs are clamped to 0–300, 0–300 and 0–60 minutes, non-numbers get a 400).
- `/api/datasets` → Input Data: the input samples (`sample_*`, found at run time) and the 21 gold tables, with row and
  column counts (gold counts from `gold_table_catalog`). Per dataset: `{name}/schema`,
  `{name}/preview?limit=100&offset=0&sort=&order=asc&search=` (paged on the server, at most 500 rows; `sort` must be a
  column of the table; `search` is a case-insensitive "contains" over the text columns, passed as a parameter),
  `{name}/download?limit=5000` (CSV, `<name>_preview.csv`) and `{name}/profile` (nulls, then min and max or distinct and
  top 5 values; tables over 500,000 rows are profiled on a sample of about 100,000). A name not on the allow-list gets a 404.
  Wording for the input tables is in `src/config/datasets.ts`.

Open http://localhost:5173 and choose **Sign in** (demo persona, no password; change it in `src/config/persona.ts`).

To switch source for one session without editing `.env`: `$env:DATA_MODE = "local"; npm run dev`.

| Script | What it does |
|---|---|
| `npm run dev` | app + API with hot reload (port 5173) |
| `npm run build` | type-check, then production build of the app into `dist/` |
| `npm run preview` | serve `dist/` with the API (port 4173) |
| `npm test` | unit and API tests (Vitest) |
| `npm run typecheck` | TypeScript only |
| `npm run lint` | oxlint |

`npm test` always runs the data-access, Databricks (mocked API) and stand-in-data tests. The real-data test
(`tests/api.test.ts`) runs in local mode against `LOCAL_DATA_DIR` and is skipped when that folder has no parquet files;
`npx vitest run --reporter=verbose` prints the reason.

## Deploy (Netlify, free tier)

The repository is ready for Netlify: `netlify.toml` builds the app into `dist/` and deploys `netlify/functions/api.ts` as a
function, with `/api/*` rewritten to it.

1. Push this folder to GitHub, then in Netlify: *Add new project → Import from Git* and pick the repository. The build
   settings come from `netlify.toml`.
2. *Project configuration → Environment variables*: add `DATABRICKS_SERVER_HOSTNAME`, `DATABRICKS_HTTP_PATH` and
   `DATABRICKS_TOKEN` (scope: Functions; mark the token as secret). Optional: `DATABRICKS_CATALOG`, `DATABRICKS_SCHEMA`,
   `CACHE_TTL_SECONDS`.
3. Deploy, then open `https://<your-site>.netlify.app/api/health`.

Successful API answers carry CDN cache headers (`CACHE_TTL_SECONDS`, default 10 minutes), so repeat visits are served by
Netlify's cache instead of waking the warehouse. Functions have a 60-second limit; queries give up after
`DATABRICKS_TIMEOUT_SECONDS` (45).

**Other hosts.** The API is one web-standard `(Request) => Promise<Response>` handler (`server/app.ts`). Vercel and
Cloudflare Pages Functions accept the same shape, so moving means a two-line adapter like `netlify/functions/api.ts`
plus that host's rewrite of `/api/*`.

## Adding data for a page

1. **Databricks:** make sure a table holds exactly what the page shows (add it in notebook 08 if needed). Name it `gold_*`;
   input samples are `sample_*`. A new `gold_*` name must also be added to `GOLD_TABLES` in `server/db.ts`.
2. **API:** add `server/routes/<page>.ts` with a function that runs the query, and register it in `server/app.ts`
   (usually wrapped in `cached(...)`). Add the response type to `shared/api-types.ts`.

   ```ts
   const rows = await query<AirportMonth>(
     `SELECT * FROM ${t('gold_airport_month')} WHERE airport = :airport ORDER BY year_month`,
     { airport },
   );
   ```

   Table names come only from `t()` (allow-listed); values only from the parameters object (`:name` placeholders, turned
   into Databricks named parameters or DuckDB `$name`). Never put request input into the SQL text. Cast dates explicitly
   (`CAST(:day AS DATE)`) and quote keyword column names with `ident('rows')`, so the same SQL runs on both sources.
3. **Page:** call it with React Query: `useQuery({ queryKey: ['airport', airport], queryFn: ({ signal }) => apiGet<AirportMonth[]>('/api/airport', { airport }, { signal }) })`.

## Security

- `DATABRICKS_TOKEN` is read only by the API, from `.env` locally or the host's environment settings in production. It is
  never sent to the browser: only `VITE_*` variables reach client code, and the build is free of it.
- `.env`, data files and builds are git-ignored. `.env.example` is committed with empty values.
- The API exposes only fixed read-only routes (GET); there is no endpoint that accepts SQL.
- Error responses are generic; details go to the server log.
- Sign-in is a demo: it stores the persona in `sessionStorage` (`ds_session`) to decide which screens show, with no
  password or server check. The API itself stays public like the site, so anyone with the URL can read the dashboard
  data (public BTS results); the CDN cache keeps that from costing warehouse time.

## Layout

```
src/                  React app
  main.tsx            entry: global styles + <App />
  App.tsx             React Query provider (retry once, 5 min staleTime) + router
  routes.tsx          route table: / redirects to /login, one route per page
  pages/              one component per page (placeholders for now)
  components/         shared components (added with the pages)
  lib/api.ts          apiGet<T>(path, params)
  lib/format.ts       formatCompact (1.64M), formatPercent (25.9%), formatMinutes (63 min), formatMultiplier (4.0x), dates
  styles/tokens.css   design tokens (CSS variables), mapped to Tailwind classes in tailwind.config.ts
shared/api-types.ts   response types used by both the API and the app
server/               API (runs on the server only)
  app.ts              router: routes, CORS, cache headers, error handling
  config.ts           settings from environment variables
  db.ts               query(sql, params), t(name), ident(name), allow-list, JSON-safe values
  cache.ts            TTL cache for read endpoints
  routes/             one module per endpoint (health, meta, ...)
  sources/            databricks.ts (REST API) and local.ts (DuckDB, laptop only)
  dev.ts              builds the API for vite dev / preview / tests from DATA_MODE
netlify/functions/    Netlify adapter for the API
tests/                Vitest tests
```

## Design tokens

Light theme only. Colours are Tailwind classes named after the tokens: `bg-bg`, `bg-surface`, `text-ink`, `text-muted`,
`border-line`, `bg-navy`, `bg-tarmac`, `text-amber`, `bg-amber-soft`, `text-teal`, `bg-teal-soft`, `text-success`,
`text-warning`, `text-critical`. Tailwind's default palette is switched off, so only these exist. Radii: `rounded-card` (8px)
and `rounded-control` (6px). Fonts: IBM Plex Sans (`font-sans`, default) and IBM Plex Mono (`font-mono`); use the `num` class
for figures (mono, tabular digits) and `label` for small mono captions.

## Related

The data pipeline, notebooks and analysis live in the main repository,
[buffer-allocation-engine](https://github.com/vaibhavmaheshwari5141-sketch/buffer-allocation-engine).
