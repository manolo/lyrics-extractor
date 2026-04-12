var test = require("node:test");
var assert = require("node:assert/strict");
var cu = require("../lib/chord-utils");

var chords = [
    { tick: 0, chord: "Lam" },
    { tick: 480, chord: "Re" },
    { tick: 960, chord: "Sol" },
    { tick: 1440, chord: "Do" }
];

test("findChordAtTick returns last chord at or before tick", function() {
    assert.equal(cu.findChordAtTick(chords, 0), "Lam");
    assert.equal(cu.findChordAtTick(chords, 479), "Lam");
    assert.equal(cu.findChordAtTick(chords, 480), "Re");
    assert.equal(cu.findChordAtTick(chords, 700), "Re");
    assert.equal(cu.findChordAtTick(chords, 2000), "Do");
});

test("findChordAtTick returns null when no chord before tick", function() {
    assert.equal(cu.findChordAtTick(chords, -1), null);
    assert.equal(cu.findChordAtTick([], 100), null);
});

test("hasChordEntryBetween detects chords in range (fromTick, toTick]", function() {
    assert.equal(cu.hasChordEntryBetween(chords, 0, 480), true);
    assert.equal(cu.hasChordEntryBetween(chords, 0, 479), false);
    assert.equal(cu.hasChordEntryBetween(chords, 480, 960), true);
    assert.equal(cu.hasChordEntryBetween(chords, 1440, 2000), false);
});

test("findChordInRange restricts search to range", function() {
    assert.equal(cu.findChordInRange(chords, 700, 480, 960), "Re");
    assert.equal(cu.findChordInRange(chords, 700, 960, 1440), null);
    assert.equal(cu.findChordInRange(chords, 1500, 0, -1), "Do");
});

test("getChordsInRange returns unique chords in range", function() {
    assert.deepEqual(cu.getChordsInRange(chords, 0, 960, null), ["Lam", "Re"]);
    assert.deepEqual(cu.getChordsInRange(chords, 0, 960, "Lam"), ["Re"]);
    assert.deepEqual(cu.getChordsInRange(chords, 0, -1, null), ["Lam", "Re", "Sol", "Do"]);
    assert.deepEqual(cu.getChordsInRange(chords, 2000, 3000, null), []);
});

// ========================================
// Anglo to solfeo conversion
// ========================================

// ========================================
// tpcToChordName (direct extraction in target language)
// ========================================
var Constants = require("../lib/constants");

test("tpcToChordName produces solfeo names with solfeggio spelling", function() {
    assert.equal(Constants.tpcToChordName(17, "m", "solfeggio"), "Lam");
    assert.equal(Constants.tpcToChordName(18, "7", "solfeggio"), "Mi7");
    assert.equal(Constants.tpcToChordName(14, "M", "solfeggio"), "DoM");
    assert.equal(Constants.tpcToChordName(13, "", "solfeggio"), "Fa");
    assert.equal(Constants.tpcToChordName(15, "", "solfeggio"), "Sol");
});

test("tpcToChordName produces anglo names with standard spelling", function() {
    assert.equal(Constants.tpcToChordName(17, "m", "standard"), "Am");
    assert.equal(Constants.tpcToChordName(18, "7", "standard"), "E7");
    assert.equal(Constants.tpcToChordName(14, "M", "standard"), "CM");
    assert.equal(Constants.tpcToChordName(13, "", "standard"), "F");
    assert.equal(Constants.tpcToChordName(15, "", "standard"), "G");
});

test("tpcToChordName defaults to standard (anglo) when no spelling", function() {
    assert.equal(Constants.tpcToChordName(17, "m"), "Am");
    assert.equal(Constants.tpcToChordName(14, ""), "C");
});

test("tpcToChordName returns literal text when no root TPC", function() {
    assert.equal(Constants.tpcToChordName(-99, "Bajos", "solfeggio"), "Bajos");
    assert.equal(Constants.tpcToChordName(-99, "A", "standard"), "A");
    assert.equal(Constants.tpcToChordName(-99, "", "solfeggio"), "");
});

test("tpcToChordName handles french spelling same as solfeggio", function() {
    assert.equal(Constants.tpcToChordName(17, "m", "french"), "Lam");
    assert.equal(Constants.tpcToChordName(14, "", "french"), "Do");
});
