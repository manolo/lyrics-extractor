# Chord line layout rules

How chords are placed on the line above the lyrics.

## Inline chords during a lyric line

Each chord is positioned by `findPosForTick()` over the syllable map of the
line. If a chord lands in the second half of a gap between two syllables, it
snaps to the next syllable (so the chord clearly belongs to the syllable that
sounds it). See `lib/formatter.js` and `test/formatter.test.js` (`gap` tests).

## Trailing chords (between two consecutive lyric lines)

When chords appear in the gap between the end of one line and the start of the
next, they are **always appended** to the chord line above the line that just
ended, even if this overflows the 70-char per-line budget.

```
                 Do                           Re7 Dom Re7 Dom Re7
para que me acariciaste diciendo que, eeee eeee,    <- short, fits naturally
```

```
                                                                  Fa#7  Sim  Mi7  La
aaaaas si en tu pecho se encontraba otro hom bre que, eeeeeeee,    <- overflows but stays inline
```

The previous behaviour split long sequences into a separate "instrumental" chord
line below the lyric. That created orphan chord lines between stanzas which
confused readers about which verse the chords belonged to. Inline overflow is
the lesser evil.

Tests: `test/formatter.test.js`

- `formatPerfLines: 5 short trailing chords on a short line are appended`
- `formatPerfLines appends trailing chords inline even when they overflow width`
- `formatPerfLines: 4 long chord names append inline above the lyric`
- `formatPerfLines: trailing chords exactly at width boundary`
- `formatLines appends trailing chords inline even when they overflow width`
- `formatLines reports lastChordTick so orchestrator can dedup coda`

`formatLines` also returns `lastChordTick` (the highest tick at which a chord
was emitted, including trailing chords appended to the last line). The
orchestrator uses this to start its post-formatting coda block AFTER that tick,
avoiding the duplication where the same trailing chords appeared both on the
chord line and again on a separate "outro" line below.

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
