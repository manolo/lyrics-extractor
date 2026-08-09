// Lyrics Extractor for MuseScore
// Copyright (C) 2026 Manolo Carrasco (do2tis)
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Licensed under the GNU General Public License version 3 or later, with an
// additional attribution requirement under section 7(b): see LICENSE.

var test = require("node:test");
var assert = require("node:assert/strict");
var fixer = require("../../lib/lyrics-fixer");

// ============================================================
// syllabicFromString / syllabicToString
// ============================================================

test("syllabicFromString converts string to integer", function() {
    assert.equal(fixer.syllabicFromString("single"), 0);
    assert.equal(fixer.syllabicFromString("begin"), 1);
    assert.equal(fixer.syllabicFromString("end"), 2);
    assert.equal(fixer.syllabicFromString("middle"), 3);
    assert.equal(fixer.syllabicFromString("unknown"), 0);
    assert.equal(fixer.syllabicFromString(undefined), 0);
});

test("syllabicToString converts integer to string", function() {
    assert.equal(fixer.syllabicToString(0), "single");
    assert.equal(fixer.syllabicToString(1), "begin");
    assert.equal(fixer.syllabicToString(2), "end");
    assert.equal(fixer.syllabicToString(3), "middle");
    assert.equal(fixer.syllabicToString(99), "single");
});

// ============================================================
// checkLyrics
// ============================================================

test("checkLyrics detects synalepha candidates", function() {
    var groups = { "0_0_0": [
        { text: "da.es", syllabic: 0 },
        { text: "normal", syllabic: 0 }
    ]};
    var result = fixer.checkLyrics(groups);
    assert.equal(result.synalepha, 1);
});

test("checkLyrics detects manual hyphens", function() {
    var groups = { "0_0_0": [
        { text: "-can", syllabic: 0 },
        { text: "tar-", syllabic: 0 },
        { text: "normal", syllabic: 0 }
    ]};
    var result = fixer.checkLyrics(groups);
    assert.equal(result.hyphens, 2);
});

test("checkLyrics detects broken syllabic chains", function() {
    var groups = { "0_0_0": [
        { text: "can", syllabic: 1 },  // begin
        { text: "tar", syllabic: 0 }   // single (should be end)
    ]};
    var result = fixer.checkLyrics(groups);
    assert.equal(result.syllabic, 1);
    assert.equal(result.syllabicExamples.length, 1);
    assert.equal(result.syllabicExamples[0], "can--tar");
});

test("checkLyrics detects punctuation issues", function() {
    var groups = { "0_0_0": [
        { text: "hola...", syllabic: 0 },
        { text: "si,,", syllabic: 0 },
        { text: "fin;", syllabic: 0 },
        { text: "ok", syllabic: 0 }
    ]};
    var result = fixer.checkLyrics(groups);
    assert.equal(result.punctuation, 3);
});

test("checkLyrics limits syllabic examples to 4", function() {
    var group = [];
    for (var i = 0; i < 10; i++) {
        group.push({ text: "a", syllabic: 1 });
        group.push({ text: "b", syllabic: 0 });
    }
    var result = fixer.checkLyrics({ "0_0_0": group });
    assert.equal(result.syllabicExamples.length, 4);
});

test("checkLyrics handles multiple groups independently", function() {
    var groups = {
        "0_0_0": [
            { text: "da.es", syllabic: 0 }
        ],
        "0_0_1": [
            { text: "la.o", syllabic: 0 }
        ]
    };
    var result = fixer.checkLyrics(groups);
    assert.equal(result.synalepha, 2);
});

test("checkLyrics returns zero counts for clean lyrics", function() {
    var groups = { "0_0_0": [
        { text: "hello", syllabic: 0 },
        { text: "world", syllabic: 0 }
    ]};
    var result = fixer.checkLyrics(groups);
    assert.equal(result.synalepha, 0);
    assert.equal(result.hyphens, 0);
    assert.equal(result.syllabic, 0);
    assert.equal(result.punctuation, 0);
});

// ============================================================
// checkChordSync
// ============================================================

