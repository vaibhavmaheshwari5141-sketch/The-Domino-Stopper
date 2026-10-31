// Two domino tiles: one standing, one tipping into it.
interface Props {
  size?: number;
  onDark?: boolean;
}

export function LogoMark({ size = 28, onDark = false }: Props) {
  const standing = onDark ? 'var(--color-amber-soft)' : 'var(--color-navy)';
  const pip = onDark ? 'var(--color-tarmac)' : 'var(--color-surface)';
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" className="shrink-0">
      <rect x="4" y="6" width="10" height="21" rx="2" fill={standing} />
      <line x1="5.5" x2="12.5" y1="16.5" y2="16.5" stroke={pip} strokeWidth="1.2" />
      <circle cx="9" cy="11.5" r="1.4" fill={pip} />
      <circle cx="9" cy="21.5" r="1.4" fill={pip} />
      <g transform="rotate(22 22 27)">
        <rect x="17" y="6" width="10" height="21" rx="2" fill="var(--color-amber)" />
        <line x1="18.5" x2="25.5" y1="16.5" y2="16.5" stroke={pip} strokeWidth="1.2" />
        <circle cx="22" cy="11.5" r="1.4" fill={pip} />
        <circle cx="22" cy="21.5" r="1.4" fill={pip} />
      </g>
    </svg>
  );
}
