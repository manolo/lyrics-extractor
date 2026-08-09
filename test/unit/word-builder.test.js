var test = require("node:test");
var assert = require("node:assert/strict");
var wb = require("../../lib/word-builder");

test("buildWords joins syllables into words", function() {
    var syls = [
        { tick: 0, verse: 0, text: "hel", syllabic: "begin", durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0 },
        { tick: 480, verse: 0, text: "lo", syllabic: "end", durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0 },
        { tick: 960, verse: 0, text: "world", syllabic: "single", durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0 }
    ];

    var words = wb.buildWords(syls, 0);
    assert.equal(words.length, 2);
    assert.equal(words[0].text, "hello");
    assert.equal(words[0].tick, 0);
    assert.equal(words[1].text, "world");
    assert.equal(words[1].tick, 960);
});

test("buildWords filters by verse", function() {
    var syls = [
        { tick: 0, verse: 0, text: "verse0", syllabic: "single", durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0 },
        { tick: 0, verse: 1, text: "verse1", syllabic: "single", durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0 }
    ];

    var words0 = wb.buildWords(syls, 0);
    assert.equal(words0.length, 1);
    assert.equal(words0[0].text, "verse0");

    var words1 = wb.buildWords(syls, 1);
    assert.equal(words1.length, 1);
    assert.equal(words1[0].text, "verse1");

    var wordsAll = wb.buildWords(syls, -1);
    assert.equal(wordsAll.length, 2);
});

test("buildWords tracks syllable ticks with offsets", function() {
    var syls = [
        { tick: 0, verse: 0, text: "hel", syllabic: "begin", durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0 },
        { tick: 480, verse: 0, text: "lo", syllabic: "end", durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0 }
    ];

    var words = wb.buildWords(syls, 0);
    assert.equal(words[0].sylTicks.length, 2);
    assert.equal(words[0].sylTicks[0].tick, 0);
    assert.equal(words[0].sylTicks[0].offset, 0);
    assert.equal(words[0].sylTicks[1].tick, 480);
    assert.equal(words[0].sylTicks[1].offset, 3); // "hel" = 3 chars
});

test("detectPhraseBreak on strong punctuation", function() {
    var syl = { text: "end.", syllabic: "single", durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0 };
    assert.equal(wb.detectPhraseBreak(syl, null), true);

    var syl2 = { text: "end!", syllabic: "single", durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0 };
    assert.equal(wb.detectPhraseBreak(syl2, null), true);
});

test("detectPhraseBreak on long rest (>= 4 beats)", function() {
    var syl = { text: "word", syllabic: "single", durationQ: 1, restAfter: true, restDurationQ: 4, gapDurationQ: 2 };
    assert.equal(wb.detectPhraseBreak(syl, null), true);
});

test("detectPhraseBreak no break on moderate rest (< 4 beats)", function() {
    var syl = { text: "word", syllabic: "single", durationQ: 1, restAfter: true, restDurationQ: 2, gapDurationQ: 2 };
    assert.equal(wb.detectPhraseBreak(syl, null), false);
});

test("detectPhraseBreak no break on short notes", function() {
    var syl = { text: "mid", syllabic: "single", durationQ: 0.5, restAfter: false, restDurationQ: 0, gapDurationQ: 0 };
    assert.equal(wb.detectPhraseBreak(syl, null), false);
});

test("detectPhraseBreak respects sectionEnd flag", function() {
    var syl = { text: "end", syllabic: "single", durationQ: 0.5, restAfter: false, restDurationQ: 0, gapDurationQ: 0, sectionEnd: true };
    assert.equal(wb.detectPhraseBreak(syl, null), true);
});

test("detectPhraseBreak respects noBreakAfter flag", function() {
    var syl = { text: "end.", syllabic: "single", durationQ: 4, restAfter: true, restDurationQ: 4, gapDurationQ: 4, noBreakAfter: true };
    assert.equal(wb.detectPhraseBreak(syl, null), false);
});

test("detectPhraseBreak on semicolon", function() {
    var syl = { text: "word;", syllabic: "single", durationQ: 0.5, restAfter: false, restDurationQ: 0, gapDurationQ: 0 };
    assert.equal(wb.detectPhraseBreak(syl, null), true);
});

test("repairSyllabicChains fixes begin+single to begin+end", function() {
    var syls = [
        { syllabic: "begin", text: "co" },
        { syllabic: "single", text: "razón" }
    ];
    wb.repairSyllabicChains(syls);
    assert.equal(syls[0].syllabic, "begin");
    assert.equal(syls[1].syllabic, "end");
});

