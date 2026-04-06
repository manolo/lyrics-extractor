var test = require("node:test");
var assert = require("node:assert/strict");
var wb = require("../lib/word-builder");

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
