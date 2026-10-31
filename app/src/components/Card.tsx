import clsx from 'clsx';
import type { ReactNode } from 'react';

interface Props {
  title?: ReactNode;
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** White panel with a 1px border. Children lay out in a column, so a child with flex-1 fills the rest. */
export function Card({ title, aside, className, children }: Props) {
  return (
    <section className={clsx('flex min-w-0 flex-col rounded-card border bg-surface', className)}>
      {title && (
        <header className="flex items-center justify-between gap-3 px-4 pb-2 pt-3">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {aside}
        </header>
      )}
      {children}
    </section>
  );
}
