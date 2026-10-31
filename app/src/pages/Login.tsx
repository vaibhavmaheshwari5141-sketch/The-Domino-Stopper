import clsx from 'clsx';
import { CalendarClock, Gauge, type LucideIcon, Waypoints } from 'lucide-react';
import { Fragment } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { LogoMark } from '../components/LogoMark';
import { PERSONA } from '../config/persona';
import { signIn } from '../lib/session';

const VALUES: { icon: LucideIcon; text: string }[] = [
  { icon: Gauge, text: 'Predict risk from the timetable' },
  { icon: CalendarClock, text: 'Place buffer where it absorbs the most' },
  { icon: Waypoints, text: 'Stop delays spreading' },
];

// Illustration only: an aircraft's day, with buffer added at the second turnaround
const LEGS = [{ delay: 30 }, { delay: 8, buffer: true }, { delay: 8 }, { delay: 7 }, { delay: 7 }];

export default function Login() {
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from;

  const onSignIn = () => {
    signIn(PERSONA);
    navigate(from && from !== '/login' ? from : '/overview', { replace: true });
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <section className="flex w-[55%] flex-col justify-between bg-tarmac px-14 py-12 text-white">
        <div className="flex items-center gap-3">
          <LogoMark size={44} onDark />
          <div className="leading-tight">
            <p className="text-xl font-semibold">The Domino Stopper</p>
            <p className="text-sm text-white/70">Buffer Delay Allocation Engine</p>
          </div>
        </div>

        <div className="max-w-xl">
          <p className="text-[26px] font-semibold leading-snug">
            Predict which turnarounds will receive a late aircraft and place limited buffer where it stops the delay chain.
          </p>
          <ul className="mt-8 space-y-4">
            {VALUES.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10">
                  <Icon size={18} className="text-amber-soft" aria-hidden="true" />
                </span>
                <span className="text-[15px] text-white/90">{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <figure>
          <div className="flex items-stretch">
            {LEGS.map((leg, i) => (
              <Fragment key={i}>
                {i > 0 && <span className="w-3 self-center border-t border-white/30" aria-hidden="true" />}
                <div
                  className={clsx(
                    'flex w-[104px] flex-col rounded-control px-2.5 py-2',
                    leg.buffer ? 'border border-dashed border-amber bg-white/5' : 'border border-white/15 bg-white/5',
                  )}
                >
                  <span className="num text-[10px] uppercase tracking-wide text-white/60">Flight {i + 1}</span>
                  <span className={clsx('num text-base font-semibold', leg.delay >= 15 ? 'text-amber-soft' : 'text-white')}>
                    +{leg.delay} min
                  </span>
                  <span className="num text-[10px] text-amber-soft">{leg.buffer ? 'buffer added' : ' '}</span>
                </div>
              </Fragment>
            ))}
          </div>
          <figcaption className="mt-2 text-[11px] text-white/50">Illustration</figcaption>
        </figure>
      </section>

      <section className="flex flex-1 flex-col bg-surface">
        <div className="flex flex-1 items-center justify-center px-8">
          <div className="w-full max-w-[380px] rounded-card border p-8">
            <h1 className="text-xl font-semibold text-navy">Sign in</h1>
            <div className="mt-5 flex items-center gap-3 rounded-card border bg-bg p-4">
              <Avatar initials={PERSONA.initials} size={44} />
              <div className="min-w-0 leading-snug">
                <p className="font-semibold text-ink">{PERSONA.name}</p>
                <p className="text-sm text-ink">{PERSONA.role}</p>
                <p className="text-xs text-muted">{PERSONA.team}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onSignIn}
              className="focus-ring mt-6 h-11 w-full rounded-control bg-amber text-[15px] font-semibold text-white hover:brightness-95"
            >
              Sign in
            </button>
            <p className="mt-3 text-center text-xs text-muted">Demo access. No password is needed.</p>
          </div>
        </div>
        <footer className="pb-6 text-center text-[12px] text-muted">Team T19 · Analytics Capstone Project</footer>
      </section>
    </div>
  );
}
