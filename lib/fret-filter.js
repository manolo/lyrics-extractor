// Lyrics Extractor for MuseScore
// Copyright (C) 2026 Manolo Carrasco (do2tis)
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Licensed under the GNU General Public License version 3 or later, with an
// additional attribution requirement under section 7(b): see LICENSE and ATTRIBUTION.md.

// Which fretboard diagrams of a score belong in the chart.
//
// A score often carries more diagrams than it means to show. MuseScore leaves a second one for
// a chord written in two spellings, solfeggio and anglo, and only one of the two is drawn: the
// other is an empty grid, which is what a player hides. Diagrams reach the plugin by three
// roads, the plugin API inside MuseScore and the two XML readers, and all three ask here, so
// that the chart does not depend on which build is running.
//
// Usage from QML:
//   FretFilter.setChordUtils(ChordUtils);
//   if (!FretFilter.keepDiagram(seen, name, strings, barre)) continue;
//
// Usage from Node:
//   var fretFilter = require("./fret-filter");   (chord-utils auto-wired)

var ChordUtils = null;
if (typeof require !== "undefined") {
    ChordUtils = require("./chord-utils");
}
function setChordUtils(mod) { ChordUtils = mod; }

// Whether anything is drawn on the grid: a fingered note, an open or muted string, a barre.
// A chord played on open strings alone is drawn; an empty grid is not.
function isDrawn(strings, barre) {
    if (barre) return true;
    for (var i = 0; strings && i < strings.length; i++) {
        if (strings[i] && (strings[i].dot || strings[i].marker)) return true;
    }
    return false;
}

// The chord a diagram is for, in one spelling, so "Fa" and "F" come out the same
function chordKey(name) {
    var text = String(name || "").trim();
    if (ChordUtils && ChordUtils.normalizeChord && ChordUtils.convertChord) {
        try { text = ChordUtils.convertChord(ChordUtils.normalizeChord(text), false); } catch (e) {}
    }
    return text.toLowerCase();
}

// Whether to keep this diagram, remembering it in `seen` when kept.
//
// Dropped: an empty grid, and a chord that already has a diagram under another name, which is
// the duplicate MuseScore leaves behind. Kept: two diagrams written under the same name, which
// are two ways of playing the chord and both worth printing. opts.assumeDrawn says the grid
// could not be read, and an unread diagram is not an empty one.
function keepDiagram(seen, chordName, strings, barre, opts) {
    opts = opts || {};
    if (!opts.assumeDrawn && !isDrawn(strings, barre)) return false;

    var key = "chord:" + chordKey(chordName);
    if (seen[key] !== undefined && seen[key] !== chordName) return false;
    seen[key] = chordName;
    return true;
}

if (typeof exports !== "undefined") {
    exports.setChordUtils = setChordUtils;
    exports.isDrawn = isDrawn;
    exports.chordKey = chordKey;
    exports.keepDiagram = keepDiagram;
}
