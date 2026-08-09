// Lyrics Extractor for MuseScore
// Copyright (C) 2026 Manolo Carrasco (do2tis)
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Licensed under the GNU General Public License version 3 or later, with an
// additional attribution requirement under section 7(b): see LICENSE.

// Chord-only formatter: structures a chord sequence using musical form markers
// Used when a score has chords but no lyrics.
// Shared between MuseScore extension and Node.js CLI.

var CHORD_LINE_MARKER = "\u200B"; // same marker as formatter.js

// Format a chord-only score into structured text output.
// data: { title, chords, repeats, voltas, systemTexts, barlines, markers, jumps, division }
// Chord names are already in the correct language from extraction.
function formatChordOnly(data, mods) {
    var chords = data.chords || [];
    var division = data.division || 480;

    if (chords.length === 0) return null;

    // Collect all structural break points
    var breaks = []; // { tick, label (optional) }

    // System texts and rehearsal marks
    var sysTexts = data.systemTexts || [];
    for (var si = 0; si < sysTexts.length; si++) {
        breaks.push({ tick: sysTexts[si].tick, label: sysTexts[si].text });
    }

    // Barlines (section boundaries)
    var barlines = data.barlines || [];
    for (var bi = 0; bi < barlines.length; bi++) {
        breaks.push({ tick: barlines[bi].tick });
    }

    // Repeat boundaries
    var repeats = data.repeats || [];
    for (var ri = 0; ri < repeats.length; ri++) {
        breaks.push({ tick: repeats[ri].startTick });
        breaks.push({ tick: repeats[ri].endTick });
    }

    // Sort by tick
    breaks.sort(function(a, b) { return a.tick - b.tick; });

    // Merge breaks that are close together (< 1 measure = division * 4)
    var measureTicks = division * 4;
    var merged = [];
    for (var mi = 0; mi < breaks.length; mi++) {
        var br = breaks[mi];
        if (merged.length > 0) {
            var prev = merged[merged.length - 1];
            if (br.tick - prev.tick < measureTicks) {
                // Keep the one with a label, or the later one
                if (br.label) {
                    prev.tick = br.tick;
                    prev.label = br.label;
                }
                continue;
            }
        }
        merged.push({ tick: br.tick, label: br.label || null });
    }

    // Build output: title + sectioned chord lines
    var output = "";
    var title = data.title || "";
    if (title) {
        output += "==== " + title.toUpperCase() + " ====\n\n";
    }

    // Split chords at break points
    var breakIdx = 0;
    var currentLabel = null;
    var currentChords = [];

    for (var ci = 0; ci < chords.length; ci++) {
        var chord = chords[ci];

        // Check if we passed any break point
        while (breakIdx < merged.length && merged[breakIdx].tick <= chord.tick) {
            // Flush current chords before the break
            if (currentChords.length > 0) {
                output += _wrapChordLine(currentChords.join("  "), 70) + "\n";
                currentChords = [];
            }

            // Emit label if present
            if (merged[breakIdx].label) {
                if (currentLabel !== null) output += "\n";
                output += "\n- " + merged[breakIdx].label.toUpperCase() + " -\n";
                currentLabel = merged[breakIdx].label;
            } else if (currentChords.length === 0 && ci > 0) {
                // Barline break without label: just add blank line
                output += "\n";
            }
            breakIdx++;
        }

        currentChords.push(chord.chord);
    }

    // Flush remaining chords
    if (currentChords.length > 0) {
        output += _wrapChordLine(currentChords.join("  "), 70) + "\n";
    }

    return output;
}

// Wrap a chord line at double-space boundaries (same logic as formatter.js wrapChordLine)
function _wrapChordLine(chordsStr, maxWidth) {
    if (chordsStr.length <= maxWidth) return CHORD_LINE_MARKER + chordsStr;
    var lines = [];
    while (chordsStr.length > maxWidth) {
        var cut = chordsStr.lastIndexOf("  ", maxWidth);
        if (cut <= 0) cut = chordsStr.indexOf("  ", maxWidth);
        if (cut <= 0) break;
        lines.push(CHORD_LINE_MARKER + chordsStr.substring(0, cut));
        chordsStr = chordsStr.substring(cut).replace(/^\s+/, "");
    }
    if (chordsStr) lines.push(CHORD_LINE_MARKER + chordsStr);
    return lines.join("\n");
}

if (typeof exports !== "undefined") {
    exports.formatChordOnly = formatChordOnly;
}
