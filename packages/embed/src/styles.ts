/**
 * Gives a shadow root its styles as a constructed stylesheet, so hosts need no `style-src 'unsafe-inline'`.
 * Where constructed stylesheets are missing, a `<style>` element is the fallback.
 */
export function adoptStyles(root: ShadowRoot, css: string): void {
  if ("adoptedStyleSheets" in root && typeof CSSStyleSheet === "function" && "replaceSync" in CSSStyleSheet.prototype) {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    root.adoptedStyleSheets = [sheet];
    return;
  }
  const style = root.ownerDocument.createElement("style");
  style.textContent = css;
  root.append(style);
}

/** Shared look; hosts theme it through these custom properties. */
export const THEME = `
  :host {
    --_accent: var(--spoko-labels-accent, #2563eb);
    --_fg: var(--spoko-labels-fg, CanvasText);
    --_bg: var(--spoko-labels-bg, Canvas);
    --_radius: var(--spoko-labels-radius, 8px);
    color-scheme: light dark;
    font: inherit;
  }
  button, select, input { font: inherit; }
`;
