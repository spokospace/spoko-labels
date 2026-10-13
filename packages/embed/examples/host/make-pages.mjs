// Writes the example host's three pages (index, tools, products) from one layout, so they stay alike.
// Run it after editing the made-up records: node examples/host/make-pages.mjs
import { writeFileSync } from "node:fs";

const head = (title) => `<!doctype html>
<html lang="pl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} · labels-embed example host</title>
  <!-- Loaded once, as a host would after copying dist/bundle/ into its assets. data-navigate-track makes a
       Livewire app reload fully when the bundle's version changes. -->
  <script type="module" src="/dist/bundle/labels-embed.js" data-navigate-track></script>
  <script type="module" src="./host.js"></script>
  <link rel="stylesheet" href="./host.css">
</head>`;

const topbar = `  <header id="topbar">
    <strong>Made-up inventory</strong>
    <nav>
      <a href="./" data-nav>Start</a>
      <a href="./tools.html" data-nav>Narzędzia</a>
      <a href="./products.html" data-nav>Produkty</a>
    </nav>
    <spoko-printer-status></spoko-printer-status>
  </header>`;

const footer = `  <footer>
    <button type="button" data-morph>Re-render the top bar (like a Livewire morph)</button>
    <p>Example host for <code>@spokospace/labels-embed</code>. Every record here is made up. The page switches in place like Livewire's <code>wire:navigate</code>: the body is replaced, the printer connection stays.</p>
  </footer>`;

const escape = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const list = (type, rows) => `    <table>
      <thead><tr><th></th><th>Nazwa</th><th>Kod</th><th>Lokalizacja</th><th></th></tr></thead>
      <tbody>
${rows
  .map(
    (r) =>
      `        <tr data-record="${escape(JSON.stringify(r))}"><td><input type="checkbox" aria-label="Zaznacz: ${escape(r.name)}"></td><td>${escape(r.name)}</td><td>${r.code}</td><td>${escape(r.location)}</td><td><button type="button" data-print-one="${type}">Drukuj etykietę</button></td></tr>`,
  )
  .join("\n")}
      </tbody>
    </table>
    <p><button type="button" data-print-selected="${type}">Drukuj zaznaczone</button></p>`;

const tools = [
  { name: "Klucz dynamometryczny 1/2 cala", code: "N-0001", location: "Regał A-2", url: "https://example.invalid/t/1" },
  { name: "Wkrętarka akumulatorowa", code: "N-0002", location: "Regał A-3", url: "https://example.invalid/t/2" },
  { name: "Zestaw kluczy płaskich", code: "N-0003", location: "Szuflada 4", url: "https://example.invalid/t/3" },
];
const products = [
  { name: "Lampa przednia lewa", code: "P-1201", location: "Półka 3", url: "https://example.invalid/p/1201" },
  { name: "Pojemnik: śruby M6", code: "C-0042", location: "Półka 1", url: "https://example.invalid/c/42" },
  { name: "Czujnik ABS przód", code: "P-1202", location: "Półka 3", url: "https://example.invalid/p/1202" },
];

const page = (title, main) => `${head(title)}
<body>
${topbar}
  <main>
${main}
  </main>
${footer}
</body>
</html>
`;

const dir = new URL("./", import.meta.url);
writeFileSync(
  new URL("index.html", dir),
  page(
    "Start",
    `    <h1>Start</h1>
    <p>Connect the printer once with the chip in the top bar, then move between <a href="./tools.html" data-nav>Narzędzia</a> and <a href="./products.html" data-nav>Produkty</a> and print. The connection should stay.</p>
    <ol>
      <li>Close the NIIMBOT phone app and switch the B1 on with a 50 x 30 mm roll.</li>
      <li>Click "Połącz drukarkę" in the top bar, pick the printer whose name starts with B1, click Pair.</li>
      <li>Open a list, print one label, select a few rows and print them, then switch lists and print again.</li>
    </ol>`,
  ),
);
writeFileSync(new URL("tools.html", dir), page("Narzędzia", `    <h1>Narzędzia</h1>\n${list("tool", tools)}`));
writeFileSync(new URL("products.html", dir), page("Produkty", `    <h1>Produkty i pojemniki</h1>\n${list("product", products)}`));
