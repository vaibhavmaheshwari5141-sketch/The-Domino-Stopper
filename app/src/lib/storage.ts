// Browser storage that never throws: private windows and blocked site data make the accessors throw or return
// nothing, so every read and write is wrapped, and callers always get a usable default.

type Area = 'local' | 'session';

function area(which: Area): Storage | null {
  try {
    return which === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export function readJson<T>(which: Area, key: string): T | null {
  try {
    const raw = area(which)?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Returns false when the value could not be stored. */
export function writeJson(which: Area, key: string, value: unknown): boolean {
  try {
    const store = area(which);
    if (!store) return false;
    store.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function remove(which: Area, key: string): void {
  try {
    area(which)?.removeItem(key);
  } catch {
    // nothing to clean up
  }
}
