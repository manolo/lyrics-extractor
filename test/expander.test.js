var test = require("node:test");
var assert = require("node:assert/strict");
var exp = require("../lib/expander");

// ========================================
// Utility functions (from performance-stream tests)
// ========================================

test("filterSylsByRange filters by tick range", function() {
    var syls = [
        { tick: 0, verse: 0 },
        { tick: 480, verse: 0 },
        { tick: 960, verse: 0 },
        { tick: 1440, verse: 0 }
    ];
    var filtered = exp.filterSylsByRange(syls, 480, 1440);
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
    var filtered = exp.filterSylsByRange(syls, 480, -1);
    assert.equal(filtered.length, 2);
});

test("filterSylsByVerse filters by verse number", function() {
    var syls = [
        { tick: 0, verse: 0 },
        { tick: 480, verse: 1 },
        { tick: 960, verse: 0 },
        { tick: 1440, verse: 1 }
    ];
    var v0 = exp.filterSylsByVerse(syls, 0);
    assert.equal(v0.length, 2);
    var v1 = exp.filterSylsByVerse(syls, 1);
    assert.equal(v1.length, 2);
});

test("cloneSyl creates a clone with activeChord", function() {
    var syl = {
        tick: 480, verse: 0, text: "test", syllabic: "single",
        durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0
    };
    var chords = [{ tick: 0, chord: "Lam" }, { tick: 960, chord: "Re" }];
    var clone = exp.cloneSyl(syl, chords);
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
    exp.recomputeStreamGaps(stream);
    assert.equal(stream[0].gapDurationQ, 1);
    assert.equal(stream[0].restAfter, true);
});

// ========================================
// buildSections (from repeat-structure tests)
// ========================================

test("buildSections pairs volta1 inside repeat", function() {
    var repeats = [{ startTick: 0, endTick: 1920 }];
    var voltas = [{ startTick: 960, endTick: 1920 }];
    var sections = exp.buildSections(repeats, voltas);
    assert.equal(sections.length, 1);
    assert.deepEqual(sections[0].volta1, { startTick: 960, endTick: 1920 });
    assert.equal(sections[0].volta2, null);
    assert.equal(sections[0].sectionEnd, 1920);
});

test("buildSections pairs volta2 after repeat", function() {
    var repeats = [{ startTick: 0, endTick: 1920 }];
    var voltas = [
        { startTick: 960, endTick: 1920 },
        { startTick: 1920, endTick: 2880 }
    ];
    var sections = exp.buildSections(repeats, voltas);
    assert.equal(sections.length, 1);
    assert.deepEqual(sections[0].volta1, { startTick: 960, endTick: 1920 });
    assert.deepEqual(sections[0].volta2, { startTick: 1920, endTick: 2880 });
    assert.equal(sections[0].sectionEnd, 2880);
});

test("buildSections handles multiple repeats", function() {
    var repeats = [
        { startTick: 0, endTick: 1920 },
        { startTick: 1920, endTick: 3840 }
    ];
    var voltas = [];
    var sections = exp.buildSections(repeats, voltas);
    assert.equal(sections.length, 2);
    assert.equal(sections[0].sectionEnd, 1920);
    assert.equal(sections[1].sectionEnd, 3840);
});

test("buildSections handles no repeats", function() {
    var sections = exp.buildSections([], []);
    assert.equal(sections.length, 0);
});

test("buildSections does not reuse voltas across sections", function() {
    var repeats = [
        { startTick: 0, endTick: 1920 },
        { startTick: 3840, endTick: 5760 }
    ];
    var voltas = [
        { startTick: 960, endTick: 1920 },
        { startTick: 4800, endTick: 5760 }
    ];
    var sections = exp.buildSections(repeats, voltas);
    assert.equal(sections.length, 2);
    assert.equal(sections[0].volta1.startTick, 960);
    assert.equal(sections[1].volta1.startTick, 4800);
});

// ========================================
// buildPlaybackPlan (from navigation tests)
// ========================================

test("buildPlaybackPlan returns null when no jumps exist", function() {
    var result = exp.buildPlaybackPlan([], [], 1000);
    assert.equal(result, null);
});

test("buildPlaybackPlan returns null when jumps is null", function() {
    var result = exp.buildPlaybackPlan([], null, 1000);
    assert.equal(result, null);
});

test("buildPlaybackPlan handles D.C.", function() {
    var markers = [];
    var jumps = [{ tick: 960, jumpTo: "start", playUntil: "end", continueAt: "", playRepeats: false }];
    var plan = exp.buildPlaybackPlan(markers, jumps, 1920);
    assert.equal(plan.length, 2);
    assert.equal(plan[0].fromTick, 0);
    assert.equal(plan[0].toTick, 961);
    assert.equal(plan[0].honorRepeats, true);
    assert.equal(plan[1].fromTick, 0);
    assert.equal(plan[1].toTick, 1920);
    assert.equal(plan[1].honorRepeats, false);
});

test("buildPlaybackPlan handles D.C. al Fine", function() {
    var markers = [{ tick: 480, label: "fine", type: "fine" }];
    var jumps = [{ tick: 960, jumpTo: "start", playUntil: "fine", continueAt: "", playRepeats: false }];
    var plan = exp.buildPlaybackPlan(markers, jumps, 1920);
    assert.equal(plan.length, 2);
    assert.equal(plan[0].fromTick, 0);
    assert.equal(plan[0].toTick, 961);
    assert.equal(plan[1].fromTick, 0);
    assert.equal(plan[1].toTick, 480);
    assert.equal(plan[1].honorRepeats, false);
});

