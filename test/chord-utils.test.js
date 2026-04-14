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
// convertChord: solfeo <-> anglo
// ========================================

test("convertChord solfeo to anglo", function() {
    assert.equal(cu.convertChord("Do", false), "C");
    assert.equal(cu.convertChord("Re", false), "D");
    assert.equal(cu.convertChord("Mi", false), "E");
    assert.equal(cu.convertChord("Fa", false), "F");
    assert.equal(cu.convertChord("Sol", false), "G");
    assert.equal(cu.convertChord("La", false), "A");
    assert.equal(cu.convertChord("Si", false), "B");
});

test("convertChord anglo to solfeo", function() {
    assert.equal(cu.convertChord("C", true), "Do");
    assert.equal(cu.convertChord("D", true), "Re");
    assert.equal(cu.convertChord("E", true), "Mi");
    assert.equal(cu.convertChord("F", true), "Fa");
    assert.equal(cu.convertChord("G", true), "Sol");
    assert.equal(cu.convertChord("A", true), "La");
    assert.equal(cu.convertChord("B", true), "Si");
});

test("convertChord preserves quality suffix", function() {
    assert.equal(cu.convertChord("Lam", false), "Am");
    assert.equal(cu.convertChord("Do#m7", false), "C#m7");
    assert.equal(cu.convertChord("Solb7", false), "Gb7");
    assert.equal(cu.convertChord("Am", true), "Lam");
    assert.equal(cu.convertChord("C#m7", true), "Do#m7");
    assert.equal(cu.convertChord("Gb7", true), "Solb7");
});

test("convertChord handles sharps and flats", function() {
    assert.equal(cu.convertChord("Fa#", false), "F#");
    assert.equal(cu.convertChord("Sib", false), "Bb");
    assert.equal(cu.convertChord("Reb", false), "Db");
    assert.equal(cu.convertChord("Sol#", false), "G#");
    assert.equal(cu.convertChord("F#", true), "Fa#");
    assert.equal(cu.convertChord("Bb", true), "Sib");
    assert.equal(cu.convertChord("Db", true), "Reb");
    assert.equal(cu.convertChord("G#", true), "Sol#");
});

test("convertChord handles double sharps and flats", function() {
    assert.equal(cu.convertChord("Do##", false), "C##");
    assert.equal(cu.convertChord("Rebb", false), "Dbb");
    assert.equal(cu.convertChord("C##", true), "Do##");
    assert.equal(cu.convertChord("Dbb", true), "Rebb");
});

test("convertChord returns unrecognized chords as-is", function() {
    assert.equal(cu.convertChord("N.C.", false), "N.C.");
    assert.equal(cu.convertChord("INTRO", true), "INTRO");
    assert.equal(cu.convertChord("", false), "");
    assert.equal(cu.convertChord(null, false), null);
});

test("convertChords modifies array in place", function() {
    var chords = [
        { tick: 0, chord: "Lam" },
        { tick: 480, chord: "Re" },
        { tick: 960, chord: "Sol7" }
    ];
    cu.convertChords(chords, false);
    assert.equal(chords[0].chord, "Am");
    assert.equal(chords[1].chord, "D");
    assert.equal(chords[2].chord, "G7");
});

test("convertChords anglo to solfeo", function() {
    var chords = [
        { tick: 0, chord: "Am" },
        { tick: 480, chord: "F#m7" }
    ];
    cu.convertChords(chords, true);
    assert.equal(chords[0].chord, "Lam");
    assert.equal(chords[1].chord, "Fa#m7");
});

// ========================================
// detectSolfeo
// ========================================

test("detectSolfeo returns true for solfeo chords", function() {
    assert.equal(cu.detectSolfeo([{ chord: "Lam" }, { chord: "Re" }]), true);
    assert.equal(cu.detectSolfeo([{ chord: "Do" }]), true);
    assert.equal(cu.detectSolfeo([{ chord: "Sol#m7" }]), true);
});

test("detectSolfeo returns false for anglo chords", function() {
    assert.equal(cu.detectSolfeo([{ chord: "Am" }, { chord: "D" }]), false);
    assert.equal(cu.detectSolfeo([{ chord: "C" }]), false);
    assert.equal(cu.detectSolfeo([{ chord: "G#m7" }]), false);
});

test("detectSolfeo returns true for empty array (default)", function() {
    assert.equal(cu.detectSolfeo([]), true);
});

test("detectSolfeo skips empty chords", function() {
    assert.equal(cu.detectSolfeo([{ chord: "" }, { chord: "Am" }]), false);
    assert.equal(cu.detectSolfeo([{ chord: null }, { chord: "Do" }]), true);
});

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
