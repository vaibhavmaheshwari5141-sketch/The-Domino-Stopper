import { ChevronDown, LogOut } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PERSONA } from '../config/persona';
import { getSession, signOut } from '../lib/session';
import { Avatar } from './Avatar';

export function UserMenu() {
  const user = getSession() ?? PERSONA;
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on a click outside or on Escape
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="focus-ring flex items-center gap-2.5 rounded-control py-1 pl-1 pr-2 hover:bg-bg"
      >
        <Avatar initials={user.initials} />
        <span className="hidden text-left leading-tight wide:block">
          <span className="block text-sm font-medium text-ink">{user.name}</span>
          <span className="block text-[11px] text-muted">{user.role}</span>
        </span>
        <ChevronDown size={16} className="text-muted" aria-hidden="true" />
      </button>

      {open && (
        <div role="menu" className="absolute right-0 top-full z-50 mt-1 w-56 rounded-card border bg-surface py-1 shadow-lg">
          <p className="px-3 py-2 text-xs text-muted">{user.team}</p>
          <button
            type="button"
            role="menuitem"
            autoFocus
            onClick={() => {
              signOut();
              navigate('/login', { replace: true });
            }}
            className="focus-ring flex w-full items-center gap-2 px-3 py-2 text-sm text-ink hover:bg-bg"
          >
            <LogOut size={16} className="text-muted" aria-hidden="true" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
