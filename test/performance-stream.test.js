var test = require("node:test");
var assert = require("node:assert/strict");
var ps = require("../lib/performance-stream");

test("filterSylsByRange filters by tick range", function() {
    var syls = [
        { tick: 0, verse: 0 },
        { tick: 480, verse: 0 },
        { tick: 960, verse: 0 },
        { tick: 1440, verse: 0 }
    ];

    var filtered = ps.filterSylsByRange(syls, 480, 1440);
    assert.equal(filtered.length, 2);
    assert.equal(filtered[0].tick, 480);
    assert.equal(filtered[1].tick, 960);
});

test("filterSylsByRange with toTick=-1 includes all after fromTick", function() {
    var syls = [
        { tick: 0, verse: 0 },
        { tick: 480, verse: 0 },
        { tick: 960, verse: 0 }
    ];

    var filtered = ps.filterSylsByRange(syls, 480, -1);
    assert.equal(filtered.length, 2);
});

test("filterSylsByVerse filters by verse number", function() {
    var syls = [
        { tick: 0, verse: 0 },
        { tick: 480, verse: 1 },
        { tick: 960, verse: 0 },
        { tick: 1440, verse: 1 }
    ];

    var v0 = ps.filterSylsByVerse(syls, 0);
    assert.equal(v0.length, 2);
    var v1 = ps.filterSylsByVerse(syls, 1);
    assert.equal(v1.length, 2);
});

test("cloneSyl creates a clone with activeChord", function() {
    var syl = {
        tick: 480, verse: 0, text: "test", syllabic: "single",
        durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0
    };
    var chords = [{ tick: 0, chord: "Lam" }, { tick: 960, chord: "Re" }];

    var clone = ps.cloneSyl(syl, chords);
    assert.equal(clone.tick, 480);
    assert.equal(clone.text, "test");
    assert.equal(clone.activeChord, "Lam");
    assert.equal(clone.inStream, true);
    assert.equal(clone.sectionEnd, false);
});

test("recomputeStreamGaps updates gap durations", function() {
    var stream = [
        { tick: 0, durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0 },
        { tick: 960, durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0 }
    ];

    ps.recomputeStreamGaps(stream);
    // Gap = (960/480) - 1 = 1.0 quarter notes
    assert.equal(stream[0].gapDurationQ, 1);
    assert.equal(stream[0].restAfter, true);
});

test("smooth volta transition: backwards tick does not set sectionEnd", function() {
    // Volta 1 has lyrics, volta 2 is implicit (from after end repeat).
    // The transition from volta 1 back to repeat start should NOT set sectionEnd
    // because the volta transition suppresses the break (noBreakAfter, durationQ <= 1).
    var syllables = [
        { tick: 0, verse: 0, text: "main", syllabic: "single", durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0 },
        { tick: 480, verse: 0, text: "part.", syllabic: "single", durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0 },
        // Volta 1 lyrics
        { tick: 960, verse: 0, text: "end1", syllabic: "single", durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0 },
        // Implicit volta 2 lyrics (after the repeat)
        { tick: 1440, verse: 0, text: "end2", syllabic: "single", durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0 }
    ];
    var chords = [{ tick: 0, chord: "Lam" }];
    var repStruct = {
        repeats: [{ startTick: 0, endTick: 1440 }],
        voltas: [{ startTick: 960, endTick: 1440 }],
        sections: [{
            repeat: { startTick: 0, endTick: 1440 },
            volta1: { startTick: 960, endTick: 1440 },
            volta2: null,
            sectionEnd: 1440
        }]
    };

    var stream = ps.buildPerformanceStream(syllables, chords, repStruct);
    // Stream should be: main, part., end1 (volta1), main, part., end2 (implicit volta2)
    // The transition between end1 and second "main" should NOT have sectionEnd
    // because volta transition sets noBreakAfter and durationQ <= 1
    var sectionEndCount = 0;
    for (var i = 0; i < stream.length; i++) {
        if (stream[i].sectionEnd) sectionEndCount++;
    }
    assert.equal(sectionEndCount, 0, "volta transition should not create sectionEnd breaks: stream=" +
        stream.map(function(s) { return s.text + (s.sectionEnd ? "[SE]" : ""); }).join(", "));
});

test("buildPerformanceStream with simple repeat and two verses", function() {
    var syllables = [
        { tick: 0, verse: 0, text: "first", syllabic: "single", durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0 },
        { tick: 0, verse: 1, text: "second", syllabic: "single", durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0 }
    ];
    var chords = [{ tick: 0, chord: "Lam" }];
    var repStruct = {
        repeats: [{ startTick: 0, endTick: 480 }],
        voltas: [],
        sections: [{ repeat: { startTick: 0, endTick: 480 }, volta1: null, volta2: null, sectionEnd: 480 }]
    };

    var stream = ps.buildPerformanceStream(syllables, chords, repStruct);
    assert.equal(stream.length, 2);
    assert.equal(stream[0].text, "first");
    assert.equal(stream[1].text, "second");
});

