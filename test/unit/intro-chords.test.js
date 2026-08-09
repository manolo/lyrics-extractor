var test = require("node:test");
var assert = require("node:assert/strict");
var IntroChords = require("../../lib/intro-chords");
var RepeatStructure = require("../../lib/expander");

test("buildIntroChordsPerf expands volta pair correctly", function() {
    // Repeat 960-8640 with volta1 (5760-8640) and volta2 (8640-9600)
    // Chords: Do@960, Sol7@2880 (main), Do@6720 (volta1), Sol7@8640 (volta2), Do@9600 (gap)
    var chords = [
        { tick: 960, chord: "Do" },
        { tick: 2880, chord: "Sol7" },
        { tick: 6720, chord: "Do" },
        { tick: 8640, chord: "Sol7" },
        { tick: 9600, chord: "Do" }
    ];
    var repeats = [{ startTick: 960, endTick: 8640 }];
    var voltas = [{ startTick: 5760, endTick: 8640 }, { startTick: 8640, endTick: 9600 }];
    var repStruct = {
        repeats: repeats, voltas: voltas,
        sections: RepeatStructure.buildSections(repeats, voltas)
    };

    var result = IntroChords.buildIntroChordsPerf(chords, repStruct, [], 11520);

    // Pass 0: Do, Sol7 (main) + Do (volta1) = Do, Sol7, Do
    // Pass 1: Do, Sol7 (main, dedup reset) + Sol7 (volta2, dedup) = Do, Sol7
    // Gap: Do@9600
    // Full: Do, Sol7, Do, Do, Sol7, Do
    assert.ok(result.length >= 5, "should have at least 5 chords: " + result.join(", "));
    assert.equal(result[0], "Do", "first chord");
    assert.equal(result[result.length - 1], "Do", "last chord should be gap Do");
});

test("buildIntroChordsPerf resets dedup between passes", function() {
    // Same chord at end of pass 0 and start of pass 1 should NOT be suppressed
    var chords = [
        { tick: 0, chord: "Lam" },
        { tick: 480, chord: "Mi7" },
        { tick: 960, chord: "Lam" }  // volta1
    ];
    var repeats = [{ startTick: 0, endTick: 960 }];
    var voltas = [{ startTick: 480, endTick: 960 }];
    var repStruct = {
        repeats: repeats, voltas: voltas,
        sections: RepeatStructure.buildSections(repeats, voltas)
    };

    var result = IntroChords.buildIntroChordsPerf(chords, repStruct, [], 2000);

    // Pass 0: Lam (main@0-480) + Lam (volta1, but Lam==lastChord -> dedup? No, volta uses full chords array)
    // The key: pass 1 starts with Lam again, dedup reset means it's NOT suppressed
    // Should have Lam appearing at the start of pass 1
    var lamCount = result.filter(function(c) { return c === "Lam"; }).length;
    assert.ok(lamCount >= 2, "Lam should appear at least twice (once per pass): " + result.join(", "));
});

test("buildIntroChordsPerf does not double-emit intro chords when repeat starts at 0 and contains lyrics (Clavelitos regression)", function() {
    // Whole-song repeat (one section spanning 0..end), with a music intro
    // before the first lyric. The lyrics branch must advance lastSectionEnd
    // so the post-loop gap pass does not re-emit the same intro chords.
    var chords = [
        { tick: 0, chord: "Lam" }, { tick: 480, chord: "Mi7" },
        { tick: 960, chord: "Lam" }, { tick: 1440, chord: "Rem" },
        { tick: 1920, chord: "Mi7" }, { tick: 2400, chord: "Lam" },
        { tick: 2880, chord: "Sol" }  // first chord under lyric, not part of intro
    ];
    var syllables = [{ tick: 2880, text: "Hey" }];
    var repeats = [{ startTick: 0, endTick: 5000 }];
    var voltas = [];
    var repStruct = {
        repeats: repeats, voltas: voltas,
        sections: RepeatStructure.buildSections(repeats, voltas)
    };
    var result = IntroChords.buildIntroChordsPerf(chords, repStruct, syllables, 2880);
    // Expect: Lam, Mi7, Lam, Rem, Mi7, Lam (6 chords, one pass)
    assert.equal(result.length, 6,
        "intro should be one pass of music chords, not duplicated: " + result.join(","));
    assert.deepEqual(result, ["Lam", "Mi7", "Lam", "Rem", "Mi7", "Lam"]);
});

test("buildIntroChordsPerf includes gap chords after section end", function() {
    // Chord in gap between section end and first lyric should be included
    var chords = [
        { tick: 0, chord: "Re" },
        { tick: 480, chord: "Sol" },
        { tick: 960, chord: "La" }  // gap chord after repeat
    ];
    var repeats = [{ startTick: 0, endTick: 480 }];
    var voltas = [];
    var repStruct = {
        repeats: repeats, voltas: voltas,
        sections: RepeatStructure.buildSections(repeats, voltas)
    };

    var result = IntroChords.buildIntroChordsPerf(chords, repStruct, [], 2000);
    assert.ok(result.indexOf("La") >= 0, "gap chord La should be included: " + result.join(", "));
});

// ========================================
// Consecutive chord dedup across repeat passes
// ========================================

test("buildIntroChordsPerf deduplicates consecutive same chords across passes", function() {
    // Repeat with "Re" at the end of pass 1 and "Re" at the start of pass 2.
    // Should not produce "Re Re" in the output.
    var chords = [
        { tick: 0, chord: "Re" },
        { tick: 480, chord: "Sol" },
        { tick: 960, chord: "Re" },
        // Pass 2 starts here (same chords)
        // tick 0: Re again
    ];
    var repStruct = {
        sections: [{
            repeat: { startTick: 0, endTick: 1440, repeatCount: 2 },
            volta1: null, volta2: null, sectionEnd: 1440
        }]
    };
    var result = IntroChords.buildIntroChordsPerf(chords, repStruct, [], 2880);
    // "Re Sol Re" for pass 1, pass 2 starts with "Re" which deduplicates with ending "Re"
    var joined = result.join(" ");
    assert.ok(joined.indexOf("Re  Re") < 0 && joined.indexOf("Re Re") < 0,
        "should not have consecutive Re Re: " + joined);
});