test("buildPlaybackPlan handles D.S. al Coda", function() {
    var markers = [
        { tick: 480, label: "segno", type: "segno" },
        { tick: 1440, label: "coda", type: "tocoda" },
        { tick: 1920, label: "codab", type: "coda" }
    ];
    var jumps = [{
        tick: 2400, jumpTo: "segno", playUntil: "coda",
        continueAt: "codab", playRepeats: false
    }];
    var plan = exp.buildPlaybackPlan(markers, jumps, 3840);
    assert.equal(plan.length, 3);
    assert.equal(plan[0].fromTick, 0);
    assert.equal(plan[0].toTick, 2401);
    assert.equal(plan[0].honorRepeats, true);
    assert.equal(plan[1].fromTick, 480);
    assert.equal(plan[1].toTick, 1440);
    assert.equal(plan[1].honorRepeats, false);
    assert.equal(plan[2].fromTick, 1920);
    assert.equal(plan[2].toTick, 3840);
    assert.equal(plan[2].honorRepeats, true);
});

test("buildPlaybackPlan handles D.S. al Fine", function() {
    var markers = [
        { tick: 480, label: "segno", type: "segno" },
        { tick: 1440, label: "fine", type: "fine" }
    ];
    var jumps = [{
        tick: 1920, jumpTo: "segno", playUntil: "fine",
        continueAt: "", playRepeats: false
    }];
    var plan = exp.buildPlaybackPlan(markers, jumps, 2400);
    assert.equal(plan.length, 2);
    assert.equal(plan[0].fromTick, 0);
    assert.equal(plan[0].toTick, 1921);
    assert.equal(plan[1].fromTick, 480);
    assert.equal(plan[1].toTick, 1440);
    assert.equal(plan[1].honorRepeats, false);
});

test("buildPlaybackPlan honors playRepeats flag", function() {
    var markers = [];
    var jumps = [{ tick: 960, jumpTo: "start", playUntil: "end", continueAt: "", playRepeats: true }];
    var plan = exp.buildPlaybackPlan(markers, jumps, 1920);
    assert.equal(plan[1].honorRepeats, true);
});

// ========================================
// expand: simple repeat with two verses
// ========================================

test("expand with simple repeat and two verses", function() {
    var data = {
        syllables: [
            { tick: 0, verse: 0, text: "first", syllabic: "single", durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0 },
            { tick: 0, verse: 1, text: "second", syllabic: "single", durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0 }
        ],
        chords: [{ tick: 0, chord: "Lam" }],
        repeats: [{ startTick: 0, endTick: 480 }],
        voltas: []
    };
    var stream = exp.expand(data);
    assert.equal(stream.length, 2);
    assert.equal(stream[0].text, "first");
    assert.equal(stream[1].text, "second");
});

// ========================================
// expand: smooth volta transition
// ========================================

test("smooth volta transition: backwards tick does not set sectionEnd", function() {
    var syllables = [
        { tick: 0, verse: 0, text: "main", syllabic: "single", durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0 },
        { tick: 480, verse: 0, text: "part.", syllabic: "single", durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0 },
        { tick: 960, verse: 0, text: "end1", syllabic: "single", durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0 },
        { tick: 1440, verse: 0, text: "end2", syllabic: "single", durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0 }
    ];
    var data = {
        syllables: syllables,
        chords: [{ tick: 0, chord: "Lam" }],
        repeats: [{ startTick: 0, endTick: 1440 }],
        voltas: [{ startTick: 960, endTick: 1440 }]
    };
    var stream = exp.expand(data);
    var sectionEndCount = 0;
    for (var i = 0; i < stream.length; i++) {
        if (stream[i].sectionEnd) sectionEndCount++;
    }
    assert.equal(sectionEndCount, 0, "volta transition should not create sectionEnd breaks: stream=" +
        stream.map(function(s) { return s.text + (s.sectionEnd ? "[SE]" : ""); }).join(", "));
});

// ========================================
// expand: 3x repeat with volta endingList
// ========================================

test("expand with 3x repeat and volta endingList (VirgenAlmudena)", function() {
    var data = {
        syllables: [
            { tick: 0, verse: 0, text: "main.", syllabic: "single", durationQ: 1, restAfter: true, restDurationQ: 2, gapDurationQ: 2 },
            { tick: 960, verse: 0, text: "volta0.", syllabic: "single", durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0 },
            { tick: 960, verse: 1, text: "volta1.", syllabic: "single", durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0 }
        ],
        chords: [{ tick: 0, chord: "Lam" }, { tick: 960, chord: "Mi7" }],
        repeats: [{ startTick: 0, endTick: 1440, repeatCount: 3 }],
        voltas: [{ startTick: 960, endTick: 1440, endingList: [1, 2] }]
    };
    var stream = exp.expand(data);

    // Find pass boundaries (where tick goes backwards)
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

    // Pass 3: main only, NO volta
    var p3 = stream.slice(passes[2], passes[3]);
    assert.ok(p3.some(function(s) { return s.text === "main."; }), "pass 3 has main");
    assert.ok(!p3.some(function(s) { return s.text === "volta0." || s.text === "volta1."; }),
        "pass 3 should NOT have volta: " + p3.map(function(s) { return s.text; }).join(", "));

    // Pass 3 last syllable should have endChordTick
    var lastP3 = p3[p3.length - 1];
    assert.equal(lastP3.endChordTick, 960, "pass 3 last syl should cap chords at volta start");
});

// ========================================
// expand: verseOffset
// ========================================

