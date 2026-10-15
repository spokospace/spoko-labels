import type { Shape } from "@spokospace/labels-render";
import type { MessageKey } from "../i18n/index.js";
import type { AppTemplate } from "./app-template.js";

// Made-up templates for 50 x 30 mm labels, each with made-up sample rows. No real product, person, place or
// code: names are obviously fictional, postal codes are 00-000 and links go to example.com.

export interface BuiltinTemplate extends AppTemplate {
  /** The name shown in the list, from the i18n dictionary. */
  name: MessageKey;
}

const LABEL = { width: 50, height: 30 };
// 50 x 30 mm gap labels have rounded corners of about 2 mm.
const ROUNDED: Shape = { kind: "rounded", radius: 2 };

const product: BuiltinTemplate = {
  id: "product",
  name: "templateProduct",
  template: {
    version: 1,
    name: "Product",
    size: LABEL,
    shape: ROUNDED,
    safeMargin: 1,
    elements: [
      { type: "text", x: 2, y: 2, width: 46, height: 9, content: { bind: "Name" }, font: { family: "HarmonyOS Sans", size: 4, bold: true }, wrap: true },
      { type: "line", x: 2, y: 12, width: 46, height: 0.3 },
      { type: "text", x: 2, y: 13.5, width: 29, height: 8, content: { bind: "Variant" }, font: { family: "HarmonyOS Sans", size: 3 }, wrap: true },
      {
        type: "text",
        x: 32,
        y: 13.5,
        width: 16,
        height: 8,
        content: { bind: "Price" },
        font: { family: "HarmonyOS Sans", size: 4.5, bold: true },
        align: "right",
        verticalAlign: "middle",
      },
      { type: "text", x: 2, y: 23, width: 46, height: 5, content: { bind: "SKU" }, font: { family: "Viga", size: 3.5 }, letterSpacing: 0.2, verticalAlign: "bottom" },
    ],
  },
  sampleRows: {
    en: [
      { Name: "Example Green Tea with Mint", Variant: "Tin 100 g, demo edition", Price: "$9.99", SKU: "DEMO-0001" },
      { Name: "Example Coffee Beans", Variant: "Bag 250 g, medium roast (sample)", Price: "€7.50", SKU: "DEMO-0002" },
      { Name: "Test Wildflower Honey", Variant: "Jar 400 g", Price: "£6.00", SKU: "DEMO-0003" },
    ],
    pl: [
      { Name: "Herbata Przykładowa, zielona z miętą", Variant: "Puszka 100 g, edycja demo", Price: "19,99 zł", SKU: "DEMO-0001" },
      { Name: "Kawa Przykładowa ziarnista", Variant: "Torebka 250 g, średnio palona (demo)", Price: "34,90 zł", SKU: "DEMO-0002" },
      { Name: "Miód Testowy wielokwiatowy", Variant: "Słoik 400 g", Price: "24,00 zł", SKU: "DEMO-0003" },
    ],
  },
};

const address: BuiltinTemplate = {
  id: "address",
  name: "templateAddress",
  template: {
    version: 1,
    name: "Address",
    size: LABEL,
    shape: ROUNDED,
    safeMargin: 1,
    elements: [
      { type: "text", x: 2.5, y: 2, width: 45, height: 6.5, content: { bind: "Name" }, font: { family: "HarmonyOS Sans", size: 4.5, bold: true } },
      { type: "text", x: 2.5, y: 9, width: 45, height: 5, content: { bind: "Street" }, font: { family: "HarmonyOS Sans", size: 3.5 } },
      { type: "text", x: 2.5, y: 14, width: 45, height: 5, content: { bind: "City" }, font: { family: "HarmonyOS Sans", size: 3.5 } },
      { type: "line", x: 2.5, y: 20.5, width: 45, height: 0.3 },
      {
        type: "text",
        x: 2.5,
        y: 22,
        width: 45,
        height: 5.5,
        content: { bind: "Note" },
        font: { family: "HarmonyOS Sans", size: 3, bold: true },
        verticalAlign: "middle",
      },
    ],
  },
  sampleRows: {
    en: [
      { Name: "Alex Example", Street: "1 Sample Street", City: "Exampleton 00000", Note: "Leave at the door" },
      { Name: "Sam Demo", Street: "7 Fictional Road", City: "Nowhere City 00001", Note: "Fragile: glass" },
      { Name: "Jordan Test", Street: "Apt 2, 12 Test Lane", City: "Sampleville 00002", Note: "Hand delivery only" },
    ],
    pl: [
      { Name: "Jan Przykładowy", Street: "ul. Testowa 1/2", City: "00-000 Przykładowo", Note: "Do rąk własnych" },
      { Name: "Anna Demo", Street: "ul. Fikcyjna 7", City: "00-001 Nibylandia", Note: "Ostrożnie: szkło" },
      { Name: "Ewa Testowa", Street: "ul. Próbna 12 m. 3", City: "00-002 Wzorcowo", Note: "Zostawić pod drzwiami" },
    ],
  },
};

