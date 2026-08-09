var test = require("node:test");
var assert = require("node:assert/strict");
var cu = require("../../lib/chord-utils");

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
// normalizeChord: fix common solfeo typos
// ========================================

// --- Whitespace removal ---

test("normalizeChord removes space between root and flat", function() {
    assert.equal(cu.normalizeChord("SI b"), "Sib");
    assert.equal(cu.normalizeChord("Si b"), "Sib");
    assert.equal(cu.normalizeChord("La b"), "Lab");
    assert.equal(cu.normalizeChord("Mi b"), "Mib");
    assert.equal(cu.normalizeChord("Re b"), "Reb");
    assert.equal(cu.normalizeChord("Sol b"), "Solb");
    assert.equal(cu.normalizeChord("Do b"), "Dob");
    assert.equal(cu.normalizeChord("Fa b"), "Fab");
});

test("normalizeChord removes space between root and quality", function() {
    assert.equal(cu.normalizeChord("RE 7"), "Re7");
    assert.equal(cu.normalizeChord("LA 7"), "La7");
    assert.equal(cu.normalizeChord("Mi m"), "Mim");
    assert.equal(cu.normalizeChord("SI 7"), "Si7");
    assert.equal(cu.normalizeChord("MI 7"), "Mi7");
    assert.equal(cu.normalizeChord("La m"), "Lam");
    assert.equal(cu.normalizeChord("Si m"), "Sim");
    assert.equal(cu.normalizeChord("Mi m"), "Mim");
});

test("normalizeChord removes space between accidental and quality", function() {
    assert.equal(cu.normalizeChord("Sol #m"), "Sol#m");
    assert.equal(cu.normalizeChord("Fa #m"), "Fa#m");
    assert.equal(cu.normalizeChord("Faa #m"), "Fa#m");
    assert.equal(cu.normalizeChord("Do #m7"), "Do#m7");
});

test("normalizeChord removes multiple spaces", function() {
    assert.equal(cu.normalizeChord("SI  b"), "Sib");
    assert.equal(cu.normalizeChord("RE  7"), "Re7");
    assert.equal(cu.normalizeChord("Sol  #  m"), "Sol#m");
});

// --- Hyphen removal before accidentals ---

test("normalizeChord removes hyphens before accidentals", function() {
    assert.equal(cu.normalizeChord("Do-#m"), "Do#m");
    assert.equal(cu.normalizeChord("Do-#"), "Do#");
    assert.equal(cu.normalizeChord("La-b7"), "Lab7");
    assert.equal(cu.normalizeChord("Si-b"), "Sib");
});

test("normalizeChord preserves hyphens not before accidentals", function() {
    // Staff text chords use hyphens as word separator
    assert.equal(cu.normalizeChord("N-C"), "N-C");
});

// --- Root capitalization ---

test("normalizeChord fixes all-caps solfeo roots", function() {
    assert.equal(cu.normalizeChord("DO"), "Do");
    assert.equal(cu.normalizeChord("RE"), "Re");
    assert.equal(cu.normalizeChord("MI"), "Mi");
    assert.equal(cu.normalizeChord("FA"), "Fa");
    assert.equal(cu.normalizeChord("SOL"), "Sol");
    assert.equal(cu.normalizeChord("LA"), "La");
    assert.equal(cu.normalizeChord("SI"), "Si");
});

test("normalizeChord fixes all-caps with quality suffix", function() {
    assert.equal(cu.normalizeChord("RE7"), "Re7");
    assert.equal(cu.normalizeChord("LAm"), "Lam");
    assert.equal(cu.normalizeChord("SIb"), "Sib");
    assert.equal(cu.normalizeChord("MIm7"), "Mim7");
    assert.equal(cu.normalizeChord("SOL#"), "Sol#");
    assert.equal(cu.normalizeChord("FA#m"), "Fa#m");
    assert.equal(cu.normalizeChord("DO7"), "Do7");
});

test("normalizeChord fixes all-lowercase solfeo roots", function() {
    assert.equal(cu.normalizeChord("do"), "Do");
    assert.equal(cu.normalizeChord("re"), "Re");
    assert.equal(cu.normalizeChord("mi"), "Mi");
    assert.equal(cu.normalizeChord("fa"), "Fa");
    assert.equal(cu.normalizeChord("sol"), "Sol");
    assert.equal(cu.normalizeChord("la"), "La");
    assert.equal(cu.normalizeChord("si"), "Si");
});

// --- Duplicated root letters ---