test("expand with verseOffset skips consumed verses", function() {
    var syllables = [
        { tick: 0, verse: 0, text: "v0", syllabic: "single", durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0 },
        { tick: 0, verse: 1, text: "v1", syllabic: "single", durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0 },
        { tick: 0, verse: 2, text: "v2", syllabic: "single", durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0 },
        { tick: 0, verse: 3, text: "v3", syllabic: "single", durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0 }
    ];

    // Without offset: uses verses 0 and 1 (2 passes)
    var stream0 = exp.expand({
        syllables: syllables, chords: [],
        repeats: [{ startTick: 0, endTick: 480 }], voltas: []
    });
    assert.equal(stream0.length, 2);
    assert.equal(stream0[0].text, "v0");
    assert.equal(stream0[1].text, "v1");

    // With offset=2: uses verses 2 and 3
    var stream2 = exp.expand({
        syllables: syllables, chords: [],
        repeats: [{ startTick: 0, endTick: 480 }], voltas: [],
        verseOffset: 2
    });
    assert.equal(stream2.length, 2, "should have 2 syllables with offset: " + stream2.map(function(s){return s.text;}).join(","));
    assert.equal(stream2[0].text, "v2");
    assert.equal(stream2[1].text, "v3");
});

// ========================================
// unwind: direct segment tests
// ========================================

test("unwind produces 2 segments for simple repeat with 2 verses", function() {
    var segments = exp.unwind({
        syllables: [
            { tick: 0, verse: 0, text: "a", syllabic: "single", durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0 },
            { tick: 0, verse: 1, text: "b", syllabic: "single", durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0 }
        ],
        chords: [], repeats: [{ startTick: 0, endTick: 480 }], voltas: []
    });
    var repSegs = segments.filter(function(s) { return s.repeatStartTick >= 0; });
    assert.equal(repSegs.length, 2, "should have 2 repeat segments");
    assert.equal(repSegs[0].pass, 1);
    assert.equal(repSegs[1].pass, 2);
});

test("unwind with D.C. produces 2 navigation segments", function() {
    var segments = exp.unwind({
        syllables: [
            { tick: 0, verse: 0, text: "x", syllabic: "single", durationQ: 2, restAfter: false, restDurationQ: 0, gapDurationQ: 0 }
        ],
        chords: [], repeats: [], voltas: [],
        markers: [],
        jumps: [{ tick: 960, jumpTo: "start", playUntil: "end", continueAt: "", playRepeats: false }],
        lastTick: 1920
    });
    assert.ok(segments.length >= 2, "should have at least 2 segments: " + segments.length);
    assert.equal(segments[0].isJumpReplay, false);
    assert.equal(segments[1].isJumpReplay, true);
});

test("unwind with volta produces segments with voltaFrom/voltaTo", function() {
    var segments = exp.unwind({
        syllables: [
            { tick: 0, verse: 0, text: "m", syllabic: "single", durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0 },
            { tick: 960, verse: 0, text: "v", syllabic: "single", durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0 }
        ],
        chords: [],
        repeats: [{ startTick: 0, endTick: 1440 }],
        voltas: [{ startTick: 960, endTick: 1440 }]
    });
    var withVolta = segments.filter(function(s) { return s.voltaFrom >= 0; });
    assert.ok(withVolta.length >= 1, "at least one segment should have volta");
    assert.equal(withVolta[0].voltaFrom, 960);
    assert.equal(withVolta[0].voltaTo, 1440);
});

// ========================================
// materialize: direct tests
// ========================================

test("materialize produces syllables from segments", function() {
    var syllables = [
        { tick: 0, verse: 0, text: "hello", syllabic: "single", durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0 },
        { tick: 0, verse: 1, text: "world", syllabic: "single", durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0 }
    ];
    var segments = [
        { mainFrom: 0, mainTo: 480, voltaFrom: -1, voltaTo: -1, pass: 1, repeatStartTick: 0, numPasses: 2, isImplicitV2: false, endChordTick: -1, isJumpReplay: false, breakType: "none", segmentBoundary: false, verseOffset: 0 },
        { mainFrom: 0, mainTo: 480, voltaFrom: -1, voltaTo: -1, pass: 2, repeatStartTick: 0, numPasses: 2, isImplicitV2: false, endChordTick: -1, isJumpReplay: false, breakType: "section", segmentBoundary: false, verseOffset: 0 }
    ];
    var stream = exp.materialize(segments, { syllables: syllables, chords: [{ tick: 0, chord: "Do" }], voltas: [] });
    assert.equal(stream.length, 2);
    assert.equal(stream[0].text, "hello");
    assert.equal(stream[1].text, "world");
    assert.equal(stream[0].activeChord, "Do");
});

// ========================================
// _titleFromFileName (musescore-extractor)
// ========================================

var extractor = require("../extractors/musescore-extractor");

test("titleFromFileName splits camelCase", function() {
    assert.equal(extractor._titleFromFileName("OjosDeEspaña"), "Ojos de España");
});

test("titleFromFileName handles hyphens", function() {
    assert.equal(extractor._titleFromFileName("ojos-de-españa"), "Ojos de España");
});

test("titleFromFileName handles underscores", function() {
    assert.equal(extractor._titleFromFileName("ojos_de_españa"), "Ojos de España");
});

test("titleFromFileName capitalizes single word", function() {
    assert.equal(extractor._titleFromFileName("clavelitos"), "Clavelitos");
});

test("titleFromFileName preserves already correct title", function() {
    assert.equal(extractor._titleFromFileName("Rondalla"), "Rondalla");
});

test("titleFromFileName handles empty string", function() {
    assert.equal(extractor._titleFromFileName(""), "");
});

test("titleFromFileName lowercases minor words but not at start", function() {
    assert.equal(extractor._titleFromFileName("ElRelicario"), "El Relicario");
    assert.equal(extractor._titleFromFileName("LaVirgenDeLaAlmudena"), "La Virgen de la Almudena");
});

// ========================================
// _getTitleFromVBox
// ========================================

