// localStorage that never throws: it can be blocked (privacy settings), full, or missing (tests). A failed
// read returns null and a failed write is dropped; the app works without storage, it only forgets.

/** Every key the app stores, in one place. */
export const STORAGE_KEYS = {
  lang: "spoko-labels:lang",
  /** The API URL without its query and fragment (A7). */
  apiUrl: "spoko-labels:api-url",
  apiPath: "spoko-labels:api-path",
  /** The calibration, `{"x":0,"y":0.5}` in mm (A13). */
  offsetMm: "spoko-labels:offset-mm",
} as const;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function storage(): StorageLike | undefined {
  try {
    return globalThis.localStorage ?? undefined;
  } catch {
    return undefined;
  }
}

export function readStored(key: string, from: StorageLike | undefined = storage()): string | null {
  try {
    return from?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** Returns false when the value could not be stored. */
export function writeStored(key: string, value: string, to: StorageLike | undefined = storage()): boolean {
  try {
    if (!to) return false;
    to.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
