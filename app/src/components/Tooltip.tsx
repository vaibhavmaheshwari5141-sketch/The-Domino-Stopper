import clsx from 'clsx';
import { Info } from 'lucide-react';
import { cloneElement, isValidElement, type ReactElement, type ReactNode, useId } from 'react';

interface Props {
  content: ReactNode;
  /** A focusable element (button); it gets aria-describedby pointing at the tooltip. */
  children: ReactElement<{ 'aria-describedby'?: string }>;
  align?: 'left' | 'center' | 'right';
  className?: string;
}

/** Shows on hover and on keyboard focus, below the trigger. */
export function Tooltip({ content, children, align = 'center', className }: Props) {
  const id = useId();
  return (
    <span className="group relative inline-flex">
      {isValidElement(children) ? cloneElement(children, { 'aria-describedby': id }) : children}
      <span
        role="tooltip"
        id={id}
        className={clsx(
          // display:none until shown, so a hidden tooltip near an edge never widens the page
          'pointer-events-none absolute top-full z-50 mt-2 hidden w-max max-w-[280px] rounded-control border bg-surface px-3 py-2',
          'text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-ink shadow-lg',
          'group-focus-within:block group-hover:block',
          align === 'left' && 'left-0',
          align === 'right' && 'right-0',
          align === 'center' && 'left-1/2 -translate-x-1/2',
          className,
        )}
      >
        {content}
      </span>
    </span>
  );
}

/** A small (i) button with a tooltip. */
export function InfoTip({ label, children, align }: { label: string; children: ReactNode; align?: Props['align'] }) {
  return (
    <Tooltip content={children} align={align}>
      <button type="button" aria-label={label} className="focus-ring rounded-full text-muted hover:text-ink">
        <Info size={14} aria-hidden="true" />
      </button>
    </Tooltip>
  );
}