test("getTitleFromVBox returns title from VBox elements", function() {
    var mockScore = {
        firstMeasure: {
            prev: {
                prev: null,
                elements: [
                    { text: "My Song Title", subtypeName: "title" },
                    { text: "John Doe", subtypeName: "composer" }
                ]
            }
        }
    };
    assert.equal(extractor._getTitleFromVBox(mockScore), "My Song Title");
});

test("getTitleFromVBox returns empty when no title element", function() {
    var mockScore = {
        firstMeasure: {
            prev: {
                prev: null,
                elements: [
                    { text: "John Doe", subtypeName: "composer" },
                    { text: "Some subtitle", subtypeName: "subtitle" }
                ]
            }
        }
    };
    assert.equal(extractor._getTitleFromVBox(mockScore), "");
});

test("getTitleFromVBox returns empty when no VBox", function() {
    var mockScore = {
        firstMeasure: { prev: null }
    };
    assert.equal(extractor._getTitleFromVBox(mockScore), "");
});

test("getTitleFromVBox returns empty on error", function() {
    assert.equal(extractor._getTitleFromVBox({}), "");
    assert.equal(extractor._getTitleFromVBox(null), "");
});

// ========================================
// _getTitle (priority: metaTag > VBox > fileName)
// ========================================

test("getTitle uses metaTag workTitle first", function() {
    extractor._setScore({
        metaTag: function(k) { return k === "workTitle" ? "Meta Title" : ""; },
        title: "",
        scoreName: "FileName",
        firstMeasure: null
    });
    assert.equal(extractor._getTitle(), "Meta Title");
    extractor._setScore(null);
});

test("getTitle falls back to VBox when metaTags empty", function() {
    var vbox = { prev: null, elements: [{ text: "VBox Title", subtypeName: "title" }] };
    extractor._setScore({
        metaTag: function() { return ""; },
        title: "",
        scoreName: "FileName",
        firstMeasure: { prev: vbox }
    });
    assert.equal(extractor._getTitle(), "VBox Title");
    extractor._setScore(null);
});

test("getTitle falls back to fileName when metaTags and VBox empty", function() {
    extractor._setScore({
        metaTag: function() { return ""; },
        title: "",
        scoreName: "MiCancion",
        firstMeasure: { prev: null }
    });
    assert.equal(extractor._getTitle(), "Mi Cancion");
    extractor._setScore(null);
});

// ========================================
// _dedup (annotation deduplication)
// ========================================

test("dedup removes consecutive duplicates by custom equality", function() {
    var items = [
        { tick: 0, label: "segno" },
        { tick: 0, label: "segno" },
        { tick: 480, label: "fine" },
        { tick: 480, label: "fine" },
        { tick: 480, label: "fine" }
    ];
    var result = extractor._dedup(items, function(a, b) { return a.tick === b.tick && a.label === b.label; });
    assert.equal(result.length, 2);
    assert.equal(result[0].label, "segno");
    assert.equal(result[1].label, "fine");
});

test("dedup keeps different items at same tick", function() {
    var items = [
        { tick: 0, label: "segno" },
        { tick: 0, label: "coda" }
    ];
    var result = extractor._dedup(items, function(a, b) { return a.tick === b.tick && a.label === b.label; });
    assert.equal(result.length, 2);
});

test("dedup returns empty for empty input", function() {
    assert.equal(extractor._dedup([], function() { return true; }).length, 0);
});

test("dedup removes duplicate jumps at same tick", function() {
    var jumps = [
        { tick: 960, jumpTo: "start", playUntil: "end" },
        { tick: 960, jumpTo: "start", playUntil: "end" }
    ];
    var result = extractor._dedup(jumps, function(a, b) { return a.tick === b.tick && a.jumpTo === b.jumpTo && a.playUntil === b.playUntil; });
    assert.equal(result.length, 1);
});

// ========================================
// MuseScore-derived unwind tests
// ========================================
// These tests validate measure playback order against MuseScore's
// RepeatList::unwind() behavior. Each test mirrors a case from
// musescore/src/engraving/tests/repeat_tests.cpp
//
// Helper: build data from measure-level descriptions.
// Each measure is 480 ticks. Measure numbers are 1-based.
// Ticks: measure N starts at (N-1)*480, ends at N*480.

var MLEN = 480; // ticks per measure

function mTick(measureNum) { return (measureNum - 1) * MLEN; }

// Build a data object for unwind() from measure-level descriptions.
// opts: { repeats: [{start:M, end:M, count:N}], voltas: [{start:M, end:M, endings:[1,2]}],
//         jumps: [{measure:M, jumpTo, playUntil, continueAt, playRepeats}],
//         markers: [{measure:M, label, type}] }
function buildMeasureData(numMeasures, opts) {
    opts = opts || {};
    var repeats = (opts.repeats || []).map(function(r) {
        return { startTick: mTick(r.start), endTick: mTick(r.end + 1), repeatCount: r.count || 2 };
    });
    var voltas = (opts.voltas || []).map(function(v) {
        var span = v.span || 1;
        return { startTick: mTick(v.start), endTick: mTick(v.start + span), endingList: v.endings };
    });
    var jumps = (opts.jumps || []).map(function(j) {
        return {
            tick: mTick(j.measure + 1) - 1, // end of measure
            jumpTo: j.jumpTo || "start",
            playUntil: j.playUntil || "end",
            continueAt: j.continueAt || "",
            playRepeats: j.playRepeats || false
        };
    });
    var markers = (opts.markers || []).map(function(m) {
        return { tick: mTick(m.measure), label: m.label, type: m.type || m.label };
    });
    // One syllable per measure (verse 0) so unwind has content to work with
    var syllables = [];
    for (var i = 1; i <= numMeasures; i++) {
        syllables.push({
            tick: mTick(i), verse: 0, text: "m" + i, syllabic: "single",
            durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0
        });
    }
    return {
        syllables: syllables, chords: [], repeats: repeats,
        voltas: voltas, jumps: jumps, markers: markers,
        lastTick: numMeasures * MLEN
    };
}

