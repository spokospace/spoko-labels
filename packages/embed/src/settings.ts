// Per-browser settings. localStorage can be missing or throw (private mode, blocked storage): every access is
// guarded, and a failure only means the default is used.

const DENSITY_KEY = "spoko-labels:density";

export function savedDensity(): number | undefined {
  try {
    const value = Number(globalThis.localStorage?.getItem(DENSITY_KEY));
    return Number.isInteger(value) && value > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

export function saveDensity(density: number): void {
  try {
    globalThis.localStorage?.setItem(DENSITY_KEY, String(density));
  } catch {
    // Not remembered; nothing else depends on it.
  }
}
