import { Calculator } from './propagation/Calculator';
import { CurveChart } from './propagation/CurveChart';
import { LegChart } from './propagation/LegChart';
import { PropagationTiles } from './propagation/PropagationTiles';
import { SegmentChart } from './propagation/SegmentChart';
import { usePropagationState } from './propagation/usePropagationState';

// Delay Propagation: the science behind the engine. How much of a late arrival is passed on, how planned ground time
// changes that (the 63-minute rule), whether it holds across segments, and how delay builds up through the day.
export default function DelayPropagation() {
  const [state, update] = usePropagationState();
  return (
    <div className="flex flex-col gap-4">
      <PropagationTiles />
      <CurveChart curves={state.curves} onCurves={(curves) => update({ curves })} />
      <Calculator state={state} update={update} />
      <div className="grid grid-cols-1 gap-4 wide:grid-cols-2">
        <SegmentChart seg={state.seg} onSeg={(seg) => update({ seg })} />
        <LegChart period={state.period} onPeriod={(period) => update({ period })} />
      </div>
    </div>
  );
}
