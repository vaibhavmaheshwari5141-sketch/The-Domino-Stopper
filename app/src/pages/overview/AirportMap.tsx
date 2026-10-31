import 'leaflet/dist/leaflet.css';
import clsx from 'clsx';
import type { CircleMarker as LeafletCircle, LatLngBoundsExpression, Map as LeafletMap } from 'leaflet';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { FeatureCollection } from 'geojson';
import { CircleMarker, GeoJSON, MapContainer, Pane, useMap } from 'react-leaflet';
import { feature } from 'topojson-client';
import { ErrorState } from '../../components/ErrorState';
import { RiskChip } from '../../components/RiskChip';
import { SegmentedControl } from '../../components/SegmentedControl';
import { InfoTip } from '../../components/Tooltip';
import { IMPACT_BANDS, IMPACT_COMPONENTS } from '../../../shared/api-types';
import type { AirportImpact, ImpactBand } from '../../lib/api';
import { formatMinutes, formatMonth, formatNumber, formatPercent } from '../../lib/format';
import { useAirportImpact } from '../../lib/queries';
import { AirportMapControls } from './AirportMapControls';
import { AirportMapKpis } from './AirportMapKpis';
import { AirportRanking } from './AirportRanking';
import { applyFilters, defaultFilters, type MapFilters, radiusScale, SIZE_BY, totals } from './airportMapFilters';

// Basemap: US state outlines from us-atlas (US Census Bureau shapes, bundled with the app), so the map needs no tile
// server, API key or outside request. Loaded on first use to keep it out of the main bundle.
const ATTRIBUTION = 'States: <a href="https://github.com/topojson/us-atlas">us-atlas</a> (US Census Bureau)';

let statesOnce: Promise<FeatureCollection> | null = null;
function loadStates(): Promise<FeatureCollection> {
  return (statesOnce ??= import('us-atlas/states-10m.json').then(({ default: topo }) => feature(topo, topo.objects.states) as FeatureCollection));
}

function useStates(): FeatureCollection | null {
  const [states, setStates] = useState<FeatureCollection | null>(null);
  useEffect(() => {
    let live = true;
    loadStates().then((s) => live && setStates(s)).catch(() => undefined);   // bubbles still show without outlines
    return () => { live = false; };
  }, []);
  return states;
}

const LOWER_48: LatLngBoundsExpression = [[24.4, -124.8], [49.4, -66.9]];
type View = 'lower48' | 'all';

const BAND_DOT: Record<ImpactBand, string> = { High: 'bg-critical', Medium: 'bg-warning', Low: 'bg-success' };
const BAND_TOKEN: Record<ImpactBand | 'none', string> = {
  High: '--color-critical', Medium: '--color-warning', Low: '--color-success', none: '--color-muted',
};

/** Bubble colours from the design tokens (src/styles/tokens.css), the same ones as the legend dots. */
function readBandColors(): Record<string, string> {
  const css = getComputedStyle(document.documentElement);
  return Object.fromEntries(Object.entries(BAND_TOKEN).map(([band, token]) => [band, css.getPropertyValue(token).trim()]));
}
const bandRange = (i: number) => {
  const { min } = IMPACT_BANDS[i];
  return i === 0 ? `${min}+` : `${min}–${IMPACT_BANDS[i - 1].min - 1}`;
};

/**
 * Fits the map to `bounds` when they change and whenever its (flex-sized) container is resized, for example on
 * entering or leaving focus mode. Wheel zoom only in focus mode; elsewhere the wheel scrolls the page.
 */
function MapSync({ bounds, focus }: { bounds: LatLngBoundsExpression; focus: boolean }) {
  const map = useMap();
  const latest = useRef(bounds);
  useEffect(() => {
    latest.current = bounds;
    map.fitBounds(bounds, { padding: [12, 12] });
  }, [map, bounds]);
  useEffect(() => {
    if (focus) map.scrollWheelZoom.enable();
    else map.scrollWheelZoom.disable();
  }, [map, focus]);
  useEffect(() => {
    const ro = new ResizeObserver(() => {
      map.invalidateSize({ pan: false });
      map.fitBounds(latest.current, { padding: [12, 12], animate: false });
    });
    ro.observe(map.getContainer());
    return () => ro.disconnect();
  }, [map]);
  return null;
}

