// Lyrics Extractor for MuseScore
// Copyright (C) 2026 Manolo Carrasco (do2tis)
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Licensed under the GNU General Public License version 3 or later, with an
// additional attribution requirement under section 7(b): see LICENSE and ATTRIBUTION.md.

// The help page: its shape here, its words in ui/i18n/. What a translator opens is a list of
// sentences, not a table, and a translation that stops halfway loses those rows to English
// rather than the whole page.
//
// build(t, showScoresDir) takes the t() of the engine, so it needs nothing else to be tested.

// One entry per row: the key of its label and the key of its body. A heading opens a section.
var SECTIONS = [
    { heading: "help.heading.howTo", steps: "help.howTo.steps" },
    { heading: "help.heading.general", rows: [
        "help.title", "help.systemText", "help.repeatCount", "help.rehearsalMark", "help.repeats",
        "help.stanzas"
    ] },
    { heading: "help.heading.guitar", rows: [
        "help.chords", "help.diagrams", "help.staffText", "help.expression"
    ] },
    { heading: "help.heading.vocal", rows: [
        "help.textEntry", "help.syllables", "help.words", "help.melisma", "help.synalepha",
        "help.splitting", "help.forceBreak", "help.preventBreak", "help.verses"
    ] },
    { heading: "help.heading.extraction", rows: [
        "help.staffSelector", "help.solfeo", "help.fullRepeat", "help.lyricsOnly", "help.staffTexts",
        "help.orphanLyrics"
    ], scoresDirAfter: true },
    { heading: "help.heading.pdf", rows: [
        "help.pdfHeader", "help.pdfFooter", "help.onePage", "help.lineNumbers", "help.noDiagrams"
    ] },
    { heading: "help.heading.buttons", rows: [
        "help.fix", "help.chordpro", "help.debug"
    ] }
];

function _row(t, key) {
    return "<tr><td width='150' nowrap><b>" + t(key + ".label") + "</b></td>" +
           "<td>" + t(key + ".body") + "</td></tr>";
}

function _heading(t, key, first) {
    var rule = first ? "" : "<tr><td colspan='2'><hr></td></tr>";
    return rule + "<tr><td colspan='2'><h3>" + t(key) + "</h3></td></tr>";
}

// showScoresDir: the scores directory only matters while the plugin has to read the .mscz from
// disk for chord diagrams, so the row appears only when that fallback is in play
function build(t, showScoresDir) {
    var html = "<table cellpadding='4' width='100%'>";

    for (var s = 0; s < SECTIONS.length; s++) {
        var section = SECTIONS[s];

        if (section.steps) {
            // The opening section carries its list inside the heading cell
            html += "<tr><td colspan='2'><h3>" + t(section.heading) + "</h3>" +
                    "<ol>" + t(section.steps) + "</ol></td></tr>";
            continue;
        }

        html += _heading(t, section.heading, false);
        for (var r = 0; r < section.rows.length; r++) html += _row(t, section.rows[r]);
        if (section.scoresDirAfter && showScoresDir) html += _row(t, "help.scoresDir");
    }

    return html + "</table>";
}

if (typeof exports !== "undefined") {
    exports.build = build;
    exports.SECTIONS = SECTIONS;
}
