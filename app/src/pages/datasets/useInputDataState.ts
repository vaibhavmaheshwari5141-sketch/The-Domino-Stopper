// Input Data state in the URL: the selected dataset and tab, so a view can be shared or reloaded as is.
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

export const TABS = [
  { value: 'preview', label: 'Preview' },
  { value: 'columns', label: 'Columns' },
  { value: 'profile', label: 'Profile' },
  { value: 'learn', label: 'What you can learn' },
] as const;
export type DatasetTab = (typeof TABS)[number]['value'];

export interface InputDataState {
  /** null until a dataset is picked (the page then selects the first input table). */
  dataset: string | null;
  tab: DatasetTab;
}

function parse(sp: URLSearchParams): InputDataState {
  const dataset = sp.get('dataset') ?? '';
  return {
    dataset: /^[A-Za-z0-9_]{1,128}$/.test(dataset) ? dataset : null,
    tab: TABS.find((t) => t.value === sp.get('tab'))?.value ?? 'preview',
  };
}

function serialise(s: InputDataState): URLSearchParams {
  const out = new URLSearchParams();
  if (s.dataset) out.set('dataset', s.dataset);
  if (s.tab !== 'preview') out.set('tab', s.tab);
  return out;
}

export function useInputDataState(): [InputDataState, (patch: Partial<InputDataState>) => void] {
  const [sp, setSp] = useSearchParams();
  const state = useMemo(() => parse(sp), [sp]);
  const update = useCallback(
    (patch: Partial<InputDataState>) => setSp((prev) => serialise({ ...parse(prev), ...patch }), { replace: true }),
    [setSp],
  );
  return [state, update];
}
