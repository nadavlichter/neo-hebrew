# Hebrew font sources and licenses

Downloaded 2026-11-04 from the Google Fonts CSS service. These are unmodified, upstream WOFF2 Hebrew subsets. NEO restricts their CSS coverage to `U+0590–05FF, U+FB1D–FB4F, U+20AA, U+25CC`; the upstream binaries additionally include a few shared marks. No font-build tool is involved.

Frank Ruhl Libre (serif) and Noto Sans Hebrew (sans) are the body faces. A native review of the faces' quality is still open. All six upstream copyright/license texts are preserved in `fonts/`, with trailing whitespace removed and Suez One's CRLF line endings normalized to LF. Google Fonts lists both variable body families under OFL: [Frank Ruhl Libre metadata](https://raw.githubusercontent.com/google/fonts/main/ofl/frankruhllibre/METADATA.pb), [Noto Sans Hebrew metadata](https://raw.githubusercontent.com/google/fonts/main/ofl/notosanshebrew/METADATA.pb).

## Frank Ruhl Libre

- Asset: `fonts/frank-ruhl-libre-hebrew-var.woff2` (18,760 bytes).
- SHA-256: `882f7b8caedc3a52b54d8d848851c199e9f9e5dabda79928d1290082aa5e02bd`.
- [Upstream binary](https://fonts.gstatic.com/s/frankruhllibre/v23/j8_w6_fAw7jrcalD7oKYNX0QfAnPW7Ll4brkiY-xBg.woff2); [upstream OFL/copyright notice](https://raw.githubusercontent.com/google/fonts/main/ofl/frankruhllibre/OFL.txt); local notice: `fonts/LICENSE-FrankRuhlLibre.txt`.

## Noto Sans Hebrew

- Asset: `fonts/noto-sans-hebrew-var.woff2` (12,212 bytes).
- SHA-256: `30420f52f9569d1a89d5ee276a40e9d984808ae794eb91570b2a74e3d2275f09`.
- [Upstream binary](https://fonts.gstatic.com/s/notosanshebrew/v50/or30Q7v33eiDljA1IufXTtVf7V6RvEEdhQlk0LlGxCyaePiWTNzWNf72cWk.woff2); [upstream OFL/copyright notice](https://raw.githubusercontent.com/google/fonts/main/ofl/notosanshebrew/OFL.txt); local notice: `fonts/LICENSE-NotoSansHebrew.txt`.

## Bellefair

- Asset: `fonts/bellefair-hebrew-400.woff2` (3,932 bytes).
- SHA-256: `aceba60941a6c5eb64563c669406290f811aff830e64d715778ef17c473a9aa6`.
- [Upstream binary](https://fonts.gstatic.com/s/bellefair/v15/kJExBuYY6AAuhiXUxG1N-vo3huR_DaS8.woff2); [upstream OFL/copyright notice](https://raw.githubusercontent.com/google/fonts/main/ofl/bellefair/OFL.txt); local notice: `fonts/LICENSE-Bellefair.txt`.

## Karantina

- Asset: `fonts/karantina-hebrew-700.woff2` (2,836 bytes).
- SHA-256: `2e48e776414cfd20b597e8afed737ed0e8ab60d7779f8af91fa9f5c721eb5023`.
- [Upstream binary](https://fonts.gstatic.com/s/karantina/v13/buExpo24ccnh31GVMABxTC8v_fRPSC8ocrZI.woff2); [upstream OFL/copyright notice](https://raw.githubusercontent.com/google/fonts/main/ofl/karantina/OFL.txt); local notice: `fonts/LICENSE-Karantina.txt`.

## Secular One

- Asset: `fonts/secular-one-hebrew-400.woff2` (4,852 bytes).
- SHA-256: `987c75c573c9c46fbfda66580443b96e1b0b9619f9e3be16cf9ceb2c7b078b52`.
- [Upstream binary](https://fonts.gstatic.com/s/secularone/v14/8QINdiTajsj_87rMuMdKyqDgOOhZL4pL06U.woff2); [upstream OFL/copyright notice](https://raw.githubusercontent.com/google/fonts/main/ofl/secularone/OFL.txt); local notice: `fonts/LICENSE-SecularOne.txt`.

## Suez One

- Asset: `fonts/suez-one-hebrew-400.woff2` (6,460 bytes).
- SHA-256: `0f268f63ddc899c3c47b14617932450d636a630f7d392e9ae11b804c5f9c8fef`.
- [Upstream binary](https://fonts.gstatic.com/s/suezone/v15/taiJGmd_EZ6rqscQgOFMmouC-50xUK4.woff2); [upstream OFL/copyright notice](https://raw.githubusercontent.com/google/fonts/main/ofl/suezone/OFL.txt); local notice: `fonts/LICENSE-SuezOne.txt`.

## Mapping and mono availability

Body serifs use Frank Ruhl Libre 300–900, with Noto supplying only U+25CC (the standalone dotted circle missing from Frank Ruhl Libre); Jost and iA Writer Quattro use Noto Sans Hebrew 100–900. Literary drop caps use Frank Ruhl Libre, fantasy uses Bellefair, and sci-fi uses Noto Sans Hebrew. Anton/Bebas use Karantina Bold; Abril uses Suez One; Playfair/Cinzel/Baskerville use Frank Ruhl Libre at their declared weights; Oswald/Josefin use Secular One. Karantina, Suez One and Secular One are display pairings, not weight-compatible replacements for the Latin files.

No proportional Hebrew face was added to Courier Prime. Screenplays use `NEO Hebrew Mono`, local Courier New Hebrew at 0.6em pitch, and the manuscript's Courier PDF reuses it; Word uses Courier New directly. No new font binary is bundled. Its fallback on Linux and Android, which have no Courier New, is unverified.
