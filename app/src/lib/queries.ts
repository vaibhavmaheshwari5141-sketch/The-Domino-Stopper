// React Query hooks, one per API endpoint.
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  type AircraftDay, type AircraftListResponse, type AirportBuffer, type AirportHourly, type AirportListResponse, type AirportMonth,
  type AirportProfile, type NetworkScatter, type AirportImpactResponse, type AbsorptionResult, type LegPeriod, type PropagationByLeg,
  type PropagationCurve, type PropagationKpis, type PropagationSegments, type SegmentType, apiGet, buildUrl, type MetaResponse, type OverviewResponse, type PlannerAirport, type PlannerDay, type PlannerDetail, type PlannerSummary,
  type PlannerTurnaroundsResponse, type QueryParams, type SimAllocationResponse, type SimDailyResponse, type SimStrategiesResponse,
  type SimSweepResponse, type ModelQuality, type RiskGroundBand, type RiskHeatmap, type RiskSummary,
  type RiskTrendRow, type RiskTurnaround, type DatasetPreview, type DatasetProfile, type DatasetSchema, type DatasetsResponse,
  type CostsResponse, type EngineKpisResponse, type KpiCatalogResponse, type NetValueResponse, type ReallocationResponse,
  type SegmentCurves,
} from './api';

export function useMeta() {
  return useQuery({
    queryKey: ['meta'],
    queryFn: ({ signal }) => apiGet<MetaResponse>('/api/meta', undefined, { signal }),
  });
}

export function useOverview(budget: number) {
  return useQuery({
    queryKey: ['overview', budget],
    queryFn: ({ signal }) => apiGet<OverviewResponse>('/api/overview', { budget }, { signal }),
  });
}

/** `from` / `to` are months ("2026-01"), null for open-ended. Keeps the previous map on screen while filters change. */
export function useAirportImpact(budget: number, from: string | null, to: string | null) {
  return useQuery({
    queryKey: ['overview', 'airports', budget, from, to],
    queryFn: ({ signal }) => apiGet<AirportImpactResponse>('/api/overview/airports', { budget, from, to }, { signal }),
    placeholderData: keepPreviousData,
  });
}

// ---- Buffer Planner ----------------------------------------------------------------------------------------------

export function usePlannerDates(budget: number) {
  return useQuery({
    queryKey: ['planner', 'dates', budget],
    queryFn: ({ signal }) => apiGet<PlannerDay[]>('/api/planner/dates', { budget }, { signal }),
  });
}

export function usePlannerAirports(date: string) {
  return useQuery({
    queryKey: ['planner', 'airports', date],
    queryFn: ({ signal }) => apiGet<PlannerAirport[]>('/api/planner/airports', { date }, { signal }),
  });
}

export function usePlannerSummary(date: string, budget: number, airport: string | null) {
  return useQuery({
    queryKey: ['planner', 'summary', date, budget, airport],
    queryFn: ({ signal }) => apiGet<PlannerSummary>('/api/planner/summary', { date, budget, airport }, { signal }),
  });
}

/** Keeps the previous page on screen while the next one loads. */
export function usePlannerTurnarounds(params: QueryParams) {
  return useQuery({
    queryKey: ['planner', 'turnarounds', params],
    queryFn: ({ signal }) => apiGet<PlannerTurnaroundsResponse>('/api/planner/turnarounds', params, { signal }),
    placeholderData: keepPreviousData,
  });
}