interface Hover {
  airport: AirportImpact;
  rect: DOMRect;
}

/** The KPI card for one airport, drawn in a portal so the map's edges never clip it. */
function HoverCard({ hover, total, budget, planPeriod }: { hover: Hover; total: number; budget: number; planPeriod: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const a = hover.airport;

  useLayoutEffect(() => {
    const tip = ref.current;
    if (!tip) return;
    const { width, height } = tip.getBoundingClientRect();
    const r = hover.rect;
    const above = r.top - 8 - height >= 8;
    const left = Math.min(Math.max(8, r.left + r.width / 2 - width / 2), window.innerWidth - width - 8);
    tip.style.left = `${left}px`;
    tip.style.top = `${above ? r.top - height - 8 : Math.min(r.bottom + 8, window.innerHeight - height - 8)}px`;
    tip.style.visibility = 'visible';
  }, [hover]);

  const rows: [string, string][] = [
    ['Departures', formatNumber(a.departures)],
    ['Late departures (15+ min)', formatPercent(a.late_departure_rate)],
    ['Late arrivals (15+ min)', formatPercent(a.late_arrival_rate)],
    ['Average departure delay', formatMinutes(a.avg_dep_delay_min, 1)],
    ['Knock-on delay per turnaround', formatMinutes(a.knock_on_per_turn_min, 1)],
    ['Share of network knock-on delay', formatPercent(a.network_knock_on_share)],
    ['Short turns (55 min or less)', formatPercent(a.short_turn_share, 0)],
    ['Cancelled', formatPercent(a.cancel_rate)],
  ];
  const engine: [string, string][] = [
    ['Buffer added', formatMinutes(a.buffer_min)],
    ['Delay absorbed', formatMinutes(a.realised_absorbed_min)],
    ['Late departures avoided', formatNumber(a.late_departures_avoided)],
  ];

  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      style={{ visibility: 'hidden', left: -9999, top: -9999 }}
      className="pointer-events-none fixed z-[1000] w-[280px] rounded-control border bg-surface px-3 py-2.5 text-xs text-ink shadow-lg"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">
            <span className="num">{a.airport}</span> · {a.city ?? a.state}
          </p>
          {a.name && <p className="truncate text-[11px] text-muted">{a.name}</p>}
        </div>
        {a.impact_band && <RiskChip band={a.impact_band} className="shrink-0" />}
      </div>
      <div className="mt-2 flex items-baseline gap-2 border-b pb-2">
        <span className="num text-xl font-semibold leading-none">{formatNumber(a.impact_score)}</span>
        <span className="text-muted">delay impact score</span>
        <span className="num ml-auto text-muted">#{formatNumber(a.impact_rank)} of {total}</span>
      </div>
      <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd className="num text-right">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="label mt-2 !text-[10px]">Engine plan, {budget} min per turnaround{planPeriod ? `, ${planPeriod}` : ''}</p>
      <dl className="mt-1 grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5">
        {engine.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd className="num text-right">{v}</dd>
          </div>
        ))}
      </dl>
    </div>,
    document.body,
  );
}

const monthSpan = (period: string | null) => {
  const [from, to] = period?.split(' to ') ?? [];
  return from && to ? `${formatMonth(from)} – ${formatMonth(to)}` : null;
};

const sameFilters = (a: MapFilters, b: MapFilters) => (Object.keys(a) as (keyof MapFilters)[]).every((k) => a[k] === b[k]);

interface Props {
  budget: number;           // default engine budget
  focus: boolean;           // full-screen view: filters, KPI tiles and the ranking list
}