test("normalizeChord removes duplicated last letter of root", function() {
    assert.equal(cu.normalizeChord("Faa"), "Fa");
    assert.equal(cu.normalizeChord("Faa#m"), "Fa#m");
    assert.equal(cu.normalizeChord("FaA"), "Fa");
    assert.equal(cu.normalizeChord("FAA"), "Fa");
    assert.equal(cu.normalizeChord("Laa"), "La");
    assert.equal(cu.normalizeChord("Sii"), "Si");
    assert.equal(cu.normalizeChord("Ree"), "Re");
    assert.equal(cu.normalizeChord("Mii"), "Mi");
    assert.equal(cu.normalizeChord("Doo"), "Do");
});

test("normalizeChord does not remove valid 'b' after flat roots", function() {
    // "Fab" is Fa-flat, the 'b' is an accidental not a duplicate
    assert.equal(cu.normalizeChord("Fab"), "Fab");
    assert.equal(cu.normalizeChord("Dob"), "Dob");
    assert.equal(cu.normalizeChord("Sib"), "Sib");
    assert.equal(cu.normalizeChord("Lab"), "Lab");
    assert.equal(cu.normalizeChord("Mib"), "Mib");
    assert.equal(cu.normalizeChord("Reb"), "Reb");
    assert.equal(cu.normalizeChord("Solb"), "Solb");
});

// --- Real-world data: every typo from MilagroDeTusOjos ---

test("normalizeChord fixes all real typos from MilagroDeTusOjos score", function() {
    // Solfeo staff (principal)
    assert.equal(cu.normalizeChord("SI b"), "Sib");
    assert.equal(cu.normalizeChord("ReO 7"), "ReO7");
    assert.equal(cu.normalizeChord("La m"), "Lam");
    assert.equal(cu.normalizeChord("RE 7"), "Re7");
    assert.equal(cu.normalizeChord("FaA"), "Fa");
    assert.equal(cu.normalizeChord("LA 7"), "La7");
    assert.equal(cu.normalizeChord("RE"), "Re");
    assert.equal(cu.normalizeChord("Faa #m"), "Fa#m");
    assert.equal(cu.normalizeChord("Mi m"), "Mim");
    assert.equal(cu.normalizeChord("Si m"), "Sim");
    assert.equal(cu.normalizeChord("Sol #m"), "Sol#m");
    assert.equal(cu.normalizeChord("SI 7"), "Si7");
    assert.equal(cu.normalizeChord("MI"), "Mi");
    assert.equal(cu.normalizeChord("MI 7"), "Mi7");
    assert.equal(cu.normalizeChord("SOL"), "Sol");
    assert.equal(cu.normalizeChord("Do-#m"), "Do#m");
    assert.equal(cu.normalizeChord("Si b"), "Sib");
    // Anglo staff (tab)
    assert.equal(cu.normalizeChord("B b"), "Bb");
    assert.equal(cu.normalizeChord("DO 7"), "Do7");
    assert.equal(cu.normalizeChord("A m"), "Am");
    assert.equal(cu.normalizeChord("D 7"), "D7");
    assert.equal(cu.normalizeChord("A 7"), "A7");
    assert.equal(cu.normalizeChord("E m"), "Em");
    assert.equal(cu.normalizeChord("B m"), "Bm");
    assert.equal(cu.normalizeChord("G #m"), "G#m");
    assert.equal(cu.normalizeChord("B 7"), "B7");
    assert.equal(cu.normalizeChord("E 7"), "E7");
});

test("normalizeChord does not alter correctly entered chords from the same score", function() {
    assert.equal(cu.normalizeChord("Re7"), "Re7");
});

// --- Combined issues ---

test("normalizeChord handles space + caps + duplicate combined", function() {
    assert.equal(cu.normalizeChord("FAA #m"), "Fa#m");
    assert.equal(cu.normalizeChord("SII b"), "Sib");
    assert.equal(cu.normalizeChord("LAA 7"), "La7");
});

// --- Preserves correct chords (no false positives) ---

test("normalizeChord preserves all correct solfeo chords", function() {
    var correct = [
        "Do", "Do#", "Dob", "Do##", "Dobb",
        "Re", "Re#", "Reb", "Re##", "Rebb",
        "Mi", "Mi#", "Mib", "Mi##", "Mibb",
        "Fa", "Fa#", "Fab", "Fa##", "Fabb",
        "Sol", "Sol#", "Solb", "Sol##", "Solbb",
        "La", "La#", "Lab", "La##", "Labb",
        "Si", "Si#", "Sib", "Si##", "Sibb"
    ];
    for (var i = 0; i < correct.length; i++) {
        assert.equal(cu.normalizeChord(correct[i]), correct[i],
            "should preserve " + correct[i]);
    }
});

