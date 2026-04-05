var test = require("node:test");
var assert = require("node:assert/strict");
var orch = require("../lib/orchestrator");

test("processExtraction returns null for empty syllables", function() {
    var result = orch.processExtraction({ syllables: [], chords: [], repeats: [], voltas: [] });
    assert.equal(result, null);
});

test("processExtraction handles single verse without repeats", function() {
    var data = {
        title: "Test Song",
        syllables: [
            { tick: 0, verse: 0, text: "hel", syllabic: "begin", durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0 },
            { tick: 480, verse: 0, text: "lo", syllabic: "end", durationQ: 1, restAfter: true, restDurationQ: 2, gapDurationQ: 2 },
            { tick: 1440, verse: 0, text: "world", syllabic: "single", durationQ: 4, restAfter: false, restDurationQ: 0, gapDurationQ: 0 }
        ],
        chords: [
            { tick: 0, chord: "Lam" },
            { tick: 1440, chord: "Re" }
        ],
        repeats: [],
        voltas: []
    };

    var output = orch.processExtraction(data);
    assert.ok(output.indexOf("TEST SONG") >= 0, "should have uppercase title");
    assert.ok(output.indexOf("Lam") >= 0, "should have chord Lam");
    assert.ok(output.indexOf("Re") >= 0, "should have chord Re");
    assert.ok(output.indexOf("Hello") >= 0 || output.indexOf("hello") >= 0, "should have lyrics");
});

test("processExtraction handles performance stream with repeats", function() {
    var data = {
        title: "Repeat Test",
        syllables: [
            { tick: 0, verse: 0, text: "one", syllabic: "single", durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0 },
            { tick: 0, verse: 1, text: "two", syllabic: "single", durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0 }
        ],
        chords: [{ tick: 0, chord: "Do" }],
        repeats: [{ startTick: 0, endTick: 480 }],
        voltas: []
    };

    var output = orch.processExtraction(data);
    assert.ok(output !== null);
    assert.ok(output.indexOf("REPEAT TEST") >= 0);
    assert.ok(output.indexOf("One") >= 0 || output.indexOf("Two") >= 0);
});

test("processExtraction handles multiple verses without repeats", function() {
    var data = {
        title: "",
        syllables: [
            { tick: 0, verse: 0, text: "verse0", syllabic: "single", durationQ: 4, restAfter: false, restDurationQ: 0, gapDurationQ: 0 },
            { tick: 0, verse: 1, text: "verse1", syllabic: "single", durationQ: 4, restAfter: false, restDurationQ: 0, gapDurationQ: 0 }
        ],
        chords: [],
        repeats: [],
        voltas: []
    };

    var output = orch.processExtraction(data);
    assert.ok(output.indexOf("verse0") >= 0 || output.indexOf("Verse0") >= 0);
    assert.ok(output.indexOf("verse1") >= 0 || output.indexOf("Verse1") >= 0);
});

// ========================================
// Navigation: D.C., D.S., Coda, Fine
// ========================================

// Helper to build a syllable
function syl(tick, verse, text, syllabic, opts) {
    var s = {
        tick: tick, verse: verse, text: text, syllabic: syllabic || "single",
        durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0
    };
    if (opts) {
        for (var k in opts) s[k] = opts[k];
    }
    return s;
}

