// Lyrics Extractor for MuseScore
// Copyright (C) 2026 Manolo Carrasco (do2tis)
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Licensed under the GNU General Public License version 3 or later, with an
// additional attribution requirement under section 7(b): see LICENSE and ATTRIBUTION.md.

// ChordPro format converter
// Converts formatted text output (with chord line markers) to ChordPro syntax
// Shared between MuseScore extension and Node.js CLI

var CHORD_LINE_MARKER = "\u200B";

// --- Injected or auto-wired chord helpers ---
var _convertChord = null;
var _isChordName = null;
function setConvertChord(fn) { _convertChord = fn; }
function setIsChordName(fn) { _isChordName = fn; }

function toAnglo(name) {
    return _convertChord ? _convertChord(name, false) : name;
}

// A chord arrives here spelled for a reader's eye, because the text output and the PDF print the
// typographic signs: ♭ for a flat, ♯ for a sharp, ° for a diminished chord. A ChordPro file is
// read by other programs, and they know none of those: given [E♭maj9] a reader reports a chord it
// cannot parse. So the spelling goes back to the one the format is written in.
function toAscii(name) {
    return name
        .replace(/♭/g, "b")
        .replace(/♯/g, "#")
        .replace(/°/g, "dim");
}

// Chord lines also carry text annotations (staff text, expressions). ChordPro reads
// every [...] as a transposable chord, so annotations use the text-annotation form
// [*text] instead. An annotation is words, and keeps whatever it says.
function formatTag(name) {
    if (_isChordName && !_isChordName(name)) return "[*" + name + "]";
    return "[" + toAscii(name) + "]";
}

// Parse chord names and their column positions from a chord line
function parseChords(chordLine) {
    var chords = [];
    var i = 0;
    while (i < chordLine.length) {
        if (chordLine[i] !== " ") {
            var start = i;
            while (i < chordLine.length && chordLine[i] !== " ") i++;
            chords.push({ pos: start, name: toAnglo(chordLine.substring(start, i)) });
        } else {
            i++;
        }
    }
    return chords;
}

// Merge a chord line with the lyric line below it into ChordPro inline format
function mergeChordAndLyric(chordLine, lyricLine) {
    var chords = parseChords(chordLine);
    if (chords.length === 0) return lyricLine.replace(/\s+$/, "");

    // Separate inline chords (within lyric text) from trailing chords (beyond text end)
    var textLen = lyricLine.replace(/\s+$/, "").length;
    var inlineChords = [];
    var trailingChords = [];
    for (var c = 0; c < chords.length; c++) {
        if (chords[c].pos < textLen) {
            inlineChords.push(chords[c]);
        } else {
            trailingChords.push(chords[c]);
        }
    }

    // Insert inline chords right to left
    var result = lyricLine;
    for (var i = inlineChords.length - 1; i >= 0; i--) {
        result = result.substring(0, inlineChords[i].pos) + formatTag(inlineChords[i].name) + result.substring(inlineChords[i].pos);
    }
    // Collapse extra alignment spaces (added by expandTextForChords)
    result = result.replace(/ {2,}/g, " ").replace(/\s+$/, "");

    // Append trailing chords as space-separated chord markers
    for (var t = 0; t < trailingChords.length; t++) {
        result += " " + formatTag(trailingChords[t].name);
    }
    return result;
}

// Convert a chord-only line to ChordPro inline chords
function chordsToInline(chordLine) {
    var chords = parseChords(chordLine);
    return chords.map(function(c) { return formatTag(c.name); }).join(" ");
}

// The credit, as lines starting with "#", which ChordPro treats as source comments: they travel
// with the file and are there for whoever opens it, and no renderer prints them, so the sheet
// stays as clean as it was. There is nowhere in this format to be small or faint, and {copyright}
// is not the place either: that field is the copyright of the song, not of the tool that wrote
// the file. The PDF is where the credit is drawn, in the margin.
var CREDIT = [
    "# Lyrics Extractor for MuseScore",
    "# Copyright (C) 2026 Manolo Carrasco (do2tis)"
];

// Convert formatted text output to ChordPro format.
// options.key: key of the score, emitted as a {key:} directive.
function convert(text, options) {
    var lines = text.split("\n");
    var result = CREDIT.slice();
    var i = 0;
    var key = options && options.key ? toAscii(toAnglo(options.key)) : "";

    while (i < lines.length) {
        var line = lines[i];

        // Title: ==== TITLE ====
        var titleMatch = line.match(/^====\s+(.+?)\s+====$/);
        if (titleMatch) {
            result.push("{title: " + titleMatch[1] + "}");
            if (key) { result.push("{key: " + key + "}"); key = ""; }
            i++;
            continue;
        }

        // Section label: - LABEL -
        var labelMatch = line.match(/^-\s+(.+?)\s+-$/);
        if (labelMatch) {
            result.push("{comment: " + labelMatch[1] + "}");
            i++;
            continue;
        }

        // Chord line (starts with zero-width space marker)
        if (line.length > 0 && line.charAt(0) === CHORD_LINE_MARKER) {
            var chordLine = line.substring(1);
            var nextLine = (i + 1 < lines.length) ? lines[i + 1] : "";
            var nextIsLyric = nextLine.length > 0 &&
                nextLine.charAt(0) !== CHORD_LINE_MARKER &&
                !nextLine.match(/^-\s+.+\s+-$/) &&
                !nextLine.match(/^====/) &&
                nextLine.trim() !== "";

            if (nextIsLyric) {
                result.push(mergeChordAndLyric(chordLine, nextLine));
                i += 2;
            } else {
                result.push(chordsToInline(chordLine));
                i++;
            }
            continue;
        }

        // Pass through empty lines and plain text (abbreviated stanzas, etc.)
        result.push(line);
        i++;
    }

    return result.join("\n");
}

if (typeof exports !== "undefined") {
    _convertChord = require("./chord-utils").convertChord;
    _isChordName = require("./chord-utils").isChordName;
    exports.convert = convert;
    exports.setConvertChord = setConvertChord;
    exports.setIsChordName = setIsChordName;
}
