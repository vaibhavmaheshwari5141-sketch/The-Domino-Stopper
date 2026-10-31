import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '../../components/Card';
import { WrappedTick } from '../../components/charts';
import { ErrorState } from '../../components/ErrorState';
import { SegmentedControl } from '../../components/SegmentedControl';
import { axisProps, axisTick, chartColors, gridProps } from '../../lib/chart';
import { formatNumber, formatPercent } from '../../lib/format';
import { useSimAllocation } from '../../lib/queries';
import { GROUPINGS } from '../../../shared/simulator';
import { ChartTooltipBox, LegendItem } from '../overview/ChartTooltip';

interface Props {
  budget: number;
  grouping: string;
  onGrouping: (grouping: string) => void;
}

/** Where the engine puts the buffer: share of turnarounds against share of engine buffer, by group. */
export function AllocationChart({ budget, grouping, onGrouping }: Props) {
  const { data, isError, error, refetch, isFetching } = useSimAllocation(budget, grouping);
  const airports = grouping === 'Airport';

  return (
    <Card
      title="Where the engine puts the buffer"
      aside={<SegmentedControl label="Group by" value={grouping} onChange={onGrouping} options={GROUPINGS.map((g) => ({ value: g.name, label: g.label }))} />}
    >
      <div className="px-4 pb-4">
        {isError && !data ? <ErrorState error={error} onRetry={() => void refetch()} retrying={isFetching} /> : (
          <>
            <p className="min-h-[20px] text-[13px] text-ink">{data ? data.caption : <span className="skeleton block h-4 w-2/3" />}</p>
            <div className="mt-1 flex gap-4">
              <LegendItem color={chartColors.line} label="Share of turnarounds" />
              <LegendItem color={chartColors.amber} label="Share of engine buffer" />
            </div>
            <div className="mt-2 h-64">
              {!data ? <span className="skeleton block h-full" /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.rows} margin={{ top: 8, right: 8, bottom: 0, left: -8 }} barGap={2} barCategoryGap={airports ? '18%' : '30%'}>
                    <CartesianGrid {...gridProps} />
                    <XAxis dataKey="group" {...axisProps} interval={0} height={airports ? 24 : 34} tick={airports ? axisTick : <WrappedTick />} />
                    <YAxis {...axisProps} width={44} tickFormatter={(v: number) => formatPercent(v, 0)} />
                    <Tooltip cursor={{ fill: 'var(--color-bg)' }} content={({ active, payload, label }) => {
                      const r = payload?.[0]?.payload as (typeof data.rows)[number] | undefined;
                      return active && r ? (
                        <ChartTooltipBox title={label} rows={[
                          ['Share of turnarounds', formatPercent(r.share_of_turnarounds, 1)],
                          ['Share of engine buffer', formatPercent(r.share_of_engine_buffer, 1)],
                          ['Engine buffer', `${formatNumber(r.engine_buffer_min)} min`],
                          ['If spread evenly', `${formatNumber(r.even_buffer_min)} min`],
                        ]} />
                      ) : null;
                    }} />
                    <Bar dataKey="share_of_turnarounds" fill={chartColors.line} radius={[3, 3, 0, 0]} maxBarSize={40} isAnimationActive={false} />
                    <Bar dataKey="share_of_engine_buffer" fill={chartColors.amber} radius={[3, 3, 0, 0]} maxBarSize={40} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
            <p className="mt-1 text-[11px] text-muted">
              At {budget} min per turnaround.{airports ? ' The 15 airports that receive the most engine buffer.' : ''} Spreading evenly would match the grey bars.
            </p>
          </>
        )}
      </div>
    </Card>
  );
}