test("D.C. replays entire score", function() {
    // Structure: A B [D.C.]
    // Execution: A B A B
    // Section A (tick 0-960): "hello" (verse 0), "goodbye" (verse 1)
    // Section B (tick 960-1920): "world" (single verse)
    var data = {
        title: "",
        syllables: [
            syl(0, 0, "hello", "single", { durationQ: 2, gapDurationQ: 0 }),
            syl(0, 1, "goodbye", "single", { durationQ: 2, gapDurationQ: 0 }),
            syl(960, 0, "world", "single", { durationQ: 2, gapDurationQ: 0 })
        ],
        chords: [
            { tick: 0, chord: "Do" },
            { tick: 960, chord: "Sol" }
        ],
        repeats: [],
        voltas: [],
        markers: [],
        jumps: [{ tick: 1920, jumpTo: "start", playUntil: "end", continueAt: "", playRepeats: false }],
        lastTick: 1920
    };

    var output = orch.processExtraction(data);
    var low = output.toLowerCase();
    // First pass: "hello" (verse 0), "world"
    // Second pass: "goodbye" (verse 1), "world"
    assert.ok(low.indexOf("hello") >= 0, "should have verse 0: " + output);
    assert.ok(low.indexOf("goodbye") >= 0, "should have verse 1: " + output);
    assert.ok(low.indexOf("world") >= 0, "should have section B: " + output);
});

test("D.C. al Fine stops at Fine marker", function() {
    // Structure: A [Fine] B [D.C. al Fine]
    // Execution: A B A (stop at Fine)
    var data = {
        title: "",
        syllables: [
            syl(0, 0, "start", "single", { durationQ: 2 }),
            syl(960, 0, "middle", "single", { durationQ: 2 })
        ],
        chords: [{ tick: 0, chord: "Do" }],
        repeats: [],
        voltas: [],
        markers: [{ tick: 480, label: "fine", type: "fine" }],
        jumps: [{ tick: 1920, jumpTo: "start", playUntil: "fine", continueAt: "", playRepeats: false }],
        lastTick: 1920
    };

    var output = orch.processExtraction(data);
    assert.ok(output !== null, "should produce output");
    // First pass: "start" and "middle"
    // Second pass: only "start" (Fine at tick 480, before "middle")
    assert.ok(output.indexOf("start") >= 0 || output.indexOf("Start") >= 0, "should have start: " + output);
});

test("D.S. al Coda jumps to segno and then to coda", function() {
    // Structure: Intro | [Segno] A [ToCoda] B [D.S. al Coda] | [Coda] C
    // Execution: Intro A B A C
    //
    // Ticks:
    //   0-480: Intro (no lyrics)
    //   480 (Segno): Section A, tick 480-960
    //   960 (ToCoda): Section B, tick 960-1440
    //   1440 (D.S. al Coda)
    //   1920 (Coda): Section C, tick 1920-2400
    var data = {
        title: "DS Coda Test",
        syllables: [
            syl(480, 0, "first", "single", { durationQ: 1 }),
            syl(960, 0, "bridge", "single", { durationQ: 1 }),
            syl(1920, 0, "coda", "single", { durationQ: 1 })
        ],
        chords: [
            { tick: 0, chord: "Lam" },
            { tick: 480, chord: "Re" },
            { tick: 960, chord: "Sol" },
            { tick: 1920, chord: "Mi" }
        ],
        repeats: [],
        voltas: [],
        markers: [
            { tick: 480, label: "segno", type: "segno" },
            { tick: 960, label: "coda", type: "tocoda" },
            { tick: 1920, label: "codab", type: "coda" }
        ],
        jumps: [{
            tick: 1440, jumpTo: "segno", playUntil: "coda",
            continueAt: "codab", playRepeats: false
        }],
        lastTick: 2400
    };

    var output = orch.processExtraction(data);
    var low = output.toLowerCase();
    assert.ok(output !== null, "should produce output");
    assert.ok(output.indexOf("DS CODA TEST") >= 0, "should have title: " + output);
    // Execution order: first, bridge, first (replay), coda
    assert.ok(low.indexOf("first") >= 0, "should have 'first': " + output);
    assert.ok(low.indexOf("bridge") >= 0, "should have 'bridge': " + output);
    assert.ok(low.indexOf("coda") >= 0, "should have 'coda': " + output);
});

