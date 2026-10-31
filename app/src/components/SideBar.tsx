import clsx from 'clsx';
import type { FocusEvent } from 'react';
import { NavLink } from 'react-router-dom';
import { NAV } from '../config/nav';

interface Props {
  expanded: boolean;
  /** Expanded over the content (on hover or focus) rather than beside it: adds a shadow. */
  overlay: boolean;
  onHover: (inside: boolean) => void;
}

/** Collapsed to icons; opens while the pointer or keyboard focus is inside it. */
export function SideBar({ expanded, overlay, onHover }: Props) {
  const onBlur = (e: FocusEvent<HTMLElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onHover(false);
  };
  return (
    <nav
      aria-label="Pages"
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={onBlur}
      className={clsx(
        'absolute inset-y-0 left-0 z-40 flex flex-col border-r bg-surface transition-[width,box-shadow] duration-200',
        expanded ? 'w-60' : 'w-16',
        overlay && 'shadow-lg',
      )}
    >
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-4">
        <ul className="space-y-0.5">
          {NAV.map(({ path, title, icon: Icon }) => (
            <li key={path}>
              <NavLink
                to={path}
                aria-label={expanded ? undefined : title}
                className={({ isActive }) =>
                  clsx(
                    'focus-ring group flex h-9 items-center gap-3 rounded-control px-[11px] text-sm',
                    isActive ? 'bg-amber-soft font-medium text-ink' : 'text-muted hover:bg-bg hover:text-ink',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon size={18} aria-hidden="true" className={clsx('shrink-0', isActive ? 'text-amber' : 'text-muted group-hover:text-ink')} />
                    {expanded && <span className="truncate whitespace-nowrap">{title}</span>}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
