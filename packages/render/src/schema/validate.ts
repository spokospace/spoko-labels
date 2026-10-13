import { checkPlacement } from "../layout/safe-area.js";
import type { IssueCode, TemplateIssue } from "./issues.js";
import {
  DEFAULTS,
  LIMITS,
  TEMPLATE_VERSION,
  type Content,
  type NormalizedElement,
  type NormalizedFontSpec,
  type NormalizedTemplate,
  type Shape,
} from "./types.js";

export interface ValidateOptions {
  /**
   * Width the print head covers, in mm (for a NIIMBOT B1, 48). When given, element boxes outside the
   * centered strip of that width get `outside-printable-area`.
   */
  printableWidth?: number;
}

export interface ValidationResult {
  /**
   * The template with every default filled in, unknown properties removed and invalid elements removed;
   * `null` only when a template-level error makes it unusable.
   */
  template: NormalizedTemplate | null;
  issues: TemplateIssue[];
}

type Json = Record<string, unknown>;
interface Range {
  min?: number;
  max?: number;
  /** The value must be greater than this. */
  above?: number;
}

const BOX_KEYS = ["type", "id", "x", "y", "width", "height"];
const KEYS = {
  template: ["version", "name", "size", "shape", "safeMargin", "elements"],
  size: ["width", "height"],
  line: BOX_KEYS,
  qr: [...BOX_KEYS, "content", "level"],
  text: [
    ...BOX_KEYS,
    ...["content", "font", "letterSpacing", "lineSpacing", "align", "verticalAlign", "wrap", "fit", "minSize", "reverse"],
  ],
  font: ["family", "size", "bold", "fallback"],
};
const SIZE_RANGE: Range = { above: 0, max: LIMITS.maxLabelSize };

/** Escape one JSON pointer segment (RFC 6901). */
const segment = (key: string | number): string => String(key).replaceAll("~", "~0").replaceAll("/", "~1");

/**
 * Reads one JSON object and records issues at JSON pointer paths. After an error a getter still returns a
 * placeholder of the right type, so a whole object can be read in one pass; the caller uses the result
 * only when `ok` is still true. An error also clears `ok` on every parent reader.
 */
class Reader {
  ok = true;

  constructor(
    private readonly issues: TemplateIssue[],
    readonly path: string,
    readonly obj: Json,
    private readonly parent?: Reader,
  ) {}

  at(key: string | number): string {
    return `${this.path}/${segment(key)}`;
  }

  error(code: IssueCode, path = this.path): void {
    this.fail();
    this.issues.push({ severity: "error", code, path });
  }

  private fail(): void {
    this.ok = false;
    this.parent?.fail();
  }

  warn(code: IssueCode, path = this.path): void {
    this.issues.push({ severity: "warning", code, path });
  }

  /** A reader for the object at `key`, or `undefined` (with an error) when it is missing or not an object. */
  child(key: string, optional = false): Reader | undefined {
    const value = this.obj[key];
    if (value === undefined && optional) return undefined;
    if (!isObject(value)) {
      this.error(value === undefined ? "required" : "invalid-type", this.at(key));
      return undefined;
    }
    return new Reader(this.issues, this.at(key), value, this);
  }

  /** Warn about every key not in `known`; the normalized output never copies unknown keys. */
  onlyKeys(known: readonly string[]): void {
    for (const key of Object.keys(this.obj)) if (!known.includes(key)) this.warn("unknown-property", this.at(key));
  }

  number(key: string, range: Range, fallback?: number): number {
    const value = this.obj[key];
    if (value === undefined && fallback !== undefined) return fallback;
    if (typeof value !== "number" || !Number.isFinite(value)) {
      this.error(value === undefined ? "required" : "invalid-type", this.at(key));
      return NaN;
    }
    const { min = -Infinity, max = Infinity, above = -Infinity } = range;
    if (value < min || value > max || value <= above) this.error("out-of-range", this.at(key));
    return value;
  }

  string(key: string, opts: { optional?: boolean; nonEmpty?: boolean } = {}): string | undefined {
    const value = this.obj[key];
    if (value === undefined) {
      if (!opts.optional) this.error("required", this.at(key));
      return undefined;
    }
    if (typeof value !== "string") this.error("invalid-type", this.at(key));
    else if (opts.nonEmpty && value.length === 0) this.error("out-of-range", this.at(key));
    return typeof value === "string" ? value : undefined;
  }

