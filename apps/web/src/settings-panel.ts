import { AXES, DEFAULT_OFFSET, loadOffset, OFFSET_LIMITS, saveOffset, validAxis, type Axis, type Offset } from "./calibration.js";
import { panelDialog, showDialog } from "./dialog.js";
import { el } from "./dom.js";
import type { HelpSection } from "./help.js";
import { applyTranslations, formatNumber, t, type MessageKey } from "./i18n/index.js";

// The printer settings panel: the calibration, x and y in mm, within the limits labels-core accepts, with
// "Reset to default" and a link to the calibration help. A valid value is used and remembered at once; an invalid
// one is marked and ignored, so the last valid value stays in use.

export interface SettingsPanel {
  open(): void;
  close(): void;
  /** The calibration printLabels gets. */
  offset(): Offset;
  refresh(): void;
  readonly element: HTMLDialogElement;
}

export interface SettingsPanelOptions {
  openHelp: (section: HelpSection) => void;
  /** For tests: where the calibration is read from and saved. */
  load?: () => Offset;
  save?: (offset: Offset) => boolean;
}

const LABELS: Record<Axis, MessageKey> = { x: "offsetX", y: "offsetY" };
const HINTS: Record<Axis, MessageKey> = { x: "offsetXHint", y: "offsetYHint" };

/** A plain decimal: an optional minus, digits, and a fraction after a point or a comma. */
const DECIMAL = /^-?\d+([.,]\d+)?$/;

/** A typed number: "0,5" counts as 0.5 (a Polish keyboard); anything else ("", "1e1", "0x1", " ") is not a number. */
export function readNumber(text: string): number {
  const trimmed = text.trim();
  return DECIMAL.test(trimmed) ? Number(trimmed.replace(",", ".")) : Number.NaN;
}

interface AxisField {
  input: HTMLInputElement;
  hint: HTMLElement;
  error: HTMLElement;
}

export function mountSettingsPanel(parent: HTMLElement, options: SettingsPanelOptions): SettingsPanel {
  const save = options.save ?? saveOffset;
  let offset = (options.load ?? loadOffset)();
  let saved = true;

  const { dialog, body, translate } = panelDialog("settings-panel", "settingsTitle");
  parent.append(dialog);

  const fields = {} as Record<Axis, AxisField>;
  const rows = AXES.map((axis) => {
    const input = el("input", { type: "text", inputMode: "decimal", id: `offset-${axis}`, autocomplete: "off" });
    const hint = el("p", { className: "hint", id: `offset-${axis}-hint` });
    const error = el("p", { className: "field-error", id: `offset-${axis}-error`, hidden: true });
    input.setAttribute("aria-describedby", `${hint.id} ${error.id}`);
    input.addEventListener("input", () => changed(axis));
    fields[axis] = { input, hint, error };
    const row = el("div", { className: "setting" });
    row.append(el("label", { htmlFor: input.id }, LABELS[axis]), input, hint, error);
    return row;
  });
  const defaults = el("p", { className: "hint" });
  const notSaved = el("p", { className: "field-error", hidden: true });
  notSaved.setAttribute("role", "status");
  const reset = el("button", { type: "button", className: "button" }, "resetDefault");
  const help = el("button", { type: "button", className: "link-button" }, "calibrationHelp");
  const buttons = el("div", { className: "sources" });
  buttons.append(reset, help);
  body.append(el("h3", {}, "calibrationHeading"), ...rows, defaults, buttons, notSaved);

  function showError(axis: Axis, invalid: boolean): void {
    const { input, error } = fields[axis];
    const { min, max } = OFFSET_LIMITS[axis];
    error.hidden = !invalid;
    error.textContent = invalid ? t("offsetInvalid", { min: formatNumber(min), max: formatNumber(max) }) : "";
    input.setAttribute("aria-invalid", String(invalid));
  }

  function showSaved(): void {
    notSaved.hidden = saved;
    notSaved.textContent = saved ? "" : t("offsetNotSaved");
  }

  function store(next: Offset): void {
    offset = next;
    saved = save(offset);
    showSaved();
  }

  function changed(axis: Axis): void {
    const value = readNumber(fields[axis].input.value);
    const valid = validAxis(axis, value);
    showError(axis, !valid);
    if (valid) store({ ...offset, [axis]: value });
  }

  /** The values in use, with the language's decimal separator. */
  function drawValues(): void {
    for (const axis of AXES) {
      fields[axis].input.value = formatNumber(offset[axis]);
      showError(axis, false);
    }
  }

  function drawText(): void {
    translate();
    applyTranslations(body);
    for (const axis of AXES) {
      const { min, max } = OFFSET_LIMITS[axis];
      fields[axis].hint.textContent = t(HINTS[axis], { min: formatNumber(min), max: formatNumber(max) });
      showError(axis, !fields[axis].error.hidden);
    }
    defaults.textContent = t("offsetDefault", { x: formatNumber(DEFAULT_OFFSET.x), y: formatNumber(DEFAULT_OFFSET.y) });
    showSaved();
  }

  reset.addEventListener("click", () => {
    store(DEFAULT_OFFSET);
    drawValues();
  });
  help.addEventListener("click", () => {
    dialog.close();
    options.openHelp("calibration");
  });

  drawValues();
  drawText();
  return {
    element: dialog,
    open(): void {
      // The fields show the values in use: an invalid entry left from last time is dropped.
      drawValues();
      showDialog(dialog);
      fields.x.input.focus();
    },
    close: () => dialog.close(),
    offset: () => offset,
    refresh(): void {
      drawText();
      // A valid entry is redrawn with the new language's separator; an invalid one stays as typed.
      for (const axis of AXES) if (fields[axis].error.hidden) fields[axis].input.value = formatNumber(offset[axis]);
    },
  };
}
