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

test("convertChordToSolfeo converts basic anglo chords", function() {
    assert.equal(cu.convertChordToSolfeo("C"), "Do");
    assert.equal(cu.convertChordToSolfeo("D"), "Re");
    assert.equal(cu.convertChordToSolfeo("E"), "Mi");
    assert.equal(cu.convertChordToSolfeo("F"), "Fa");
    assert.equal(cu.convertChordToSolfeo("G"), "Sol");
    assert.equal(cu.convertChordToSolfeo("A"), "La");
    assert.equal(cu.convertChordToSolfeo("B"), "Si");
});

test("convertChordToSolfeo converts chords with modifiers", function() {
    assert.equal(cu.convertChordToSolfeo("Am"), "Lam");
    assert.equal(cu.convertChordToSolfeo("E7"), "Mi7");
    assert.equal(cu.convertChordToSolfeo("F#7"), "Fa#7");
    assert.equal(cu.convertChordToSolfeo("Bb"), "Sib");
    assert.equal(cu.convertChordToSolfeo("Bbm"), "Sibm");
    assert.equal(cu.convertChordToSolfeo("G7"), "Sol7");
    assert.equal(cu.convertChordToSolfeo("Dmaj7"), "Remaj7");
    assert.equal(cu.convertChordToSolfeo("C#m7"), "Do#m7");
});

test("convertChordToSolfeo leaves solfeo chords unchanged", function() {
    assert.equal(cu.convertChordToSolfeo("Lam"), "Lam");
    assert.equal(cu.convertChordToSolfeo("Mi7"), "Mi7");
    assert.equal(cu.convertChordToSolfeo("Fa#7"), "Fa#7");
    assert.equal(cu.convertChordToSolfeo("Sol7"), "Sol7");
    assert.equal(cu.convertChordToSolfeo("Do"), "Do");
    assert.equal(cu.convertChordToSolfeo("Sib"), "Sib");
    assert.equal(cu.convertChordToSolfeo("Re"), "Re");
});

test("convertChordsToSolfeo converts entire array in place", function() {
    var arr = [
        { tick: 0, chord: "Am" },
        { tick: 480, chord: "E7" },
        { tick: 960, chord: "Lam" }
    ];
    cu.convertChordsToSolfeo(arr);
    assert.equal(arr[0].chord, "Lam");
    assert.equal(arr[1].chord, "Mi7");
    assert.equal(arr[2].chord, "Lam"); // already solfeo, unchanged
});

test("convertChordToAnglo converts solfeo to anglo", function() {
    assert.equal(cu.convertChordToAnglo("Do"), "C");
    assert.equal(cu.convertChordToAnglo("Lam"), "Am");
    assert.equal(cu.convertChordToAnglo("Mi7"), "E7");
    assert.equal(cu.convertChordToAnglo("Fa#7"), "F#7");
    assert.equal(cu.convertChordToAnglo("Sib"), "Bb");
    assert.equal(cu.convertChordToAnglo("Sol7"), "G7");
    assert.equal(cu.convertChordToAnglo("Remaj7"), "Dmaj7");
});

test("convertChordToAnglo leaves anglo chords unchanged", function() {
    assert.equal(cu.convertChordToAnglo("Am"), "Am");
    assert.equal(cu.convertChordToAnglo("C"), "C");
    assert.equal(cu.convertChordToAnglo("F#7"), "F#7");
});

test("isSolfeoChord detects solfeo roots", function() {
    assert.equal(cu.isSolfeoChord("Do"), true);
    assert.equal(cu.isSolfeoChord("Lam"), true);
    assert.equal(cu.isSolfeoChord("Sol7"), true);
    assert.equal(cu.isSolfeoChord("Am"), false);
    assert.equal(cu.isSolfeoChord("C"), false);
    assert.equal(cu.isSolfeoChord("F#7"), false);
});
