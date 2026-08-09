// Lyrics Extractor for MuseScore
// Copyright (C) 2026 Manolo Carrasco (do2tis)
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Licensed under the GNU General Public License version 3 or later, with an
// additional attribution requirement under section 7(b): see LICENSE.

// lib/fretboard-renderer.js draws the chord diagrams into the PDF, and it was the least
// covered file in the project at 17% of lines: the snapshot suite compares text, so nothing
// it draws is ever looked at. These are pure functions returning PDF content stream
// operators, so they can be read directly.
//
// The operators that matter: "re f" fills a rectangle, "m ... l S" strokes a line, "c" draws
// a Bezier curve, "Tj" shows text, and "q"/"Q" save and restore the graphics state.

var test = require("node:test");
var assert = require("node:assert/strict");

var fr = require("../../lib/fretboard-renderer");

function esc(s) { return s.replace(/([()\\])/g, "\\$1"); }

// An open chord: two crosses, one open string, three fingered notes, no barre
function openChord() {
    return {
        chordName: "Lam",
        numFrets: 4,
        fretOffset: 0,
        barre: null,
        strings: [
            { number: 0, marker: "cross" },
            { number: 1, marker: "circle" },
            { number: 2, dot: { fret: 2 } },
            { number: 3, dot: { fret: 2 } },
            { number: 4, dot: { fret: 1 } },
            { number: 5, marker: "circle" }
        ]
    };
}

function countOf(stream, op) {
    return stream.split(op).length - 1;
}

test("renderFretDiagram draws the chord name, the grid and every marker", function() {
    var stream = fr.renderFretDiagram(openChord(), 50, 700, esc, {});

    assert.ok(stream.indexOf("(Lam) Tj") >= 0, "the chord name is shown: " + stream.slice(0, 120));
    // Six strings and five frets, plus the nut, are strokes or fills
    assert.ok(countOf(stream, " l S") >= 6, "the grid lines are stroked");
    // Two crosses are two strokes each, and a cross is the only X in the drawing
    assert.equal(countOf(stream, " m ") >= 8, true, "crosses and grid share the move operator");
    // Circles are drawn as four Bezier curves
    assert.ok(countOf(stream, " c\n") >= 8, "open strings and dots are curves");
});

test("renderFretDiagram places a dot per fingered string and none for a muted one", function() {
    var withDots = fr.renderFretDiagram(openChord(), 0, 0, esc, {});
    var noDots = fr.renderFretDiagram({
        chordName: "x", numFrets: 4, fretOffset: 0, barre: null,
        strings: [{ number: 0, marker: "cross" }, { number: 1, marker: "cross" }]
    }, 0, 0, esc, {});

    assert.ok(withDots.length > noDots.length,
        "a chord with three dots draws more than one with none");
});

test("renderFretDiagram ignores a dot outside the frets it draws", function() {
    var inside = fr.renderFretDiagram({
        chordName: "a", numFrets: 4, fretOffset: 0, barre: null,
        strings: [{ number: 0, dot: { fret: 4 } }]
    }, 0, 0, esc, {});
    var outside = fr.renderFretDiagram({
        chordName: "a", numFrets: 4, fretOffset: 0, barre: null,
        strings: [{ number: 0, dot: { fret: 9 } }]
    }, 0, 0, esc, {});

    assert.ok(inside.length > outside.length,
        "a dot on the ninth fret of a four fret diagram is not drawn");
});

test("renderFretDiagram draws a barre as a rounded bar", function() {
    var d = openChord();
    d.barre = { start: 0, end: 5, fret: 1 };
    var stream = fr.renderFretDiagram(d, 0, 0, esc, {});

    assert.ok(countOf(stream, " re f") >= 1, "the barre body is a filled rectangle");
    assert.ok(stream.indexOf("q\n") >= 0 && stream.indexOf("Q\n") >= 0,
        "it is drawn inside a saved graphics state");
});