// Convert unwind segments to a measure sequence string like "1,2,3; 2,3,4"
// Each segment becomes a semicolon-separated group of measure numbers.
function unwindToMeasures(data) {
    var segments = exp.unwind(data);
    var groups = [];
    for (var si = 0; si < segments.length; si++) {
        var seg = segments[si];
        if (seg.instrumental) continue;
        var measures = [];
        // Main range
        var fromM = Math.floor(seg.mainFrom / MLEN) + 1;
        var toM = Math.ceil(seg.mainTo / MLEN);
        // Clamp toM: if mainTo is exactly on a measure boundary, don't include the next
        if (seg.mainTo > 0 && seg.mainTo % MLEN === 0) toM = seg.mainTo / MLEN;
        for (var m = fromM; m <= toM; m++) measures.push(m);
        // Volta range (if any)
        if (seg.voltaFrom >= 0) {
            var vFromM = Math.floor(seg.voltaFrom / MLEN) + 1;
            var vToM = seg.voltaTo / MLEN;
            for (var vm = vFromM; vm <= vToM; vm++) {
                if (measures.indexOf(vm) < 0) measures.push(vm);
            }
        }
        if (measures.length > 0) groups.push(measures.join(","));
    }
    return groups.join("; ");
}

// --- Basic repeat tests (should pass) ---

test("mscore repeat01: basic repeat |: m2 m3 :|", function() {
    var data = buildMeasureData(6, {
        repeats: [{ start: 2, end: 3 }]
    });
    assert.equal(unwindToMeasures(data), "1,2,3; 2,3,4,5,6");
});

test("mscore repeat03: end repeat to start :|", function() {
    var data = buildMeasureData(6, {
        repeats: [{ start: 1, end: 2 }]
    });
    assert.equal(unwindToMeasures(data), "1,2; 1,2,3,4,5,6");
});

test("mscore repeat06: simple volta", function() {
    var data = buildMeasureData(6, {
        repeats: [{ start: 2, end: 3 }],
        voltas: [{ start: 3, span: 1, endings: [1] }, { start: 4, span: 1, endings: [2] }]
    });
    assert.equal(unwindToMeasures(data), "1,2,3; 2; 4,5,6");
});

test("mscore repeat15: 8x repeat", function() {
    var data = buildMeasureData(3, {
        repeats: [{ start: 2, end: 2, count: 8 }]
    });
    var result = unwindToMeasures(data);
    assert.equal(result, "1,2; 2; 2; 2; 2; 2; 2; 2,3");
});

// --- DC / DS tests ---

test("mscore repeat07: DC al Fine", function() {
    var data = buildMeasureData(6, {
        jumps: [{ measure: 6, jumpTo: "start", playUntil: "fine" }],
        markers: [{ measure: 3, label: "fine", type: "fine" }]
    });
    assert.equal(unwindToMeasures(data), "1,2,3,4,5,6; 1,2,3");
});

test("mscore repeat08: DS al Coda", function() {
    var data = buildMeasureData(11, {
        jumps: [{ measure: 6, jumpTo: "segno", playUntil: "coda", continueAt: "codab" }],
        markers: [
            { measure: 2, label: "segno", type: "segno" },
            { measure: 4, label: "coda", type: "tocoda" },
            { measure: 7, label: "codab", type: "coda" }
        ]
    });
    assert.equal(unwindToMeasures(data), "1,2,3,4,5,6; 2,3,4; 7,8,9,10,11");
});

// --- Bug: phrase extension past jump ---

test("mscore repeat16: jump in simple repeat", function() {
    // m1 m2(Fine) m3 |:m4(DC al Fine):| (startRepeat+endRepeat on same measure)
    var data = buildMeasureData(4, {
        repeats: [{ start: 4, end: 4 }],
        jumps: [{ measure: 4, jumpTo: "start", playUntil: "fine" }],
        markers: [{ measure: 2, label: "fine", type: "fine" }]
    });
    assert.equal(unwindToMeasures(data), "1,2,3,4; 4; 1,2");
});

test("mscore repeat31: ending measure has jump and repeat", function() {
    // m1 |: m2(DC) :| — MuseScore flat sequence: 1,2,2,1,2
    var data = buildMeasureData(2, {
        repeats: [{ start: 2, end: 2 }],
        jumps: [{ measure: 2, jumpTo: "start", playUntil: "end" }]
    });
    // forceFinalRepeat splits segments at the REP_START during DC replay
    assert.equal(unwindToMeasures(data), "1,2; 2; 1; 2");
});

// --- Bug: forceFinalRepeat / playRepeats=false ---

test("mscore repeat22: DS and 3x repeat", function() {
    // m1 S m2 m3(DS) |: m5(x3) :| m6
    var data = buildMeasureData(6, {
        repeats: [{ start: 5, end: 5, count: 3 }],
        jumps: [{ measure: 3, jumpTo: "segno", playUntil: "end" }],
        markers: [{ measure: 2, label: "segno", type: "segno" }]
    });
    // First: 1,2,3. DS replay: 2,3,4,5; 5; 5,6 (forceFinalRepeat forces 3x on replay)
    assert.equal(unwindToMeasures(data), "1,2,3; 2,3,4,5; 5; 5,6");
});