test("normalizeChord preserves all correct solfeo chords with quality", function() {
    var correct = ["Lam", "Re7", "Fa#m", "Sib7", "Sol#m7", "Dom7b5",
                   "DoM7", "Reo7", "Sim6", "Fa#dim", "Solaug", "Lasus4"];
    for (var i = 0; i < correct.length; i++) {
        assert.equal(cu.normalizeChord(correct[i]), correct[i],
            "should preserve " + correct[i]);
    }
});

test("normalizeChord preserves all correct anglo chords", function() {
    var correct = ["Am", "D7", "F#m", "Bb7", "G#m7", "Cm7b5",
                   "CM7", "Bo7", "Bm6", "C", "D", "E", "F", "G", "A", "B",
                   "Eb", "Ab", "Db", "Gb", "Cb", "Fb", "Bb"];
    for (var i = 0; i < correct.length; i++) {
        assert.equal(cu.normalizeChord(correct[i]), correct[i],
            "should preserve " + correct[i]);
    }
});

// --- Edge cases ---

test("normalizeChord handles null and empty", function() {
    assert.equal(cu.normalizeChord(null), null);
    assert.equal(cu.normalizeChord(""), "");
    assert.equal(cu.normalizeChord(undefined), undefined);
});

test("normalizeChord does not corrupt non-chord text", function() {
    assert.equal(cu.normalizeChord("N.C."), "N.C.");
    assert.equal(cu.normalizeChord("Bajos"), "Bajos");
    assert.equal(cu.normalizeChord("INTRO"), "INTRO");
    assert.equal(cu.normalizeChord("Rasgueo"), "Rasgueo");
});

// --- Annotation safety: text used as Harmony but not actual chords ---

test("normalizeChord does not alter guitar annotations used as Harmony", function() {
    // These are common annotation texts that users put in Harmony elements
    var annotations = [
        "SOLO", "Solo", "Bajos", "Rasgueo", "Punteo", "Arpeggio",
        "Cejilla", "Intro", "INTRO", "Puente", "FADE", "STOP",
        "simile", "tacet", "N.C.", "fade out"
    ];
    for (var i = 0; i < annotations.length; i++) {
        assert.equal(cu.normalizeChord(annotations[i]), annotations[i],
            "should not alter annotation: " + annotations[i]);
    }
});

test("normalizeChord does not alter multi-word annotations with solfeo-like starts", function() {
    // These start with note names but are not chords
    assert.equal(cu.normalizeChord("La Cejilla"), "La Cejilla");
    assert.equal(cu.normalizeChord("Mi Solo"), "Mi Solo");
    assert.equal(cu.normalizeChord("Do Mayor"), "Do Mayor");
    assert.equal(cu.normalizeChord("Re Menor"), "Re Menor");
    assert.equal(cu.normalizeChord("Sol Mayor"), "Sol Mayor");
    assert.equal(cu.normalizeChord("Fa Sostenido"), "Fa Sostenido");
});

// --- chordToTpc + normalizeChord round-trip ---

test("normalizeChord + chordToTpc round-trips produce correct TPC for all typo patterns", function() {
    var cases = [
        { input: "SI b",    tpc: 12, quality: "" },     // Sib
        { input: "RE 7",    tpc: 16, quality: "7" },    // Re7
        { input: "Faa #m",  tpc: 20, quality: "m" },    // Fa#m
        { input: "LA 7",    tpc: 17, quality: "7" },    // La7
        { input: "Sol #m",  tpc: 22, quality: "m" },    // Sol#m
        { input: "Do-#m",   tpc: 21, quality: "m" },    // Do#m
        { input: "MI",      tpc: 18, quality: "" },      // Mi
        { input: "Mi m",    tpc: 18, quality: "m" },     // Mim
        { input: "FaA",     tpc: 13, quality: "" },      // Fa
        { input: "SOL",     tpc: 15, quality: "" },      // Sol
        { input: "SI 7",    tpc: 19, quality: "7" },     // Si7
        { input: "SI b 7",  tpc: 12, quality: "7" },     // Sib7
    ];
    for (var i = 0; i < cases.length; i++) {
        var normalized = cu.normalizeChord(cases[i].input);
        var parsed = Constants.chordToTpc(normalized);
        assert.ok(parsed, cases[i].input + " should parse after normalize");
        assert.equal(parsed.rootTpc, cases[i].tpc,
            cases[i].input + " -> rootTpc should be " + cases[i].tpc + " (got " + parsed.rootTpc + ")");
        assert.equal(parsed.quality, cases[i].quality,
            cases[i].input + " -> quality should be " + cases[i].quality + " (got " + parsed.quality + ")");
    }
});

