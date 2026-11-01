// Side-bar navigation, in display order. `fit` pages fill the viewport without scrolling on large screens.
import {
  Building2, CalendarClock, Database, Gauge, LayoutDashboard, type LucideIcon, Plane, SlidersHorizontal, Waypoints,
} from 'lucide-react';

export interface NavItem {
  path: string;
  title: string;
  icon: LucideIcon;
  fit?: boolean;
}

export const NAV: NavItem[] = [
  { path: '/overview', title: 'Overview', icon: LayoutDashboard, fit: true },
  { path: '/buffer-planner', title: 'Buffer Planner', icon: CalendarClock },
  { path: '/aircraft-day', title: 'Aircraft Day', icon: Plane },
  { path: '/scenario-simulator', title: 'Scenario Simulator', icon: SlidersHorizontal },
  { path: '/risk-forecast', title: 'Risk Forecast', icon: Gauge },
  { path: '/airport-insights', title: 'Airport Insights', icon: Building2, fit: true },
  { path: '/delay-propagation', title: 'Delay Propagation', icon: Waypoints },
  { path: '/input-data', title: 'Input Data', icon: Database, fit: true },
];

/** Route `handle`: read by the shell for the top-bar title and the scrolling rule. */
export interface PageHandle {
  title: string;
  fit?: boolean;
}