test("mscore repeat34: DC with repeat+volta", function() {
    // m1 |: m2 :|[1] m3 [2] m4 |: m5(DC) :|
    var data = buildMeasureData(5, {
        repeats: [{ start: 2, end: 3 }, { start: 5, end: 5 }],
        voltas: [{ start: 3, span: 1, endings: [1] }, { start: 4, span: 1, endings: [2] }],
        jumps: [{ measure: 5, jumpTo: "start", playUntil: "end" }]
    });
    // First: 1,2,3; 2; 4; 5; 5. DC(no repeats): 1; 2; 4,5
    // MuseScore flat: 1,2,3,2,4,5,5,1,2,4,5
    assert.equal(unwindToMeasures(data), "1,2,3; 2; 4; 5; 5; 1; 2; 4,5");
});

// --- Bug: multiple jumps ---

test("mscore repeat20: DS al Coda + DS1 al Fine", function() {
    var data = buildMeasureData(8, {
        jumps: [
            { measure: 3, jumpTo: "segno", playUntil: "coda", continueAt: "codab" },
            { measure: 8, jumpTo: "segno1", playUntil: "fine" }
        ],
        markers: [
            { measure: 1, label: "segno", type: "segno" },
            { measure: 1, label: "coda", type: "tocoda" },
            { measure: 4, label: "codab", type: "coda" },
            { measure: 5, label: "segno1", type: "segno" },
            { measure: 6, label: "fine", type: "fine" }
        ]
    });
    assert.equal(unwindToMeasures(data), "1,2,3; 1; 4,5,6,7,8; 5,6");
});

test("mscore repeat51: twice DS with playRepeats", function() {
    var data = buildMeasureData(11, {
        jumps: [
            { measure: 6, jumpTo: "segno", playUntil: "toCoda", continueAt: "coda1", playRepeats: true },
            { measure: 9, jumpTo: "segno", playUntil: "toCoda", continueAt: "coda2", playRepeats: true }
        ],
        markers: [
            { measure: 3, label: "segno", type: "segno" },
            { measure: 4, label: "toCoda", type: "tocoda" },
            { measure: 7, label: "coda1", type: "coda" },
            { measure: 10, label: "coda2", type: "coda" }
        ]
    });
    assert.equal(unwindToMeasures(data), "1,2,3,4,5,6; 3,4; 7,8,9; 3,4; 10,11");
});

// --- Bug: jump from/into volta ---

test("mscore repeat44: jump from within volta", function() {
    // m1(ToCoda) m2 |: m3 m4(DC al Coda)[1,3] m5:|(x3) m6[2]:|(x2) m7(Coda)
    var data = buildMeasureData(7, {
        repeats: [{ start: 3, end: 5, count: 3 }, { start: 3, end: 6 }],
        voltas: [
            { start: 4, span: 2, endings: [1, 3] },
            { start: 6, span: 1, endings: [2] }
        ],
        jumps: [{ measure: 4, jumpTo: "start", playUntil: "coda", continueAt: "codab" }],
        markers: [
            { measure: 1, label: "coda", type: "tocoda" },
            { measure: 7, label: "codab", type: "coda" }
        ]
    });
    // MuseScore flat: 1,2,3,4,5,3,6,3,4,1,7
    assert.equal(unwindToMeasures(data), "1,2,3,4,5; 3; 6; 3,4; 1; 7");
});

test("mscore repeat48: jump into first volta without playRepeats", function() {
    // m1 [1]m2 m3(Segno) m4:| [2]m5(ToCoda) m6 m7(DS al Coda) m8(Coda)
    var data = buildMeasureData(8, {
        repeats: [{ start: 1, end: 4 }],
        voltas: [
            { start: 2, span: 3, endings: [1] },
            { start: 5, span: 2, endings: [2] }
        ],
        jumps: [{ measure: 7, jumpTo: "segno", playUntil: "coda", continueAt: "codab" }],
        markers: [
            { measure: 3, label: "segno", type: "segno" },
            { measure: 5, label: "coda", type: "tocoda" },
            { measure: 8, label: "codab", type: "coda" }
        ]
    });
    // MuseScore flat: 1,2,3,4,1,5,6,7,3,4,1,5,8
    assert.equal(unwindToMeasures(data), "1,2,3,4; 1; 5,6,7; 3,4; 1; 5; 8");
});

// --- Bug: DS with playRepeats ---

test("mscore repeat49: DS with playRepeats", function() {
    var data = buildMeasureData(7, {
        repeats: [{ start: 1, end: 3 }],
        jumps: [{ measure: 6, jumpTo: "segno", playUntil: "coda", continueAt: "codab", playRepeats: true }],
        markers: [
            { measure: 3, label: "segno", type: "segno" },
            { measure: 4, label: "coda", type: "tocoda" },
            { measure: 7, label: "codab", type: "coda" }
        ]
    });
    assert.equal(unwindToMeasures(data), "1,2,3; 1,2,3,4,5,6; 3; 1,2,3,4; 7");
});

// --- 3 voltas ---

test("mscore repeat10: 3 voltas", function() {
    // |: m1 m2 [1]m3 m4:| [2]m5 m6 m7 m8:| [3]m9 m10:| m11 m12
    // Three end-repeat barlines at m4, m8, m10 (each count=2)
    var data = buildMeasureData(12, {
        repeats: [{ start: 1, end: 4 }, { start: 1, end: 8 }, { start: 1, end: 10 }],
        voltas: [
            { start: 3, span: 2, endings: [1] },
            { start: 5, span: 4, endings: [2] },
            { start: 9, span: 2, endings: [3] }
        ]
    });
    // MuseScore flat: 1,2,3,4,1,2,5,6,7,8,1,2,9,10,1,2,11,12
    assert.equal(unwindToMeasures(data), "1,2,3,4; 1,2; 5,6,7,8; 1,2; 9,10; 1,2; 11,12");
});

// --- Additional edge cases ---