test("repairSyllabicChains does not affect valid chains", function() {
    var syls = [
        { syllabic: "begin", text: "co" },
        { syllabic: "middle", text: "ra" },
        { syllabic: "end", text: "zón" }
    ];
    wb.repairSyllabicChains(syls);
    assert.equal(syls[0].syllabic, "begin");
    assert.equal(syls[1].syllabic, "middle");
    assert.equal(syls[2].syllabic, "end");
});

test("detectPhraseBreak on fullwidth comma", function() {
    var syl = { text: "word\uFF0C", syllabic: "single", durationQ: 0.5, restAfter: false, restDurationQ: 0, gapDurationQ: 0 };
    assert.equal(wb.detectPhraseBreak(syl, null), true);
});

test("detectPhraseBreak: suspension points (...) suppress all breaks", function() {
    // Consecutive dots should NOT trigger break, even with long gap
    var syl = { text: "sas...", syllabic: "end", durationQ: 0.5, restAfter: false, restDurationQ: 0, gapDurationQ: 5 };
    assert.equal(wb.detectPhraseBreak(syl, null), false, "... should suppress gap break");
});

test("detectPhraseBreak: suspension points (..) suppress all breaks", function() {
    var syl = { text: "te..", syllabic: "end", durationQ: 4, restAfter: true, restDurationQ: 3, gapDurationQ: 5 };
    assert.equal(wb.detectPhraseBreak(syl, null), false, ".. should suppress all breaks");
});

test("detectPhraseBreak: ellipsis unicode suppresses all breaks", function() {
    var syl = { text: "sas\u2026", syllabic: "end", durationQ: 0.5, restAfter: true, restDurationQ: 3, gapDurationQ: 5 };
    assert.equal(wb.detectPhraseBreak(syl, null), false, "ellipsis should suppress all breaks");
});

test("detectPhraseBreak: single dot still triggers break", function() {
    var syl = { text: "sol.", syllabic: "end", durationQ: 0.5, restAfter: false, restDurationQ: 0, gapDurationQ: 0 };
    assert.equal(wb.detectPhraseBreak(syl, null), true, "single dot is sentence end");
});

test("detectPhraseBreak: double comma (,,) suppresses all breaks", function() {
    var syl = { text: "word,,", syllabic: "end", durationQ: 0.5, restAfter: true, restDurationQ: 5, gapDurationQ: 10 };
    assert.equal(wb.detectPhraseBreak(syl, null), false, ",, should suppress all breaks");
});

test("detectPhraseBreak: small comma (U+FE50) suppresses all breaks", function() {
    var syl = { text: "word\uFE50", syllabic: "end", durationQ: 0.5, restAfter: true, restDurationQ: 5, gapDurationQ: 10 };
    assert.equal(wb.detectPhraseBreak(syl, null), false, "small comma should suppress");
});

test("detectPhraseBreak: small full stop (U+FE52) suppresses all breaks", function() {
    var syl = { text: "word\uFE52", syllabic: "end", durationQ: 0.5, restAfter: true, restDurationQ: 5, gapDurationQ: 10 };
    assert.equal(wb.detectPhraseBreak(syl, null), false, "small full stop should suppress");
});

test("detectPhraseBreak: sectionBar triggers break", function() {
    var syl = { text: "word", syllabic: "end", durationQ: 0.5, restAfter: false, restDurationQ: 0, gapDurationQ: 0, sectionBar: true };
    assert.equal(wb.detectPhraseBreak(syl, null), true, "sectionBar should trigger break");
});

test("detectPhraseBreak: no sectionBar no break (other rules aside)", function() {
    var syl = { text: "word", syllabic: "end", durationQ: 0.5, restAfter: false, restDurationQ: 0, gapDurationQ: 0 };
    assert.equal(wb.detectPhraseBreak(syl, null), false, "no sectionBar, no other trigger");
});

test("buildWords joins broken chain after repair", function() {
    var syls = [
        { tick: 0, verse: 0, text: "co", syllabic: "begin", durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0 },
        { tick: 480, verse: 0, text: "razón", syllabic: "single", durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0 }
    ];
    var words = wb.buildWords(syls, 0);
    assert.equal(words.length, 1);
    assert.equal(words[0].text, "corazón");
});

