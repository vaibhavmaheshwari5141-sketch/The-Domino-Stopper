// Delay Propagation endpoints (/api/propagation/...): how much inbound delay is passed on at each planned ground time,
// whether that holds across segments, how delay builds up through an aircraft's day, and a what-if calculator.

import {
  type DelayByLeg, type Kpi, LEG_PERIODS, PROPAGATION_KPIS, type CurveBand, type PropagationByLeg, type PropagationCurve,
  type PropagationKpis, type PropagationSegments, SEGMENT_TYPES, type SegmentBand, type SegmentCurves,
} from '../../shared/api-types.ts';
import { formatMinutes, formatNumber } from '../../shared/format.ts';
import { parseCurve } from './planner.ts';
import { type AbsorptionResult, CALC_LIMITS, calculateAbsorption } from '../../shared/propagation.ts';
import { cached } from '../cache.ts';
import { query, t } from '../db.ts';
import { HttpError } from '../http.ts';
import { oneOf } from '../params.ts';

const FITTED = 'fitted%';                  // curve_type "fitted_curve (training period)"
const SEGMENT = 'segment%';                // curve_type "segment (all periods)"
const V2_SEGMENT = 'v2 segment%';          // curve_type "v2 segment curve (training period)": one smoothed curve per segment
/** The calculator's `curve` value for the single (v1) curve; any other value names a v2 segment. */
export const SINGLE_CURVE = 'v1';
/** v2 segments in display order; anything else follows, alphabetically. */
const V2_ORDER = ['All turnarounds', 'Ten busiest | Morning', 'Ten busiest | Afternoon', 'Ten busiest | Evening',
  'Other airports | Morning', 'Other airports | Afternoon', 'Other airports | Evening'];

/** Display order of known segments; anything else follows, alphabetically. */
const SEGMENT_ORDER = ['All', 'Ten busiest', 'Other airports', 'Morning (05-11)', 'Afternoon (12-16)', 'Evening (17-23)',
  'Normal days', 'Disruption days', 'Training', 'Validation', 'Test'];

const orderOf = (s: string) => {
  const i = SEGMENT_ORDER.indexOf(s);
  return i < 0 ? SEGMENT_ORDER.length : i;
};

/** The smoothed curve from the latest engine run. Cached: the curve endpoint and the calculator both use it. */
const curvePoints = cached('propagation/points', 600, async () => {
  const runs = await query<{ curve_points: string | null; curve_version: string | null }>(
    `SELECT curve_points, curve_version FROM ${t('gold_engine_run_log')} ORDER BY run_timestamp_utc DESC LIMIT 1`,
  );
  return { points: parseCurve(runs[0]?.curve_points ?? null), curve_version: runs[0]?.curve_version ?? null };
});

async function kpiRows(): Promise<Record<string, Kpi>> {
  const names = Object.fromEntries(PROPAGATION_KPIS.map((name, i) => [`k${i}`, name]));
  const rows = await query<Kpi>(
    `SELECT kpi_name, value, unit, period, definition FROM ${t('gold_kpi_headline')}
     WHERE kpi_name IN (${Object.keys(names).map((k) => `:${k}`).join(', ')})`,
    names,
  );
  return Object.fromEntries(rows.map((r) => [r.kpi_name, r]));
}

/** Engine v2's segment curves. sg_band holds the ground time ("0", "5", ... "300") as text, so it is cast here. */
const segmentCurves = cached('propagation/segment-curves', 600, async (): Promise<SegmentCurves> => {
  const rows = await query<{ segment: string; ground_min: number | null; pass_through: number | null; curve_version: string | null }>(
    `SELECT segment, CAST(sg_band AS DOUBLE) AS ground_min, pass_through_smoothed AS pass_through, curve_version
     FROM ${t('gold_passthrough_curve')} WHERE curve_type LIKE :v2`,
    { v2: V2_SEGMENT },
  );
  const bySegment = new Map<string, { ground_min: number; pass_through: number }[]>();
  for (const r of rows) {
    if (r.ground_min === null || r.pass_through === null) continue;
    bySegment.set(r.segment, [...(bySegment.get(r.segment) ?? []), { ground_min: r.ground_min, pass_through: r.pass_through }]);
  }
  const rank = (s: string) => (V2_ORDER.includes(s) ? V2_ORDER.indexOf(s) : V2_ORDER.length);
  return {
    segments: [...bySegment]
      .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
      .map(([segment, points]) => ({ segment, points: points.sort((a, b) => a.ground_min - b.ground_min) })),
    curve_version: rows[0]?.curve_version ?? null,
  };
});

