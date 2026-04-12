# Lyrics and Chords Extractor

MuseScore 4 extension and Node.js CLI that extracts lyrics with aligned chords from .mscz scores. Generates plain text and PDF output suitable for songbooks, rehearsal sheets, and chord charts.

## What it does

- Extracts lyrics and chord symbols from MuseScore 4 scores
- Renders fretboard chord diagrams in PDF header (from FBox diagrams)
- Aligns chords above the corresponding syllables
- Handles repeats, voltas, D.S., D.C., Coda, Fine
- Expands multi-verse sections (verse 0, verse 1, etc.)
- Abbreviates repeated sections (estribillos) with "..." or section labels
- Detects system text labels (INTRO, SOLISTA, ESTRIBILLO, etc.) as section markers
- Converts chord names to solfeo (Do, Re, Mi) or anglo (C, D, E)
- Generates PDF with formatted output (optional auto-fit to one page)

## Installation

### MuseScore 4 Extension (recommended)

1. Download `lyrics-extractor.mext` from the [latest release](https://github.com/manolo/lyrics-extractor/releases/latest)
2. Drag the `.mext` file onto MuseScore 4 (or double click it)
3. The extension appears in the toolbar and under **Extensions**

### Manual installation

Clone or copy this repository to the extensions directory:

| OS | Path |
|----|------|
| macOS | `~/Library/Application Support/MuseScore/MuseScore4/extensions/lyrics-extractor/` |
| Linux | `~/.local/share/MuseScore/MuseScore4/extensions/lyrics-extractor/` |
| Windows | `%LOCALAPPDATA%\MuseScore\MuseScore4\extensions\lyrics-extractor\` |

Restart MuseScore after copying.

### CLI

Only requires Node.js (no additional dependencies).

```bash
node cli/index.js song.mscz
```

## CLI Usage

```bash
# Output to stdout
node cli/index.js song.mscz

# Save text file alongside the score
node cli/index.js song.mscz --save

# Generate PDF
node cli/index.js song.mscz --pdf

# PDF with header and auto-fit to one page
node cli/index.js song.mscz --pdf --single --header "My Band"

# List chords only (no lyrics needed)
node cli/index.js song.mscz --chords-only
```

### Flags

| Flag | Description |
|------|-------------|
| `--save` | Save to `<score>-letra.txt` alongside the score |
| `--pdf` | Generate PDF to `<score>-letra.pdf` |
| `--single` | Shrink PDF to fit on one page (reduces gaps, margins, then font) |
| `--header <name>` | Group/band name for PDF header (right-aligned) |
| `--numbers` | Add line numbers in PDF output |
| `--no-diagrams` | Omit fretboard diagrams from PDF |
| `--chords-only` | Output chord sequence only (no lyrics needed) |
| `--anglo` | Force anglo chord names (C, D, E) |
| `--solfeo` | Force solfeo chord names (Do, Re, Mi) |
| `--full` | Write all D.S./D.C. repeats even without new lyrics |
| `--debug` | Export raw extracted data as JSON |

By default, chord names use the score's own spelling setting (from Format > Style > Chord Symbols). Use `--anglo` or `--solfeo` to override.

### Examples

```bash
# Text to stdout
node cli/index.js ~/Music/Clavelitos.mscz

# Save text + PDF with header
node cli/index.js ~/Music/Clavelitos.mscz --save --pdf --header "Tuna de Madrid"

# PDF auto-fit to one page with line numbers
node cli/index.js ~/Music/HorasDeRonda.mscz --pdf --single --numbers

# Generate PDF from an existing text file
node cli/index.js lyrics.txt --pdf --header "My Band"

# Chord progression for a score without lyrics
node cli/index.js ~/Music/EspanaCani.mscz
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

- **Score health indicator**: green (OK) or orange (issues detected) with specific counts
- **Fix**: Fixes synalepha dots, hyphens, syllabic chains, syncs chords to linked staves
- **Extract**: Extracts lyrics with chords and shows preview (works from any tab, including excerpts)
- **Copy**: Copies to clipboard
- **Save TXT / Save PDF**: Saves alongside the score, with open and copy-path buttons
- **Debug**: Exports raw extracted data as JSON

### Settings (persisted)

- **Solfeo**: Use solfeo chord names (controls fallback spelling)
- **Full repeat**: Write all repeats even without new lyrics

### PDF options (visible after extraction)

- **1 page**: Auto-fit PDF to one page
- **Line numbers**: Add sequential numbers to lyric lines
- **No diagrams**: Omit fretboard diagrams
- **Header**: Group/band name (right-aligned, subtle)

## Running tests

```bash
node --test test/*.test.js
```

260 tests covering extractors, formatting, repeats, navigation, PDF output, chord-only mode, spelling detection, fretboard diagrams, and integration.

## Project structure

```
lyrics-extractor/
  manifest.json                # MuseScore 4 extension manifest
  ui/LyricsForm.qml            # Plugin UI (QML)
  lib/                         # Shared modules (QML + Node.js)
    constants.js               # Note names, TPC maps, tpcToChordName
    orchestrator.js            # Main pipeline coordinator
    formatter.js               # Chord+text rendering, chord line marker
    chord-formatter.js         # Chord-only mode (scores without lyrics)
    pdf-writer.js              # PDF generation (no dependencies)
    fretboard-renderer.js      # [Fretboard] PDF diagram rendering
    chord-utils.js             # Chord lookup functions
    word-builder.js            # Syllables to words, phrase breaks
    line-builder.js            # Words to lines, splitting, merging
    repeat-structure.js        # Repeat/volta section pairing
    performance-stream.js      # Flat syllable stream in singing order
    intro-chords.js            # Intro chord expansion with repeats
    navigation.js              # D.S./D.C./Coda playback plan
    text-utils.js              # HTML strip, synalepha, vowels
  extractors/
    musescore-extractor.js     # MuseScore QML API extractor
    xml-extractor.js           # XML parser extractor (CLI)
    fretdiagram-fallback.js    # [Fretboard] QML API workaround
    xml-chord-reader.js        # [Fretboard] XML parser for fallback
  cli/
    index.js                   # CLI entry point
    mscz-reader.js             # ZIP reader for .mscz files
    extract-chords.js          # [Fretboard] Node.js fallback helper
  test/                        # Unit and integration tests
    fixture.mscz               # Self-contained test score
```

Files tagged `[Fretboard]` are workarounds for MuseScore 4 QML API not exposing FretDiagram.harmony. They can be removed when the API is fixed.

## License

Copyright 2025 Manolo Carrasco (do2tis)
