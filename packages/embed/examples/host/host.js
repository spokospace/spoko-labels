// The example host's own script, loaded once in <head>. It does what a real panel does:
// - navigation in place, like Livewire's wire:navigate: a cancelable "livewire:navigate" event on document,
//   then the <body> is replaced with the fetched page's (labels-embed refuses navigation while printing);
// - "Print label" buttons that pass a record to window.spokoLabels.printLabels().
// Clicks are handled by delegation on document, so they keep working after every body swap.
import { TEMPLATES } from "./templates.js";

const rowOf = (tr) => JSON.parse(tr.dataset.record);

function print(type, rows, title) {
  window.spokoLabels.printLabels({ template: TEMPLATES[type], rows, title }).then((outcome) => console.log("printed", outcome));
}

async function navigate(url, push = true) {
  const event = new CustomEvent("livewire:navigate", { cancelable: true, detail: { url } });
  if (!document.dispatchEvent(event)) return;
  const html = await (await fetch(url)).text();
  const next = new DOMParser().parseFromString(html, "text/html");
  document.title = next.title;
  document.body.replaceWith(document.importNode(next.body, true));
  if (push) history.pushState({}, "", url);
}

document.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const link = target?.closest("a[data-nav]");
  if (link) {
    event.preventDefault();
    void navigate(link.href);
    return;
  }
  const one = target?.closest("[data-print-one]");
  if (one) {
    const row = rowOf(one.closest("tr"));
    print(one.dataset.printOne, [row], row.name);
    return;
  }
  const selected = target?.closest("[data-print-selected]");
  if (selected) {
    const rows = [...document.querySelectorAll("tr[data-record]")].filter((tr) => tr.querySelector("input:checked")).map(rowOf);
    if (rows.length > 0) print(selected.dataset.printSelected, rows, `${rows.length} etykiet`);
    return;
  }
  if (target?.closest("[data-morph]")) {
    // Replaces every element of the bar with a fresh copy, as a Livewire morph can.
    const bar = document.getElementById("topbar");
    bar.replaceChildren(...[...bar.children].map((child) => child.cloneNode(true)));
  }
});

window.addEventListener("popstate", () => void navigate(location.href, false));
