import clsx from 'clsx';
import { type KeyboardEvent, type ReactNode, useId, useRef } from 'react';

interface Props<T extends string> {
  label: string;
  value: T;
  tabs: { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
  /** The panel of the selected tab. */
  children: ReactNode;
  /** Shown at the right end of the tab row, for example a button. */
  aside?: ReactNode;
  className?: string;
}

/** Underlined tabs with one panel (WAI-ARIA tabs: arrow keys, Home and End move between tabs). */
export function Tabs<T extends string>({ label, value, tabs, onChange, children, aside, className }: Props<T>) {
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: KeyboardEvent, i: number) {
    const last = tabs.length - 1;
    const next = { ArrowRight: i === last ? 0 : i + 1, ArrowLeft: i === 0 ? last : i - 1, Home: 0, End: last }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    onChange(tabs[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div className={clsx('flex min-h-0 flex-col', className)}>
      <div className="flex items-end justify-between gap-3 border-b">
        <div role="tablist" aria-label={label} className="flex gap-4">
          {tabs.map((t, i) => {
            const active = t.value === value;
            return (
              <button
                key={t.value}
                ref={(el) => { refs.current[i] = el; }}
                type="button"
                role="tab"
                id={`${id}-tab-${t.value}`}
                aria-selected={active}
                aria-controls={`${id}-panel`}
                tabIndex={active ? 0 : -1}
                onClick={() => onChange(t.value)}
                onKeyDown={(e) => onKeyDown(e, i)}
                className={clsx(
                  'focus-ring -mb-px whitespace-nowrap border-b-2 pb-2 pt-1 text-[13px]',
                  active ? 'border-navy font-semibold text-ink' : 'border-transparent text-muted hover:text-ink',
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>
        {aside && <div className="pb-1.5">{aside}</div>}
      </div>
      {/* A one-row grid, so whatever the panel holds stretches to its full height */}
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${value}`} className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] pt-3">
        {children}
      </div>
    </div>
  );
}
