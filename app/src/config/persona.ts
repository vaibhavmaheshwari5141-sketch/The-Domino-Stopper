// The demo user shown on the Login page and in the top bar. Change it here.
export interface Persona {
  name: string;
  role: string;
  team: string;
  initials: string;
}

export const PERSONA: Persona = {
  name: 'Aarav Mehta',
  role: 'Network Schedule Planner',
  team: 'Network Planning',
  initials: 'AM',
};
