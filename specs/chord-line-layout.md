# Chord line layout rules

How chords are placed on the line above the lyrics.

## Inline chords during a lyric line

Each chord is positioned by `findPosForTick()` over the syllable map of the
line. If a chord lands in the second half of a gap between two syllables, it
snaps to the next syllable (so the chord clearly belongs to the syllable that
sounds it). See `lib/formatter.js` and `test/formatter.test.js` (`gap` tests).

## Trailing chords (between two consecutive lyric lines)

When chords appear in the gap between the end of one line and the start of the
next, the formatter has two options:

1. **Append** them to the chord line above the line that just ended.
2. **Emit a separate instrumental line** below the lyric.

The decision is **width-based**: if `lineLength + 2 + trailingChordsWidth <= 70`
the chords are appended; otherwise they go to a separate line.

```
                 Do                           Re7 Dom Re7 Dom Re7
para que me acariciaste diciendo que, eeee eeee,    <- 38 + 2 + ~21 = 61 chars, fits
```

vs.

```
aaaaas si en tu pecho se encontraba otro hom bre que, eeeeeeee,
Dom  Re7  Dom  Re7                                  <- 62 + 2 + 18 = 82 chars, separate
```

This replaces the previous hardcoded 4-chord threshold and lets short
"passing chord" sequences stay attached to the line they belong to.

Tests: `test/formatter.test.js`

- `formatPerfLines: 5 short trailing chords on a short line are appended`
- `formatPerfLines: 4 long chord names on a long line go to separate line`
- `formatPerfLines: trailing chords exactly at width boundary`

## Inline text annotations as chord tokens

`StaffText`, `Expression` and `PlayTechAnnotation` placed on the harmony staff
are rendered as chord tokens in the chord line. Multi-word text would otherwise
look like several chords (`Staff text` -> two tokens), so internal whitespace is
collapsed to `-` (`Staff-text`, `molto-rit.`, `harmonics`).

Tests:

- `test/extract-chords-types.test.js` -> `inline text with internal whitespace is collapsed to '-'`
- `test/xml-chord-reader.test.js` -> `extractChords picks up StaffText, Expression and PlayTechAnnotation as chord text`
- `test/formatter.test.js` -> `xml-extractor: StaffText with internal whitespace collapses to '-'`

## Punctuation sticks to the previous syllable

When a "word" coming out of the syllable builder is just a punctuation token
(e.g. when the user wrote `que. ,` in the score and the syllabic chain made the
comma its own word), the line builder skips the inter-word space so the
punctuation sticks to the previous syllable: `que.,` instead of `que. ,`.

Punctuation characters that trigger this: `, . ; : ! ?` plus the unicode
variants the formatter already treats specially (`\u2026` `\uFE52` `\uFE50`
`\uFF0C`).

Tests: `test/line-builder.test.js`

- `buildLinesFromWords does not insert space before standalone punctuation`
- `buildLinesFromWords: punctuation rule covers . ; : ! ?`
- `buildLinesFromWords: ellipsis variants stick to previous syllable`
- `buildLinesFromWords: punctuation in a word with letters keeps the space`
