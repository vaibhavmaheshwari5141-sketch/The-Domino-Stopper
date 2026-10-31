import { flightNo } from '../../../shared/planner';

interface Props {
  inboundFlight: number | null;
  from: string | null;
  airport: string;
  outboundFlight: number | null;
  to: string | null;
}

/** "AA2718 PIT → CLT → AA2516 TPA", with the turnaround airport in bold. */
export function FlightChain({ inboundFlight, from, airport, outboundFlight, to }: Props) {
  return (
    <span className="whitespace-nowrap">
      <span className="num text-muted">{flightNo(inboundFlight)}</span> {from ?? '–'} <span className="text-muted">→</span>{' '}
      <span className="font-semibold text-ink">{airport}</span> <span className="text-muted">→</span>{' '}
      <span className="num text-muted">{flightNo(outboundFlight)}</span> {to ?? '–'}
    </span>
  );
}