// ========================================
// normalizeChords: batch + typo reporting
// ========================================

test("normalizeChords modifies array in place and returns typos", function() {
    var chords = [
        { tick: 0, chord: "SI b" },
        { tick: 480, chord: "Faa #m" },
        { tick: 960, chord: "RE 7" },
        { tick: 1440, chord: "Lam" }
    ];
    var typos = cu.normalizeChords(chords);
    assert.equal(chords[0].chord, "Sib");
    assert.equal(chords[1].chord, "Fa#m");
    assert.equal(chords[2].chord, "Re7");
    assert.equal(chords[3].chord, "Lam");
    assert.equal(typos.length, 3);
    assert.equal(typos[0].original, "SI b");
    assert.equal(typos[0].normalized, "Sib");
    assert.equal(typos[1].original, "Faa #m");
    assert.equal(typos[1].normalized, "Fa#m");
    assert.equal(typos[2].original, "RE 7");
    assert.equal(typos[2].normalized, "Re7");
});

test("normalizeChords deduplicates repeated typos", function() {
    var chords = [
        { tick: 0, chord: "SI b" },
        { tick: 480, chord: "RE 7" },
        { tick: 960, chord: "SI b" },
        { tick: 1440, chord: "RE 7" },
        { tick: 1920, chord: "Lam" }
    ];
    var typos = cu.normalizeChords(chords);
    assert.equal(typos.length, 2);
    assert.equal(chords[0].chord, "Sib");
    assert.equal(chords[2].chord, "Sib");
});

test("normalizeChords returns empty array when no typos", function() {
    var chords = [
        { tick: 0, chord: "Lam" },
        { tick: 480, chord: "Re7" },
        { tick: 960, chord: "Fa#m" },
        { tick: 1440, chord: "Sib" }
    ];
    var typos = cu.normalizeChords(chords);
    assert.equal(typos.length, 0);
});

test("normalizeChords handles empty array", function() {
    var typos = cu.normalizeChords([]);
    assert.equal(typos.length, 0);
});

// ========================================
// prettifyChord: b -> ♭, o -> °
// ========================================

// --- Flat replacement in solfeo roots ---

test("prettifyChord replaces flat in every solfeo root", function() {
    assert.equal(cu.prettifyChord("Sib"), "Si\u266D");
    assert.equal(cu.prettifyChord("Mib"), "Mi\u266D");
    assert.equal(cu.prettifyChord("Lab"), "La\u266D");
    assert.equal(cu.prettifyChord("Reb"), "Re\u266D");
    assert.equal(cu.prettifyChord("Solb"), "Sol\u266D");
    assert.equal(cu.prettifyChord("Dob"), "Do\u266D");
    assert.equal(cu.prettifyChord("Fab"), "Fa\u266D");
});

test("prettifyChord replaces flat with quality suffix", function() {
    assert.equal(cu.prettifyChord("Sib7"), "Si\u266D7");
    assert.equal(cu.prettifyChord("Sibm"), "Si\u266Dm");
    assert.equal(cu.prettifyChord("MibM7"), "Mi\u266DM7");
    assert.equal(cu.prettifyChord("Labm7"), "La\u266Dm7");
});

test("prettifyChord replaces double flat in solfeo", function() {
    assert.equal(cu.prettifyChord("Sibb"), "Si\u266D\u266D");
    assert.equal(cu.prettifyChord("Labb"), "La\u266D\u266D");
    assert.equal(cu.prettifyChord("Rebb"), "Re\u266D\u266D");
    assert.equal(cu.prettifyChord("Solbb"), "Sol\u266D\u266D");
    assert.equal(cu.prettifyChord("Dobb"), "Do\u266D\u266D");
    assert.equal(cu.prettifyChord("Mibb"), "Mi\u266D\u266D");
    assert.equal(cu.prettifyChord("Fabb"), "Fa\u266D\u266D");
});

// --- Flat replacement in anglo roots ---

