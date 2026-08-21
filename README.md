# Lyrics and Chords Extractor

[Leer en Espanol](README.es.md)

MuseScore 4 extension that extracts lyrics with aligned chords from scores, generating text and PDF output for songbooks, rehearsal sheets, and chord charts. Also available as a Node.js CLI.

![Plugin extracting lyrics and chords from a MuseScore score, showing text preview and PDF output with fretboard diagrams](docs/lyrics-extractor-txt-pdf.png)

**Legend:**

| # | Source / Output | Description |
|---|-----------------|-------------|
| 1 | Score | Lyrics on the melody staff (one syllable per note) |
| 2 | Score | Chord symbols on the accompaniment staff |
| 3 | Plugin | Extracted text preview with chords aligned over syllables |
| 4 | PDF | Generated PDF, ready to print or share |
| 5 | PDF | Song title rendered in large bold type |
| 6 | PDF | Fretboard diagrams for every unique chord used in the song |
| 7 | PDF | Section labels from rehearsal marks and system text (INTRO, ESTROFA, ESTRIBILLO) |
| 8 | PDF | Chord progression for instrumental sections (intro, interludes, outro) |
| 9 | PDF | Lyrics with each chord positioned exactly above the syllable where it changes |
| 10 | PDF | Optional sequential line numbers for easy rehearsal references |

## Installation

