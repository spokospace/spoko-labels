import type { ImportOptions, ImportWarning, ImportWarningCode } from "../types.js";

export type Json = Record<string, unknown>;

export const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** An own property only, so `__proto__` or `constructor` in the input never reach the prototype. */
export const get = (obj: Json, key: string): unknown => (Object.hasOwn(obj, key) ? obj[key] : undefined);

/** `null` counts as absent everywhere: the app writes both for "not set". */
export const present = (value: unknown): boolean => value !== undefined && value !== null;

export const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/** Rounds to 0.001 so float noise (12.299999, 0.2 × 1.65) never reaches the output; -0 becomes 0. */
export const round = (value: number): number => Math.round(value * 1000) / 1000 + 0;

/** Everything a converter needs about the element it is converting. */
export class ElementContext {
  constructor(
    readonly raw: Json,
    /** JSON pointer of the element in the Niimbot input, "/elements/<i>". */
    readonly path: string,
    readonly options: ImportOptions,
    private readonly warnings: ImportWarning[],
  ) {}

  warn(code: ImportWarningCode, key?: string, extra: Pick<ImportWarning, "feature" | "issue"> = {}): void {
    this.warnings.push({ code, path: key === undefined ? this.path : `${this.path}/${key}`, ...extra });
  }

  /** `unsupported-style`: a feature that was approximated. */
  approximated(key: string, feature: string): void {
    this.warn("unsupported-style", key, { feature });
  }

  /** A finite number, rounded and limited to `min..max`, with `value-clamped` when it was outside. */
  clamped(key: string, value: number, min: number, max: number): number {
    const limited = Math.min(Math.max(value, min), max);
    if (limited !== value) this.warn("value-clamped", key);
    return round(limited);
  }
}
