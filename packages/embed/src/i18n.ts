import type { ErrorCode } from "@spokospace/labels-core";
import type { IssueCode } from "@spokospace/labels-render";

export type Lang = "pl" | "en";

const UI = {
  pl: {
    connect: "Połącz drukarkę",
    connecting: "Łączenie…",
    connected: "Drukarka: {name}",
    battery: "bateria {level}",
    printingProgress: "Drukuje {done}/{total}…",
    busyElsewhere: "Drukarka w użyciu w innej karcie",
    noBluetooth: "Brak Bluetooth",
    insecure: "Drukowanie wymaga HTTPS",
    disconnect: "Rozłącz",
    print: "Drukuj",
    cancel: "Anuluj",
    close: "Zamknij",
    copies: "Kopie",
    density: "Gęstość",
    label: "Etykieta {n} z {total}",
    previous: "Poprzednia etykieta",
    next: "Następna etykieta",
    preview: "Podgląd etykiety: {width} x {height} mm",
    progress: "Etykieta {done} z {total}",
    printed: "Wydrukowano etykiet: {printed}.",
    printedPartly: "Wydrukowano etykiet: {printed} z {total}. Etykieta {row}: {reason}",
    cancelled: "Anulowano. Wydrukowano etykiet: {printed}.",
    warnings: "Uwagi",
    noWarnings: "Brak uwag.",
    templateError: "Szablon jest nieprawidłowy: {issues}",
    loadingFonts: "Wczytywanie fontów…",
    chooserHint: "Wybierz drukarkę o nazwie zaczynającej się od B1 i kliknij Paruj. Najpierw zamknij aplikację NIIMBOT w telefonie.",
    harmonyNotice: "Font: HarmonyOS Sans © Huawei Device Co., Ltd.",
    navigationBlocked: "Trwa drukowanie; poczekaj na koniec albo je anuluj.",
  },
  en: {
    connect: "Connect printer",
    connecting: "Connecting…",
    connected: "Printer: {name}",
    battery: "battery {level}",
    printingProgress: "Printing {done}/{total}…",
    busyElsewhere: "Printer in use in another tab",
    noBluetooth: "No Bluetooth",
    insecure: "Printing needs HTTPS",
    disconnect: "Disconnect",
    print: "Print",
    cancel: "Cancel",
    close: "Close",
    copies: "Copies",
    density: "Density",
    label: "Label {n} of {total}",
    previous: "Previous label",
    next: "Next label",
    preview: "Label preview: {width} x {height} mm",
    progress: "Label {done} of {total}",
    printed: "Labels printed: {printed}.",
    printedPartly: "Labels printed: {printed} of {total}. Label {row}: {reason}",
    cancelled: "Cancelled. Labels printed: {printed}.",
    warnings: "Notes",
    noWarnings: "No notes.",
    templateError: "The template is not valid: {issues}",
    loadingFonts: "Loading fonts…",
    chooserHint: "Pick the printer whose name starts with B1, then Pair. Close the NIIMBOT phone app first.",
    harmonyNotice: "Font: HarmonyOS Sans © Huawei Device Co., Ltd.",
    navigationBlocked: "Printing is in progress; wait for it to finish or cancel it.",
  },
} as const satisfies Record<Lang, Record<string, string>>;

export type MessageKey = keyof (typeof UI)["en"];

const RETRY = {
  pl: "Coś poszło nie tak; spróbuj ponownie, a potem uruchom drukarkę ponownie.",
  en: "Something went wrong; try again, then restart the printer.",
};