test("prettifyChord replaces flat in every anglo root", function() {
    assert.equal(cu.prettifyChord("Bb"), "B\u266D");
    assert.equal(cu.prettifyChord("Eb"), "E\u266D");
    assert.equal(cu.prettifyChord("Ab"), "A\u266D");
    assert.equal(cu.prettifyChord("Db"), "D\u266D");
    assert.equal(cu.prettifyChord("Gb"), "G\u266D");
    assert.equal(cu.prettifyChord("Cb"), "C\u266D");
    assert.equal(cu.prettifyChord("Fb"), "F\u266D");
});

test("prettifyChord replaces flat in anglo with quality", function() {
    assert.equal(cu.prettifyChord("Bb7"), "B\u266D7");
    assert.equal(cu.prettifyChord("Ebm"), "E\u266Dm");
    assert.equal(cu.prettifyChord("AbM7"), "A\u266DM7");
});

test("prettifyChord replaces double flat in anglo", function() {
    assert.equal(cu.prettifyChord("Bbb"), "B\u266D\u266D");
    assert.equal(cu.prettifyChord("Abb"), "A\u266D\u266D");
});

// --- Diminished marker ---

test("prettifyChord replaces lowercase o -> degree sign", function() {
    assert.equal(cu.prettifyChord("Reo7"), "Re\u00B07");
    assert.equal(cu.prettifyChord("Reo"), "Re\u00B0");
    assert.equal(cu.prettifyChord("Lao7"), "La\u00B07");
    assert.equal(cu.prettifyChord("Do7"), "Do7"); // 'o' is part of root, not diminished
    assert.equal(cu.prettifyChord("Bo7"), "B\u00B07");
    assert.equal(cu.prettifyChord("Ao"), "A\u00B0");
});

test("prettifyChord replaces uppercase O -> degree sign", function() {
    assert.equal(cu.prettifyChord("ReO7"), "Re\u00B07");
    assert.equal(cu.prettifyChord("LaO"), "La\u00B0");
    assert.equal(cu.prettifyChord("BO7"), "B\u00B07");
});

test("prettifyChord does not confuse diminished with root containing o", function() {
    // "Do" root: the 'o' is part of the root, not a diminished marker
    assert.equal(cu.prettifyChord("Do"), "Do");
    assert.equal(cu.prettifyChord("Do7"), "Do7");
    assert.equal(cu.prettifyChord("Dom"), "Dom");
    // "Sol" root: no trailing 'o'
    assert.equal(cu.prettifyChord("Sol"), "Sol");
    assert.equal(cu.prettifyChord("Sol7"), "Sol7");
});

// --- Flat before digits in suffix ---

test("prettifyChord replaces flat before digits in suffix", function() {
    assert.equal(cu.prettifyChord("Rem7b5"), "Rem7\u266D5");
    assert.equal(cu.prettifyChord("Am7b5"), "Am7\u266D5");
    assert.equal(cu.prettifyChord("Lam7b5"), "Lam7\u266D5");
    assert.equal(cu.prettifyChord("Bb7b9"), "B\u266D7\u266D9");
    assert.equal(cu.prettifyChord("Do7b9b13"), "Do7\u266D9\u266D13");
});

// --- Preserves sharps (no change) ---

test("prettifyChord preserves sharps unchanged", function() {
    assert.equal(cu.prettifyChord("Fa#m"), "Fa#m");
    assert.equal(cu.prettifyChord("Do#"), "Do#");
    assert.equal(cu.prettifyChord("Sol#m7"), "Sol#m7");
    assert.equal(cu.prettifyChord("F#"), "F#");
    assert.equal(cu.prettifyChord("C#m7"), "C#m7");
    assert.equal(cu.prettifyChord("G#"), "G#");
});

test("prettifyChord preserves double sharps", function() {
    assert.equal(cu.prettifyChord("Fa##"), "Fa##");
    assert.equal(cu.prettifyChord("Do##"), "Do##");
    assert.equal(cu.prettifyChord("C##"), "C##");
});

// --- No change on clean chords ---

test("prettifyChord preserves chords without flats or diminished", function() {
    var clean = ["Lam", "Re7", "Sol", "Do", "Mi", "Fa", "Si",
                 "Am", "D7", "G", "C", "E", "F", "B",
                 "Fa#m", "Do#m7", "G#m7", "C#dim"];
    for (var i = 0; i < clean.length; i++) {
        assert.equal(cu.prettifyChord(clean[i]), clean[i],
            "should preserve " + clean[i]);
    }
});

// --- Edge cases ---

test("prettifyChord handles null, empty, undefined", function() {
    assert.equal(cu.prettifyChord(null), null);
    assert.equal(cu.prettifyChord(""), "");
    assert.equal(cu.prettifyChord(undefined), undefined);
});