export function AirportMap({ budget, focus }: Props) {
  const [filters, setFilters] = useState(() => defaultFilters(budget));
  const [bandColors] = useState(readBandColors);
  const { data, isError, error, refetch, isFetching } = useAirportImpact(filters.budget, filters.from, filters.to);
  const [view, setView] = useState<View>('lower48');
  const [hover, setHover] = useState<Hover | null>(null);
  const [map, setMap] = useState<LeafletMap | null>(null);
  const states = useStates();
  const markers = useRef(new Map<string, LeafletCircle>());

  const shown = useMemo(() => applyFilters(data?.airports ?? [], filters), [data, filters]);
  const radius = useMemo(() => radiusScale(shown, filters.sizeBy), [shown, filters.sizeBy]);
  // Biggest bubbles first, so smaller ones sit on top and stay reachable
  const drawn = useMemo(() => [...shown].sort((a, b) => radius(b) - radius(a)), [shown, radius]);
  const kpis = useMemo(() => totals(shown), [shown]);
  const bounds = useMemo<LatLngBoundsExpression>(
    () => (view === 'all' && shown.length ? shown.map((a) => [a.lat, a.lon] as [number, number]) : LOWER_48),
    [view, shown],
  );
  const size = SIZE_BY.find((s) => s.value === filters.sizeBy) ?? SIZE_BY[0];
  const changed = !sameFilters(filters, defaultFilters(budget));
  const period = monthSpan(data?.context.period ?? null);
  const planPeriod = monthSpan(data?.context.plan_period ?? null);
  const updating = isFetching && !!data;

  const update = (patch: Partial<MapFilters>) => setFilters((f) => ({ ...f, ...patch }));
  const reset = () => setFilters(defaultFilters(budget));

  // Anchor the card to the bubble on screen
  const showFor = (a: AirportImpact | null) => {
    const el = a && markers.current.get(a.airport)?.getElement();
    setHover(a && el ? { airport: a, rect: el.getBoundingClientRect() } : null);
  };
  const zoomTo = (a: AirportImpact) => {
    setHover(null);
    map?.flyTo([a.lat, a.lon], Math.max(map.getZoom(), 6), { duration: 0.6 });
  };
  // Entering or leaving focus removes the ranking row under the pointer before it can report mouseleave
  const [hoverFocus, setHoverFocus] = useState(focus);
  if (hoverFocus !== focus) {
    setHoverFocus(focus);
    setHover(null);
  }
  useEffect(() => {
    if (!hover) return;
    const hide = () => setHover(null);
    window.addEventListener('scroll', hide, true);
    return () => window.removeEventListener('scroll', hide, true);
  }, [hover]);

  if (isError && !data) return <ErrorState error={error} onRetry={() => void refetch()} retrying={isFetching} />;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
            Delay impact by airport
            <InfoTip label="How the delay impact score works" align="left">
              <span className="block">
                Score from 0 to 100: where the airport ranks among all {data?.airports.length ?? ''} airports with flights in
                the period (percentile) on:
              </span>
              <span className="mt-1 block">
                {IMPACT_COMPONENTS.map((c) => (
                  <span key={c.key} className="block">• {c.label}: {formatPercent(c.weight, 0)}</span>
                ))}
              </span>
              <span className="mt-1 block text-muted">
                The network share stops a small airport with a few bad months from outranking a hub. Changing the period
                recomputes every score.
              </span>
            </InfoTip>
          </h3>
          <p className="text-xs text-muted">
            {filters.sizeBy === 'impact_score' ? 'Bubble size and colour show the score' : `Colour: impact band · Size: ${size.label.toLowerCase()}`}
            {period ? ` · ${period}` : ''}
            {updating && <span className="ml-1.5 text-teal">Updating…</span>}
            {!focus && changed && (
              <>
                {' · '}filtered in focus view{' '}
                <button type="button" onClick={reset} className="focus-ring rounded text-teal underline-offset-2 hover:underline">Reset</button>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-3">
            {IMPACT_BANDS.map((b, i) => (
              <span key={b.band} className="inline-flex items-center gap-1.5 text-[11px] text-muted">
                <span className={clsx('h-2 w-2 rounded-full', BAND_DOT[b.band])} aria-hidden="true" />
                {b.band} <span className="num">{bandRange(i)}</span>
              </span>
            ))}
          </div>
          <SegmentedControl<View>
            label="Map area"
            value={view}
            onChange={setView}
            options={[{ value: 'lower48', label: 'Lower 48' }, { value: 'all', label: 'All' }]}
          />
        </div>
      </div>

      {focus && (
        <>
          {data ? (
            <AirportMapControls
              filters={filters}
              months={data.context.months}
              budgets={data.context.budgets}
              onChange={update}
              onReset={reset}
              changed={changed}
            />
          ) : (
            <span className="skeleton block h-16" />
          )}
          {data ? (
            <AirportMapKpis totals={kpis} totalAirports={data.airports.length} budget={data.context.budget} planPeriod={planPeriod} updating={updating} />
          ) : (
            <span className="skeleton block h-[68px]" />
          )}
        </>
      )}

      <div className={clsx('min-h-0 flex-1', focus && 'grid grid-rows-[minmax(0,1fr)_220px] gap-3 wide:grid-cols-[minmax(0,1fr)_300px] wide:grid-rows-[minmax(0,1fr)]')}>
        {/* isolate: Leaflet's controls (z-index 1000) and panes stay inside the map instead of covering the side bar */}
        <div className={clsx('relative isolate h-full min-h-0 overflow-hidden rounded-control border transition-opacity', updating && 'opacity-70')}>
          <MapContainer
            ref={setMap}
            bounds={LOWER_48}
            boundsOptions={{ padding: [12, 12] }}
            scrollWheelZoom={false}
            zoomSnap={0.25}
            zoomDelta={0.5}
            minZoom={2}
            maxZoom={10}
            worldCopyJump
            className="impact-map h-full w-full"
            attributionControl
          >
            {/* Outlines in their own pane under the bubbles (Leaflet's overlay pane is z-index 400). They load
                asynchronously, so in the shared pane they would cover bubbles that were drawn first. */}
            <Pane name="basemap" style={{ zIndex: 350 }}>
              {states && <GeoJSON data={states} interactive={false} attribution={ATTRIBUTION} style={{ className: 'us-state', weight: 0.75 }} />}
            </Pane>
            <MapSync bounds={bounds} focus={focus} />
            {drawn.map((a) => {
              const active = hover?.airport.airport === a.airport;
              return (
                <CircleMarker
                  key={a.airport}
                  ref={(m) => { if (m) markers.current.set(a.airport, m); else markers.current.delete(a.airport); }}
                  center={[a.lat, a.lon]}
                  radius={radius(a)}
                  className="impact-bubble"
                  pathOptions={{
                    // Colours as style values, not classes: react-leaflet applies pathOptions with setStyle, which
                    // never adds a class (it only seemed to work in development, where strict mode redraws twice)
                    color: bandColors[a.impact_band ?? 'none'] ?? bandColors.none,
                    fillColor: bandColors[a.impact_band ?? 'none'] ?? bandColors.none,
                    weight: active ? 2.5 : 1,
                    fillOpacity: active ? 0.85 : 0.5,
                  }}
                  eventHandlers={{
                    mouseover: (e) => {
                      (e.target as LeafletCircle).bringToFront();
                      showFor(a);
                    },
                    mouseout: () => showFor(null),
                    click: () => zoomTo(a),
                  }}
                />
              );
            })}
          </MapContainer>
          {!data && <span className="skeleton absolute inset-0 z-[500] block rounded-none" />}
          {data && shown.length === 0 && (
            <p className="absolute inset-x-0 top-1/2 z-[500] text-center text-sm text-muted">No airports match the filters.</p>
          )}
        </div>
        {focus && (
          <AirportRanking
            airports={shown}
            active={hover?.airport.airport ?? null}
            sizeLabel={size.label}
            sizeValue={(a) => size.format(a[filters.sizeBy])}
            onHover={showFor}
            onSelect={zoomTo}
          />
        )}
      </div>
      {data && data.context.missing_coordinates.length > 0 && (
        <p className="text-[11px] text-muted">Not on the map (no coordinates): {data.context.missing_coordinates.join(', ')}</p>
      )}

      {hover && data && <HoverCard hover={hover} total={data.airports.length} budget={data.context.budget} planPeriod={planPeriod} />}
    </div>
  );
}
