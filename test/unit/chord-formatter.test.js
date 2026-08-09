// Lyrics Extractor for MuseScore
// Copyright (C) 2026 Manolo Carrasco (do2tis)
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Licensed under the GNU General Public License version 3 or later, with an
// additional attribution requirement under section 7(b): see LICENSE.

var test = require("node:test");
var assert = require("node:assert/strict");
var cf = require("../../lib/chord-formatter");

test("formatChordOnly returns null when no chords", function() {
    assert.equal(cf.formatChordOnly({ chords: [], division: 480 }), null);
});

test("formatChordOnly outputs title and chord sequence", function() {
    var data = {
        title: "Test Song",
        chords: [
            { tick: 0, chord: "Lam" },
            { tick: 480, chord: "Mi7" },
            { tick: 960, chord: "Lam" }
        ],
        division: 480
    };
    var output = cf.formatChordOnly(data);
    assert.ok(output.indexOf("==== TEST SONG ====") >= 0);
    assert.ok(output.indexOf("Lam") >= 0);
    assert.ok(output.indexOf("Mi7") >= 0);
});

test("formatChordOnly splits at system texts", function() {
    var data = {
        title: "Song",
        chords: [
            { tick: 0, chord: "Do" },
            { tick: 480, chord: "Sol" },
            { tick: 1920, chord: "Lam" },
            { tick: 2400, chord: "Mi" }
        ],
        systemTexts: [
            { tick: 0, text: "Intro" },
            { tick: 1920, text: "Verse" }
        ],
        division: 480
    };
    var output = cf.formatChordOnly(data);
    assert.ok(output.indexOf("- INTRO -") >= 0, "should have Intro label");
    assert.ok(output.indexOf("- VERSE -") >= 0, "should have Verse label");
});

test("formatChordOnly splits at barlines", function() {
    var data = {
        title: "",
        chords: [
            { tick: 0, chord: "Do" },
            { tick: 480, chord: "Sol" },
            { tick: 1920, chord: "Lam" },
            { tick: 2400, chord: "Mi" }
        ],
        barlines: [
            { tick: 1920, type: "double" }
        ],
        division: 480
    };
    var output = cf.formatChordOnly(data);
    var lines = output.split("\n").filter(function(l) { return l.trim().length > 0; });
    // Should have at least 2 chord lines (split at barline)
    var chordLines = lines.filter(function(l) { return l.indexOf("Do") >= 0 || l.indexOf("Lam") >= 0; });
    assert.ok(chordLines.length >= 2, "barline should split into 2+ chord lines: " + output);
});

test("formatChordOnly merges close events", function() {
    var data = {
        title: "",
        chords: [
            { tick: 0, chord: "Do" },
            { tick: 480, chord: "Sol" },
            { tick: 960, chord: "Lam" }
        ],
        barlines: [{ tick: 480, type: "double" }],
        systemTexts: [{ tick: 960, text: "A" }],
        division: 480
    };
    // barline at 480 and systemText at 960 are < 1 measure apart (1920 ticks)
    // Should merge: keep the label "A"
    var output = cf.formatChordOnly(data);
    assert.ok(output.indexOf("- A -") >= 0, "should keep label from merged event");
});

test("formatChordOnly splits at repeat boundaries", function() {
    var data = {
        title: "",
        chords: [
            { tick: 0, chord: "Do" },
            { tick: 480, chord: "Sol" },
            { tick: 1920, chord: "Lam" },
            { tick: 3840, chord: "Mi" }
        ],
        repeats: [{ startTick: 1920, endTick: 3840 }],
        division: 480
    };
    var output = cf.formatChordOnly(data);
    var lines = output.split("\n").filter(function(l) { return l.trim().length > 0; });
    var chordLines = lines.filter(function(l) { return l.replace(/\u200B/g, "").match(/^[A-Z]/i); });
    assert.ok(chordLines.length >= 2, "repeat boundaries should split: " + output);
});