test("mscore repeat04: double end repeat", function() {
    // |: m2 m3 :| :| m4 m5 m6
    var data = buildMeasureData(6, {
        repeats: [{ start: 2, end: 3 }, { start: 2, end: 4 }]
    });
    assert.equal(unwindToMeasures(data), "1,2,3; 2,3,4; 2,3,4,5,6");
});

test("mscore repeat05: 3x then 2x repeat", function() {
    // |: m2 m3 :|(x3) :| m4 m5 m6
    var data = buildMeasureData(6, {
        repeats: [{ start: 2, end: 3, count: 3 }, { start: 2, end: 4 }]
    });
    assert.equal(unwindToMeasures(data), "1,2,3; 2,3; 2,3,4; 2,3,4,5,6");
});

// ========================================
// Volta-at-start: syllable dedup and continuation
// ========================================

test("volta-at-start excludes volta syls from main range", function() {
    // Repeat with volta 2 starting at mainFrom of post-repeat segment.
    // "mé." at volta tick should appear once (as volta), not twice.
    var div = 480;
    var data = {
        division: div,
        syllables: [
            { tick: 1920, verse: 0, text: "a", syllabic: "begin", durationQ: 1, restAfter: false, gapDurationQ: 0 },
            { tick: 2880, verse: 0, text: "mé.", syllabic: "end", durationQ: 1, restAfter: true, gapDurationQ: 2 },
            // volta 2 has the same syllable at endRepeat tick
            { tick: 3840, verse: 0, text: "mé.", syllabic: "end", durationQ: 1, restAfter: true, gapDurationQ: 2 },
            // post-repeat content
            { tick: 5760, verse: 0, text: "O", syllabic: "begin", durationQ: 1, restAfter: false, gapDurationQ: 0 },
            { tick: 6240, verse: 0, text: "jos.", syllabic: "end", durationQ: 2, restAfter: true, gapDurationQ: 4 }
        ],
        chords: [{ tick: 0, chord: "La" }, { tick: 3840, chord: "Mi" }],
        repeats: [{ startTick: 960, endTick: 3840, repeatCount: 2 }],
        voltas: [
            { startTick: 2880, endTick: 3840, _measureIdx: 2, endingList: [1] },
            { startTick: 3840, endTick: 4800, _measureIdx: 3, endingList: [2] }
        ],
        markers: [], jumps: [], systemTexts: [], barlines: [], lastTick: 7680
    };
    var stream = exp.expand(data);
    var meCount = stream.filter(function(s) { return s.text === "mé."; }).length;
    assert.equal(meCount, 2, "mé. should appear exactly twice (volta 1 + volta 2): got " + meCount +
        " in: " + stream.map(function(s) { return s.text; }).join(" "));
});

test("volta-at-start marks _voltaContinuation when phrase is incomplete", function() {
    // "el" at endRepeat bar, "sol" in volta 2. "el" doesn't end with
    // punctuation, so "sol" should get _voltaContinuation = true.
    var div = 480;
    var data = {
        division: div,
        syllables: [
            { tick: 960, verse: 0, text: "que", syllabic: "single", durationQ: 1, restAfter: false, gapDurationQ: 0 },
            { tick: 1920, verse: 0, text: "el", syllabic: "single", durationQ: 1, restAfter: false, gapDurationQ: 0, sectionBar: true },
            // volta 1 content (skipped on pass 2)
            { tick: 2880, verse: 0, text: "sol.", syllabic: "single", durationQ: 2, restAfter: true, gapDurationQ: 4 },
            // volta 2 content (the continuation)
            { tick: 3840, verse: 0, text: "sol,", syllabic: "single", durationQ: 1, restAfter: false, gapDurationQ: 0 },
            // post-repeat
            { tick: 5760, verse: 0, text: "fin.", syllabic: "single", durationQ: 2, restAfter: true, gapDurationQ: 4 }
        ],
        chords: [{ tick: 0, chord: "Do" }],
        repeats: [{ startTick: 0, endTick: 3840, repeatCount: 2 }],
        voltas: [
            { startTick: 2880, endTick: 3840, _measureIdx: 2, endingList: [1] },
            { startTick: 3840, endTick: 4800, _measureIdx: 3, endingList: [2] }
        ],
        markers: [], jumps: [], systemTexts: [], barlines: [], lastTick: 7680
    };
    var stream = exp.expand(data);
    // Find the volta-at-start "sol," in the stream
    var voltaSol = stream.filter(function(s) { return s.text === "sol,"; });
    assert.equal(voltaSol.length, 1, "should have one volta sol,");
    assert.ok(voltaSol[0]._voltaContinuation, "sol, should have _voltaContinuation (el doesn't end with punctuation)");
});

test("volta-at-start does NOT mark _voltaContinuation after punctuation", function() {
    // "muero." at endRepeat bar, "Es" in volta 2. "muero." ends with ".",
    // so "Es" should NOT get _voltaContinuation (it starts a new section).
    var div = 480;
    var data = {
        division: div,
        syllables: [
            { tick: 960, verse: 0, text: "mue", syllabic: "begin", durationQ: 0.5, restAfter: false, gapDurationQ: 0 },
            { tick: 1200, verse: 0, text: "ro.", syllabic: "end", durationQ: 1, restAfter: true, gapDurationQ: 2, sectionBar: true },
            // volta 1 (skipped on pass 2)
            { tick: 2880, verse: 0, text: "X", syllabic: "single", durationQ: 1, restAfter: false, gapDurationQ: 0 },
            // volta 2
            { tick: 3840, verse: 0, text: "Es", syllabic: "single", durationQ: 1, restAfter: false, gapDurationQ: 0 },
            // post-repeat
            { tick: 5760, verse: 0, text: "fin.", syllabic: "single", durationQ: 2, restAfter: true, gapDurationQ: 4 }
        ],
        chords: [{ tick: 0, chord: "Do" }],
        repeats: [{ startTick: 0, endTick: 3840, repeatCount: 2 }],
        voltas: [
            { startTick: 2880, endTick: 3840, _measureIdx: 2, endingList: [1] },
            { startTick: 3840, endTick: 4800, _measureIdx: 3, endingList: [2] }
        ],
        markers: [], jumps: [], systemTexts: [], barlines: [], lastTick: 7680
    };
    var stream = exp.expand(data);
    var voltaEs = stream.filter(function(s) { return s.text === "Es"; });
    assert.equal(voltaEs.length, 1, "should have one volta Es");
    assert.ok(!voltaEs[0]._voltaContinuation, "Es should NOT have _voltaContinuation (muero. ends with .)");
});

