import clsx from 'clsx';

interface Props {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}

/** An on/off switch with its label. */
export function Toggle({ checked, onChange, label }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="focus-ring inline-flex items-center gap-2 rounded-control text-[13px] text-ink"
    >
      <span className={clsx('relative block h-5 w-9 shrink-0 rounded-full transition-colors', checked ? 'bg-teal' : 'bg-line')}>
        <span className={clsx('absolute left-0 top-0.5 block h-4 w-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[18px]' : 'translate-x-0.5')} />
      </span>
      {label}
    </button>
  );
}
