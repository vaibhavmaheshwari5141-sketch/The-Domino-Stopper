// Demo sign-in: a session object in sessionStorage (key ds_session). There is no password and no server check;
// it only decides which screens are shown. If storage is blocked, the session lives in memory for this tab.

import type { Persona } from '../config/persona';
import { readJson, remove, writeJson } from './storage';

export interface Session extends Persona {
  signed_in_at: string;
}

const KEY = 'ds_session';
let memory: Session | null = null;

export function getSession(): Session | null {
  return readJson<Session>('session', KEY) ?? memory;
}

export function signIn(persona: Persona): Session {
  const session: Session = { ...persona, signed_in_at: new Date().toISOString() };
  if (!writeJson('session', KEY, session)) memory = session;
  return session;
}

export function signOut(): void {
  remove('session', KEY);
  memory = null;
}