test("sectionEnd overrides noBreakAfter at pass boundary", function() {
    // When a volta pass ends with noBreakAfter=true but sectionEnd=true,
    // the phrase should still break (sectionEnd wins).
    var syls = [
        { tick: 0, verse: 0, text: "ti.", syllabic: "single", durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0, sectionEnd: true, noBreakAfter: true },
        { tick: 480, verse: 0, text: "Sal", syllabic: "begin", durationQ: 0.5, restAfter: false, restDurationQ: 0, gapDurationQ: 0 },
        { tick: 720, verse: 0, text: "ve,", syllabic: "end", durationQ: 0.5, restAfter: false, restDurationQ: 0, gapDurationQ: 0 }
    ];
    var words = wb.buildWords(syls, 0);
    // "ti." should be its own word (phrase breaks despite noBreakAfter)
    assert.ok(words.some(function(w) { return w.text === "ti."; }),
        "ti. should be a separate word: " + words.map(function(w) { return w.text; }).join(", "));
    assert.ok(words.some(function(w) { return w.text === "Salve,"; }),
        "Salve, should be a separate word: " + words.map(function(w) { return w.text; }).join(", "));
});

test("buildWords propagates endChordTick from syllable to word", function() {
    var syls = [
        { tick: 0, verse: 0, text: "amor.", syllabic: "single", durationQ: 1, restAfter: true, restDurationQ: 2, gapDurationQ: 2, sectionEnd: true, endChordTick: 960 }
    ];
    var words = wb.buildWords(syls, 0);
    assert.equal(words[0].endChordTick, 960, "endChordTick should propagate to word");
});

test("buildWords propagates sectionBar as sectionEnd on the word", function() {
    var syls = [
        { tick: 0, verse: 0, text: "a", syllabic: "single", durationQ: 1, restAfter: true, restDurationQ: 2, gapDurationQ: 2 },
        { tick: 960, verse: 0, text: "mor.", syllabic: "single", durationQ: 1, restAfter: true, restDurationQ: 2, gapDurationQ: 2, sectionBar: true },
        { tick: 1920, verse: 0, text: "Tú", syllabic: "single", durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0 }
    ];
    var words = wb.buildWords(syls, 0);
    var morWord = words.filter(function(w) { return w.text === "mor."; })[0];
    assert.ok(morWord, "should have word 'mor.'");
    assert.ok(morWord.sectionEnd, "word with sectionBar syllable should have sectionEnd=true");
});

// ========================================
// Forced break overrides noBreakAfter
// ========================================

test("detectPhraseBreak: semicolon overrides noBreakAfter", function() {
    var syl = { text: "oh;", syllabic: "end", noBreakAfter: true };
    var next = { text: "Cha", syllabic: "single" };
    assert.equal(wb.detectPhraseBreak(syl, next), true,
        "semicolon should force break even with noBreakAfter");
});

test("detectPhraseBreak: fullwidth comma overrides noBreakAfter", function() {
    var syl = { text: "oh\uFF0C", syllabic: "end", noBreakAfter: true };
    var next = { text: "Cha", syllabic: "single" };
    assert.equal(wb.detectPhraseBreak(syl, next), true,
        "fullwidth comma should force break even with noBreakAfter");
});

// ========================================
// Volta continuation suppresses break
// ========================================

test("detectPhraseBreak: _voltaContinuation suppresses sectionEnd break", function() {
    // "el" has sectionEnd (from endRepeat barline), but "sol" is a volta
    // continuation that should join the same phrase.
    var syl = { text: "el", syllabic: "single", sectionEnd: true, sectionBar: true };
    var next = { text: "sol", syllabic: "single", _voltaContinuation: true };
    assert.equal(wb.detectPhraseBreak(syl, next), false,
        "_voltaContinuation should suppress sectionEnd/sectionBar break");
});

test("detectPhraseBreak: _voltaContinuation does not suppress when absent", function() {
    // Same as above but without _voltaContinuation: break should occur
    var syl = { text: "el", syllabic: "single", sectionEnd: true, sectionBar: true };
    var next = { text: "sol", syllabic: "single" };
    assert.equal(wb.detectPhraseBreak(syl, next), true,
        "without _voltaContinuation, sectionEnd should break");
});

// ========================================
// repairSyllabicChains: mid-word split on strong punctuation + rest
// ========================================

// ========================================
// Apostrophe joining: contractions stay as one word
// ========================================