export const getSegmentCurves = () => segmentCurves(new URLSearchParams());

// ---- parameters ----------------------------------------------------------------------------------------------------

export const segmentParams = (p: URLSearchParams) =>
  new URLSearchParams({ segment_type: oneOf(p, 'segment_type', [...SEGMENT_TYPES, 'all'] as const, 'all') });

export const legParams = (p: URLSearchParams) => new URLSearchParams({ period: oneOf(p, 'period', LEG_PERIODS, 'all') });

/** A number, clamped to the calculator's range and rounded to 0.1 (keeps the cache key small); 400 if not a number. */
function clampedNumber(p: URLSearchParams, key: keyof typeof CALC_LIMITS): number {
  const { min, max, fallback } = CALC_LIMITS[key];
  const raw = p.get(key)?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new HttpError(400, `${key} must be a number of minutes`);
  return Math.round(Math.min(max, Math.max(min, n)) * 10) / 10;
}

/** "v1" (the single curve) or a v2 segment name such as "Ten busiest | Morning" (letters, spaces and "|" only). */
function curveParam(p: URLSearchParams): string {
  const v = p.get('curve')?.trim() || SINGLE_CURVE;
  if (!/^[A-Za-z0-9 |]{1,40}$/.test(v)) throw new HttpError(400, 'curve must be "v1" or a segment name such as "Ten busiest | Morning"');
  return v;
}

export const calculateParams = (p: URLSearchParams) => new URLSearchParams({
  ground_min: String(clampedNumber(p, 'ground_min')),
  inbound_delay_min: String(clampedNumber(p, 'inbound_delay_min')),
  extra_min: String(clampedNumber(p, 'extra_min')),
  curve: curveParam(p),
});

// ---- endpoints -----------------------------------------------------------------------------------------------------

export async function getCurve(): Promise<PropagationCurve> {
  const [bands, run, kpis] = await Promise.all([
    query<CurveBand>(
      `SELECT sg_band, sg_mean_min, turnarounds, pass_through, ci95_low, ci95_high, pass_through_smoothed
       FROM ${t('gold_passthrough_curve')} WHERE curve_type LIKE :fitted ORDER BY sg_mean_min`,
      { fitted: FITTED },
    ),
    curvePoints(new URLSearchParams()),
    kpiRows(),
  ]);
  return { bands, points: run.points, curve_version: run.curve_version, threshold_min: kpis.absorption_threshold?.value ?? null };
}

/** "Long turnarounds at the ten busiest airports pass on 0.25 of the delay, against 0.56 elsewhere." */
export function segmentCaption(segmentType: string, rows: SegmentBand[]): string | null {
  const long = rows.filter((r) => /^long/i.test(r.sg_band) && r.pass_through !== null);
  if (long.length < 2) return null;
  const v = (r: SegmentBand) => formatNumber(r.pass_through, 2);
  if (segmentType === 'Airport type') {
    const busy = long.find((r) => r.segment === 'Ten busiest');
    const other = long.find((r) => r.segment === 'Other airports');
    if (busy && other) return `Long turnarounds at the ten busiest airports pass on ${v(busy)} of the delay, against ${v(other)} elsewhere.`;
  }
  const sorted = [...long].sort((a, b) => a.pass_through! - b.pass_through!);
  const lo = sorted[0];
  const hi = sorted[sorted.length - 1];
  const shortMedium = rows.filter((r) => !/^long/i.test(r.sg_band) && r.pass_through !== null);
  const allPassed = shortMedium.length > 0 && shortMedium.every((r) => r.pass_through! >= 0.9);
  return `Long turnarounds pass on ${v(lo)} of the delay for ${lo.segment}, against ${v(hi)} for ${hi.segment}.`
    + (allPassed ? ' Short and medium turnarounds pass on nearly all of it in every group.' : '');
}