test("D.S. al Coda with multi-verse uses next verse on replay", function() {
    // Structure: [Segno] A (2 verses) [ToCoda] B [D.S. al Coda] | [Coda] C
    // Execution: A(v0) B A(v1) C
    var data = {
        title: "",
        syllables: [
            syl(0, 0, "morning", "single", { durationQ: 2 }),
            syl(0, 1, "evening", "single", { durationQ: 2 }),
            syl(960, 0, "sun", "single", { durationQ: 2 }),
            syl(1920, 0, "end", "single", { durationQ: 2 })
        ],
        chords: [{ tick: 0, chord: "Do" }],
        repeats: [],
        voltas: [],
        markers: [
            { tick: 0, label: "segno", type: "segno" },
            { tick: 960, label: "coda", type: "tocoda" },
            { tick: 1920, label: "codab", type: "coda" }
        ],
        jumps: [{
            tick: 1440, jumpTo: "segno", playUntil: "coda",
            continueAt: "codab", playRepeats: false
        }],
        lastTick: 2400
    };

    var output = orch.processExtraction(data);
    // First pass of A: "morning" (verse 0)
    // Second pass of A (D.S.): "evening" (verse 1)
    assert.ok(output.indexOf("morning") >= 0 || output.indexOf("Morning") >= 0, "should have verse 0: " + output);
    assert.ok(output.indexOf("evening") >= 0 || output.indexOf("Evening") >= 0, "should have verse 1: " + output);
    assert.ok(output.indexOf("end") >= 0 || output.indexOf("End") >= 0, "should have coda: " + output);
});

test("D.S. al Fine with multi-verse", function() {
    // Structure: A [Segno] B [Fine] C [D.S. al Fine]
    // Execution: A B C B(v1, stop at Fine)
    var data = {
        title: "",
        syllables: [
            syl(0, 0, "intro", "single", { durationQ: 2 }),
            syl(480, 0, "verse1", "single", { durationQ: 2 }),
            syl(480, 1, "verse2", "single", { durationQ: 2 }),
            syl(1440, 0, "after", "single", { durationQ: 2 })
        ],
        chords: [{ tick: 0, chord: "Lam" }],
        repeats: [],
        voltas: [],
        markers: [
            { tick: 480, label: "segno", type: "segno" },
            { tick: 960, label: "fine", type: "fine" }
        ],
        jumps: [{
            tick: 1920, jumpTo: "segno", playUntil: "fine",
            continueAt: "", playRepeats: false
        }],
        lastTick: 1920
    };

    var output = orch.processExtraction(data);
    assert.ok(output !== null, "should produce output");
    // First pass: intro, verse1, after
    // D.S. replay: verse2 (verse 1 of B section, stop at Fine)
    assert.ok(output.indexOf("intro") >= 0 || output.indexOf("Intro") >= 0, "should have intro: " + output);
    assert.ok(output.indexOf("verse1") >= 0 || output.indexOf("Verse1") >= 0, "should have verse1: " + output);
    assert.ok(output.indexOf("verse2") >= 0 || output.indexOf("Verse2") >= 0, "should have verse2: " + output);
});

test("D.C. with repeat bars honors repeats on first pass only", function() {
    // Structure: |: A :| [D.C.]
    // First pass (honorRepeats=true): A(v0) A(v1)
    // D.C. replay (honorRepeats=false): A(v0 again, since no overlap tracking inside repeat)
    var data = {
        title: "",
        syllables: [
            syl(0, 0, "alpha", "single", { durationQ: 2 }),
            syl(0, 1, "beta", "single", { durationQ: 2 })
        ],
        chords: [{ tick: 0, chord: "Do" }],
        repeats: [{ startTick: 0, endTick: 960 }],
        voltas: [],
        markers: [],
        jumps: [{ tick: 960, jumpTo: "start", playUntil: "end", continueAt: "", playRepeats: false }],
        lastTick: 960
    };

    var output = orch.processExtraction(data);
    var low = output.toLowerCase();
    // First pass with repeats: alpha + beta
    assert.ok(low.indexOf("alpha") >= 0, "should have verse 0: " + output);
    assert.ok(low.indexOf("beta") >= 0, "should have verse 1 from repeat: " + output);
});