const tool: BuiltinTemplate = {
  id: "tool",
  name: "templateTool",
  template: {
    version: 1,
    name: "Tool",
    size: LABEL,
    shape: ROUNDED,
    safeMargin: 1,
    elements: [
      { type: "text", x: 2, y: 2, width: 28, height: 12, content: { bind: "Tool" }, font: { family: "HarmonyOS Sans", size: 4, bold: true }, wrap: true },
      { type: "text", x: 2, y: 14.5, width: 28, height: 6.5, content: { bind: "ID" }, font: { family: "Viga", size: 5 }, verticalAlign: "middle" },
      {
        type: "text",
        x: 2,
        y: 22.5,
        width: 20,
        height: 5.5,
        content: { bind: "Place" },
        font: { family: "HarmonyOS Sans", size: 3.5, bold: true },
        reverse: true,
        align: "center",
        verticalAlign: "middle",
      },
      { type: "qr", x: 31, y: 6.5, width: 17, height: 17, content: { bind: "URL" }, level: "M" },
    ],
  },
  sampleRows: {
    en: [
      { Tool: "Example cordless drill 12 V", ID: "T-0001", Place: "Shelf A-1", URL: "https://example.com/tools/T-0001" },
      { Tool: "Example torque wrench, 1/2 inch", ID: "T-0002", Place: "Drawer B-2", URL: "https://example.com/tools/T-0002" },
      { Tool: "Demo spirit level 60 cm", ID: "T-0003", Place: "Wall C", URL: "https://example.com/tools/T-0003" },
    ],
    pl: [
      { Tool: "Wkrętarka testowa 12 V", ID: "T-0001", Place: "Półka A-1", URL: "https://example.com/tools/T-0001" },
      { Tool: "Klucz dynamometryczny demo 1/2 cala", ID: "T-0002", Place: "Szuflada B-2", URL: "https://example.com/tools/T-0002" },
      { Tool: "Poziomica demo 60 cm", ID: "T-0003", Place: "Ściana C", URL: "https://example.com/tools/T-0003" },
    ],
  },
};

const upright: BuiltinTemplate = {
  id: "upright",
  name: "templateUpright",
  template: {
    version: 1,
    name: "Storage bin (upright)",
    // Designed upright and printed across a 50 x 30 mm roll: the printed image is the design turned 90 degrees
    // clockwise, so the top of the design comes out on the right of the printed label.
    size: { width: 30, height: 50 },
    shape: ROUNDED,
    safeMargin: 1,
    printRotation: 90,
    elements: [
      {
        type: "text",
        x: 2,
        y: 2.5,
        width: 26,
        height: 9,
        content: { bind: "Bin" },
        font: { family: "HarmonyOS Sans", size: 6, bold: true },
        reverse: true,
        align: "center",
        verticalAlign: "middle",
      },
      {
        type: "text",
        x: 2,
        y: 13,
        width: 26,
        height: 13,
        content: { bind: "Contents" },
        font: { family: "HarmonyOS Sans", size: 3.6, bold: true },
        wrap: true,
        align: "center",
        verticalAlign: "middle",
      },
      { type: "qr", x: 5, y: 27.5, width: 20, height: 20, content: { bind: "Bin" }, level: "M" },
    ],
  },
  sampleRows: {
    en: [
      { Bin: "A-07", Contents: "M4 screws and washers (demo)" },
      { Bin: "B-12", Contents: "Example cable ties, assorted" },
      { Bin: "C-03", Contents: "Test fuses 5 A" },
    ],
    pl: [
      { Bin: "A-07", Contents: "Śrubki M4 i podkładki (demo)" },
      { Bin: "B-12", Contents: "Opaski zaciskowe demo, różne" },
      { Bin: "C-03", Contents: "Bezpieczniki testowe 5 A" },
    ],
  },
};

export const BUILTIN_TEMPLATES: readonly BuiltinTemplate[] = [product, address, tool, upright];
export const DEFAULT_TEMPLATE_ID = "product";

export function builtinTemplate(id: string): BuiltinTemplate | undefined {
  return BUILTIN_TEMPLATES.find((b) => b.id === id);
}