  boolean(key: string, fallback: boolean): boolean {
    const value = this.obj[key];
    if (value === undefined) return fallback;
    if (typeof value !== "boolean") this.error("invalid-type", this.at(key));
    return value === true;
  }

  oneOf<T extends string>(key: string, allowed: readonly T[], fallback?: T): T {
    const value = this.obj[key];
    if (value === undefined && fallback !== undefined) return fallback;
    if (typeof value !== "string") this.error(value === undefined ? "required" : "invalid-type", this.at(key));
    else if (!(allowed as readonly string[]).includes(value)) this.error("out-of-range", this.at(key));
    return value as T;
  }
}

const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Check a template (parsed JSON of unknown shape) against format version 1. Never throws on bad input:
 * every problem is an issue with a stable `code` and a JSON pointer `path`.
 *
 * - A template-level error (version, name, size, shape, safeMargin, elements) gives `template: null`.
 * - An element with an error is removed from `template`; its issues keep severity `error`.
 * - An unknown element type is removed with an `unknown-element` warning; unknown properties are removed
 *   with an `unknown-property` warning.
 * - Element boxes outside the label, the safe area or (with `printableWidth`) the printable strip are
 *   warnings; such elements stay.
 *
 * @throws RangeError when `options.printableWidth` is given and is not a positive finite number.
 */
export function validateTemplate(input: unknown, options: ValidateOptions = {}): ValidationResult {
  const { printableWidth } = options;
  if (printableWidth !== undefined && !(Number.isFinite(printableWidth) && printableWidth > 0)) {
    throw new RangeError(`printableWidth must be a positive number of millimetres, got ${printableWidth}`);
  }

  const issues: TemplateIssue[] = [];
  if (!isObject(input)) {
    issues.push({ severity: "error", code: input === undefined ? "required" : "invalid-type", path: "" });
    return { template: null, issues };
  }
  const r = new Reader(issues, "", input);
  r.onlyKeys(KEYS.template);

  if (input.version === undefined) r.error("required", "/version");
  else if (input.version !== TEMPLATE_VERSION) r.error("unsupported-version", "/version");
  const name = r.string("name", { optional: true });
  const size = readSize(r);
  const shape = size ? readShape(r, size) : undefined;
  const safeMargin = r.number("safeMargin", { min: 0, max: LIMITS.maxSafeMargin }, DEFAULTS.safeMargin);
  const elements = input.elements;
  if (elements === undefined) r.error("required", "/elements");
  else if (!Array.isArray(elements)) r.error("invalid-type", "/elements");
  else if (elements.length > LIMITS.maxElements) r.error("out-of-range", "/elements");

  if (!r.ok || !size || !shape || !Array.isArray(elements)) return { template: null, issues };

  const template: NormalizedTemplate = { version: TEMPLATE_VERSION, size, shape, safeMargin, elements: [] };
  if (name !== undefined) template.name = name;
  elements.forEach((raw: unknown, i) => {
    const path = `/elements/${i}`;
    if (!isObject(raw)) {
      issues.push({ severity: "error", code: "invalid-type", path });
      return;
    }
    const element = readElement(new Reader(issues, path, raw));
    if (!element) return;
    for (const code of checkPlacement(element, template, printableWidth)) issues.push({ severity: "warning", code, path });
    template.elements.push(element);
  });
  return { template, issues };
}

function readSize(parent: Reader): NormalizedTemplate["size"] | undefined {
  const r = parent.child("size");
  if (!r) return undefined;
  r.onlyKeys(KEYS.size);
  const size = { width: r.number("width", SIZE_RANGE), height: r.number("height", SIZE_RANGE) };
  return r.ok ? size : undefined;
}

function readShape(parent: Reader, size: NormalizedTemplate["size"]): Shape | undefined {
  const r = parent.child("shape", true);
  if (!r) return parent.obj.shape === undefined ? { kind: "rectangle" } : undefined;
  const kind = r.oneOf("kind", ["rectangle", "rounded", "circle"] as const);
  if (kind !== "rounded") {
    r.onlyKeys(["kind"]);
    return r.ok ? { kind } : undefined;
  }
  r.onlyKeys(["kind", "radius"]);
  const radius = r.number("radius", { above: 0, max: Math.min(size.width, size.height) / 2 });
  return r.ok ? { kind, radius } : undefined;
}

