# Bundled fonts

The fonts that Niimbot templates use beyond the two `@spokospace/labels-render` bundles (HarmonyOS Sans and Viga). They ship unmodified, byte for byte as published by their sources, and never come from NIIMBOT's CDN. A test (`test/fonts.test.ts`) checks the SHA-256 of each file against this table, so a changed file fails the validation gate. Do not subset, convert or rename them.

All four families are under the SIL Open Font License 1.1. Each license file is copied unchanged from the same source as its font.

| File | Family (`font.family`) | Face | Niimbot code | License | Source |
|---|---|---|---|---|---|
| `Inconsolata-Regular.ttf` | `Inconsolata` | regular | `ZT021` | SIL OFL 1.1, `OFL-Inconsolata.txt` | [google/fonts `ofl/inconsolata/static`](https://github.com/google/fonts/tree/66928797f271fed5ee428544e7229685e2d90127/ofl/inconsolata/static) at `66928797f271fed5ee428544e7229685e2d90127` |
| `Inconsolata-Bold.ttf` | `Inconsolata` | bold | `ZT021` | same as above | same as above |
| `BalooPaaji-Regular.ttf` | `Baloo Paaji` | regular | `ZT348` | SIL OFL 1.1, `OFL-BalooPaaji.txt` | [EkType/Baloo release `1.443`](https://github.com/EkType/Baloo/releases/tag/1.443), asset `Baloo_1.443.zip`, file `Fonts/BalooPaaji-Regular.ttf`; license from [`OFL.txt`](https://github.com/EkType/Baloo/blob/e433fc2d0d3d9083e18bcb95403485c3335f541b/OFL.txt) at `e433fc2d0d3d9083e18bcb95403485c3335f541b` |
| `MarkaziText[wght].ttf` | `Markazi Text` | regular (variable, default instance) | `ZT063` | SIL OFL 1.1, `OFL-MarkaziText.txt` | [google/fonts `ofl/markazitext`](https://github.com/google/fonts/tree/66928797f271fed5ee428544e7229685e2d90127/ofl/markazitext) at `66928797f271fed5ee428544e7229685e2d90127` |
| `Cookie-Regular.ttf` | `Cookie` | regular | `ZT015` | SIL OFL 1.1, `OFL-Cookie.txt` (Reserved Font Name "Cookie") | [google/fonts `ofl/cookie`](https://github.com/google/fonts/tree/66928797f271fed5ee428544e7229685e2d90127/ofl/cookie) at `66928797f271fed5ee428544e7229685e2d90127` |

| File | SHA-256 |
|---|---|
| `Inconsolata-Regular.ttf` | `0f11ac40d1618e1aa1adb7322a14980a0b0c943421124022073f83236d15f0d5` |
| `Inconsolata-Bold.ttf` | `69deb4d3626bcdce00331458e62de49e0ae58236626841014939dd8c5119abb4` |
| `BalooPaaji-Regular.ttf` | `44f965b34616da8e9d83cf92633f9440f88571b01932cb4c2fa2716bd75565ab` |
| `MarkaziText[wght].ttf` | `424b7331681160ff2a4b209bfc356ea9564d429a7daea43ee4dc28de8ff4f9fe` |
| `Cookie-Regular.ttf` | `9daf3cc9e5efe1b65094cdf1f14729ef6f07a70c27ee0679bf7f544a828b080e` |

## Baloo Paaji v1

The NIIMBOT app uses Baloo Paaji version 1; `google/fonts` now carries only its successor, Baloo Paaji 2, under a different family name. The `BalooPaaji-Gurmukhi` folder of `EkType/Baloo` holds only design sources (VFB and feature files), so the compiled font comes from the project's own GitHub release `1.443`, the last v1 release (`version` file at `e433fc2`, the head of `master`, says 1.443, and so does the font's `head.fontRevision`). The release zip's `OFL.txt` is identical to the repository's.

## Metrics and coverage

`src/fonts/bundled.ts` holds each file's ascent and descent per em (`hhea` table) and the code point ranges of its `cmap`, read with fontTools 4.60.1. Every family covers all Polish letters.

| Family | Ascent | Descent | Coverage |
|---|---|---|---|
| Inconsolata (both faces) | 0.859 | 0.19 | Latin (Extended-A and Vietnamese), box drawing, arrows |
| Baloo Paaji | 1.157 | 0.604 | Latin (Extended-A and Vietnamese), Gurmukhi |
| Markazi Text | 0.839 | 0.361 | Latin (Extended-A and Vietnamese), Arabic |
| Cookie | 0.789 | 0.32 | Basic Latin, Latin-1 and a few more letters, including every Polish one |

Markazi Text is a variable font (weight 400 to 700). Canvas draws its default instance, 400; `bold: true` renders that regular face with render's `missing-font` warning, as for every family without a bold file.
