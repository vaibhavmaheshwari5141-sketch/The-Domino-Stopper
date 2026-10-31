import { Link } from 'react-router-dom';
import { DataContextChip } from './DataContextChip';
import { LogoMark } from './LogoMark';
import { UserMenu } from './UserMenu';

export function TopBar({ title }: { title: string }) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-5 border-b bg-surface px-4">
      <Link to="/overview" className="focus-ring flex shrink-0 items-center gap-2.5 rounded-control">
        <LogoMark size={28} />
        <span className="leading-tight">
          <span className="block text-sm font-semibold text-navy">The Domino Stopper</span>
          <span className="block text-[11px] text-muted">Buffer Delay Allocation Engine</span>
        </span>
      </Link>
      <span className="h-6 w-px shrink-0 bg-line" aria-hidden="true" />
      <h1 className="min-w-0 truncate text-[15px] font-semibold text-ink">{title}</h1>
      <div className="ml-auto flex shrink-0 items-center gap-3">
        <DataContextChip />
        <UserMenu />
      </div>
    </header>
  );
}
