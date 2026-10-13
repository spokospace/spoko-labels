// Made-up templates, one per record type, as a host would store them (template v1 JSON). They bind by
// column name, so no `columns` are needed.

const text = (extra) => ({ type: "text", font: { family: "HarmonyOS Sans", size: 3.2 }, ...extra });

export const TEMPLATES = {
  tool: {
    version: 1,
    name: "Narzędzie",
    size: { width: 50, height: 30 },
    shape: { kind: "rounded", radius: 2 },
    elements: [
      text({ x: 2, y: 2.5, width: 28, height: 15, content: { bind: "name" }, font: { family: "HarmonyOS Sans", size: 3.6, bold: true }, wrap: true }),
      text({ x: 2, y: 19, width: 28, height: 4.5, content: { bind: "code" }, font: { family: "Inconsolata", size: 3.6, bold: true, fallback: ["HarmonyOS Sans"] } }),
      text({ x: 2, y: 24, width: 28, height: 4, content: { bind: "location" } }),
      { type: "qr", x: 31.5, y: 6.5, width: 16.5, height: 16.5, content: { bind: "url" }, level: "M" },
    ],
  },
  product: {
    version: 1,
    name: "Produkt / pojemnik",
    size: { width: 50, height: 30 },
    shape: { kind: "rounded", radius: 2 },
    elements: [
      text({ x: 2, y: 2, width: 46, height: 7, content: { bind: "code" }, font: { family: "Viga", size: 6, fallback: ["HarmonyOS Sans"] } }),
      { type: "line", x: 2.5, y: 9.5, width: 45, height: 0.4 },
      text({ x: 2.5, y: 11.4, width: 28, height: 11, content: { bind: "name" }, font: { family: "HarmonyOS Sans", size: 3.2, bold: true }, wrap: true }),
      text({ x: 2.5, y: 23.5, width: 28, height: 4, content: { bind: "location" } }),
      { type: "qr", x: 31.3, y: 11.3, width: 16.8, height: 16.8, content: { bind: "url" }, level: "M" },
    ],
  },
};
