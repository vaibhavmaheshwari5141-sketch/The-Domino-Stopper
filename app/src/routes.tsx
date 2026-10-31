import type { ReactElement } from 'react';
import type { RouteObject } from 'react-router-dom';
import { AppShell, HomeRedirect } from './components/AppShell';
import { NAV, type PageHandle } from './config/nav';
import AircraftDay from './pages/AircraftDay';
import AirportInsights from './pages/AirportInsights';
import BufferPlanner from './pages/BufferPlanner';
import DelayPropagation from './pages/DelayPropagation';
import InputData from './pages/InputData';
import Login from './pages/Login';
import NotFound from './pages/NotFound';
import Overview from './pages/Overview';
import RiskForecast from './pages/RiskForecast';
import ScenarioSimulator from './pages/ScenarioSimulator';

const PAGES: Record<string, ReactElement> = {
  '/overview': <Overview />,
  '/buffer-planner': <BufferPlanner />,
  '/aircraft-day': <AircraftDay />,
  '/scenario-simulator': <ScenarioSimulator />,
  '/risk-forecast': <RiskForecast />,
  '/airport-insights': <AirportInsights />,
  '/delay-propagation': <DelayPropagation />,
  '/input-data': <InputData />,
};

export const routes: RouteObject[] = [
  { path: '/login', element: <Login /> },
  { path: '/', element: <HomeRedirect /> },
  {
    // Every other page needs a session (AppShell redirects to /login without one)
    element: <AppShell />,
    children: [
      ...NAV.map(({ path, title, fit }) => ({ path, element: PAGES[path], handle: { title, fit } satisfies PageHandle })),
      { path: '*', element: <NotFound />, handle: { title: 'Page not found' } satisfies PageHandle },
    ],
  },
];
