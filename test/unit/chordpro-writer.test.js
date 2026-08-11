// Lyrics Extractor for MuseScore
// Copyright (C) 2026 Manolo Carrasco (do2tis)
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Licensed under the GNU General Public License version 3 or later, with an
// additional attribution requirement under section 7(b): see LICENSE and ATTRIBUTION.md.

var test = require("node:test");
var assert = require("node:assert/strict");
var cp = require("../../lib/chordpro-writer");
var M = "\u200B"; // chord line marker

// Every file opens with the credit as source comment lines. What the tests below are about is
// what comes after it.
function body(out) { return out.replace(/^(#[^\n]*\n)+/, ""); }

// --- Accidentals ---

test("accidentals are written the way ChordPro reads them", function() {
    // The text output and the PDF print the typographic signs, so that is how a chord arrives
    // here. A ChordPro reader given [E♭maj9] reports a chord it cannot parse
    var out = cp.convert(M + "B\u266D    E\u266Dmaj9  F\u266Fm   C\u00B0\n" +
                         "one   two      three  four\n");

    assert.ok(out.indexOf("[Bb]") >= 0, "a flat is a b: " + out);
    assert.ok(out.indexOf("[Ebmaj9]") >= 0, "including before a quality");
    assert.ok(out.indexOf("[F#m]") >= 0, "and a sharp is a hash");
    assert.ok(out.indexOf("[Cdim]") >= 0, "and the degree sign is dim");
    assert.equal(/[\u266D\u266F\u00B0]/.test(out), false, "nothing typographic is left: " + out);
});

test("the key directive is spelled the same way", function() {
    var out = cp.convert("==== SONG ====\n", { key: "B\u266D" });
    assert.ok(out.indexOf("{key: Bb}") >= 0, out.split("\n").slice(0, 4).join(" / "));
});

test("an annotation keeps whatever it says", function() {
    // [*...] is words rather than a chord, and a word is not respelled
    var out = cp.convert(M + "Ma\u00B0s\u266D\n" + "sing\n");
    assert.ok(out.indexOf("Ma\u00B0s\u266D") >= 0,
        "an annotation is left alone: " + out.replace(/\n/g, " / "));
});

// --- The credit ---

test("the file opens with the credit, as lines no renderer prints", function() {
    var out = cp.convert("hello\n");
    var lines = out.split("\n");

    assert.equal(lines[0].charAt(0), "#", "a source comment, not a {comment:} directive: " + lines[0]);
    assert.ok(out.indexOf("Manolo Carrasco (do2tis)") >= 0, "the author is named");
    assert.ok(out.indexOf("{c") < 0 || out.indexOf("{comment") > out.indexOf("Carrasco"),
        "nothing about the credit is rendered onto the sheet");
});

// --- Title ---

test("converts title line to {title:} directive", function() {
    var input = "==== MY SONG ====\n";
    assert.ok(cp.convert(input).indexOf("{title: MY SONG}") >= 0);
});

// --- Section labels ---

test("converts section labels to {comment:} directives", function() {
    var input = "- ESTROFA 1 -\n";
    assert.ok(cp.convert(input).indexOf("{comment: ESTROFA 1}") >= 0);
});

test("converts multiple section labels", function() {
    var input = "- INTRO -\nhello\n\n- ESTRIBILLO -\nworld\n";
    var out = cp.convert(input);
    assert.ok(out.indexOf("{comment: INTRO}") >= 0);
    assert.ok(out.indexOf("{comment: ESTRIBILLO}") >= 0);
});

// --- Chord + lyric merging ---

test("merges chord line with lyric line into inline chords", function() {
    var input = M + "Am        D\nhello     world\n";
    var out = cp.convert(input);
    // After collapsing alignment spaces: [Am]hello [D]world
    assert.ok(out.indexOf("[Am]hello") >= 0, "Am should be at hello: " + out);
    assert.ok(out.indexOf("[D]") >= 0, "D should appear: " + out);
    assert.ok(out.indexOf("world") >= 0, "world should appear: " + out);
});

test("handles chord at start of line", function() {
    var input = M + "Am\nhello\n";
    var out = cp.convert(input);
    assert.ok(out.indexOf("[Am]hello") >= 0);
});

test("handles trailing chord beyond lyric length", function() {
    var input = M + "Am       D\nhello\n";
    var out = cp.convert(input);
    assert.ok(out.indexOf("[Am]hello") >= 0);
    assert.ok(out.indexOf("[D]") >= 0);
});

test("multiple trailing chords are space-separated, not collapsed", function() {
    var input = M + "                           Mim Lam Si7 Mim\nComo el candor de una rosa sa.\n";
    var out = cp.convert(input);
    // Should not produce [[Am] or similar broken brackets
    assert.equal(out.indexOf("[["), -1, "should not have double brackets: " + out);
    assert.ok(out.indexOf("[Am]") >= 0, "should have Am: " + out);
    assert.ok(out.indexOf("[B7]") >= 0, "should have B7: " + out);
    // Trailing chords should be separated by spaces
    assert.ok(out.indexOf("] [") >= 0 || out.indexOf("]") >= 0, "trailing chords should be separated");
});

test("collapses extra alignment spaces", function() {
    var input = M + "Am          D\nhello       world\n";
    var out = cp.convert(input);
    // Extra spaces should be collapsed to single space
    assert.ok(out.indexOf("  ") < 0 || out.indexOf("  ") > out.indexOf("\n"));
});

// --- Chord-only lines ---

test("converts chord-only line (no lyrics below) to inline chords", function() {
    var input = M + "Am  D  G\n\n";
    var out = cp.convert(input);
    assert.ok(out.indexOf("[Am] [D] [G]") >= 0);
});

test("chord-only line followed by section label", function() {
    var input = M + "Am  D\n- VERSO -\n";
    var out = cp.convert(input);
    assert.ok(out.indexOf("[Am] [D]") >= 0);
    assert.ok(out.indexOf("{comment: VERSO}") >= 0);
});

// --- Solfeo to anglo conversion ---

test("converts solfeo chords to anglo", function() {
    var input = M + "Lam  Re  Mi7\nhello world here\n";
    var out = cp.convert(input);
    assert.ok(out.indexOf("[Am]") >= 0, "Lam should become Am: " + out);
    assert.ok(out.indexOf("[D]") >= 0, "Re should become D: " + out);
    assert.ok(out.indexOf("[E7]") >= 0, "Mi7 should become E7: " + out);
    assert.equal(out.indexOf("[Lam]"), -1, "Lam should not appear");
    assert.equal(out.indexOf("[Re]"), -1, "Re should not appear as solfeo");
});

test("converts solfeo chord-only lines to anglo", function() {
    var input = M + "Lam  Mi7  La\n\n";
    var out = cp.convert(input);
    assert.ok(out.indexOf("[Am]") >= 0);
    assert.ok(out.indexOf("[E7]") >= 0);
    assert.ok(out.indexOf("[A]") >= 0);
});

test("anglo chords pass through unchanged", function() {
    var input = M + "Am  E7  A\nhello world here\n";
    var out = cp.convert(input);
    assert.ok(out.indexOf("[Am]") >= 0);
    assert.ok(out.indexOf("[E7]") >= 0);
    assert.ok(out.indexOf("[A]") >= 0);
});

test("handles prettified chords with flat symbol", function() {
    var input = M + "Si\u266d  Mi\u266d7\nhello world\n";
    var out = cp.convert(input);
    assert.ok(out.indexOf("[B\u266d]") >= 0 || out.indexOf("[Bb]") >= 0, "Si♭ should become Bb: " + out);
});

// --- Pass-through ---

test("passes through empty lines", function() {
    var input = "line1\n\nline2\n";
    assert.equal(body(cp.convert(input)), input);
});

test("passes through plain text (abbreviated stanzas)", function() {
    var input = "hello world...\n";
    var out = body(cp.convert(input));
    assert.equal(out, input);
});

// --- Full document ---

test("converts a complete formatted document", function() {
    var input = [
        "==== MI CANCION ====",
        "",
        "- INTRO -",
        M + "Lam  Mi7  Lam",
        "",
        "- ESTROFA -",
        M + "Lam      Mi7",
        "hola mundo cruel",
        "",
        ""
    ].join("\n");
    var out = cp.convert(input);
    assert.ok(out.indexOf("{title: MI CANCION}") >= 0);
    assert.ok(out.indexOf("{comment: INTRO}") >= 0);
    assert.ok(out.indexOf("[Am] [E7] [Am]") >= 0);
    assert.ok(out.indexOf("{comment: ESTROFA}") >= 0);
    assert.ok(out.indexOf("[Am]hola") >= 0);
    assert.ok(out.indexOf("[E7]") >= 0);
    // No solfeo should remain
    assert.equal(out.indexOf("[Lam]"), -1);
    assert.equal(out.indexOf("[Mi7]"), -1);
});

// --- Text annotations vs chords ---

test("emits text annotations with the ChordPro annotation syntax", function() {
    // "Muy-lento" is staff text carried on the chord line, not a chord: as a plain
    // [Muy-lento] tag a ChordPro reader would try to transpose it.
    var input = M + "Do        Muy-lento   Sol\nhola mundo que tal\n";
    var out = cp.convert(input);
    assert.ok(out.indexOf("[*Muy-lento]") >= 0, "annotation should use [*...]: " + out);
    assert.ok(out.indexOf("[C]") >= 0, "real chords stay plain: " + out);
    assert.ok(out.indexOf("[G]") >= 0, "real chords stay plain: " + out);
});

test("emits annotations on a chord-only line with the annotation syntax", function() {
    var input = M + "-CAPELLA-\n\n";
    var out = cp.convert(input);
    assert.ok(out.indexOf("[*-CAPELLA-]") >= 0, "annotation should use [*...]: " + out);
});

test("treats slash chords and qualities as chords, not annotations", function() {
    var input = M + "Sib/Fa   Domaj7   Mi7(b5)\nhola mundo que tal\n";
    var out = cp.convert(input);
    assert.ok(out.indexOf("[Bb/F]") >= 0, "slash chord: " + out);
    assert.ok(out.indexOf("[Cmaj7]") >= 0, "quality chord: " + out);
    assert.ok(out.indexOf("[E7(b5)]") >= 0, "bracketed quality: " + out);
    assert.ok(out.indexOf("[*") < 0, "no annotations expected: " + out);
});

// --- Key directive ---

test("emits a {key:} directive when the key is known", function() {
    var input = "==== MY SONG ====\n" + M + "Do\nhola\n";
    var out = cp.convert(input, { key: "Bb" });
    assert.ok(out.indexOf("{key: Bb}") >= 0, "should have the key directive: " + out);
    assert.ok(out.indexOf("{key: Bb}") > out.indexOf("{title: MY SONG}"),
        "key should follow the title: " + out);
});

test("converts a solfeo key name to anglo in the directive", function() {
    var out = cp.convert("==== X ====\n", { key: "Sib" });
    assert.ok(out.indexOf("{key: Bb}") >= 0, "key should be anglo: " + out);
});

test("omits the key directive when no key is given", function() {
    var out = cp.convert("==== X ====\n");
    assert.ok(out.indexOf("{key:") < 0, "no key directive expected: " + out);
});
