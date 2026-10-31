import { AlertTriangle, CheckCircle2, Database } from 'lucide-react';
import { EMPTY, formatPeriod } from '../lib/format';
import { useMeta } from '../lib/queries';
import { Tooltip } from './Tooltip';

/** "Data v1.0 · Test Jan–Aug 2026 · Run 0e6b", with versions and checks in a tooltip. From GET /api/meta. */
export function DataContextChip() {
  const { data, isPending, isError } = useMeta();
  const chip = 'num inline-flex h-8 items-center gap-2 rounded-full border bg-bg px-3 text-[12px] text-muted';

  if (isPending) return <span className="skeleton h-8 w-60 rounded-full" aria-label="Loading data context" />;
  if (isError || !data) {
    return (
      <span className={chip}>
        <AlertTriangle size={14} className="text-warning" aria-hidden="true" />
        Data context unavailable
      </span>
    );
  }

  const { run } = data;
  const tag = run.data_tag ? `Data ${run.data_tag.replace(/^data-?/i, '')}` : 'Data';
  const allPassed = run.checks_total !== null && run.checks_passed === run.checks_total;
  const rows: [string, string | null][] = [
    ['Model', run.model_version], ['Engine', run.engine_version], ['Curve', run.curve_version], ['Run', run.run_id],
  ];

  return (
    <Tooltip
      align="right"
      content={
        <div className="space-y-1.5">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
            {rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted">{k}</dt>
                <dd className="num">{v ?? EMPTY}</dd>
              </div>
            ))}
          </dl>
          <p className="flex items-center gap-1.5 border-t pt-1.5">
            {allPassed
              ? <CheckCircle2 size={14} className="text-success" aria-hidden="true" />
              : <AlertTriangle size={14} className="text-warning" aria-hidden="true" />}
            {run.checks_passed ?? EMPTY} of {run.checks_total ?? EMPTY} checks passed
          </p>
        </div>
      }
    >
      <button type="button" className={`${chip} focus-ring hover:text-ink`}>
        <Database size={14} aria-hidden="true" />
        <span>{tag}</span>
        <span aria-hidden="true">·</span>
        <span>Test {formatPeriod(run.test_period)}</span>
        <span aria-hidden="true">·</span>
        <span>Run {run.run_id.slice(-4)}</span>
      </button>
    </Tooltip>
  );
}
