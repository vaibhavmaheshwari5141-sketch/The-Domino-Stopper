import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation, useMatches } from 'react-router-dom';
import type { PageHandle } from '../config/nav';
import { getSession } from '../lib/session';
import { readJson, writeJson } from '../lib/storage';
import { SideBar } from './SideBar';
import { TopBar } from './TopBar';

const INTRO_KEY = 'ds_sidebar_intro';      // signed_in_at of the session whose side-bar intro has been shown
const INTRO_MS = 2500;                      // after signing in, the side bar stays open this long, then collapses

/** `/`: Overview when signed in, otherwise Login. */
export function HomeRedirect() {
  return <Navigate to={getSession() ? '/overview' : '/login'} replace />;
}

/** Top bar, side bar and content area for every page except Login. Without a session, sends the user to Login. */
export function AppShell() {
  const location = useLocation();
  const handle = useMatches()
    .map((m) => m.handle as PageHandle | undefined)
    .reverse()
    .find((h) => h?.title);
  const session = getSession();
  // Open beside the content right after signing in (once per sign-in, not on every reload), then collapsed to icons
  const [intro, setIntro] = useState(() => !!session && readJson<string>('session', INTRO_KEY) !== session.signed_in_at);
  const [hover, setHover] = useState(false);

  useEffect(() => {
    document.title = handle?.title ? `${handle.title} · The Domino Stopper` : 'The Domino Stopper';
  }, [handle?.title]);

  const signedInAt = session?.signed_in_at ?? null;   // a string, so re-renders do not restart the timer
  useEffect(() => {
    if (!intro || !signedInAt) return;
    writeJson('session', INTRO_KEY, signedInAt);
    const id = setTimeout(() => setIntro(false), INTRO_MS);
    return () => clearTimeout(id);
  }, [intro, signedInAt]);

  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TopBar title={handle?.title ?? ''} />
      <div className="flex min-h-0 flex-1">
        {/* Reserves the side bar's width: full during the intro, icons after. On hover the bar opens over the content. */}
        <div className={clsx('relative shrink-0 transition-[width] duration-200', intro ? 'w-60' : 'w-16')}>
          <SideBar expanded={intro || hover} overlay={hover && !intro} onHover={setHover} />
        </div>
        {/* Scrolls by default; `fit` pages stay within the viewport on large screens. `relative` anchors absolutely
            positioned content (such as sr-only labels) here, so it scrolls with the page instead of stretching the window
            and adding a second scrollbar. */}
        <main className={clsx('relative h-[calc(100vh-56px)] min-w-0 flex-1 overflow-auto p-5', handle?.fit && 'fit:overflow-hidden')}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