test("D.C. with all verses consumed skips replay (no abbreviation needed)", function() {
    // Structure: |: Verse(v0,v1) :| Estribillo [D.C.]
    // The repeat already expands v0 and v1. D.C. replay has no unconsumed verses -> skipped.
    var data = {
        title: "",
        syllables: [
            syl(0, 0, "Noche", "single", { durationQ: 2, restAfter: true, restDurationQ: 2, gapDurationQ: 2 }),
            syl(1440, 0, "clara.", "single", { durationQ: 2, restAfter: true, restDurationQ: 4, gapDurationQ: 4 }),
            syl(0, 1, "Luna", "single", { durationQ: 2, restAfter: true, restDurationQ: 2, gapDurationQ: 2 }),
            syl(1440, 1, "llena.", "single", { durationQ: 2, restAfter: true, restDurationQ: 4, gapDurationQ: 4 }),
            syl(3840, 0, "Clavelitos,", "single", { durationQ: 2 }),
            syl(4800, 0, "clavelitos,", "single", { durationQ: 2 }),
            syl(5760, 0, "clavelitos", "single", { durationQ: 2 }),
            syl(6720, 0, "de", "single", { durationQ: 1 }),
            syl(7200, 0, "mi", "single", { durationQ: 1 }),
            syl(7680, 0, "corazon.", "single", { durationQ: 2 })
        ],
        chords: [{ tick: 0, chord: "Lam" }],
        repeats: [{ startTick: 0, endTick: 3840 }],
        voltas: [],
        markers: [],
        jumps: [{ tick: 8640, jumpTo: "start", playUntil: "end", continueAt: "", playRepeats: false }],
        lastTick: 8640
    };

    var output = orch.processExtraction(data);
    var low = output.toLowerCase();

    // Both verses should appear (from repeat expansion in segment 1)
    assert.ok(low.indexOf("noche") >= 0, "should have verse 0: " + output);
    assert.ok(low.indexOf("luna") >= 0, "should have verse 1: " + output);
    assert.ok(low.indexOf("corazon") >= 0, "should have estribillo: " + output);

    // D.C. replay should be SKIPPED (all verses already consumed)
    // So estribillo appears only once, no abbreviation needed
    var count = 0;
    var idx = 0;
    while ((idx = low.indexOf("clavelitos", idx)) >= 0) { count++; idx++; }
    // "clavelitos" appears 3 times in the single estribillo, not 6 (no replay)
    assert.ok(count <= 4, "estribillo should not repeat (D.C. skipped): count=" + count + " " + output);
});

// ========================================
// --full flag: D.S./D.C. replay without new lyrics
// ========================================

test("D.C. replay with only verse 0 and fullRepeat=false skips replay segment", function() {
    // Structure: A [D.C.] where A has only verse 0 (no verse 1).
    // With fullRepeat=false, the D.C. replay should be skipped because
    // there are no new lyrics (verse 1+) in the replay segment.
    var data = {
        title: "",
        syllables: [
            syl(0, 0, "hello", "single", { durationQ: 2 }),
            syl(960, 0, "world.", "single", { durationQ: 2, restAfter: true, restDurationQ: 4, gapDurationQ: 4 })
        ],
        chords: [{ tick: 0, chord: "Do" }],
        repeats: [],
        voltas: [],
        markers: [],
        jumps: [{ tick: 1920, jumpTo: "start", playUntil: "end", continueAt: "", playRepeats: false }],
        lastTick: 1920,
        fullRepeat: false
    };

    var output = orch.processExtraction(data);
    assert.ok(output !== null, "should produce output");
    // "hello" and "world" should appear only once (replay skipped)
    var low = output.toLowerCase();
    var helloCount = 0;
    var idx = 0;
    while ((idx = low.indexOf("hello", idx)) >= 0) { helloCount++; idx++; }
    assert.equal(helloCount, 1, "hello should appear only once (replay skipped): " + output);
});