test("buildWords joins apostrophe contraction: don't", function() {
    var syls = [
        { tick: 0, verse: 0, text: "don", syllabic: "end", durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0 },
        { tick: 480, verse: 0, text: "'t", syllabic: "single", durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0 }
    ];
    var words = wb.buildWords(syls, 0);
    assert.equal(words.length, 1);
    assert.equal(words[0].text, "don't");
});

test("buildWords joins apostrophe contraction: I'm", function() {
    var syls = [
        { tick: 0, verse: 0, text: "I", syllabic: "single", durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0 },
        { tick: 480, verse: 0, text: "'m", syllabic: "single", durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0 }
    ];
    var words = wb.buildWords(syls, 0);
    assert.equal(words.length, 1);
    assert.equal(words[0].text, "I'm");
});

test("buildWords joins unicode right quote contraction: don\u2019t", function() {
    var syls = [
        { tick: 0, verse: 0, text: "don", syllabic: "end", durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0 },
        { tick: 480, verse: 0, text: "\u2019t", syllabic: "single", durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0 }
    ];
    var words = wb.buildWords(syls, 0);
    assert.equal(words.length, 1);
    assert.equal(words[0].text, "don\u2019t");
});

test("buildWords joins multi-syllable contraction: wouldn't", function() {
    var syls = [
        { tick: 0, verse: 0, text: "would", syllabic: "begin", durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0 },
        { tick: 480, verse: 0, text: "n", syllabic: "end", durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0 },
        { tick: 960, verse: 0, text: "'t", syllabic: "single", durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0 }
    ];
    var words = wb.buildWords(syls, 0);
    assert.equal(words.length, 1);
    assert.equal(words[0].text, "wouldn't");
});

test("buildWords does NOT join long apostrophe word (quoted word)", function() {
    var syls = [
        { tick: 0, verse: 0, text: "say", syllabic: "single", durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0 },
        { tick: 480, verse: 0, text: "'hello'", syllabic: "single", durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0 }
    ];
    var words = wb.buildWords(syls, 0);
    assert.equal(words.length, 2);
    assert.equal(words[0].text, "say");
    assert.equal(words[1].text, "'hello'");
});

test("buildWords joins Italian elision: l'amore", function() {
    var syls = [
        { tick: 0, verse: 0, text: "l'a", syllabic: "begin", durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0 },
        { tick: 480, verse: 0, text: "mo", syllabic: "middle", durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0 },
        { tick: 960, verse: 0, text: "re", syllabic: "end", durationQ: 1, restAfter: false, restDurationQ: 0, gapDurationQ: 0 }
    ];
    var words = wb.buildWords(syls, 0);
    assert.equal(words.length, 1);
    assert.equal(words[0].text, "l'amore");
});

test("repairSyllabicChains splits mid-word chain at strong punctuation + rest", function() {
    // "can" (begin) -> "ción." (middle, punct+rest) -> "A" (middle) -> "za," (end)
    // Should become: "can" (begin) -> "ción." (end) -> "A" (begin) -> "za," (end)
    var syls = [
        { text: "can", syllabic: "begin" },
        { text: "ción.", syllabic: "middle", restAfter: true, restDurationQ: 1.5 },
        { text: "A", syllabic: "middle", sectionBar: true },
        { text: "za,", syllabic: "end" }
    ];
    wb.repairSyllabicChains(syls);
    assert.equal(syls[1].syllabic, "end", "ción. should become end");
    assert.equal(syls[2].syllabic, "begin", "A should become begin");
});

test("repairSyllabicChains does NOT split at sectionBar without punctuation", function() {
    // "de" (begin) -> "cir" (end, sectionBar) should NOT be split
    var syls = [
        { text: "de", syllabic: "begin" },
        { text: "cir.", syllabic: "end", sectionBar: true },
        { text: "next", syllabic: "single" }
    ];
    wb.repairSyllabicChains(syls);
    assert.equal(syls[0].syllabic, "begin", "de should stay begin");
    assert.equal(syls[1].syllabic, "end", "cir should stay end");
});

test("repairSyllabicChains converts begin to single when split", function() {
    // Single-syllable word incorrectly chained: "sol." (begin, punct+rest) -> "A" (end)
    var syls = [
        { text: "sol.", syllabic: "begin", restAfter: true, restDurationQ: 2 },
        { text: "A", syllabic: "end" }
    ];
    wb.repairSyllabicChains(syls);
    assert.equal(syls[0].syllabic, "single", "sol. should become single");
    assert.equal(syls[1].syllabic, "single", "A should become single");
});
