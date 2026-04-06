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

### Entering lyrics in MuseScore

| Action | Shortcut | Effect |
|--------|----------|--------|
| Enter lyrics mode | `Cmd+L` | Start typing lyrics on the selected note |
| Next note (same word) | `-` (hyphen) | Advance to the next note within the same word (syllable separator) |
| Next note (new word) | `Space` | Complete the current word and move to the next note |
| Melisma (extend syllable) | `_` (underscore) | Extend the syllable over the next note without new text |
| Synalepha (vowel linking) | `.` between letters | `da.es` renders as `da es` (two syllables sung as one) |
| Add chord symbol | `Cmd+K` | Add a chord symbol above the staff |
| Add system text | `Cmd+Shift+T` | Add a section label (Intro, Estrofa, etc.) |

### Line breaks and punctuation

The extractor automatically detects line breaks based on the musical structure. You can also control line breaks explicitly:

| In the score | After Fix button | Output | Line break? |
|-------------|-----------------|--------|-------------|
| `;` (semicolon) | `，` (fullwidth comma) | `,` | YES (new line, same stanza) |
| `,,` (double comma) | `﹐` (small comma) | `,` | NO (same line) |
| `..` (double period) | `﹒` (small full stop) | `.` | NO (same line) |
| `...` (triple period) | `…` (ellipsis) | `…` | NO (same line) |
| `.` `!` `?` (single) | unchanged | unchanged | YES (end of sentence) |

**Automatic line breaks** are triggered by sentence-ending punctuation (`.` `!` `?`), long rests (>= 4 beats), and section barlines (end repeat `:|`, double barline, final barline).

**Stanza breaks** (blank line between sections) are determined by system text labels when present. Without labels, heuristic breaks occur at sentence ends followed by rests and uppercase starts.

**Principle:** When in doubt, the extractor does NOT break. Use `;` to force a break where needed.

### Synalepha (vowel linking)

Use a dot between vowels to indicate synalepha: `da.es` renders as `da es` (two syllables sung as one). The **Fix** button converts these to the undertie character (U+203F) for visual clarity in the score.

### Verse numbering

For songs with repeat bars and different lyrics per pass, add lyrics to verse 0 (first pass) and verse 1 (second pass) using MuseScore's verse number feature. The extractor automatically expands repeats with the correct verse for each pass. With 4 verses (0,1,2,3), a D.S. with playRepeats uses verses 2,3 on the second execution.

### Section labels

Add System Text (`Cmd+Shift+T`) to mark sections: "Intro", "Estrofa", "Estribillo", "Solista", "Subida", etc. Labels control the output structure:

- **With labels:** stanza breaks occur only at label boundaries (no heuristic breaks). Add more labels for more divisions.
- **Single label in `|: :|`:** appears once (both passes are the same section).
- **Multiple labels in `|: :|`:** all labels re-emit on each pass (sub-sections).
- **Repeated sections:** if a labeled section repeats identically (D.S./D.C.), only the label is shown (content abbreviated).
- **Numbered labels:** use `#` in the label text (e.g. `Estrofa #`) to get automatic numbering: `ESTROFA 1`, `ESTROFA 2`, etc. on each pass.

### Chord symbols

Add chord symbols (`Cmd+K`) to the staff used for chord extraction. The extractor auto-detects the staff with the most chord symbols. Linked/tab staves and hidden staves are automatically excluded.

### Navigation markers

D.S., D.C., Coda, Fine, Segno markers are automatically detected and used to build the correct playback order. The `playRepeats` property on D.S./D.C. jumps controls whether repeat bars are honored in the replay. When all verses are consumed, the replay wraps to verse 0 (song repeats with the same lyrics).

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

213 tests covering all modules: extractors, performance stream, word builder, line builder, formatter, navigation, PDF writer, orchestrator, and integration tests.

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