1. Download `lyrics-extractor.mext` from the [latest release](https://github.com/manolo/lyrics-extractor/releases/latest)
2. Drag the `.mext` file onto MuseScore 4 (or double click it)
3. The extension appears in the toolbar and under **Extensions**

## Features

![Plugin usage demo](docs/lyrics-extractor-video.gif)

The demo above shows a complete workflow: chord symbols are entered on the accompaniment staff, lyrics are typed on the voice staff using MuseScore's standard input (`.` for synalepha between vowels, `Space` to advance to the next word, `-` to split a word across notes, and punctuation like `,` `.` `;` to mark phrase boundaries). Once the score is ready, the plugin is launched, lyrics and chords are extracted with one click, and the formatted PDF is saved and opened automatically.

### Score health check
When the plugin opens, it analyzes the score and shows a status indicator:
- **Green**: score is correct, ready to extract
- **Orange**: issues detected with specific counts (synalepha, hyphens, syllabic chains, chord sync)

The **Fix** button corrects all issues automatically:
- Formats synalepha dots between vowels (da.es -> da&#x203F;es)
- Removes manual hyphens from syllables
- Repairs broken syllabic chains (begin/middle/end)
- Syncs chords from the principal staff of a part to the rest of its staves, typically its tablature copy
- Syncs VBox text fields (title, subtitle, composer, lyricist) to project properties

### Lyrics and chords extraction
- Extracts lyrics with chord symbols aligned above the corresponding syllables
- Handles repeats, voltas, D.S., D.C., Coda, Fine
- Expands multi-verse sections (verse 0, verse 1, etc.)
- Abbreviates repeated sections with "..." or section labels
- Detects system text labels (INTRO, SOLISTA, ESTRIBILLO) and rehearsal marks as section markers (auto-deduplicates when present on multiple staves). Two kinds of text are not section names and are skipped: a rehearsal mark whose text is the number of its own measure, which is how MuseScore names rehearsal references, and a label that is only a repeat count such as `3x` or `x3`, which the repeat barline already carries as its play count
- Chord names follow the score's spelling setting (solfeo or anglo), no manual conversion needed
- Works from any tab, including excerpt/part views (uses masterScore automatically)

### Staff text on the chord line
Staff text, expressions and play techniques from the accompaniment staff are printed on the chord line in brackets, so they read as words rather than as a chord: `(muy suave)`, `(8va 2nd time)`. When one shares a beat with a chord, both are printed, the chord first. The PDF gives them a colour of their own instead of the brackets, and ChordPro writes them as `[*muy suave]`, which a transposing app leaves alone. Inside the pipeline they travel in braces, which no chord notation uses, because a bracket is part of the chord vocabulary, `Mi7(b5)`: that is what lets the PDF know what to colour and ChordPro what to mark, and the brackets are put on last, for the reader. The **Staff texts** option, or `--no-annotations`, leaves them out.

### ChordPro export
**Save ChordPro** writes a `.cho` file, the format songbook apps read: chords inline in anglo spelling so any reader can transpose them, section labels as comments, and the title and key of the score as `{title:}` and `{key:}`.

### Orphan lyrics
A score with more lyric lines than the music has passes leaves the last ones unsung. The plugin says which line that is, and the **Orphan lyrics** option prints it after the music, ruled off, with the chords of its own bars above it.

### Chord-only mode
For scores without lyrics (instrumentals), the plugin automatically shows the chord progression structured by sections, barlines, and repeat markers.

### Fretboard diagrams
Extracts chord fretboard diagrams from FBox frames (including guitar excerpts) and renders them graphically in the PDF header. Where the QML API exposes `FretDiagram`, diagrams and chord names are read straight from the score in memory. That is [MuseScore PR 32996](https://github.com/musescore/MuseScore/pull/32996), merged in April 2026, after the 4.7 branch had already been cut: no 4.7.x release carries it. Until a release does, the plugin falls back to reading the `.mscz` from disk, which is why it asks for the directory your scores live in. The CLI always reads the file directly and needs neither.

### PDF output
- Compact layout optimized for printing (A4, safe margins)
- Chords in green, lyrics in black, monospace alignment
- Optional: auto-fit to one page, line numbers, header, footer
- Fretboard diagrams in header with barres, markers, and fret numbers
- Open generated file directly from the plugin

### Plugin controls

| Control | Description |
|---------|-------------|
| **Fix** | Correct synalepha, hyphens, syllabic chains, chord sync |
| **Staff** | Which staff's lyrics to read, when more than one has them. Automatic picks the one with the most syllables |
| **Extract** | Extract lyrics with chords, show preview |
| **Copy** | Copy extracted text to clipboard |
| **Save txt** | Save text file alongside the score and open it |
| **Save ChordPro** | Save a `.cho` file alongside the score |
| **Debug** | Export raw data as JSON |

### Settings (persisted)

Every option in the dialog is remembered between sessions, under the `LyricsExtractor` category.

| Setting | Description |
|---------|-------------|
| Solfeo | Convert chord names to solfeo (Do, Re, Mi) or anglo (C, D, E) |
| Full repeat | Expand all D.S./D.C. repeats even without new lyrics |
| Lyrics only | Omit the chord lines, keeping lyrics and section labels |
| Orphan lyrics | Print the lyric lines no pass of the score sings |
| Staff texts | Include staff text, expressions and play techniques on the chord line |
| Fit in 1 page, Line numbers, No chord diagrams | The PDF options below |
| Header, Footer | The PDF header and footer text |
| Scores directory | Where the plugin reads a `.mscz` from to find its chord diagrams |

### PDF options (visible after extraction)

| Option | Description |
|--------|-------------|
| Header | Right-aligned text on every PDF page (e.g. group name) |
| Footer | Centered text at the bottom of every page |
| Fit in 1 page | Auto-fit to one page (reduces gaps first, then font size) |
| Line numbers | Sequential numbers on lyric lines |
| No chord diagrams | Omit fretboard diagrams from the header |
| **Save** (PDF) | Save PDF alongside the score and open it |

## Where the plugin reads and writes

Two MuseScore decisions shape this, and it is worth knowing which is which.

**Writing is restricted to folders MuseScore knows about.** Since [PR 31066](https://github.com/musescore/MuseScore/pull/31066), `FileIO` refuses any path outside them: the user data folder (`Documents/MuseScore4`, which holds Scores, Plugins, SoundFonts, Styles and Templates), the system temp folder, and each folder set in *Preferences → Folders*. MuseScore's own application data is deliberately excluded, since it holds credentials, shortcuts and logs. A plugin cannot write next to an arbitrary file on your disk, and this one is no exception: **Save txt**, **Save pdf** and **Save ChordPro** write to

```
~/Documents/MuseScore4/Scores/<title>-lyrics.pdf
~/Documents/MuseScore4/<title>-lyrics.pdf      (if the first is not writable)
```

whatever folder the score itself came from, because the API tells a plugin neither the path of the open score nor the Scores folder you configured. The CLI has no such limit: it writes beside the score it was given.

**Reading the `.mscz` is what the chord diagram fallback needs**, for the reason above. The **Directory** field in the dialog is where it looks, in this order:

```
<Directory>/<score name>/<score name>.mscz     a folder per song
<Directory>/<score name>.mscz                  all of them together
<Directory>/**/<score name>.mscz               anywhere below, searched recursively
```

**So point both at the same place.** Keep your scores under `Documents/MuseScore4/Scores`, set *Preferences → Folders → Scores* to that folder, and set the plugin's **Directory** to it as well. Then the fallback finds the score that is open, and what the plugin saves lands where you go looking for it. If your scores live somewhere else, the fallback still works as long as **Directory** points there, but saved files will still appear under `Documents/MuseScore4/`.

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

The extractor splits lyrics into lines automatically based on punctuation, musical rests, section barlines, and line length. For best results, add explicit markers in the score:

| In the score | After Fix | Output | Line break? |
|-------------|-----------|--------|-------------|
| `;` (semicolon) | `,` (fullwidth comma) | `,` | YES (recommended) |
| `.` `!` `?` (single) | unchanged | unchanged | YES |
| `,,` (double comma) | `,` (small comma) | `,` | NO (continuation) |
| `..` (double period) | `.` (small full stop) | `.` | NO (continuation) |
| `...` (triple period) | `...` (ellipsis) | `...` | NO (continuation) |

**Automatic line splitting:** When lyrics lack explicit break markers, the extractor splits long lines at commas near the median verse length, at musical rest boundaries, and at double barlines. Lines that exceed the PDF page width (75 characters) are split at the best available pause, even if short.

**Tips for optimal results:**
- Use `;` (semicolon) in the lyrics to force a line break at any point. The Fix button converts it to a visually distinct fullwidth comma in the score, and it renders as a normal `,` in the output.
- Add **double barlines** between sections (Solista, Estribillo) to mark structural boundaries.
- Add **System Text** labels (`Cmd+Shift+T`) for section names. These control stanza breaks and label emission.
- Without any of the above, the extractor relies on heuristics (punctuation, rests, line length) which may produce suboptimal results on scores with long unbroken phrases.

### Section labels

Add System Text (`Cmd+Shift+T`) to mark sections. Labels control the output structure:
- **With labels:** breaks occur only at label boundaries
- **Single label in `|: :|`:** appears once (same section both passes)
- **Multiple labels in `|: :|`:** all re-emit on each pass
- **Numbered labels:** use `#` (e.g. `Estrofa #`) for `ESTROFA 1`, `ESTROFA 2`
- **Explicit sequence:** use `:` to list values (e.g. `Solista manolo:juan:pedro` produces `SOLISTA MANOLO`, `SOLISTA JUAN`, `SOLISTA PEDRO`). Works with numbers: `Estrofa 1:2`. Empty items between separators are ignored (`Estrofa 1::2::` = `Estrofa 1:2`). When the sequence is exhausted, the label is suppressed entirely

### Verse numbering

For songs with repeat bars and different lyrics per pass, use MuseScore's verse number feature (verse 0, verse 1). The extractor expands repeats with the correct verse for each pass.

### Chord symbols

Add chords (`Cmd+K`) to any staff. The extractor auto-detects the staff with the most chord symbols. Linked/tab staves and hidden staves are excluded automatically. Chord names use the score's spelling setting (Format > Style > Chord Symbols).

### Title detection

The plugin resolves the song title in this order:
1. **Project properties** (File > Project Properties > Title)
2. **VBox title** (the title text element in the score's top frame)
3. **File name** (derived from the .mscz file name, splitting camelCase/hyphens)

The **Fix** button also syncs VBox text fields (title, subtitle, composer, lyricist) to the project properties, so both stay in sync.

## CLI Usage

The same extraction engine is available as a Node.js CLI (no additional dependencies).

```bash
node cli/index.js song.mscz                          # stdout
node cli/index.js song.mscz --save                   # save text file
node cli/index.js song.mscz --pdf --header "My Band" # PDF with header
node cli/index.js song.mscz --pdf --footer "My Band" # PDF with footer
node cli/index.js song.mscz --pdf --single --numbers  # PDF, one page, numbered
node cli/index.js song.mscz --chords-only             # chord progression only
```

### CLI Flags

| Flag | Description |
|------|-------------|
| `--save` | Save to `<score>-lyrics.txt` alongside the score |
| `--pdf` | Generate PDF to `<score>-lyrics.pdf` |
| `--single` | Shrink PDF to fit on one page |
| `--header <name>` | Right-aligned header on every PDF page |
| `--footer <name>` | Centered footer on last PDF page |
| `--numbers` | Add line numbers in PDF |
| `--no-diagrams` | Omit fretboard diagrams from PDF |
| `--chords-only` | Force chord-only mode (ignore lyrics) |
| `--lyrics-only` | Output lyrics without chord lines above |
| `--chordpro` | Export as ChordPro format (.cho) |
| `--no-annotations` | Omit staff text and expressions from the chord line |
| `--orphan-lyrics` | Print lyric verses that no pass of the score sings |
| `--staff <name\|num>` | Extract lyrics from a specific staff (by index or instrument name) |
| `--anglo` | Force anglo chord names (C, D, E) |
| `--solfeo` | Force solfeo chord names (Do, Re, Mi) |
| `--compact` | Abbreviate a stanza that repeats, printing it once with `...` |
| `--check` | Check lyrics for issues (synalepha, hyphens, syllabic) |
| `--fix` | Fix lyrics issues, sync chords, sync VBox to project properties |
| `--debug` | Export raw extracted data as JSON |

By default, chord names use the score's own spelling setting. Use `--anglo` or `--solfeo` to override.

## Translating the dialog

The dialog reads its language from MuseScore. English lives in `ui/i18n/en.js` and is the
reference; every other language is a JSON file beside it, read when the plugin starts:

```
ui/i18n/en.js     English, imported by the dialog, so it is always there
ui/i18n/es.json   Spanish
ui/i18n/<code>.json   yours
```

To add one, copy the keys of `en.js` into `ui/i18n/<code>.json` as a JSON object, translate the
values, and drop the file into the installed extension. Nothing else to edit: the plugin looks
for `<language>_<REGION>.json` first, then `<language>.json`, matching what MuseScore reports.

A translation may be partial. Anything it does not carry is read from English, so a file with
ten keys in it is a perfectly good contribution, and a key that is missing everywhere shows as
its own name, `save.txtDone`, which says where to look.

`{placeholders}` are filled in at runtime and may be reordered as the language needs:

```json
"extract.summary": "{syllables} syllables, {chords} chords extracted"
```

`node --test test/unit/i18n.test.js` checks that every key the dialog asks for exists in
English, that a translation invents no keys and no placeholders, and prints how complete each
language is.

## Manual installation

| OS | Path |
|----|------|
| macOS | `~/Library/Application Support/MuseScore/MuseScore4/extensions/lyrics-extractor/` |
| Linux | `~/.local/share/MuseScore/MuseScore4/extensions/lyrics-extractor/` |
| Windows | `%LOCALAPPDATA%\MuseScore\MuseScore4\extensions\lyrics-extractor\` |

## Repository layout

```
lib/     transforms extracted data into text, PDF and ChordPro. Shared by the dialog
         and the CLI, and depends on nothing else in the tree
score/   reads a MuseScore score, and writes back into it, one module per direction
         and per source: api-extractor.js reads the score open in MuseScore through the
         QML API and api-patcher.js writes into it, which is what the Fix button does,
         while xml-extractor.js reads the XML of a .mscz and xml-patcher.js writes into
         it for the CLI. mscz-reader.js unzips the file, and fallback-runner.js runs the
         CLI when the plugin API cannot give the fret diagrams
cli/     the two entry points: index.js for the command line, and extract-chords.js,
         which the dialog spawns for that fallback
ui/      the dialog, its help page, and one file per language in ui/i18n/
test/    unit/ for the unit suites, its/ for the snapshot corpus and its
         baselines, and local/, when present, for a developer's own suite
```

Dependencies run one way: `score/` and `cli/` reach into `lib/`, never the reverse. Every
`.js` outside `cli/` works in both the QML engine and Node, which is why the same
formatting code serves the dialog and the command line. Modules that need a sibling get it
through `require` in Node and through an injected reference in QML (`setTextUtils`,
`setLineBuilder`, `setConvertChord`), since QML has no `require`.

## Running tests

```bash
npm test              # same as: node --test 'test/**/*.test.js'
npm run test:package  # build the package, then run that same suite against its minified CLI
```

925 tests covering score readers, formatting, repeats, navigation, PDF output, chord-only mode, spelling detection, fretboard diagrams, native API detection, the disk fallback, score file lookup, element type classification, chord line layout, punctuation handling, lyrics fixing, XML patching, label emission on repeat passes, and integration.

The unit suites are in `test/unit/`, one per module. Beside them, the snapshot suite compares CLI output against baseline `.txt` files:

```
test/its/scores/       the corpus, small .mscz files, committed
test/its/baselines/    what the CLI must print for each of them
```

Each score in the corpus exists to reach code the others do not: no lyrics at all, repeats that carry no lyrics, phrases that have to be split, chord spellings, section labels, instrumental intros and interludes, chord diagrams in the guitar part, staff text sharing a beat with a chord inside a repeat. How they were made is not the repository's business: they are the fixtures of record, and a maintainer may well have drawn one by hand in MuseScore.

`test/its/snapshot.js` drives them, and it is told nothing: a song is snapshotted because a baseline exists for it, and a mode runs because that mode's baseline exists. So adding a score is copying it in and generating its baselines, with no list to edit.

The modes are `compact`, `full`, `orphan` and `chordpro`, named in the baseline: `test_le_LongLines.full.txt`. The first three are what the CLI prints; `chordpro` is the `.cho` file it writes, taken on a copy of the score in a temporary directory so a run leaves nothing beside the corpus.

That is also what lets a developer keep a suite of their own beside it, in a folder git ignores whole:

```
test/local/scores/      frozen copies of real scores
test/local/baselines/   their baselines
test/local/generators/  scripts that write the corpus in test/its/scores
test/local/local.test.js
```

`npm test` is a recursive glob, so that suite runs when it is there and is not missed when it is not: nothing in `package.json` refers to it. Nothing about that music reaches the repository, and the generators stay there too, so what the corpus is worth is judged by what it covers rather than by how it was written.

`node test/its/coverage-gap.js` reports how much of `lib/` and `score/` only a local suite reaches, running the snapshots twice under coverage. It is the measure a new synthetic score has to move: writing them took the snapshot tests a contributor can run from 14 to 26, and the whole suite from a fresh checkout now covers 91.4% of lines and 90.0% of branches, against 91.4% and 90.0% with a local suite of twenty one real scores added: the corpus reaches what that music reaches.

Baselines are reviewed by hand: never regenerate one without checking whether the score itself changed (each baseline stores the `.mscz` mtime in a trailing comment).

`npm run test:package` is the run that matters before a release: it minifies, then drives the suite through the **packaged** CLI, so a minification that changes any output fails. The release workflow does the same thing a step at a time rather than calling it, because it has to package the real version first and must not have that tree rebuilt as a dev version underneath. It removes the staging directory afterwards either way: MuseScore reads a manifest from any subdirectory, so one left behind while developing makes the plugin appear twice in the Extensions menu.

## Building the .mext package

```bash
npm install --ignore-scripts   # once, for terser
npm run build                  # dev build
node build.js 2.0.3            # versioned build
node build.js dev --no-minify  # sources verbatim, to bisect a packaging problem
npm run install-local          # build and copy into the local MuseScore extensions dir
```

File names and relative paths in the package are the ones in this tree, so the QML imports resolve there exactly as they do here. Only runtime files are included (no tests or documentation).

The JavaScript is minified: comments and whitespace go and expressions are compressed, which takes the package from 156K to 103K. Identifiers are **not** mangled. That is deliberate: mangling once cost two shipping bugs, it makes the stack trace in a `console.log` only environment useless, and it would save just 9K more. `test/minify.test.js` holds those options in place by checking that the minified modules keep every export and every name the dialog calls. Read this repository for the sources, not the package.

The release workflow (`release.yml`) runs tests and then calls `build.js` with the version from the git tag.

## License

GNU General Public License, version 3 or later, the same license as MuseScore Studio itself. See
[LICENSE](LICENSE) for the license and [ATTRIBUTION.md](ATTRIBUTION.md) for the copyright and the
added term. Copyright (C) 2026 Manolo Carrasco (do2tis).

You may use, study, share and modify this, and you must pass those same freedoms on: a modified
version has to be free software too, with its source available.

One additional requirement, under section 7(b) of the license, and it is about credit only:

> You must preserve the author attribution in the dialog of the plugin, where it is displayed
> today, and in the credit line printed on every page of the documents the program generates.
> If you modify the program you may add your own attribution beside it, but you may not remove
> or obscure the original one.

Adding to the credit is welcome. Replacing it is the one thing this license does not allow.