export async function getSegments(p: URLSearchParams): Promise<PropagationSegments> {
  const segmentType = p.get('segment_type') as PropagationSegments['segment_type'];
  const rows = await query<SegmentBand>(
    `SELECT segment_type, segment, sg_band, sg_mean_min, turnarounds, pass_through, ci95_low, ci95_high
     FROM ${t('gold_passthrough_curve')}
     WHERE curve_type LIKE :segment ${segmentType === 'all' ? '' : 'AND segment_type = :segment_type'}
     ORDER BY segment_type, segment, sg_mean_min`,
    segmentType === 'all' ? { segment: SEGMENT } : { segment: SEGMENT, segment_type: segmentType },
  );
  rows.sort((a, b) => a.segment_type.localeCompare(b.segment_type) || orderOf(a.segment) - orderOf(b.segment)
    || a.segment.localeCompare(b.segment) || (a.sg_mean_min ?? 0) - (b.sg_mean_min ?? 0));
  const segments = [...new Set(rows.map((r) => r.segment))];
  const bandMeans = new Map<string, number>();
  for (const r of rows) bandMeans.set(r.sg_band, Math.min(bandMeans.get(r.sg_band) ?? Infinity, r.sg_mean_min ?? Infinity));
  const bands = [...bandMeans.keys()].sort((a, b) => bandMeans.get(a)! - bandMeans.get(b)!);
  return { segment_type: segmentType, rows, segments, bands, caption: segmentType === 'all' ? null : segmentCaption(segmentType, rows) };
}

export async function getByLeg(p: URLSearchParams): Promise<PropagationByLeg> {
  const period = p.get('period') as PropagationByLeg['period'];
  const legs = await query<DelayByLeg>(
    `SELECT leg, leg_label, flights, avg_dep_delay_min, median_dep_delay_min, dep_late15_rate
     FROM ${t('gold_delay_by_leg')} WHERE period = :period ORDER BY leg`,
    { period },
  );
  const first = legs[0];
  const last = legs[legs.length - 1];
  const growth = first && last && legs.length > 1
    ? `Average departure delay grows from ${formatMinutes(first.avg_dep_delay_min, 1)} on the first flight of the day to `
      + `${formatMinutes(last.avg_dep_delay_min, 1)} on flight ${last.leg_label}. `
    : '';
  return { period, legs, caption: `${growth}Delay that is not absorbed early is carried through the rest of the day.` };
}

export async function getKpis(): Promise<PropagationKpis> {
  const rows = await kpiRows();
  return { kpis: Object.fromEntries(PROPAGATION_KPIS.map((name) => [name, rows[name] ?? null])) as PropagationKpis['kpis'] };
}

export async function getCalculate(p: URLSearchParams): Promise<AbsorptionResult> {
  const curve = p.get('curve') ?? SINGLE_CURVE;
  let points: { ground_min: number; pass_through: number }[];
  if (curve === SINGLE_CURVE) {
    points = (await curvePoints(new URLSearchParams())).points;
    if (!points.length) throw new HttpError(503, 'gold_engine_run_log has no curve_points; run notebook 08 first');
  } else {
    const found = (await getSegmentCurves()).segments.find((s) => s.segment === curve);
    if (!found) throw new HttpError(404, `No v2 segment curve named "${curve}"`);
    points = found.points;
  }
  return calculateAbsorption(points, {
    ground_min: Number(p.get('ground_min')),
    inbound_delay_min: Number(p.get('inbound_delay_min')),
    extra_min: Number(p.get('extra_min')),
  });
}