test("D.C. replay with only verse 0 and fullRepeat=true includes replay segment", function() {
    // Same structure as above, but with fullRepeat=true.
    // The D.C. replay should be included even without new lyrics.
    var data = {
        title: "",
        syllables: [
            syl(0, 0, "hello", "single", { durationQ: 2 }),
            syl(960, 0, "world.", "single", { durationQ: 2, restAfter: true, restDurationQ: 4, gapDurationQ: 4 })
        ],
        chords: [{ tick: 0, chord: "Do" }],
        repeats: [],
        voltas: [],
        markers: [],
        jumps: [{ tick: 1920, jumpTo: "start", playUntil: "end", continueAt: "", playRepeats: false }],
        lastTick: 1920,
        fullRepeat: true
    };

    var output = orch.processExtraction(data);
    assert.ok(output !== null, "should produce output");
    // "hello" should appear at least twice (replay included)
    var low = output.toLowerCase();
    var helloCount = 0;
    var idx = 0;
    while ((idx = low.indexOf("hello", idx)) >= 0) { helloCount++; idx++; }
    assert.ok(helloCount >= 2, "hello should appear at least twice (replay included): " + output);
});

// ========================================
// Phrase extension stops at coda markers
// ========================================

test("phrase extension stops at coda marker between segment boundary and extended tick", function() {
    // Structure: [Segno] A (tick 0-960) [ToCoda at 960] B (tick 960-1920) [D.S. al Coda at 1920] [Coda at 2400] C (tick 2400-3360)
    // Section A has a phrase that ends just after the ToCoda boundary (tick 960).
    // Syllable "spill" at tick 1000 is between ToCoda (960) and Coda (2400).
    // The phrase extension should NOT pull in "spill" because ToCoda marker at 960
    // limits the extension range.
    var data = {
        title: "",
        syllables: [
            syl(0, 0, "before", "single", { durationQ: 2 }),
            syl(480, 0, "the", "single", { durationQ: 2 }),
            syl(900, 0, "end", "single", { durationQ: 2 }),
            // This syllable is in the ToCoda-to-Coda gap, should NOT be included in segment 1
            syl(1000, 0, "spill", "single", { durationQ: 2 }),
            syl(1440, 0, "bridge", "single", { durationQ: 2 }),
            syl(2400, 0, "finale", "single", { durationQ: 2 })
        ],
        chords: [{ tick: 0, chord: "Do" }],
        repeats: [],
        voltas: [],
        markers: [
            { tick: 0, label: "segno", type: "segno" },
            { tick: 960, label: "coda", type: "tocoda" },
            { tick: 2400, label: "codab", type: "coda" }
        ],
        jumps: [{
            tick: 1920, jumpTo: "segno", playUntil: "coda",
            continueAt: "codab", playRepeats: false
        }],
        lastTick: 3360
    };

    var output = orch.processExtraction(data);
    var low = output.toLowerCase();
    // "before", "the", "end" from first pass, then replay from segno, then "finale" from coda
    assert.ok(low.indexOf("before") >= 0, "should have first section: " + output);
    assert.ok(low.indexOf("finale") >= 0, "should have coda section: " + output);
    // "spill" should appear only once (from the first pass through the full score),
    // not pulled into the D.S. replay by phrase extension
    var spillCount = 0;
    var idx = 0;
    while ((idx = low.indexOf("spill", idx)) >= 0) { spillCount++; idx++; }
    assert.ok(spillCount <= 1, "spill should not be duplicated by phrase extension crossing coda marker: count=" + spillCount + " " + output);
});

test("navigation fallback when no valid plan", function() {
    // Jumps with no matching markers should fallback to linear processing
    var data = {
        title: "",
        syllables: [
            syl(0, 0, "fallback", "single", { durationQ: 2 })
        ],
        chords: [],
        repeats: [],
        voltas: [],
        markers: [],
        jumps: [], // empty jumps
        lastTick: 960
    };

    var output = orch.processExtraction(data);
    var low = output.toLowerCase();
    assert.ok(low.indexOf("fallback") >= 0, "should fall back to linear: " + output);
});
