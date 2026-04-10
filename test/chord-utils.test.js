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

// Note: solfeo/anglo conversion tests removed.
// Chord names are now extracted directly in the correct language
// using Constants.tpcToChordName() with the score's spelling setting.