/** Plain words for every labels-core error code. */
export const ERRORS: Record<Lang, Record<ErrorCode | "template" | "render" | "internal", string>> = {
  pl: {
    "bluetooth-unsupported": "Drukowanie wymaga Chrome lub Edge na komputerze albo Androidzie (w Brave włącz flagę Bluetooth).",
    "chooser-cancelled": "Nie wybrano drukarki.",
    "device-unreachable": "Nie można połączyć się z drukarką: może być połączona z telefonem. Zamknij aplikację NIIMBOT.",
    disconnected: "Drukarka się rozłączyła.",
    "no-response": RETRY.pl,
    refused: "Drukarka odrzuciła zlecenie; sprawdź, czy etykiety są włożone, a klapka zamknięta.",
    "print-timeout": "Drukarka nie skończyła na czas; sprawdź papier i spróbuj ponownie.",
    busy: RETRY.pl,
    aborted: "Anulowano.",
    "invalid-argument": RETRY.pl,
    protocol: RETRY.pl,
    template: "szablon jest nieprawidłowy",
    render: "nie udało się przygotować etykiety",
    internal: RETRY.pl,
  },
  en: {
    "bluetooth-unsupported": "Printing needs Chrome or Edge on a computer or Android (Brave: turn on its Bluetooth flag).",
    "chooser-cancelled": "No printer picked.",
    "device-unreachable": "The printer could not be reached: it may be connected to a phone. Close the NIIMBOT app.",
    disconnected: "The printer disconnected.",
    "no-response": RETRY.en,
    refused: "The printer refused the job; check that labels are loaded and the lid is closed.",
    "print-timeout": "The printer did not finish in time; check the paper and try again.",
    busy: RETRY.en,
    aborted: "Cancelled.",
    "invalid-argument": RETRY.en,
    protocol: RETRY.en,
    template: "the template is not valid",
    render: "the label could not be prepared",
    internal: RETRY.en,
  },
};

/** Plain words for every render warning and validation code. */
export const ISSUES: Record<Lang, Record<IssueCode, string>> = {
  pl: {
    "invalid-type": "wartość ma zły typ",
    required: "brakuje wymaganej wartości",
    "out-of-range": "wartość poza zakresem",
    "unsupported-version": "nieobsługiwana wersja szablonu",
    "unknown-element": "nieznany element, pominięty",
    "unknown-property": "nieznane pole, pominięte",
    "outside-label": "element wychodzi poza etykietę",
    "outside-safe-area": "treść poza bezpiecznym obszarem (rogi lub margines)",
    "outside-printable-area": "treść poza zasięgiem głowicy: nie wydrukuje się",
    "missing-column": "brak takiej kolumny w danych; pole puste",
    "value-truncated": "za długi tekst, obcięty do 2000 znaków",
    "missing-font": "brak fontu, użyto innego",
    "missing-glyphs": "żaden font nie ma wszystkich znaków tego tekstu",
    "text-overflow": "tekst nie mieści się w polu nawet w najmniejszym rozmiarze",
    "qr-empty": "pusta treść kodu QR, nic nie narysowano",
    "qr-too-long": "za dużo danych na kod QR, nic nie narysowano",
    "qr-too-small": "pole kodu QR za małe na pełne punkty",
  },
  en: {
    "invalid-type": "a value has the wrong type",
    required: "a required value is missing",
    "out-of-range": "a value is out of range",
    "unsupported-version": "unsupported template version",
    "unknown-element": "unknown element type, skipped",
    "unknown-property": "unknown property, ignored",
    "outside-label": "element reaches past the label",
    "outside-safe-area": "content outside the safe area (corners or margin)",
    "outside-printable-area": "content outside the print head: it will not print",
    "missing-column": "no such data column; printed empty",
    "value-truncated": "value too long, cut to 2000 characters",
    "missing-font": "font not available, another one is used",
    "missing-glyphs": "no font has every character of this text",
    "text-overflow": "text does not fit its box, even at the smallest size",
    "qr-empty": "QR content is empty, nothing drawn",
    "qr-too-long": "too much data for a QR code, nothing drawn",
    "qr-too-small": "QR box too small for whole dots per module",
  },
};

/** The option, else `<html lang>` (`pl-PL` → `pl`), else English. Read when it is needed, not at import. */
export function langOf(option?: string): Lang {
  const raw = (option ?? globalThis.document?.documentElement?.lang ?? "").toLowerCase();
  return raw.split("-")[0] === "pl" ? "pl" : "en";
}

/** A UI string with `{name}` placeholders filled in. */
export function t(lang: Lang, key: MessageKey, params: Record<string, string | number> = {}): string {
  return UI[lang][key].replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

/** The wording for an error code; unknown codes get the generic "try again". */
export function errorText(lang: Lang, code: string | undefined): string {
  const table = ERRORS[lang] as Record<string, string>;
  return (code !== undefined && Object.hasOwn(table, code) ? table[code] : undefined) ?? ERRORS[lang].internal;
}
