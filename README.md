# Lyrics and Chords Extractor

[Leer en Espanol](README.es.md)

MuseScore 4 extension that extracts lyrics with aligned chords from scores, generating text and PDF output for songbooks, rehearsal sheets, and chord charts. Also available as a Node.js CLI.

## Installation

1. Download `lyrics-extractor.mext` from the [latest release](https://github.com/manolo/lyrics-extractor/releases/latest)
2. Drag the `.mext` file onto MuseScore 4 (or double click it)
3. The extension appears in the toolbar and under **Extensions**

## Features

### Score health check
When the plugin opens, it analyzes the score and shows a status indicator:
- **Green**: score is correct, ready to extract
- **Orange**: issues detected with specific counts (synalepha, hyphens, syllabic chains, chord sync)

The **Fix** button corrects all issues automatically:
- Formats synalepha dots between vowels (da.es -> da&#x203F;es)
- Removes manual hyphens from syllables
- Repairs broken syllabic chains (begin/middle/end)
- Syncs chords from the principal staff to linked tab staves

### Lyrics and chords extraction
- Extracts lyrics with chord symbols aligned above the corresponding syllables
- Handles repeats, voltas, D.S., D.C., Coda, Fine
- Expands multi-verse sections (verse 0, verse 1, etc.)
- Abbreviates repeated sections with "..." or section labels
- Detects system text labels (INTRO, SOLISTA, ESTRIBILLO) and rehearsal marks as section markers
- Chord names follow the score's spelling setting (solfeo or anglo), no manual conversion needed
- Works from any tab, including excerpt/part views (uses masterScore automatically)

### Chord-only mode
For scores without lyrics (instrumentals), the plugin automatically shows the chord progression structured by sections, barlines, and repeat markers.

### Fretboard diagrams
Extracts chord fretboard diagrams from FBox frames (including guitar excerpts) and renders them graphically in the PDF header.

### PDF output
- Compact layout optimized for printing (A4, safe margins)
- Chords in green, lyrics in black, monospace alignment
- Optional: auto-fit to one page, line numbers, group header
- Fretboard diagrams in header with barres, markers, and fret numbers
- Open generated file directly from the plugin

### Plugin controls

| Control | Description |
|---------|-------------|
| **Fix** | Correct synalepha, hyphens, syllabic chains, chord sync |
| **Extract** | Extract lyrics with chords, show preview |
| **Copy** | Copy to clipboard |
| **Save TXT** | Save text file alongside the score |
| **Save PDF** | Save PDF alongside the score |
| **Debug** | Export raw data as JSON |

### Settings (persisted)

| Setting | Description |
|---------|-------------|
| Solfeo | Controls chord spelling for the fallback extractor |
| Full repeat | Expand all D.S./D.C. repeats even without new lyrics |

### PDF options (visible after extraction)

| Option | Description |
|--------|-------------|
| 1 page | Shrink to fit on one page (gaps, margins, then font) |
| Line numbers | Sequential numbers on lyric lines |
| No diagrams | Omit fretboard diagrams |
| Header | Group/band name (subtle, right-aligned) |

## Writing lyrics for best results

### Entering lyrics in MuseScore

| Action | Shortcut | Effect |
|--------|----------|--------|
| Enter lyrics mode | `Cmd+L` | Start typing lyrics on the selected note |
| Next note (same word) | `-` (hyphen) | Advance within the same word |
| Next note (new word) | `Space` | Complete the word and move on |
| Synalepha (vowel linking) | `.` between letters | `da.es` renders as `da es` |
| Add chord symbol | `Cmd+K` | Add a chord symbol above the staff |
| Add system text | `Cmd+Shift+T` | Add a section label (Intro, Estrofa, etc.) |

### Line breaks and punctuation

| In the score | After Fix | Output | Line break? |
|-------------|-----------|--------|-------------|
| `;` (semicolon) | `,` (fullwidth comma) | `,` | YES |
| `,,` (double comma) | `,` (small comma) | `,` | NO |
| `..` (double period) | `.` (small full stop) | `.` | NO |
| `...` (triple period) | `...` (ellipsis) | `...` | NO |
| `.` `!` `?` (single) | unchanged | unchanged | YES |

Automatic line breaks are triggered by sentence-ending punctuation, long rests (>= 4 beats), and section barlines. When in doubt, the extractor does NOT break. Use `;` to force a break.

### Section labels

Add System Text (`Cmd+Shift+T`) to mark sections. Labels control the output structure:
- **With labels:** breaks occur only at label boundaries
- **Single label in `|: :|`:** appears once (same section both passes)
- **Multiple labels in `|: :|`:** all re-emit on each pass
- **Numbered labels:** use `#` (e.g. `Estrofa #`) for `ESTROFA 1`, `ESTROFA 2`

### Verse numbering

For songs with repeat bars and different lyrics per pass, use MuseScore's verse number feature (verse 0, verse 1). The extractor expands repeats with the correct verse for each pass.

### Chord symbols

Add chords (`Cmd+K`) to any staff. The extractor auto-detects the staff with the most chord symbols. Linked/tab staves and hidden staves are excluded automatically. Chord names use the score's spelling setting (Format > Style > Chord Symbols).

## CLI Usage

The same extraction engine is available as a Node.js CLI (no additional dependencies).

```bash
node cli/index.js song.mscz                          # stdout
node cli/index.js song.mscz --save                   # save text file
node cli/index.js song.mscz --pdf --header "My Band" # generate PDF
node cli/index.js song.mscz --pdf --single --numbers  # PDF, one page, numbered
node cli/index.js song.mscz --chords-only             # chord progression only
```

### CLI Flags

| Flag | Description |
|------|-------------|
| `--save` | Save to `<score>-letra.txt` alongside the score |
| `--pdf` | Generate PDF to `<score>-letra.pdf` |
| `--single` | Shrink PDF to fit on one page |
| `--header <name>` | Group/band name for PDF header |
| `--numbers` | Add line numbers in PDF |
| `--no-diagrams` | Omit fretboard diagrams from PDF |
| `--chords-only` | Force chord-only mode (ignore lyrics) |
| `--anglo` | Force anglo chord names (C, D, E) |
| `--solfeo` | Force solfeo chord names (Do, Re, Mi) |
| `--full` | Write all D.S./D.C. repeats |
| `--debug` | Export raw extracted data as JSON |

By default, chord names use the score's own spelling setting. Use `--anglo` or `--solfeo` to override.

## Manual installation

| OS | Path |
|----|------|
| macOS | `~/Library/Application Support/MuseScore/MuseScore4/extensions/lyrics-extractor/` |
| Linux | `~/.local/share/MuseScore/MuseScore4/extensions/lyrics-extractor/` |
| Windows | `%LOCALAPPDATA%\MuseScore\MuseScore4\extensions\lyrics-extractor\` |

## Running tests

```bash
node --test test/*.test.js
```

260 tests covering extractors, formatting, repeats, navigation, PDF output, chord-only mode, spelling detection, fretboard diagrams, and integration.

## License

Copyright 2025 Manolo Carrasco (do2tis)
