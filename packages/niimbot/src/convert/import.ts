import { TEMPLATE_VERSION, validateTemplate, type Element, type IssueCode, type Template } from "@spokospace/labels-render";
import type {
  ImportFailure,
  ImportOptions,
  ImportResult,
  ImportSource,
  ImportWarning,
  ImportedTemplate,
} from "../types.js";
import { ElementContext, get, isObject, present } from "./context.js";
import { convertElement } from "./element.js";
import { convertSize, isValidSize } from "./size.js";

/** A validator path inside one element: "/elements/3" or "/elements/3/font/size". */
const ELEMENT_PATH = /^\/elements\/(\d+)(?:\/|$)/;

const nameOf = (raw: unknown): string | undefined => {
  const name = isObject(raw) ? get(raw, "name") : undefined;
  const trimmed = typeof name === "string" ? name.trim() : "";
  return trimmed.length > 0 ? trimmed : undefined;
};

function sourceOf(raw: unknown, index: number): ImportSource {
  const name = nameOf(raw);
  return name === undefined ? { index } : { index, name };
}

type Outcome = Omit<ImportedTemplate, "source"> | Omit<ImportFailure, "source">;

function importOne(raw: unknown, options: ImportOptions): Outcome {
  if (!isObject(raw)) return { code: "invalid-input" };
  const rawElements = get(raw, "elements");
  if (!Array.isArray(rawElements)) return { code: "invalid-input" };
  const size = convertSize(raw, options.defaultSize);
  if (!size) return { code: "unknown-size" };

  // Warnings are kept per Niimbot element so the validator's findings land in element order too.
  const warnings: ImportWarning[][] = Array.from(rawElements, () => []);
  const elements: Element[] = [];
  /** For each converted element, the index of the Niimbot element it came from. */
  const origin: number[] = [];
  // An index loop, not forEach: a hole in a host-built sparse array is reported like any non-object.
  for (let i = 0; i < rawElements.length; i++) {
    const rawElement: unknown = rawElements[i];
    const path = `/elements/${i}`;
    const sink = warnings[i] as ImportWarning[];
    if (!isObject(rawElement)) {
      sink.push({ code: "invalid-element", path, issue: "invalid-type" });
      continue;
    }
    const element = convertElement(new ElementContext(rawElement, path, options, sink));
    if (element) {
      elements.push(element);
      origin.push(i);
    }
  }

  const name = nameOf(raw);
  const template: Template = name === undefined
    ? { version: TEMPLATE_VERSION, size, elements }
    : { version: TEMPLATE_VERSION, name, size, elements };

  // The validator checks the result; the converted object (not its normalized copy) is what is emitted.
  const { template: checked, issues } = validateTemplate(template);
  const errors = issues.filter((issue) => issue.severity === "error");
  if (!checked) return { code: "invalid-template", issues: errors };

  const rejected = new Map<number, IssueCode>();
  for (const error of errors) {
    const k = Number(ELEMENT_PATH.exec(error.path)?.[1]);
    if (Number.isInteger(k) && !rejected.has(k)) rejected.set(k, error.code);
  }
  for (const [k, issue] of rejected) {
    const i = origin[k] as number;
    warnings[i]?.push({ code: "invalid-element", path: `/elements/${i}`, issue });
  }
  template.elements = elements.filter((_, k) => !rejected.has(k));

  return { template, warnings: warnings.flat() };
}

/**
 * Converts templates designed in the NIIMBOT desktop app into `@spokospace/labels-render` v1 templates.
 * Each template is converted on its own: one that cannot be converted becomes an entry in `failures` and
 * never stops the rest. Every emitted template passes `validateTemplate()` without errors, and the same
 * input and options always give the same output.
 *
 * Throws `TypeError` only for a host bug: `input` that is not an array, or an invalid `defaultSize`.
 */
export function importTemplates(input: readonly unknown[], optionsArg?: ImportOptions | null): ImportResult {
  if (!Array.isArray(input)) throw new TypeError("importTemplates: input must be an array of Niimbot templates");
  if (present(optionsArg) && !isObject(optionsArg)) {
    throw new TypeError("importTemplates: options must be an object");
  }
  const options: ImportOptions = optionsArg ?? {};
  if (present(options.defaultSize) && !isValidSize(options.defaultSize)) {
    throw new TypeError("importTemplates: defaultSize must be { width, height } in mm, each in (0, 300]");
  }

  const result: ImportResult = { templates: [], failures: [] };
  input.forEach((raw: unknown, index) => {
    const source = sourceOf(raw, index);
    let outcome: Outcome;
    try {
      outcome = importOne(raw, options);
    } catch {
      // Defensive: data the converters did not anticipate (a getter that throws, a proxy) fails one template.
      outcome = { code: "invalid-input" };
    }
    if ("template" in outcome) result.templates.push({ source, ...outcome });
    else result.failures.push({ source, ...outcome });
  });
  return result;
}