test("checkChordSync detects missing chords on tab staff", function() {
    var chords = [
        { tick: 0, text: "Am", staffIndex: 0, isTabStaff: false },
        { tick: 480, text: "C", staffIndex: 0, isTabStaff: false },
        { tick: 0, text: "Am", staffIndex: 1, isTabStaff: true }
        // tick 480 missing on tab
    ];
    var result = fixer.checkChordSync(chords, { 1: true });
    assert.equal(result.chordSync, 1);
});

test("checkChordSync detects genuinely different chords", function() {
    var chords = [
        { tick: 0, text: "Am", staffIndex: 0, isTabStaff: false },
        { tick: 0, text: "Em", staffIndex: 1, isTabStaff: true }
    ];
    var result = fixer.checkChordSync(chords, { 1: true });
    assert.equal(result.chordSync, 1);
});

test("checkChordSync returns 0 when no tab staves", function() {
    var chords = [
        { tick: 0, text: "Am", staffIndex: 0, isTabStaff: false }
    ];
    var result = fixer.checkChordSync(chords, {});
    assert.equal(result.chordSync, 0);
});

test("checkChordSync returns 0 when all synced (same spelling)", function() {
    var chords = [
        { tick: 0, text: "Am", staffIndex: 0, isTabStaff: false },
        { tick: 0, text: "Am", staffIndex: 1, isTabStaff: true },
        { tick: 480, text: "C", staffIndex: 0, isTabStaff: false },
        { tick: 480, text: "C", staffIndex: 1, isTabStaff: true }
    ];
    var result = fixer.checkChordSync(chords, { 1: true });
    assert.equal(result.chordSync, 0);
});

test("checkChordSync returns 0 when synced across solfeo/anglo spelling", function() {
    // Principal uses solfeo, tab uses anglo: same chord, different names
    var chords = [
        { tick: 0, text: "Lam", staffIndex: 0, isTabStaff: false },
        { tick: 0, text: "Am", staffIndex: 1, isTabStaff: true },
        { tick: 480, text: "Re7", staffIndex: 0, isTabStaff: false },
        { tick: 480, text: "D7", staffIndex: 1, isTabStaff: true },
        { tick: 960, text: "Sib", staffIndex: 0, isTabStaff: false },
        { tick: 960, text: "Bb", staffIndex: 1, isTabStaff: true }
    ];
    var result = fixer.checkChordSync(chords, { 1: true });
    assert.equal(result.chordSync, 0);
});

test("checkChordSync returns 0 when synced despite typos on both sides", function() {
    // Real MilagroDeTusOjos data: principal solfeo typos, tab anglo typos
    var chords = [
        { tick: 0, text: "SI b", staffIndex: 3, isTabStaff: false },
        { tick: 0, text: "B b", staffIndex: 4, isTabStaff: true },
        { tick: 480, text: "La m", staffIndex: 3, isTabStaff: false },
        { tick: 480, text: "A m", staffIndex: 4, isTabStaff: true },
        { tick: 960, text: "RE 7", staffIndex: 3, isTabStaff: false },
        { tick: 960, text: "D 7", staffIndex: 4, isTabStaff: true }
    ];
    var result = fixer.checkChordSync(chords, { 4: true });
    assert.equal(result.chordSync, 0);
});

test("checkChordSync still detects real mismatches with typos present", function() {
    var chords = [
        { tick: 0, text: "SI b", staffIndex: 3, isTabStaff: false },
        { tick: 0, text: "B b", staffIndex: 4, isTabStaff: true },
        { tick: 480, text: "La m", staffIndex: 3, isTabStaff: false },
        { tick: 480, text: "E m", staffIndex: 4, isTabStaff: true }  // Em != Lam
    ];
    var result = fixer.checkChordSync(chords, { 4: true });
    assert.equal(result.chordSync, 1);
});

test("checkChordSync detects all missing when tab staff has zero chords", function() {
    var chords = [
        { tick: 0, text: "Am", staffIndex: 7, isTabStaff: false },
        { tick: 480, text: "C", staffIndex: 7, isTabStaff: false }
        // tab staff 8 exists but has no chords at all
    ];
    var result = fixer.checkChordSync(chords, { 8: true });
    assert.equal(result.chordSync, 2);
});