test("prettifyChord passes through non-chord text", function() {
    assert.equal(cu.prettifyChord("N.C."), "N.C.");
    assert.equal(cu.prettifyChord("Bajos"), "Bajos");
    assert.equal(cu.prettifyChord("INTRO"), "INTRO");
    assert.equal(cu.prettifyChord("Rasgueo"), "Rasgueo");
});

// --- Batch operation ---

test("prettifyChords modifies array in place", function() {
    var chords = [
        { tick: 0, chord: "Sib" },
        { tick: 480, chord: "Reo7" },
        { tick: 960, chord: "Lam" },
        { tick: 1440, chord: "Fa#m" },
        { tick: 1920, chord: "Mib" }
    ];
    cu.prettifyChords(chords);
    assert.equal(chords[0].chord, "Si\u266D");
    assert.equal(chords[1].chord, "Re\u00B07");
    assert.equal(chords[2].chord, "Lam");
    assert.equal(chords[3].chord, "Fa#m");
    assert.equal(chords[4].chord, "Mi\u266D");
});

// --- Full pipeline: normalize -> prettify ---

test("normalize then prettify produces correct display chord", function() {
    // Simulates the full QML plugin pipeline
    var cases = [
        ["SI b",    "Si\u266D"],
        ["RE 7",    "Re7"],
        ["Faa #m",  "Fa#m"],
        ["FaA",     "Fa"],
        ["LA 7",    "La7"],
        ["ReO 7",   "Re\u00B07"],
        ["Sol #m",  "Sol#m"],
        ["Do-#m",   "Do#m"],
        ["Mi m",    "Mim"],
        ["Si b",    "Si\u266D"],
        ["MI",      "Mi"],
        ["SOL",     "Sol"],
    ];
    for (var i = 0; i < cases.length; i++) {
        var normalized = cu.normalizeChord(cases[i][0]);
        var pretty = cu.prettifyChord(normalized);
        assert.equal(pretty, cases[i][1],
            cases[i][0] + " -> normalize -> prettify should be " + cases[i][1]);
    }
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
var Constants = require("../../lib/constants");

// ========================================
// chordToTpc: parse chord name to root TPC + quality
// ========================================

test("chordToTpc parses solfeo roots", function() {
    assert.deepEqual(Constants.chordToTpc("Do"), { rootTpc: 14, quality: "" });
    assert.deepEqual(Constants.chordToTpc("Re"), { rootTpc: 16, quality: "" });
    assert.deepEqual(Constants.chordToTpc("Mi"), { rootTpc: 18, quality: "" });
    assert.deepEqual(Constants.chordToTpc("Fa"), { rootTpc: 13, quality: "" });
    assert.deepEqual(Constants.chordToTpc("Sol"), { rootTpc: 15, quality: "" });
    assert.deepEqual(Constants.chordToTpc("La"), { rootTpc: 17, quality: "" });
    assert.deepEqual(Constants.chordToTpc("Si"), { rootTpc: 19, quality: "" });
});

test("chordToTpc parses solfeo with accidentals", function() {
    assert.deepEqual(Constants.chordToTpc("Sib"), { rootTpc: 12, quality: "" });
    assert.deepEqual(Constants.chordToTpc("Fa#"), { rootTpc: 20, quality: "" });
    assert.deepEqual(Constants.chordToTpc("Mib"), { rootTpc: 11, quality: "" });
    assert.deepEqual(Constants.chordToTpc("Sol#"), { rootTpc: 22, quality: "" });
    assert.deepEqual(Constants.chordToTpc("Do##"), { rootTpc: 28, quality: "" });
    assert.deepEqual(Constants.chordToTpc("Rebb"), { rootTpc: 2, quality: "" });
});

test("chordToTpc separates quality suffix", function() {
    assert.deepEqual(Constants.chordToTpc("Lam"), { rootTpc: 17, quality: "m" });
    assert.deepEqual(Constants.chordToTpc("Re7"), { rootTpc: 16, quality: "7" });
    assert.deepEqual(Constants.chordToTpc("Fa#m"), { rootTpc: 20, quality: "m" });
    assert.deepEqual(Constants.chordToTpc("Sibm7"), { rootTpc: 12, quality: "m7" });
    assert.deepEqual(Constants.chordToTpc("Do#m7"), { rootTpc: 21, quality: "m7" });
    assert.deepEqual(Constants.chordToTpc("Sol#m"), { rootTpc: 22, quality: "m" });
});

test("chordToTpc parses anglo roots", function() {
    assert.deepEqual(Constants.chordToTpc("Am"), { rootTpc: 17, quality: "m" });
    assert.deepEqual(Constants.chordToTpc("D7"), { rootTpc: 16, quality: "7" });
    assert.deepEqual(Constants.chordToTpc("Bb"), { rootTpc: 12, quality: "" });
    assert.deepEqual(Constants.chordToTpc("F#m"), { rootTpc: 20, quality: "m" });
    assert.deepEqual(Constants.chordToTpc("C"), { rootTpc: 14, quality: "" });
});

test("chordToTpc returns null for non-chord text", function() {
    assert.equal(Constants.chordToTpc("N.C."), null);
    assert.equal(Constants.chordToTpc("INTRO"), null);
    assert.equal(Constants.chordToTpc("123"), null);
    assert.equal(Constants.chordToTpc(""), null);
    assert.equal(Constants.chordToTpc(null), null);
});

test("chordToTpc picks longest matching root", function() {
    // "Sib" should match "Sib" (TPC 12), not "Si" (TPC 19) + leftover "b"
    var result = Constants.chordToTpc("Sib7");
    assert.equal(result.rootTpc, 12);
    assert.equal(result.quality, "7");

    // "Fa#m" should match "Fa#" (TPC 20), not "Fa" (TPC 13) + leftover "#m"
    var result2 = Constants.chordToTpc("Fa#m");
    assert.equal(result2.rootTpc, 20);
    assert.equal(result2.quality, "m");
});

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

test("tpcToChordName appends bass note for slash chords", function() {
    // TPC 12 = Bb/Sib, 13 = F/Fa, 17 = A/La, 18 = E/Mi
    assert.equal(Constants.tpcToChordName(12, "", "standard", 13), "Bb/F");
    assert.equal(Constants.tpcToChordName(12, "", "solfeggio", 13), "Sib/Fa");
    assert.equal(Constants.tpcToChordName(17, "m", "standard", 18), "Am/E");
    assert.equal(Constants.tpcToChordName(14, "maj7", "solfeggio", 18), "Domaj7/Mi");
});

test("tpcToChordName ignores absent or invalid bass TPC", function() {
    assert.equal(Constants.tpcToChordName(12, "", "standard"), "Bb");
    assert.equal(Constants.tpcToChordName(12, "", "standard", -99), "Bb");
    assert.equal(Constants.tpcToChordName(12, "", "standard", undefined), "Bb");
    assert.equal(Constants.tpcToChordName(12, "", "standard", NaN), "Bb");
});

test("tpcToChordName keeps bass note when the root is literal text", function() {
    assert.equal(Constants.tpcToChordName(-99, "Bajos", "standard", 13), "Bajos");
});

test("tpcToChordName handles french spelling same as solfeggio", function() {
    assert.equal(Constants.tpcToChordName(17, "m", "french"), "Lam");
    assert.equal(Constants.tpcToChordName(14, "", "french"), "Do");
});

// ============================================================
// Text annotations sharing a tick with a real chord
// ============================================================

test("findChordAtTick prefers a harmony over a text annotation at the same tick", function() {
    var mixed = [
        { tick: 0, chord: "Do" },
        { tick: 480, chord: "Solo", isText: true },
        { tick: 480, chord: "Sol" },
        { tick: 960, chord: "Lam" }
    ];
    assert.equal(cu.findChordAtTick(mixed, 480), "Sol");
    assert.equal(cu.findChordAtTick(mixed, 700), "Sol", "annotation must not become the carried chord");
});

test("findChordAtTick prefers the harmony when the annotation comes first in tick order", function() {
    var mixed = [
        { tick: 0, chord: "Do" },
        { tick: 480, chord: "Sol" },
        { tick: 480, chord: "A-cappella", isText: true },
        { tick: 960, chord: "Lam" }
    ];
    assert.equal(cu.findChordAtTick(mixed, 480), "Sol");
    assert.equal(cu.findChordAtTick(mixed, 900), "Sol");
});

test("findChordAtTick still returns an annotation when no harmony shares its tick", function() {
    var mixed = [
        { tick: 0, chord: "Do" },
        { tick: 480, chord: "Solo", isText: true }
    ];
    assert.equal(cu.findChordAtTick(mixed, 480), "Solo");
});

test("findChordInRange prefers a harmony over a text annotation at the same tick", function() {
    var mixed = [
        { tick: 480, chord: "Solo", isText: true },
        { tick: 480, chord: "Sol" },
        { tick: 960, chord: "Lam" }
    ];
    assert.equal(cu.findChordInRange(mixed, 700, 0, 960), "Sol");
});

// ============================================================
// Jazz font triangle qualities and the double-flat table
// ============================================================

test("tpcToChordName translates jazz triangle qualities", function() {
    // MuseScore jazz chord symbols store a major seventh as the quality "t"
    assert.equal(Constants.tpcToChordName(11, "t", "standard"), "Ebmaj7");
    assert.equal(Constants.tpcToChordName(11, "t", "solfeggio"), "Mibmaj7");
    assert.equal(Constants.tpcToChordName(14, "t9", "standard"), "Cmaj9");
    assert.equal(Constants.tpcToChordName(14, "t9", "solfeggio"), "Domaj9");
});

test("tpcToChordName leaves other qualities untouched", function() {
    assert.equal(Constants.tpcToChordName(14, "m", "standard"), "Cm");
    assert.equal(Constants.tpcToChordName(14, "maj7", "standard"), "Cmaj7");
    assert.equal(Constants.tpcToChordName(14, "sus4", "standard"), "Csus4");
    assert.equal(Constants.tpcToChordName(14, "7", "standard"), "C7");
    // A quality that merely starts with t must not be rewritten
    assert.equal(Constants.tpcToChordName(14, "tristeza", "standard"), "Ctristeza");
});

test("tpcToNoteName spells the lowest TPC in solfeo", function() {
    // TPC -1 is F double flat: every other entry of the table is solfeo
    assert.equal(Constants.tpcToNoteName(-1), "Fabb");
    assert.equal(Constants.tpcToNoteName(0), "Dobb");
});

// ============================================================
// convertChord: slash chords and false root matches
// ============================================================

test("convertChord converts the bass note of a slash chord", function() {
    assert.equal(cu.convertChord("Bb/F", true), "Sib/Fa");
    assert.equal(cu.convertChord("Sib/Fa", false), "Bb/F");
    assert.equal(cu.convertChord("Am/E", true), "Lam/Mi");
    assert.equal(cu.convertChord("Lam/Mi", false), "Am/E");
    assert.equal(cu.convertChord("Cmaj7/G", true), "Domaj7/Sol");
});

test("convertChord leaves anglo chords alone when converting to anglo", function() {
    // "Fadd9" starts with the solfeo root "Fa", but "dd9" is not a chord quality
    assert.equal(cu.convertChord("Fadd9", false), "Fadd9");
    assert.equal(cu.convertChord("Fadd4", false), "Fadd4");
    assert.equal(cu.convertChord("Fa", false), "F");
    assert.equal(cu.convertChord("Fam", false), "Fm");
    assert.equal(cu.convertChord("Fa7", false), "F7");
});

test("convertChord does not touch words that start like a root", function() {
    assert.equal(cu.convertChord("Solo", false), "Solo");
    assert.equal(cu.convertChord("Solista", false), "Solista");
    assert.equal(cu.convertChord("Doble", false), "Doble");
    assert.equal(cu.convertChord("Mismo", false), "Mismo");
    assert.equal(cu.convertChord("Bass", true), "Bass");
});

test("convertChord keeps converting real qualities", function() {
    assert.equal(cu.convertChord("Domaj7", false), "Cmaj7");
    assert.equal(cu.convertChord("Solsus4", false), "Gsus4");
    assert.equal(cu.convertChord("Ladim", false), "Adim");
    assert.equal(cu.convertChord("Mi7(b5)", false), "E7(b5)");
    assert.equal(cu.convertChord("Sib9", false), "Bb9");
});

// ============================================================
// isChordName: chord names vs annotation text
// ============================================================

test("isChordName accepts chord names in both spellings", function() {
    ["Do", "Lam", "Sol7", "Sib", "Sib/Fa", "Do#m7", "Mi7(b5)", "Domaj7", "Fa##",
     "C", "Am", "G7", "Bb", "Bb/F", "C#m7", "Cmaj7", "Csus4", "Adim"].forEach(function(name) {
        assert.equal(cu.isChordName(name), true, name + " should be a chord");
    });
});

test("isChordName rejects annotation text", function() {
    ["Solo", "Solista", "Doble", "A-cappella", "Muy-lento", "-CAPELLA-", "8va-2nd-time",
     "Bass", "N.C.", "rit.", "harmonics", "", null].forEach(function(text) {
        assert.equal(cu.isChordName(text), false, JSON.stringify(text) + " should not be a chord");
    });
});