test("renderFretDiagram takes a barre reaching to -1 as reaching the last string", function() {
    var toLast = openChord();
    toLast.barre = { start: 0, end: 5, fret: 1 };
    var openEnded = openChord();
    openEnded.barre = { start: 0, end: -1, fret: 1 };

    var a = fr.renderFretDiagram(toLast, 0, 0, esc, {});
    var b = fr.renderFretDiagram(openEnded, 0, 0, esc, {});
    assert.equal(a, b, "end -1 means the sixth string, so both draw the same bar");
});

test("renderFretDiagram ignores a barre outside the frets it draws", function() {
    var d = openChord();
    d.barre = { start: 0, end: 5, fret: 12 };
    var stream = fr.renderFretDiagram(d, 0, 0, esc, {});
    var noBarre = fr.renderFretDiagram(openChord(), 0, 0, esc, {});

    assert.equal(stream, noBarre, "a barre on the twelfth fret of four is not drawn");
});

test("renderFretDiagram shows the fret number when the diagram starts up the neck", function() {
    var d = openChord();
    d.fretOffset = 4;
    var stream = fr.renderFretDiagram(d, 0, 0, esc, {});

    assert.ok(/\(5\) Tj/.test(stream),
        "an offset of four starts at the fifth fret, which is labelled: " +
        (stream.match(/\([^)]*\) Tj/g) || []).join(" "));
});

test("renderFretDiagram escapes a chord name that would break the PDF string", function() {
    var d = openChord();
    d.chordName = "La(m)";
    var stream = fr.renderFretDiagram(d, 0, 0, esc, {});

    assert.ok(stream.indexOf("(La\\(m\\)) Tj") >= 0,
        "the parentheses are escaped: " + (stream.match(/\([^\n]*\) Tj/) || [])[0]);
});

test("renderFretDiagram draws accidentals through the caller's text writer", function() {
    // A chord name with a flat cannot be written in the base 14 fonts, so pdf-writer passes
    // its own showTextOps and the renderer has to use it rather than emitting text itself
    var d = openChord();
    d.chordName = "Si♭";
    var calls = [];
    var stream = fr.renderFretDiagram(d, 0, 0, esc, {
        accidentalFont: "F5",
        showTextOps: function(text, fontRes, size, accRes) {
            calls.push({ text: text, fontRes: fontRes, size: size, accRes: accRes });
            return "(marker) Tj\n";
        }
    });

    assert.equal(calls.length, 1, "the writer is called once, for the chord name");
    assert.equal(calls[0].text, "Si♭");
    assert.equal(calls[0].accRes, "F5", "and told which font holds the accidentals");
    assert.ok(stream.indexOf("(marker) Tj") >= 0, "its output is what lands in the stream");
});

// --- placeDiagrams -------------------------------------------------------------

test("placeDiagrams lays the diagrams out left to right", function() {
    var cmds = fr.placeDiagrams([{ chordName: "a" }, { chordName: "b" }, { chordName: "c" }],
        50, 700, 1000);

    assert.equal(cmds.length, 3);
    cmds.forEach(function(c) {
        assert.equal(c.type, "fretboard");
        assert.equal(c.y, 700, "all on the same line");
    });
    assert.ok(cmds[1].x > cmds[0].x && cmds[2].x > cmds[1].x, "each one further right");
    assert.equal(cmds[1].x - cmds[0].x, cmds[2].x - cmds[1].x, "evenly spaced");
});

test("placeDiagrams stops at the width it is given", function() {
    var many = [];
    for (var i = 0; i < 40; i++) many.push({ chordName: "c" + i });

    var cmds = fr.placeDiagrams(many, 50, 700, 200);
    assert.ok(cmds.length < many.length, "it does not run past the page: " + cmds.length);
    cmds.forEach(function(c) {
        assert.ok(c.x < 200, "every diagram starts inside the width: " + c.x);
    });
});

test("placeDiagrams on an empty list returns nothing to draw", function() {
    assert.deepEqual(fr.placeDiagrams([], 50, 700, 1000), []);
});