test("buildPerformanceStream with 3x repeat and volta endingList (VirgenAlmudena)", function() {
    // 3x repeat with volta "1-2": passes 1-2 include volta, pass 3 skips it.
    // Volta has 2 verses (v0 and v1), main section has only v0.
    var syllables = [
        // Main section (tick 0-480, only verse 0)
        { tick: 0, verse: 0, text: "main.", syllabic: "single", durationQ: 1, restAfter: true, restDurationQ: 2, gapDurationQ: 2 },
        // Volta section (tick 960-1440, verse 0 and verse 1)
        { tick: 960, verse: 0, text: "volta0.", syllabic: "single", durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0 },
        { tick: 960, verse: 1, text: "volta1.", syllabic: "single", durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0 }
    ];
    var chords = [{ tick: 0, chord: "Lam" }, { tick: 960, chord: "Mi7" }];
    var repStruct = {
        repeats: [{ startTick: 0, endTick: 1440, repeatCount: 3 }],
        voltas: [{ startTick: 960, endTick: 1440, endingList: [1, 2] }],
        sections: [{
            repeat: { startTick: 0, endTick: 1440, repeatCount: 3 },
            volta1: { startTick: 960, endTick: 1440, endingList: [1, 2] },
            volta2: null,
            sectionEnd: 1440
        }]
    };
    var stream = ps.buildPerformanceStream(syllables, chords, repStruct);

    // Should produce 3 passes
    var passes = [0];
    for (var i = 1; i < stream.length; i++) {
        if (stream[i].tick < stream[i-1].tick) passes.push(i);
    }
    passes.push(stream.length);
    assert.equal(passes.length - 1, 3, "should have 3 passes: " +
        stream.map(function(s) { return s.text; }).join(", "));

    // Pass 1: main + volta verse 0
    var p1 = stream.slice(passes[0], passes[1]);
    assert.ok(p1.some(function(s) { return s.text === "main."; }), "pass 1 has main");
    assert.ok(p1.some(function(s) { return s.text === "volta0."; }), "pass 1 has volta v0");

    // Pass 2: main + volta verse 1
    var p2 = stream.slice(passes[1], passes[2]);
    assert.ok(p2.some(function(s) { return s.text === "main."; }), "pass 2 has main");
    assert.ok(p2.some(function(s) { return s.text === "volta1."; }), "pass 2 has volta v1");

    // Pass 3: main only, NO volta (ending list [1,2] excludes pass 3)
    var p3 = stream.slice(passes[2], passes[3]);
    assert.ok(p3.some(function(s) { return s.text === "main."; }), "pass 3 has main");
    assert.ok(!p3.some(function(s) { return s.text === "volta0." || s.text === "volta1."; }),
        "pass 3 should NOT have volta: " + p3.map(function(s) { return s.text; }).join(", "));

    // Pass 3 last syllable should have endChordTick (cap volta chords)
    var lastP3 = p3[p3.length - 1];
    assert.equal(lastP3.endChordTick, 960, "pass 3 last syl should cap chords at volta start");
});

test("buildPerformanceStream with verseOffset skips consumed verses", function() {
    // 4 verses in a repeat. verseOffset=2 means verses 0-1 already consumed.
    // Should use verses 2 and 3.
    var syllables = [
        { tick: 0, verse: 0, text: "v0", syllabic: "single", durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0 },
        { tick: 0, verse: 1, text: "v1", syllabic: "single", durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0 },
        { tick: 0, verse: 2, text: "v2", syllabic: "single", durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0 },
        { tick: 0, verse: 3, text: "v3", syllabic: "single", durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0 }
    ];
    var chords = [];
    var repStruct = {
        repeats: [{ startTick: 0, endTick: 480 }],
        voltas: [],
        sections: [{ repeat: { startTick: 0, endTick: 480 }, volta1: null, volta2: null }]
    };

    // Without offset: uses verses 0 and 1 (2 passes)
    var stream0 = ps.buildPerformanceStream(syllables, chords, repStruct, 0);
    assert.equal(stream0.length, 2);
    assert.equal(stream0[0].text, "v0");
    assert.equal(stream0[1].text, "v1");

    // With offset=2: uses verses 2 and 3
    var stream2 = ps.buildPerformanceStream(syllables, chords, repStruct, 2);
    assert.equal(stream2.length, 2, "should have 2 syllables with offset: " + stream2.map(function(s){return s.text;}).join(","));
    assert.equal(stream2[0].text, "v2");
    assert.equal(stream2[1].text, "v3");
});
