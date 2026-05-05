// ChordPro format converter
// Converts formatted text output (with chord line markers) to ChordPro syntax
// Shared between MuseScore extension and Node.js CLI

var CHORD_LINE_MARKER = "\u200B";

// --- Injected or auto-wired chord converter ---
var _convertChord = null;
function setConvertChord(fn) { _convertChord = fn; }

function toAnglo(name) {
    return _convertChord ? _convertChord(name, false) : name;
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
        result = result.substring(0, inlineChords[i].pos) + "[" + inlineChords[i].name + "]" + result.substring(inlineChords[i].pos);
    }
    // Collapse extra alignment spaces (added by expandTextForChords)
    result = result.replace(/ {2,}/g, " ").replace(/\s+$/, "");

    // Append trailing chords as space-separated chord markers
    for (var t = 0; t < trailingChords.length; t++) {
        result += " [" + trailingChords[t].name + "]";
    }
    return result;
}

// Convert a chord-only line to ChordPro inline chords
function chordsToInline(chordLine) {
    var chords = parseChords(chordLine);
    return chords.map(function(c) { return "[" + c.name + "]"; }).join(" ");
}

// Convert formatted text output to ChordPro format
function convert(text) {
    var lines = text.split("\n");
    var result = [];
    var i = 0;

    while (i < lines.length) {
        var line = lines[i];

        // Title: ==== TITLE ====
        var titleMatch = line.match(/^====\s+(.+?)\s+====$/);
        if (titleMatch) {
            result.push("{title: " + titleMatch[1] + "}");
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
    exports.convert = convert;
    exports.setConvertChord = setConvertChord;
}
