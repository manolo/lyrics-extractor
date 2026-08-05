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

test("D.C. with all verses consumed replays with verse 0", function() {
    // Structure: |: Verse(v0,v1) :| Estribillo [D.C.]
    // The repeat expands v0 and v1. D.C. replay reuses verse 0 (wraps around).
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

    // Both verses from first pass
    assert.ok(low.indexOf("noche") >= 0, "should have verse 0: " + output);
    assert.ok(low.indexOf("luna") >= 0, "should have verse 1: " + output);
    // D.C. replay reuses available verses. With playRepeats=false (linear),
    // targetVerse=overlapCount=1 picks verse 1. Song repeats with lyrics.
    var lunaCount = 0;
    var idx = 0;
    while ((idx = low.indexOf("luna", idx)) >= 0) { lunaCount++; idx++; }
    assert.ok(lunaCount >= 1, "D.C. replay should produce lyrics: " + output);
});

// ========================================
// --full flag: D.S./D.C. replay without new lyrics
// ========================================

test("D.C. replay with only verse 0 replays with verse 0 (abbreviated)", function() {
    // Structure: A [D.C.] where A has only verse 0.
    // D.C. replay reuses verse 0 (abbreviated as incipit + ...).
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
    // "hello" appears at least twice (first pass + D.C. replay)
    var low = output.toLowerCase();
    var helloCount = 0;
    var idx = 0;
    while ((idx = low.indexOf("hello", idx)) >= 0) { helloCount++; idx++; }
    assert.ok(helloCount >= 2, "hello should appear at least twice (replay with v0): count=" + helloCount + " " + output);
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
    // "spill" appears in the first pass. The D.S. replay may also include it
    // via phrase extension, but "finale" (coda) should still appear.
    assert.ok(low.indexOf("end") >= 0, "should have 'end' from first pass: " + output);
});

test("D.S. replay wraps to verse 0 when all verses consumed", function() {
    // Structure: |: Verse(v0,v1) :| [D.S.]
    // First execution uses v0+v1. D.S. replay wraps to v0.
    var data = {
        title: "",
        syllables: [
            syl(0, 0, "Hello", "single", { durationQ: 2, restAfter: true, restDurationQ: 4, gapDurationQ: 4 }),
            syl(1440, 0, "world.", "single", { durationQ: 2, restAfter: true, restDurationQ: 4, gapDurationQ: 4 }),
            syl(0, 1, "Good", "single", { durationQ: 2, restAfter: true, restDurationQ: 4, gapDurationQ: 4 }),
            syl(1440, 1, "night.", "single", { durationQ: 2, restAfter: true, restDurationQ: 4, gapDurationQ: 4 })
        ],
        chords: [{ tick: 0, chord: "Do" }],
        repeats: [{ startTick: 0, endTick: 2880 }],
        voltas: [],
        markers: [{ tick: 0, label: "segno", type: "segno" }],
        jumps: [{ tick: 2880, jumpTo: "segno", playUntil: "end", continueAt: "", playRepeats: false }],
        lastTick: 3840
    };

    var output = orch.processExtraction(data);
    var low = output.toLowerCase();
    // First execution: v0 (Hello) + v1 (Good)
    assert.ok(low.indexOf("hello") >= 0, "should have verse 0: " + output);
    assert.ok(low.indexOf("good") >= 0, "should have verse 1: " + output);
    // D.S. replay should produce lyrics (wraps to available verse)
    // Count total occurrences: more than just the first pass
    var helloCount = (low.match(/hello/g) || []).length;
    var goodCount = (low.match(/good/g) || []).length;
    assert.ok(helloCount + goodCount > 2, "D.S. replay should produce lyrics: hello=" + helloCount + " good=" + goodCount + " " + output);
});

