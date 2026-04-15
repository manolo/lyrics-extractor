# Section titles and chords: which MuseScore elements count?

This spec documents which MuseScore elements the extractor recognises as
**chords** (rendered above the syllables) and which as **section titles**
(rendered as `- LABEL -` between sections).

## Chords

| Element / XML tag | Type | Source of text | Notes |
|---|---|---|---|
| `Element.HARMONY` / `<Harmony>` | varies | `ann.text` (QML) or composed from `harmonyInfo/root` + `name` (XML) | Primary chord source |
| `Element.STAFF_TEXT` / `<StaffText>` | 52 | `ann.text` / `<text>` | Inline text on the harmony staff is treated as a chord |
| `Element.EXPRESSION` / `<Expression>` | 42 | `ann.text` / `<text>` | Same as StaffText; useful for expression marks like `rit.` placed above the chord line |
| `Element.FRET_DIAGRAM` / `<FretDiagram>` | 63 | `ann.harmonyPlainText` (QML 4.7+) or nested `<Harmony>` (XML) | Only if the diagram has a harmony |

Filtering rules:

- All chord candidates must sit on the harmony staff (auto-detected by
  `findStaves()`). When no harmony staff is found, candidates from any staff are
  accepted.
- Empty text never produces a chord.
- HTML markup in `text` is stripped before use.

## Section titles

| Element / XML tag | Type | Notes |
|---|---|---|
| `Element.STAFF_TEXT` / `<StaffText>` | 52 | Same element as the chord case; the same text can appear both as a chord (when on the harmony staff) and as a section title |
| `Element.SYSTEM_TEXT` / `<SystemText>` | varies | XML extractor restricts to staff 0 |
| `Element.REHEARSAL_MARK` / `<RehearsalMark>` | 60 | XML extractor restricts to staff 0 |

Rendering (`Formatter.renderLabel`):

- Uppercased: `Estrofa` -> `ESTROFA`
- `#` is replaced per-base counter -> `Estrofa #` becomes `ESTROFA 1`,
  `ESTROFA 2`, etc. Each base label keeps an independent counter, so
  `Estrofa #` and `Solista #` numbering does not interfere.
- Wrapped as `- TEXT -`.

`Element.MARKER` and `Element.JUMP` are extracted by `extractNavigation()` for
repeat handling and are **not** emitted as section titles.

## Tests covering this contract

- `test/extract-chords-types.test.js` (QML path via mock `curScore` + `Element`)
- `test/xml-extractor.test.js` (XML path: Expression, FretDiagram nested
  Harmony, RehearsalMark, staff-0 filter for section labels)
- `test/formatter.test.js` (`renderLabel` uppercase, `#` numbering,
  multi-counter independence)
