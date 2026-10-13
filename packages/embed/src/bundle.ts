// Entry of the self-contained browser bundle (dist/bundle/labels-embed.js). Unlike the package entry it has
// side effects: it registers the elements, installs window.spokoLabels, listens for spoko-labels:print and
// tries a silent reconnect.
import { defineElements, printerSession, printLabels, type PrintOutcome, type PrintRequest } from "./index.js";

declare const __LABELS_EMBED_VERSION__: string;
const VERSION = typeof __LABELS_EMBED_VERSION__ === "string" ? __LABELS_EMBED_VERSION__ : "dev";

interface Installed {
  version: string;
  session: typeof printerSession;
  printLabels: typeof printLabels;
}

const host = window as Window & { spokoLabels?: Installed };

if (host.spokoLabels) {
  // Evaluated again (another URL of the bundle): keep the first copy and its printer connection.
  if (host.spokoLabels.version !== VERSION) {
    console.warn(`labels-embed ${VERSION} not installed: ${host.spokoLabels.version} is already on this page; reload it.`);
  }
} else {
  host.spokoLabels = { version: VERSION, session: printerSession, printLabels };
  defineElements();
  // Server-driven hosts (a Livewire action: $this->dispatch('spoko-labels:print', template: …, rows: …)).
  window.addEventListener("spoko-labels:print", (event) => {
    const request = (event as CustomEvent<PrintRequest>).detail;
    printLabels(request).then(
      (outcome: PrintOutcome) => window.dispatchEvent(new CustomEvent("spoko-labels:printed", { detail: outcome })),
      (error: unknown) => console.error("labels-embed: spoko-labels:print was not printed", error),
    );
  });
  void printerSession.tryReconnect();
}
