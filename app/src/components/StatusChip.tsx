import clsx from 'clsx';
import { Check, Minus, X } from 'lucide-react';

/** Pass / fail chip: green for true, red for false, grey when there is nothing to judge. */
export function StatusChip({ ok, yes = 'Met', no = 'Not met', none = 'n/a' }: { ok: boolean | null | undefined; yes?: string; no?: string; none?: string }) {
  const Icon = ok === true ? Check : ok === false ? X : Minus;
  return (
    <span className={clsx(
      'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-px text-[11px] font-semibold',
      ok === true ? 'bg-success-soft text-success' : ok === false ? 'bg-critical-soft text-critical' : 'bg-bg text-muted',
    )}>
      <Icon size={11} aria-hidden="true" />
      {ok === true ? yes : ok === false ? no : none}
    </span>
  );
}