function readElement(r: Reader): NormalizedElement | undefined {
  const type = r.obj.type;
  if (typeof type !== "string") {
    r.error(type === undefined ? "required" : "invalid-type", r.at("type"));
    return undefined;
  }
  if (type !== "text" && type !== "qr" && type !== "line") {
    r.warn("unknown-element");
    return undefined;
  }
  r.onlyKeys(KEYS[type]);

  const id = r.string("id", { optional: true });
  const box = {
    ...(id === undefined ? {} : { id }),
    x: r.number("x", {}),
    y: r.number("y", {}),
    width: r.number("width", SIZE_RANGE),
    height: r.number("height", SIZE_RANGE),
  };

  if (type === "line") return r.ok ? { type, ...box } : undefined;

  // Every field is read before anything is returned, so one pass reports all of an element's issues.
  const content = readContent(r);
  if (type === "qr") {
    const level = r.oneOf("level", ["L", "M", "Q", "H"] as const, DEFAULTS.level);
    return r.ok && content ? { type, ...box, content, level } : undefined;
  }
  const font = readFont(r);
  const fields = {
    letterSpacing: r.number("letterSpacing", LIMITS.letterSpacing, DEFAULTS.letterSpacing),
    lineSpacing: r.number("lineSpacing", LIMITS.lineSpacing, DEFAULTS.lineSpacing),
    align: r.oneOf("align", ["left", "center", "right"] as const, DEFAULTS.align),
    verticalAlign: r.oneOf("verticalAlign", ["top", "middle", "bottom"] as const, DEFAULTS.verticalAlign),
    wrap: r.boolean("wrap", DEFAULTS.wrap),
    fit: r.oneOf("fit", ["shrink", "none"] as const, DEFAULTS.fit),
    minSize: r.number("minSize", { above: 0, max: LIMITS.maxFontSize }, DEFAULTS.minSize),
    reverse: r.boolean("reverse", DEFAULTS.reverse),
  };
  if (!r.ok || !content || !font) return undefined;
  return { type, ...box, content, font, ...fields, minSize: Math.min(fields.minSize, font.size) };
}

function readFont(parent: Reader): NormalizedFontSpec | undefined {
  const r = parent.child("font");
  if (!r) return undefined;
  r.onlyKeys(KEYS.font);
  const family = r.string("family", { nonEmpty: true });
  const size = r.number("size", { above: 0, max: LIMITS.maxFontSize });
  const bold = r.boolean("bold", DEFAULTS.bold);

  const fallback: string[] = [];
  const list = r.obj.fallback;
  if (list !== undefined && !Array.isArray(list)) r.error("invalid-type", r.at("fallback"));
  else if (list && list.length > LIMITS.maxFallbackFonts) r.error("out-of-range", r.at("fallback"));
  else if (list) {
    list.forEach((name: unknown, i) => {
      if (typeof name !== "string") r.error("invalid-type", `${r.at("fallback")}/${i}`);
      else if (name.length === 0) r.error("out-of-range", `${r.at("fallback")}/${i}`);
      else fallback.push(name);
    });
  }
  return r.ok && family !== undefined ? { family, size, bold, fallback } : undefined;
}

function readContent(parent: Reader): Content | undefined {
  const r = parent.child("content");
  if (!r) return undefined;
  if ("text" in r.obj) {
    r.onlyKeys(["text"]);
    const text = r.string("text");
    return r.ok && text !== undefined ? { text } : undefined;
  }
  if (!("bind" in r.obj) && !("bindIndex" in r.obj)) {
    r.error("required", r.at("text"));
    return undefined;
  }
  r.onlyKeys(["bind", "bindIndex"]);
  const bind = r.string("bind", { optional: true, nonEmpty: true });
  const index = r.obj.bindIndex;
  if (index !== undefined && (typeof index !== "number" || !Number.isInteger(index))) r.error("invalid-type", r.at("bindIndex"));
  else if (typeof index === "number" && index < 0) r.error("out-of-range", r.at("bindIndex"));
  if (!r.ok) return undefined;
  const bindIndex = index as number | undefined;
  if (bind === undefined) return bindIndex === undefined ? undefined : { bindIndex };
  return bindIndex === undefined ? { bind } : { bind, bindIndex };
}