/** Reallocate mode: the turnarounds that give or receive minutes on a day. */
export function usePlannerReallocation(date: string, airport: string | null, tail: string, enabled: boolean) {
  return useQuery({
    queryKey: ['planner', 'reallocation', date, airport, tail],
    queryFn: ({ signal }) => apiGet<ReallocationResponse>('/api/planner/reallocation', { date, airport, tail: tail || null }, { signal }),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function usePlannerDetail(turnId: string | null, budget: number) {
  return useQuery({
    queryKey: ['planner', 'turnaround', turnId, budget],
    queryFn: ({ signal }) => apiGet<PlannerDetail>(`/api/planner/turnaround/${encodeURIComponent(turnId!)}`, { budget }, { signal }),
    enabled: turnId !== null,
  });
}

// ---- Aircraft Day ------------------------------------------------------------------------------------------------

export function useAircraftList(date: string, budget: number, airport: string | null, search: string, selected: string | null) {
  return useQuery({
    queryKey: ['aircraft-day', 'aircraft', date, budget, airport, search, selected],
    queryFn: ({ signal }) =>
      apiGet<AircraftListResponse>('/api/aircraft-day/aircraft', { date, budget, airport, search: search || null, selected }, { signal }),
    placeholderData: keepPreviousData,
  });
}

export function useAircraftDay(tail: string | null, date: string, budget: number) {
  return useQuery({
    queryKey: ['aircraft-day', 'day', tail, date, budget],
    queryFn: ({ signal }) => apiGet<AircraftDay>('/api/aircraft-day', { tail, date, budget }, { signal }),
    enabled: tail !== null,
    retry: (count, err) => (err as { status?: number }).status !== 404 && count < 1,      // a 404 is an answer, not a glitch
  });
}

// ---- Scenario Simulator ------------------------------------------------------------------------------------------

export function useSimStrategies(budget: number, dayType: string) {
  return useQuery({
    queryKey: ['simulator', 'strategies', budget, dayType],
    queryFn: ({ signal }) => apiGet<SimStrategiesResponse>('/api/simulator/strategies', { budget, day_type: dayType }, { signal }),
    placeholderData: keepPreviousData,
  });
}

export function useSimSweep(dayType: string) {
  return useQuery({
    queryKey: ['simulator', 'sweep', dayType],
    queryFn: ({ signal }) => apiGet<SimSweepResponse>('/api/simulator/sweep', { day_type: dayType }, { signal }),
    placeholderData: keepPreviousData,
  });
}

export function useSimDaily(budget: number, strategies: string[]) {
  return useQuery({
    queryKey: ['simulator', 'daily', budget, strategies],
    queryFn: ({ signal }) => apiGet<SimDailyResponse>('/api/simulator/daily', { budget, strategies: strategies.join(',') }, { signal }),
    placeholderData: keepPreviousData,
  });
}

export function useSimAllocation(budget: number, grouping: string) {
  return useQuery({
    queryKey: ['simulator', 'allocation', budget, grouping],
    queryFn: ({ signal }) => apiGet<SimAllocationResponse>('/api/simulator/allocation', { budget, grouping }, { signal }),
    placeholderData: keepPreviousData,
  });
}

// ---- Engine v2 KPIs ----------------------------------------------------------------------------------------------

export function useKpiCatalog() {
  return useQuery({
    queryKey: ['kpis', 'catalog'],
    queryFn: ({ signal }) => apiGet<KpiCatalogResponse>('/api/kpis/catalog', undefined, { signal }),
  });
}

/** Both views unless one is asked for; `budget: 'all'` returns every budget (the budget sweep). */
export function useEngineKpis(budget: number | 'all', dayType: string) {
  return useQuery({
    queryKey: ['kpis', 'engine', budget, dayType],
    queryFn: ({ signal }) => apiGet<EngineKpisResponse>('/api/kpis/engine', { budget, day_type: dayType, evaluator: 'both', mode: 'all' }, { signal }),
    placeholderData: keepPreviousData,
  });
}

export function useCosts() {
  return useQuery({
    queryKey: ['kpis', 'costs'],
    queryFn: ({ signal }) => apiGet<CostsResponse>('/api/kpis/costs', undefined, { signal }),
  });
}

/** Net value and break-even for every strategy and view at the given costs (null = the stored assumption). */
export function useNetValue(budget: number, dayType: string, costDelay: number | null, costBuffer: number | null) {
  return useQuery({
    queryKey: ['kpis', 'net-value', budget, dayType, costDelay, costBuffer],
    queryFn: ({ signal }) => apiGet<NetValueResponse>('/api/kpis/net-value',
      { budget, day_type: dayType, cost_delay: costDelay, cost_buffer: costBuffer }, { signal }),
    placeholderData: keepPreviousData,
  });
}

// ---- Risk Forecast -----------------------------------------------------------------------------------------------

export function useRiskSummary(start: string, end: string, airport: string | null) {
  return useQuery({
    queryKey: ['risk', 'summary', start, end, airport],
    queryFn: ({ signal }) => apiGet<RiskSummary>('/api/risk/summary', { start, end, airport }, { signal }),
    placeholderData: keepPreviousData,
  });
}

export function useRiskAirports(start: string, end: string) {
  return useQuery({
    queryKey: ['risk', 'airports', start, end],
    queryFn: ({ signal }) => apiGet<PlannerAirport[]>('/api/risk/airports', { start, end }, { signal }),
  });
}

export function useRiskHeatmap(start: string, end: string, metric: RiskHeatmap['metric']) {
  return useQuery({
    queryKey: ['risk', 'heatmap', start, end, metric],
    queryFn: ({ signal }) => apiGet<RiskHeatmap>('/api/risk/heatmap', { start, end, metric }, { signal }),
    placeholderData: keepPreviousData,
  });
}

export function useRiskTrend(airport: string | null) {
  return useQuery({
    queryKey: ['risk', 'trend', airport],
    queryFn: ({ signal }) => apiGet<RiskTrendRow[]>('/api/risk/trend', { airport }, { signal }),
    placeholderData: keepPreviousData,
  });
}

export function useRiskByGroundTime(airport: string | null) {
  return useQuery({
    queryKey: ['risk', 'ground', airport],
    queryFn: ({ signal }) => apiGet<RiskGroundBand[]>('/api/risk/by-ground-time', { airport }, { signal }),
    placeholderData: keepPreviousData,
  });
}

export function useModelQuality() {
  return useQuery({
    queryKey: ['risk', 'model-quality'],
    queryFn: ({ signal }) => apiGet<ModelQuality>('/api/risk/model-quality', undefined, { signal }),
  });
}

export function useRiskTopTurnarounds(date: string, airport: string | null) {
  return useQuery({
    queryKey: ['risk', 'top', date, airport],
    queryFn: ({ signal }) => apiGet<RiskTurnaround[]>('/api/risk/top-turnarounds', { date, airport, limit: 20 }, { signal }),
    placeholderData: keepPreviousData,
  });
}


// ---- Airport Insights --------------------------------------------------------------------------------------------

export function useAirportList(search: string, sort: string, top10: boolean) {
  return useQuery({
    queryKey: ['airports', 'list', search, sort, top10],
    queryFn: ({ signal }) =>
      apiGet<AirportListResponse>('/api/airports/list', { search: search || null, sort, top10: top10 ? 'true' : null, min_departures: 0 }, { signal }),
    placeholderData: keepPreviousData,
  });
}

export function useAirportProfile(code: string) {
  return useQuery({
    queryKey: ['airports', code, 'profile'],
    queryFn: ({ signal }) => apiGet<AirportProfile>(`/api/airports/${code}/profile`, undefined, { signal }),
    retry: (count, err) => (err as { status?: number }).status !== 404 && count < 1,
  });
}

export function useAirportMonthly(code: string) {
  return useQuery({
    queryKey: ['airports', code, 'monthly'],
    queryFn: ({ signal }) => apiGet<AirportMonth[]>(`/api/airports/${code}/monthly`, undefined, { signal }),
  });
}

export function useAirportHourly(code: string) {
  return useQuery({
    queryKey: ['airports', code, 'hourly'],
    queryFn: ({ signal }) => apiGet<AirportHourly>(`/api/airports/${code}/hourly`, undefined, { signal }),
  });
}

export function useAirportBuffer(code: string, budget: number) {
  return useQuery({
    queryKey: ['airports', code, 'buffer', budget],
    queryFn: ({ signal }) => apiGet<AirportBuffer>(`/api/airports/${code}/buffer`, { budget }, { signal }),
    placeholderData: keepPreviousData,
  });
}

export function useNetworkScatter() {
  return useQuery({
    queryKey: ['airports', 'scatter'],
    queryFn: ({ signal }) => apiGet<NetworkScatter>('/api/airports/network-scatter', undefined, { signal }),
  });
}

// ---- Delay Propagation -------------------------------------------------------------------------------------------

export function usePropagationKpis() {
  return useQuery({
    queryKey: ['propagation', 'kpis'],
    queryFn: ({ signal }) => apiGet<PropagationKpis>('/api/propagation/kpis', undefined, { signal }),
  });
}

export function usePropagationCurve() {
  return useQuery({
    queryKey: ['propagation', 'curve'],
    queryFn: ({ signal }) => apiGet<PropagationCurve>('/api/propagation/curve', undefined, { signal }),
  });
}

export function usePropagationSegments(segmentType: SegmentType) {
  return useQuery({
    queryKey: ['propagation', 'segments', segmentType],
    queryFn: ({ signal }) => apiGet<PropagationSegments>('/api/propagation/segments', { segment_type: segmentType }, { signal }),
    placeholderData: keepPreviousData,
  });
}

export function usePropagationByLeg(period: LegPeriod) {
  return useQuery({
    queryKey: ['propagation', 'by-leg', period],
    queryFn: ({ signal }) => apiGet<PropagationByLeg>('/api/propagation/by-leg', { period }, { signal }),
    placeholderData: keepPreviousData,
  });
}

export function useSegmentCurves() {
  return useQuery({
    queryKey: ['propagation', 'segment-curves'],
    queryFn: ({ signal }) => apiGet<SegmentCurves>('/api/propagation/segment-curves', undefined, { signal }),
  });
}

/** Keeps the previous result on screen while the sliders move. `curve` is "v1" or a v2 segment name. */
export function useAbsorption(ground: number, inbound: number, extra: number, curve: string) {
  return useQuery({
    queryKey: ['propagation', 'calculate', ground, inbound, extra, curve],
    queryFn: ({ signal }) => apiGet<AbsorptionResult>('/api/propagation/calculate',
      { ground_min: ground, inbound_delay_min: inbound, extra_min: extra, curve }, { signal }),
    placeholderData: keepPreviousData,
  });
}

// ---- Input Data --------------------------------------------------------------------------------------------------

const datasetPath = (name: string, part: string) => `/api/datasets/${encodeURIComponent(name)}/${part}`;

export function useDatasets() {
  return useQuery({
    queryKey: ['datasets'],
    queryFn: ({ signal }) => apiGet<DatasetsResponse>('/api/datasets', undefined, { signal }),
  });
}

export function useDatasetSchema(name: string, enabled: boolean) {
  return useQuery({
    queryKey: ['datasets', name, 'schema'],
    queryFn: ({ signal }) => apiGet<DatasetSchema>(datasetPath(name, 'schema'), undefined, { signal }),
    enabled,
  });
}

/** Keeps the previous page on screen while the next one loads, but never another dataset's rows. */
export function useDatasetPreview(name: string, params: QueryParams) {
  return useQuery({
    queryKey: ['datasets', name, 'preview', params],
    queryFn: ({ signal }) => apiGet<DatasetPreview>(datasetPath(name, 'preview'), params, { signal }),
    placeholderData: (previous, previousQuery) => (previousQuery?.queryKey[1] === name ? previous : undefined),
  });
}

export function useDatasetProfile(name: string, enabled: boolean) {
  return useQuery({
    queryKey: ['datasets', name, 'profile'],
    queryFn: ({ signal }) => apiGet<DatasetProfile>(datasetPath(name, 'profile'), undefined, { signal }),
    enabled,
  });
}

export function datasetDownloadUrl(name: string, params: QueryParams): string {
  return buildUrl(datasetPath(name, 'download'), params);
}