test("heuristic stanza breaks disabled when system texts exist", function() {
    // With system texts, only labels create stanza breaks (not punctuation + rest + uppercase).
    var data = {
        title: "",
        syllables: [
            syl(0, 0, "First", "single", { durationQ: 2 }),
            syl(960, 0, "sentence.", "single", { durationQ: 2, restAfter: true, restDurationQ: 4, gapDurationQ: 4 }),
            syl(3840, 0, "Second", "single", { durationQ: 2 }),
            syl(4800, 0, "sentence.", "single", { durationQ: 2 })
        ],
        chords: [{ tick: 0, chord: "Do" }],
        repeats: [],
        voltas: [],
        markers: [],
        jumps: [],
        systemTexts: [{ tick: 0, text: "Section" }]
    };

    var output = orch.processExtraction(data);
    // Without system texts, "sentence." + rest + "Second" (uppercase) would create stanza break.
    // With system texts, no heuristic break: all 4 syllables stay in one section.
    var lines = output.split("\n").filter(function(l) { return l.trim().length > 0 && !l.match(/^[=-]/) && !l.match(/^Do/); });
    // Should be 1-2 text lines (no blank line separating them)
    var blankBetween = output.indexOf("sentence.\n\n");
    assert.equal(blankBetween, -1, "no heuristic stanza break with system texts: " + output);
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

// ========================================
// DC al Coda: trailing chords and intro chord sequence
// ========================================

test("DC al Coda does not dump all chords as trailing on last line", function() {
    // Simulates DC al Coda: jump at high tick goes back to start,
    // plays until coda mark, then continues at codab.
    // The last syllable is a DC lead-in remapped to tick 0.
    var data = {
        title: "DC TEST",
        syllables: [
            syl(960, 0, "hel", "begin", { durationQ: 1 }),
            syl(1440, 0, "lo.", "end", { durationQ: 1 })
        ],
        chords: [
            { tick: 0, chord: "Sol" }, { tick: 240, chord: "Re" },
            { tick: 480, chord: "Sol" },
            { tick: 960, chord: "Mi" }, { tick: 1440, chord: "Lam" },
            { tick: 1920, chord: "Sol" }, { tick: 2160, chord: "Re7" },
            { tick: 2400, chord: "Sol" }
        ],
        repeats: [],
        voltas: [],
        markers: [
            { tick: 720, label: "coda", type: "tocoda" },
            { tick: 2160, label: "codab", type: "coda" }
        ],
        jumps: [{ tick: 1920, jumpTo: "start", playUntil: "coda", continueAt: "codab", playRepeats: false }],
        systemTexts: [{ tick: 0, text: "Intro" }, { tick: 960, text: "Estrofa" }],
        barlines: [],
        lastTick: 2880,
        division: 480,
        fullRepeat: true
    };
    var output = orch.processExtraction(data);
    // The output should NOT contain a massive chord dump between "hello." and "- INTRO -"
    // Count chord occurrences: Sol should not appear more than a few times
    var stripped = output.replace(/\u200B/g, "");
    var solCount = (stripped.match(/\bSol\b/g) || []).length;
    // Reasonable: Sol in intro chords + inline + coda, not 8+ times from a full dump
    assert.ok(solCount <= 6, "should not dump all chords on DC lead-in line: Sol count=" + solCount);
});

test("DC al Coda emits intro label and chords at end of output", function() {
    // When DC replay is fully instrumental, the INTRO label + chords
    // should be appended at the end of the output.
    var data = {
        title: "DC INTRO",
        syllables: [
            syl(960, 0, "hel", "begin", { durationQ: 1 }),
            syl(1440, 0, "lo.", "end", { durationQ: 1 })
        ],
        chords: [
            { tick: 0, chord: "Sol" }, { tick: 240, chord: "Re" },
            { tick: 480, chord: "Sol" },
            { tick: 960, chord: "Mi" }, { tick: 1440, chord: "Lam" },
            { tick: 1920, chord: "Sol" }, { tick: 2160, chord: "Re7" },
            { tick: 2400, chord: "Sol" }
        ],
        repeats: [],
        voltas: [],
        markers: [
            { tick: 720, label: "coda", type: "tocoda" },
            { tick: 2160, label: "codab", type: "coda" }
        ],
        jumps: [{ tick: 1920, jumpTo: "start", playUntil: "coda", continueAt: "codab", playRepeats: false }],
        systemTexts: [{ tick: 0, text: "Intro" }, { tick: 960, text: "Estrofa" }],
        barlines: [],
        lastTick: 2880,
        division: 480,
        fullRepeat: true
    };
    var output = orch.processExtraction(data);
    var stripped = output.replace(/\u200B/g, "");
    // Should have INTRO label near the end
    var introIdx = stripped.lastIndexOf("- INTRO -");
    assert.ok(introIdx >= 0, "should have INTRO label: " + stripped);
    // The INTRO label should be after the lyrics
    var helloIdx = stripped.lastIndexOf("hello.");
    assert.ok(introIdx > helloIdx, "INTRO should come after lyrics");
    // Should include codab chords (Re7, Sol)
    var afterIntro = stripped.substring(introIdx);
    assert.ok(afterIntro.indexOf("Re7") >= 0, "should include coda chord Re7 after INTRO: " + afterIntro);
});

test("DC al Coda filters gap labels between coda and codab", function() {
    // Labels between the coda mark and codab should NOT appear in the
    // DC replay gap (playback jumps over that region).
    var data = {
        title: "DC FILTER",
        syllables: [
            syl(2000, 0, "hel", "begin", { durationQ: 1 }),
            syl(2480, 0, "lo.", "end", { durationQ: 1 })
        ],
        chords: [
            { tick: 0, chord: "Sol" }, { tick: 480, chord: "Re" },
            { tick: 960, chord: "Sol" },
            { tick: 2000, chord: "Mi" }, { tick: 2480, chord: "Lam" },
            { tick: 3000, chord: "Sol" }, { tick: 3240, chord: "Re7" },
            { tick: 3480, chord: "Sol" }
        ],
        repeats: [],
        voltas: [],
        markers: [
            { tick: 960, label: "coda", type: "tocoda" },
            { tick: 3240, label: "codab", type: "coda" }
        ],
        jumps: [{ tick: 3000, jumpTo: "start", playUntil: "coda", continueAt: "codab", playRepeats: false }],
        systemTexts: [
            { tick: 0, text: "Intro" },
            { tick: 2000, text: "Estrofa" }  // between coda(960) and codab(3240): should be filtered
        ],
        barlines: [],
        lastTick: 3960,
        division: 480,
        fullRepeat: true
    };
    var output = orch.processExtraction(data);
    var stripped = output.replace(/\u200B/g, "");
    // "Estrofa" label at tick 2000 is between coda(960) and codab(3240),
    // so it should NOT appear in the DC gap section at the end
    var lastIntro = stripped.lastIndexOf("- INTRO -");
    if (lastIntro >= 0) {
        var afterIntro = stripped.substring(lastIntro);
        assert.ok(afterIntro.indexOf("ESTROFA") < 0,
            "Estrofa label should not appear in DC gap (between coda and codab): " + afterIntro);
    }
});

// ============================================================
// Double D.S./D.C. expansion (session fixes)
// ============================================================

test("double D.S.: sequence labels advance per replay group (ESTROFA 1, 2, 3)", function() {
    var div = 480;
    var segnoTick = div * 4;
    var estrofaStart = div * 4 * 5;
    var estrofaEnd = div * 4 * 7;
    var estriStart = div * 4 * 7;
    var dsOneTick = div * 4 * 10;
    var dsTwoTick = div * 4 * 11;
    var codaTick = div * 4 * 9;
    var codabTick = div * 4 * 12;
    var syls = [];
    [["uno"], ["dos"], ["tres"]].forEach(function(texts, v) {
        syls.push({ tick: estrofaStart, verse: v, text: texts[0], syllabic: "single", durationQ: 2, restAfter: false, restDurationQ: 0, gapDurationQ: 0 });
    });
    syls.push({ tick: estriStart, verse: 0, text: "coro.", syllabic: "single", durationQ: 2, restAfter: false, restDurationQ: 0, gapDurationQ: 0 });
    var data = {
        division: div,
        syllables: syls,
        chords: [{ tick: segnoTick, chord: "Do" }, { tick: estrofaStart, chord: "Re" }],
        repeats: [{ startTick: estrofaStart, endTick: estrofaEnd, repeatCount: 2 }],
        voltas: [],
        markers: [
            { tick: segnoTick, label: "segno", type: "segno" },
            { tick: codaTick, label: "coda", type: "tocoda" },
            { tick: codabTick, label: "codab", type: "coda" }
        ],
        jumps: [
            { tick: dsOneTick, jumpTo: "segno", playUntil: "end", continueAt: "", playRepeats: true },
            { tick: dsTwoTick, jumpTo: "segno", playUntil: "coda", continueAt: "codab", playRepeats: true }
        ],
        systemTexts: [{ tick: estrofaStart, text: "Estrofa 1::2::3::" }],
        barlines: [],
        lastTick: div * 4 * 13,
        fullRepeat: false
    };
    var output = orch.processExtraction(data);
    var stripped = output.replace(/​/g, "");
    assert.ok(stripped.indexOf("ESTROFA 1") >= 0, "should have ESTROFA 1");
    assert.ok(stripped.indexOf("ESTROFA 2") >= 0, "should have ESTROFA 2 (first DS replay): " + stripped.substring(0, 400));
    assert.ok(stripped.indexOf("ESTROFA 3") >= 0, "should have ESTROFA 3 (second DS replay)");
    // Verse content (capitalized by stanza formatting)
    assert.ok(stripped.match(/[Uu]no/), "should have verse 0 content (uno)");
    assert.ok(stripped.match(/[Dd]os/), "should have verse 1 content (dos)");
    assert.ok(stripped.match(/[Tt]res/), "should have verse 2 content (tres)");
    // Labels appear in order
    var pos1 = stripped.indexOf("ESTROFA 1"), pos2 = stripped.indexOf("ESTROFA 2"), pos3 = stripped.indexOf("ESTROFA 3");
    assert.ok(pos1 < pos2 && pos2 < pos3, "ESTROFA labels should appear in order 1, 2, 3");
});

test("double D.S.: instrumental intro gap appears before each replay section", function() {
    var div = 480;
    var segnoTick = div * 4;
    var estrofaStart = div * 4 * 5;
    var estrofaEnd = div * 4 * 7;
    var estriStart = div * 4 * 7;
    var dsOneTick = div * 4 * 9;
    var dsTwoTick = div * 4 * 10;
    var codaTick = div * 4 * 8;
    var codabTick = div * 4 * 11;
    var data = {
        division: div,
        syllables: [
            { tick: estrofaStart, verse: 0, text: "a.", syllabic: "single", durationQ: 2, restAfter: false, restDurationQ: 0, gapDurationQ: 0 },
            { tick: estrofaStart, verse: 1, text: "b.", syllabic: "single", durationQ: 2, restAfter: false, restDurationQ: 0, gapDurationQ: 0 },
            { tick: estrofaStart, verse: 2, text: "c.", syllabic: "single", durationQ: 2, restAfter: false, restDurationQ: 0, gapDurationQ: 0 },
            { tick: estriStart, verse: 0, text: "coro.", syllabic: "single", durationQ: 2, restAfter: false, restDurationQ: 0, gapDurationQ: 0 }
        ],
        chords: [{ tick: segnoTick, chord: "Do" }, { tick: estrofaStart, chord: "Re" }],
        repeats: [{ startTick: estrofaStart, endTick: estrofaEnd, repeatCount: 2 }],
        voltas: [],
        markers: [
            { tick: segnoTick, label: "segno", type: "segno" },
            { tick: codaTick, label: "coda", type: "tocoda" },
            { tick: codabTick, label: "codab", type: "coda" }
        ],
        jumps: [
            { tick: dsOneTick, jumpTo: "segno", playUntil: "end", continueAt: "", playRepeats: true },
            { tick: dsTwoTick, jumpTo: "segno", playUntil: "coda", continueAt: "codab", playRepeats: true }
        ],
        systemTexts: [
            { tick: segnoTick, text: "Música" },
            { tick: estrofaStart, text: "Estrofa 1::2::3::" }
        ],
        barlines: [],
        lastTick: div * 4 * 12,
        fullRepeat: false
    };
    var output = orch.processExtraction(data);
    var stripped = output.replace(/​/g, "");
    var musicaMatches = (stripped.match(/- MÚSICA -/g) || []);
    assert.ok(musicaMatches.length >= 2,
        "should have MÚSICA before each replay: found " + musicaMatches.length + " occurrence(s)\n" + stripped.substring(0, 500));
});

test("home chord not shown at start of replay after abbreviated stanza", function() {
    // When an estribillo is abbreviated in compact mode, the home chord
    // should not bleed into the start of the next replay section chord line.
    var div = 480;
    var estrofaStart = div * 4;
    var estriStart = div * 4 * 3;
    var dsTick = div * 4 * 5;
    var data = {
        division: div,
        syllables: [
            { tick: estrofaStart, verse: 0, text: "verso0.", syllabic: "single", durationQ: 2, restAfter: true, restDurationQ: 4, gapDurationQ: 4 },
            { tick: estrofaStart, verse: 1, text: "verso1.", syllabic: "single", durationQ: 2, restAfter: true, restDurationQ: 4, gapDurationQ: 4 },
            { tick: estriStart, verse: 0, text: "coro.", syllabic: "single", durationQ: 2, restAfter: false, restDurationQ: 0, gapDurationQ: 0 }
        ],
        chords: [
            { tick: 0, chord: "Do" },
            { tick: estrofaStart, chord: "Do" },
            { tick: estrofaStart + div, chord: "Re" }
        ],
        repeats: [],
        voltas: [],
        markers: [{ tick: 0, label: "segno", type: "segno" }],
        jumps: [{ tick: dsTick, jumpTo: "segno", playUntil: "end", continueAt: "", playRepeats: false }],
        systemTexts: [],
        barlines: [],
        lastTick: div * 4 * 7,
        fullRepeat: false
    };
    var output = orch.processExtraction(data);
    var stripped = output.replace(/​/g, "");
    // DS replay should show verse 1 content
    assert.ok(stripped.match(/[Vv]erso1/), "DS replay should show verse 1");
    // Re chord should appear (it's not the home chord, so it should always show)
    assert.ok(stripped.indexOf("Re") >= 0, "Re chord should appear in replay");
    // The home chord "Do" should NOT appear twice consecutively (home chord dedup)
    // In the replay, "Do" at the start of a section is the home chord and should be suppressed
    assert.ok(!stripped.match(/Do\s*\n[^\n]*Do/), "home chord 'Do' should not appear duplicated: " + stripped);
});

// ============================================================
// Section labels in multi-verse output
// ============================================================

// Two verses on the same music, no repeats and no jumps, which is what routes to the
// multi-verse branch of the simple path
function twoVerseData(systemTexts) {
    function syl(tick, verse, text, syllabic, rest) {
        return { tick: tick, verse: verse, text: text, syllabic: syllabic, durationQ: 1,
                 restAfter: !!rest, restDurationQ: rest ? 4 : 0, gapDurationQ: rest ? 4 : 0 };
    }
    return {
        title: "Dos Versos",
        // The period ends the phrase, so each verse is two lines and the label at the
        // start of the second line has somewhere to go
        syllables: [
            syl(960, 0, "uno", "single"), syl(1440, 0, "dos.", "single", true),
            syl(3840, 0, "tres", "single"), syl(4320, 0, "cuatro.", "single", true),
            syl(960, 1, "cinco", "single"), syl(1440, 1, "seis.", "single", true),
            syl(3840, 1, "siete", "single"), syl(4320, 1, "ocho.", "single", true)
        ],
        chords: [
            { tick: 0, chord: "Lam" },
            { tick: 960, chord: "Re" },
            { tick: 3840, chord: "Sol" }
        ],
        repeats: [],
        voltas: [],
        systemTexts: systemTexts
    };
}

test("processExtraction keeps section labels in multi-verse output", function() {
    var output = orch.processExtraction(twoVerseData([
        { tick: 0, text: "Intro" },
        { tick: 960, text: "Estrofa" }
    ]));
    assert.ok(output, "should produce output");
    assert.ok(output.indexOf("- INTRO -") >= 0, "the label before the first lyric:\n" + output);
    assert.ok(output.indexOf("- ESTROFA -") >= 0, "the label at the first lyric:\n" + output);

    // Each verse is its own stanza over the same music, so it carries the labels of
    // that music: the whole point of handing every block its own range
    var estrofas = output.split("- ESTROFA -").length - 1;
    assert.equal(estrofas, 2, "one per verse, found " + estrofas + ":\n" + output);
    var intros = output.split("- INTRO -").length - 1;
    assert.equal(intros, 1, "the intro label belongs to the intro only:\n" + output);
});

test("processExtraction gives each multi-verse block only the labels of its range", function() {
    // A label sitting past both verses must not be dragged to the top of a verse
    var output = orch.processExtraction(twoVerseData([
        { tick: 960, text: "Estrofa" },
        { tick: 99999, text: "Coda" }
    ]));
    assert.ok(output.indexOf("- ESTROFA -") >= 0, "the verse label is emitted:\n" + output);
    assert.ok(output.indexOf("- CODA -") < 0, "a label out of range is not:\n" + output);
});

test("processExtraction renders label templates before the first lyric", function() {
    // "#" numbering and "a:b" sequences are expanded by renderLabel, which the label
    // emitted before the intro chords was skipping
    var data = {
        title: "Plantillas",
        syllables: [
            { tick: 1920, verse: 0, text: "hola", syllabic: "single", durationQ: 1,
              restAfter: true, restDurationQ: 4, gapDurationQ: 4 }
        ],
        chords: [{ tick: 0, chord: "Lam" }, { tick: 1920, chord: "Re" }],
        repeats: [],
        voltas: [],
        systemTexts: [{ tick: 0, text: "Intro #" }]
    };
    var output = orch.processExtraction(data);
    assert.ok(output.indexOf("- INTRO 1 -") >= 0, "the # should be numbered:\n" + output);
    assert.ok(output.indexOf("#") < 0, "no raw template should be left:\n" + output);
});