test("checkChordSync handles complex solfeo/anglo pairs with accidentals", function() {
    var chords = [
        { tick: 0, text: "Fa#m", staffIndex: 0, isTabStaff: false },
        { tick: 0, text: "F#m", staffIndex: 1, isTabStaff: true },
        { tick: 480, text: "Sol#m", staffIndex: 0, isTabStaff: false },
        { tick: 480, text: "G#m", staffIndex: 1, isTabStaff: true },
        { tick: 960, text: "Do#m", staffIndex: 0, isTabStaff: false },
        { tick: 960, text: "C#m", staffIndex: 1, isTabStaff: true }
    ];
    var result = fixer.checkChordSync(chords, { 1: true });
    assert.equal(result.chordSync, 0);
});

// ============================================================
// fixGroup: text transformations
// ============================================================

test("fixGroup converts synalepha", function() {
    var group = [{ text: "da.es", syllabic: 0 }];
    var patches = fixer.fixGroup(group);
    assert.equal(patches.length, 1);
    assert.equal(patches[0].newText, "da\u203Fes");
});

test("fixGroup converts punctuation sequences", function() {
    var group = [
        { text: "hola...", syllabic: 0 },
        { text: "si,,", syllabic: 0 },
        { text: "A..", syllabic: 0 }
    ];
    var patches = fixer.fixGroup(group);
    assert.equal(patches[0].newText, "hola\u2026");     // ellipsis
    assert.equal(patches[1].newText, "si\uFE50");       // small comma
    assert.equal(patches[2].newText, "A\uFE52");        // small full stop
});

test("fixGroup converts semicolons to fullwidth comma", function() {
    var group = [{ text: "hola;", syllabic: 0 }];
    var patches = fixer.fixGroup(group);
    assert.equal(patches[0].newText, "hola\uFF0C");
});

test("fixGroup returns empty patches for clean text", function() {
    var group = [{ text: "hello", syllabic: 0 }];
    var patches = fixer.fixGroup(group);
    assert.equal(patches.length, 0);
});

// ============================================================
// fixGroup: hyphen handling and syllabic
// ============================================================

test("fixGroup strips hyphens and sets syllabic begin/end", function() {
    var group = [
        { text: "can-", syllabic: 0 },
        { text: "tar", syllabic: 0 }
    ];
    var patches = fixer.fixGroup(group);
    var patchMap = {};
    for (var i = 0; i < patches.length; i++) patchMap[patches[i].index] = patches[i];

    assert.equal(patchMap[0].newText, "can");
    assert.equal(patchMap[0].newSyllabic, 1); // begin
    assert.equal(patchMap[1].newSyllabic, 2); // end
});

test("fixGroup handles leading hyphens", function() {
    var group = [
        { text: "can-", syllabic: 0 },
        { text: "-tar", syllabic: 0 }
    ];
    var patches = fixer.fixGroup(group);
    var patchMap = {};
    for (var i = 0; i < patches.length; i++) patchMap[patches[i].index] = patches[i];

    assert.equal(patchMap[0].newText, "can");
    assert.equal(patchMap[0].newSyllabic, 1); // begin
    assert.equal(patchMap[1].newText, "tar");
    assert.equal(patchMap[1].newSyllabic, 2); // end
});

test("fixGroup handles 3-syllable chain with hyphens", function() {
    var group = [
        { text: "can-", syllabic: 0 },
        { text: "-ta-", syllabic: 0 },
        { text: "dor", syllabic: 0 }
    ];
    var patches = fixer.fixGroup(group);
    var patchMap = {};
    for (var i = 0; i < patches.length; i++) patchMap[patches[i].index] = patches[i];

    assert.equal(patchMap[0].newSyllabic, 1); // begin
    assert.equal(patchMap[1].newSyllabic, 3); // middle
    assert.equal(patchMap[2].newSyllabic, 2); // end
});

// ============================================================
// fixGroup: syllabic chain repair
// ============================================================

