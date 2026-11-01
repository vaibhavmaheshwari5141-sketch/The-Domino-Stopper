import clsx from 'clsx';
import { ArrowLeftRight, BadgeDollarSign, Gauge, Lightbulb, type LucideIcon, Target, Timer } from 'lucide-react';
import type { Insight, InsightSource } from '../../lib/api';

const ICONS: Record<string, LucideIcon> = {
  threshold: Timer,
  placement: Target,
  realloc: ArrowLeftRight,
  break_even: BadgeDollarSign,
  risk: Gauge,
};

const TONE: Record<InsightSource, { circle: string; icon: string }> = {
  'Prediction engine': { circle: 'bg-teal-soft', icon: 'text-teal' },
  'Buffer engine': { circle: 'bg-amber-soft', icon: 'text-amber' },
  'Delay propagation': { circle: 'bg-bg', icon: 'text-tarmac' },
  Data: { circle: 'bg-bg', icon: 'text-muted' },
};

export function InsightsList({ insights }: { insights: Insight[] }) {
  return (
    <ul className="divide-y divide-line">
      {insights.map((item) => {
        const Icon = ICONS[item.id] ?? Lightbulb;
        const tone = TONE[item.source] ?? TONE.Data;
        return (
          <li key={item.id} className="flex gap-3 py-2.5 first:pt-1">
            <span className={clsx('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full', tone.circle)}>
              <Icon size={16} className={tone.icon} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold leading-snug text-ink" title={item.title}>{item.title}</p>
              <p className="truncate text-[12px] leading-snug text-muted" title={item.body}>{item.body}</p>
              <div className="mt-1.5 flex items-center gap-1.5">
                <span className="num shrink-0 rounded-control border bg-bg px-1 py-px text-[12px] font-medium text-ink">{item.metric}</span>
                <span className="truncate text-[11px] text-muted" title={item.metric_label}>{item.metric_label}</span>
                <span className="ml-auto shrink-0 rounded-full border px-1.5 py-px text-[10px] leading-4 text-muted">{item.source}</span>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