// ========================================
// Verse modulo wrapping on D.S. replay
// ========================================

test("verse selection uses modulo: counter 2 with 2 verses wraps to v=0", function() {
    // The verse selection at line 1112: verses[vIdx % verses.length]
    // With vIdx=2 and 2 available verses, should give verses[0] = v=0
    var div = 480;
    var data = {
        division: div,
        syllables: [
            { tick: 480, verse: 0, text: "hello", syllabic: "single", durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0 },
            { tick: 480, verse: 1, text: "world", syllabic: "single", durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0 }
        ],
        chords: [{ tick: 0, chord: "Do" }],
        repeats: [{ startTick: 0, endTick: 960, repeatCount: 2 }],
        voltas: [], markers: [], jumps: [],
        systemTexts: [], barlines: [], lastTick: 960
    };
    var stream = exp.expand(data);
    var hellos = stream.filter(function(s) { return s.text === "hello"; });
    var worlds = stream.filter(function(s) { return s.text === "world"; });
    // Pass 1: v=0 (hello), Pass 2: v=1 (world)
    assert.equal(hellos.length, 1, "hello (v=0) once");
    assert.equal(worlds.length, 1, "world (v=1) once");
});

test("verse counter does not increment for segments outside repeat range", function() {
    // Segment after repeat end should not consume verse slots.
    // Repeat 0-960 (2 passes), then content at 960+ (outside repeat).
    var div = 480;
    var data = {
        division: div,
        syllables: [
            { tick: 480, verse: 0, text: "inside", syllabic: "single", durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0 },
            { tick: 480, verse: 1, text: "second", syllabic: "single", durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0 },
            { tick: 1440, verse: 0, text: "outside.", syllabic: "single", durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0 }
        ],
        chords: [{ tick: 0, chord: "Do" }],
        repeats: [{ startTick: 0, endTick: 960, repeatCount: 2 }],
        voltas: [], markers: [], jumps: [],
        systemTexts: [], barlines: [], lastTick: 1920
    };
    var stream = exp.expand(data);
    var texts = stream.map(function(s) { return s.text; });
    // inside (v=0), second (v=1), outside (after repeat, v=0 but doesn't consume)
    assert.ok(texts.indexOf("inside") >= 0, "inside should appear");
    assert.ok(texts.indexOf("second") >= 0, "second should appear");
    assert.ok(texts.indexOf("outside.") >= 0, "outside should appear");
});

// ========================================
// sectionBar only at word boundaries
// ========================================

test("sectionBar does not set sectionEnd on mid-word syllables", function() {
    var div = 480;
    var data = {
        division: div,
        syllables: [
            { tick: 0, verse: 0, text: "me", syllabic: "begin", durationQ: 1, restAfter: false, gapDurationQ: 0, sectionBar: true },
            { tick: 480, verse: 0, text: "jor.", syllabic: "end", durationQ: 1, restAfter: false, gapDurationQ: 0 }
        ],
        chords: [], repeats: [], voltas: [], markers: [], jumps: [],
        systemTexts: [], barlines: [], lastTick: 960
    };
    var stream = exp.expand(data);
    var me = stream.find(function(s) { return s.text === "me"; });
    assert.ok(me, "should have 'me' in stream");
    assert.ok(!me.sectionEnd, "mid-word 'me' should NOT get sectionEnd from sectionBar");
});

// ========================================
// Lead-in completesWord detection
// ========================================

test("D.S. lead-in that completes a word does not set noBreakAfter", function() {
    // "ro" (begin) before jump, "sa" (end) as lead-in. "sa" completes "rosa".
    var div = 480;
    var data = {
        division: div,
        syllables: [
            { tick: 480, verse: 0, text: "a", syllabic: "single", durationQ: 1, restAfter: false, gapDurationQ: 0 },
            { tick: 960, verse: 0, text: "ro", syllabic: "begin", durationQ: 1, restAfter: false, gapDurationQ: 0 },
            { tick: 1440, verse: 0, text: "sa", syllabic: "end", durationQ: 1, restAfter: false, gapDurationQ: 0 },
            { tick: 2400, verse: 0, text: "next", syllabic: "single", durationQ: 1, restAfter: false, gapDurationQ: 0 }
        ],
        chords: [{ tick: 0, chord: "Do" }, { tick: 2400, chord: "Re" }],
        repeats: [],
        voltas: [],
        markers: [{ tick: 2400, label: "segno", type: "segno" }],
        jumps: [{ tick: 1200, jumpTo: "segno", playUntil: "end", continueAt: "", playRepeats: false }],
        systemTexts: [],
        barlines: [{ tick: 1920, type: "double" }],
        lastTick: 3360
    };
    var stream = exp.expand(data);
    var sa = stream.filter(function(s) { return s.text === "sa" && s._jumpReplay; });
    if (sa.length > 0) {
        assert.ok(!sa[0].noBreakAfter, "lead-in 'sa' completing 'rosa' should NOT have noBreakAfter");
    }
});