test("fixGroup repairs broken syllabic chain (begin followed by single)", function() {
    var group = [
        { text: "can", syllabic: 1 },  // begin
        { text: "tar", syllabic: 0 }   // single -> should become end
    ];
    var patches = fixer.fixGroup(group);
    assert.equal(patches.length, 1);
    assert.equal(patches[0].index, 1);
    assert.equal(patches[0].newSyllabic, 2); // end
});

test("fixGroup repairs broken chain with 3-lookahead (middle follows)", function() {
    var group = [
        { text: "can", syllabic: 1 },  // begin
        { text: "ta", syllabic: 0 },   // single -> should become middle (next is end)
        { text: "dor", syllabic: 2 }   // end
    ];
    var patches = fixer.fixGroup(group);
    assert.equal(patches.length, 1);
    assert.equal(patches[0].index, 1);
    assert.equal(patches[0].newSyllabic, 3); // middle (because next is end)
});

test("fixGroup does not patch already correct syllabic chains", function() {
    var group = [
        { text: "can", syllabic: 1 },  // begin
        { text: "tar", syllabic: 2 }   // end
    ];
    var patches = fixer.fixGroup(group);
    assert.equal(patches.length, 0);
});

// ============================================================
// fixAll
// ============================================================

test("fixAll processes multiple groups", function() {
    var groups = {
        "0_0_0": [
            { text: "da.es", syllabic: 0 }
        ],
        "0_0_1": [
            { text: "can-", syllabic: 0 },
            { text: "tar", syllabic: 0 }
        ]
    };
    var result = fixer.fixAll(groups);
    assert.equal(result.fixCount, 3); // 1 synalepha + 2 hyphen fixes
    assert.ok(result.patches["0_0_0"]);
    assert.ok(result.patches["0_0_1"]);
});

test("fixAll returns 0 fixCount for clean lyrics", function() {
    var groups = {
        "0_0_0": [
            { text: "hello", syllabic: 0 },
            { text: "world", syllabic: 0 }
        ]
    };
    var result = fixer.fixAll(groups);
    assert.equal(result.fixCount, 0);
    assert.deepEqual(result.patches, {});
});

// ============================================================
// fixGroup: combined text + syllabic fixes
// ============================================================

test("fixGroup handles synalepha + hyphens together", function() {
    var group = [
        { text: "da.es-", syllabic: 0 },
        { text: "te", syllabic: 0 }
    ];
    var patches = fixer.fixGroup(group);
    var patchMap = {};
    for (var i = 0; i < patches.length; i++) patchMap[patches[i].index] = patches[i];

    // da.es- -> synalepha applied, hyphens stripped
    assert.ok(patchMap[0]);
    assert.equal(patchMap[0].newSyllabic, 1); // begin
    assert.equal(patchMap[0].newText.indexOf("-"), -1); // no hyphens
    assert.equal(patchMap[1].newSyllabic, 2); // end
});

// ============================================================
// checkLyrics: punctuation examples
// ============================================================

test("checkLyrics returns punctuationExamples for detected issues", function() {
    var groups = {
        "0_0_0": [
            { text: "long...", syllabic: 0 },
            { text: "word", syllabic: 0 },
            { text: "da,,", syllabic: 0 },
            { text: "semi;", syllabic: 0 },
            { text: "ok", syllabic: 0 }
        ]
    };
    var result = fixer.checkLyrics(groups);
    assert.equal(result.punctuation, 3);
    assert.ok(result.punctuationExamples.length === 3);
    assert.ok(result.punctuationExamples.indexOf("long...") >= 0);
    assert.ok(result.punctuationExamples.indexOf("da,,") >= 0);
    assert.ok(result.punctuationExamples.indexOf("semi;") >= 0);
});

test("checkLyrics limits punctuationExamples to 4", function() {
    var entries = [];
    for (var i = 0; i < 10; i++) entries.push({ text: "w" + i + "...", syllabic: 0 });
    var groups = { "0_0_0": entries };
    var result = fixer.checkLyrics(groups);
    assert.equal(result.punctuation, 10);
    assert.equal(result.punctuationExamples.length, 4);
});
