# Lyrics and Chords Extractor

MuseScore 4 extension and Node.js CLI that extracts lyrics with aligned chords from .mscz scores. Generates plain text and PDF output suitable for songbooks, rehearsal sheets, and chord charts.

## What it does

- Extracts lyrics and chord symbols from MuseScore 4 scores
- Aligns chords above the corresponding syllables
- Handles repeats, voltas, D.S., D.C., Coda, Fine
- Expands multi-verse sections (verse 0, verse 1, etc.)
- Abbreviates repeated sections (estribillos) with "..." or section labels
- Detects system text labels (INTRO, SOLISTA, ESTRIBILLO, etc.) as section markers
- Converts chord names to solfeo (Do, Re, Mi) or anglo (C, D, E)
- Generates PDF with formatted output (optional auto-fit to one page)

## Installation

### As MuseScore 4 Extension

Copy or symlink this directory to:

```
~/Library/Application Support/MuseScore/MuseScore4/extensions/lyrics-extractor/
```

Restart MuseScore. The extension appears under **Plugins > Lyrics > Lyrics and Chords**.

### CLI

Only requires Node.js (no additional dependencies).

```bash
chmod +x cli/index.js
```

## CLI Usage

```bash
# Output to stdout
cli/index.js song.mscz

# Save text file alongside the score
cli/index.js song.mscz --save

# Generate PDF
cli/index.js song.mscz --pdf

# PDF with header and auto-fit to one page
cli/index.js song.mscz --pdf --one-page --header "My Band"

# All flags work in any position
cli/index.js --pdf --one-page --save song.mscz
```

### Flags

| Flag | Description |
|------|-------------|
| `--save` | Save to `<score>-letra.txt` alongside the score |
| `--pdf` | Generate PDF to `<score>-letra.pdf` |
| `--one-page` | Shrink PDF to fit on one page (reduces gaps, margins, then font) |
| `--header <name>` | Group/band name for PDF header (right-aligned) |
| `--anglo` | Use anglo chord names (C, D, E) instead of solfeo |
| `--full` | Write all D.S./D.C. repeats even without new lyrics |
| `--debug` | Export raw extracted data as JSON |

### Examples

```bash
# Text to stdout
cli/index.js ~/Music/Clavelitos.mscz

# Save text + PDF with header
cli/index.js ~/Music/Clavelitos.mscz --save --pdf --header "Tuna de Madrid"

# PDF auto-fit to one page
cli/index.js ~/Music/HorasDeRonda.mscz --pdf --one-page

# Generate PDF from an existing text file
cli/index.js lyrics.txt --pdf --header "My Band"
```

## Writing lyrics for best results

The extractor works with any MuseScore score that has lyrics and chord symbols, but following these conventions produces the best output:

### Syllable separation

In MuseScore's lyrics input mode (`Cmd+L`), press `-` (hyphen) to advance to the next note within the same word, and `Space` to complete a word and move to the next note. This sets the syllabic types (begin/middle/end/single) correctly. Avoid typing hyphens directly in the lyric text.

### Synalepha (vowel linking)

Use a dot between vowels to indicate synalepha: `da.es` renders as `da es` (two syllables sung as one). The **Fix** button in the plugin converts these to the undertie character (U+203F) for visual clarity.

### Verse numbering

For songs with repeat bars and different lyrics per pass, add lyrics to verse 0 (first pass) and verse 1 (second pass) using MuseScore's verse number feature. The extractor automatically expands repeats with the correct verse for each pass.

### Section labels

Add System Text (`Cmd+Shift+T`, or Add > Text > System Text) to mark sections: "Intro", "Estrofa", "Estribillo", "Solista", "Subida", etc. These appear as section labels in the output and enable smart abbreviation of repeated sections.

### Chord symbols

Add chord symbols (`Cmd+K`, or Add > Text > Chord Symbol) to the staff that should be used for chord extraction. The extractor auto-detects the staff with the most chord symbols. Linked/tab staves are automatically excluded.

### Phrase separators

Use semicolons (`;`) in lyrics to indicate line breaks within the same stanza (no blank line). The **Fix** button converts these to fullwidth commas (U+FF0C) for visual distinction in the score. In the output, both semicolons and fullwidth commas are normalized to regular commas.

```
Score input:    "palabra;"        (user types semicolon)
After Fix:      "palabra，"       (fullwidth comma in the score)
Text output:    "palabra,"        (regular comma + new line)
                "palabra."        (if last line of stanza)
```

### No-break punctuation

Use double comma (`,,`) or double period (`..`) in lyrics to insert punctuation without triggering a line break. The **Fix** button converts these to small form variants for visual distinction.

```
,,  → ﹐ (U+FE50 small comma)   → output: ,  (no line break)
..  → ﹒ (U+FE52 small full stop) → output: .  (no line break)
... → … (U+2026 ellipsis)        → output: …  (no line break)
```

This allows phrases like `rosas.. y del sol` to stay on one line even when there is an instrumental interlude between the words.

### Navigation markers

D.S., D.C., Coda, Fine, Segno markers are automatically detected and used to build the correct playback order.

## Plugin UI

The MuseScore extension provides:

- **Fix**: Fixes synalepha dots, hyphens, syllabic chains, semicolons, suspension points, and syncs chords to linked staves
- **Extract**: Extracts lyrics with chords and shows preview
- **Copy**: Copies to clipboard
- **Save TXT**: Saves text file alongside the score
- **Save PDF**: Saves PDF alongside the score
- **Debug**: Exports raw extracted data as JSON for troubleshooting

### Settings (persisted)

- **Solfeo checkbox**: Use solfeo chord names (default on)
- **Full repeat checkbox**: Write all repeats even without new lyrics
- **PDF 1 page checkbox**: Auto-fit PDF to one page
- **PDF header field**: Group/band name for PDF header

## Running tests

```bash
node --test
```

184 tests covering all modules: extractors, performance stream, word builder, line builder, formatter, navigation, PDF writer, orchestrator, and integration tests.

## Project structure

```
lyrics-extractor/
  manifest.json              # MuseScore 4 extension manifest
  ui/LyricsForm.qml          # Plugin UI
  lib/                        # Shared modules (QML + Node.js)
    constants.js              # Note names, duration maps
    text-utils.js             # HTML strip, synalepha, vowels
    chord-utils.js            # Chord lookup, solfeo/anglo conversion
    word-builder.js           # Syllables to words, phrase breaks
    line-builder.js           # Words to lines, splitting, merging
    repeat-structure.js       # Repeat/volta section pairing
    performance-stream.js     # Flat syllable stream in singing order
    intro-chords.js           # Intro chord expansion with repeats
    navigation.js             # D.S./D.C./Coda playback plan
    formatter.js              # Chord+text rendering, abbreviation
    orchestrator.js           # Main pipeline
    pdf-writer.js             # PDF generation (no dependencies)
  extractors/
    musescore-extractor.js    # MuseScore plugin API extractor
    xml-extractor.js          # XML parser extractor (CLI)
  cli/
    index.js                  # CLI entry point
    mscz-reader.js            # ZIP reader for .mscz files
  test/                       # Unit and integration tests
```

## License

Copyright 2025 Manolo Carrasco (do2tis)
