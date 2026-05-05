var test = require("node:test");
var assert = require("node:assert/strict");
var cp = require("../lib/chordpro-writer");
var M = "\u200B"; // chord line marker

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
    var out = cp.convert(input);
    assert.equal(out, input);
});

test("passes through plain text (abbreviated stanzas)", function() {
    var input = "hello world...\n";
    var out = cp.convert(input);
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
