# Bundled fonts

These files ship unmodified, byte for byte as published by their sources. A test (`test/fonts.test.ts`) checks the SHA-256 of each file against this table, so a changed file fails the validation gate. Do not subset, convert or rename them.

| File | Family (`font.family`) | Face | License | Source |
|---|---|---|---|---|
| `Viga-Regular.ttf` | `Viga` | regular | SIL Open Font License 1.1, `OFL-Viga.txt` (Reserved Font Name "Viga") | [google/fonts `ofl/viga`](https://github.com/google/fonts/tree/90abd17b4f97671435798b6147b698aa9087612f/ofl/viga) at `90abd17b4f97671435798b6147b698aa9087612f` |
| `HarmonyOS_Sans_Medium.ttf` | `HarmonyOS Sans` | regular | HarmonyOS Sans Fonts License Agreement, `LICENSE-HarmonyOS-Sans.txt` | [openharmony/resources `fonts/`](https://github.com/openharmony/resources/tree/0d79cad76b37ba0f3ccb1323c83833c78e0860de/fonts) at `0d79cad76b37ba0f3ccb1323c83833c78e0860de` |
| `HarmonyOS_Sans_Bold.ttf` | `HarmonyOS Sans` | bold | HarmonyOS Sans Fonts License Agreement, `LICENSE-HarmonyOS-Sans.txt` | same as above |

| File | SHA-256 |
|---|---|
| `Viga-Regular.ttf` | `730ad2a38691ce19ee5aa9dd9ec84ae8737b2084b06eef13435a4facad9b063c` |
| `HarmonyOS_Sans_Medium.ttf` | `f6b009d07d8d894d55eadeb7080b4916c3a2c83ff3ee60bbe851e6698d73bafd` |
| `HarmonyOS_Sans_Bold.ttf` | `7f973862c42353c9cc372dc2ae891d12c9ea5fe2a01b449adaf1eade9b469b47` |

## HarmonyOS Sans

HarmonyOS Sans is © Huawei Device Co., Ltd. and is used under the HarmonyOS Sans Fonts License Agreement, which allows bundling and redistributing unmodified copies with software that is not itself font software. Its conditions, and how this package meets them:

1. A prominent notice that HarmonyOS Sans is used: the package README, and the UI of anything in this repository that shows rendered labels (the demo page, the web app).
2. No modifications: the files above are the originals (checked by hash).
3. Not distributed or sold on their own: they ship only inside `@spokospace/labels-render`.
4. The copyright notice and the agreement stay with every copy: `LICENSE-HarmonyOS-Sans.txt`.

If you take these files out of this package, the agreement's conditions apply to you directly.

## Metrics and coverage

`src/fonts/bundled.ts` holds each file's ascent and descent per em (`hhea` table) and the code point ranges of its `cmap`, read with fontTools:

- Viga: ascent 1.015, descent 0.329; Basic Latin, Latin-1 and a few more letters (it has Ł ł Ń ń but lacks ą ć ę ś ź ż, so Polish text falls back to HarmonyOS Sans).
- HarmonyOS Sans (both faces): ascent 0.928, descent 0.244; Latin (including Latin Extended-A, so every Polish letter), Greek, Cyrillic.
