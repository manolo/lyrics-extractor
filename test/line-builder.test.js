var test = require("node:test");
var assert = require("node:assert/strict");
var lb = require("../lib/line-builder");

test("buildLinesFromWords groups words into lines by phraseBreak", function() {
    var words = [
        { text: "hello", tick: 0, phraseBreak: false, sylTicks: [{ tick: 0, offset: 0 }], sectionEnd: false },
        { text: "world.", tick: 480, phraseBreak: true, sylTicks: [{ tick: 480, offset: 0 }], sectionEnd: false },
        { text: "next", tick: 960, phraseBreak: true, sylTicks: [{ tick: 960, offset: 0 }], sectionEnd: false }
    ];

    var lines = lb.buildLinesFromWords(words, []);
    assert.equal(lines.length, 2);
    assert.equal(lines[0].text, "hello world.");
    assert.equal(lines[1].text, "next");
});

test("buildLinesFromWords computes sylMap positions", function() {
    var words = [
        { text: "ab", tick: 0, phraseBreak: false, sylTicks: [{ tick: 0, offset: 0 }], sectionEnd: false },
        { text: "cd", tick: 480, phraseBreak: true, sylTicks: [{ tick: 480, offset: 0 }], sectionEnd: false }
    ];

    var lines = lb.buildLinesFromWords(words, []);
    assert.equal(lines[0].sylMap.length, 2);
    assert.equal(lines[0].sylMap[0].pos, 0);  // "ab" starts at 0
    assert.equal(lines[0].sylMap[1].pos, 3);  // "cd" starts at 3 ("ab" + space)
});

test("findPosForTick finds best position", function() {
    var sylMap = [
        { tick: 0, pos: 0 },
        { tick: 480, pos: 5 },
        { tick: 960, pos: 10 }
    ];

    assert.equal(lb.findPosForTick(sylMap, 0), 0);
    assert.equal(lb.findPosForTick(sylMap, 240), 0);
    assert.equal(lb.findPosForTick(sylMap, 480), 5);
    assert.equal(lb.findPosForTick(sylMap, 700), 5);
    assert.equal(lb.findPosForTick(sylMap, 2000), 10);
});

test("findPosForTick snaps to next syllable when in second half of gap", function() {
    var sylMap = [
        { tick: 0, pos: 0 },
        { tick: 480, pos: 5 },
        { tick: 960, pos: 10 }
    ];
    // tick 250 is in the second half of gap 0-480 (midpoint=240): snap to pos 4 (5-1)
    assert.equal(lb.findPosForTick(sylMap, 250), 4);
    // tick 239 is in the first half: stay at pos 0
    assert.equal(lb.findPosForTick(sylMap, 239), 0);
    // tick 730 is in the second half of gap 480-960 (midpoint=720): snap to pos 9 (10-1)
    assert.equal(lb.findPosForTick(sylMap, 730), 9);
    // tick 719 is in the first half: stay at pos 5
    assert.equal(lb.findPosForTick(sylMap, 719), 5);
});

test("applyStanzaFormatting capitalizes first line", function() {
    var lines = [
        { text: "hello world" },
        { text: "second line" }
    ];
    lb.applyStanzaFormatting(lines);
    assert.equal(lines[0].text, "Hello world,");
    assert.equal(lines[1].text, "second line.");
});

test("applyStanzaFormatting adds commas and period", function() {
    var lines = [
        { text: "first" },
        { text: "second" },
        { text: "third" }
    ];
    lb.applyStanzaFormatting(lines);
    assert.equal(lines[0].text, "First,");
    assert.equal(lines[1].text, "second,");
    assert.equal(lines[2].text, "third."); // lowercase after comma, period at end
});

test("applyStanzaFormatting preserves existing punctuation", function() {
    var lines = [
        { text: "question?" },
        { text: "exclaim!" }
    ];
    lb.applyStanzaFormatting(lines);
    assert.equal(lines[0].text, "Question?");
    assert.equal(lines[1].text, "exclaim!");
});

test("applyStanzaFormatting replaces comma with period on last line", function() {
    var lines = [
        { text: "only," }
    ];
    lb.applyStanzaFormatting(lines);
    assert.equal(lines[0].text, "Only.");
});

test("splitLongLines splits at comma near median", function() {
    var lines = [
        { text: "short line one", sylMap: [{tick:0,pos:0}], startTick: 0, endTick: 100, sectionEnd: false },
        { text: "short line two", sylMap: [{tick:100,pos:0}], startTick: 100, endTick: 200, sectionEnd: false },
        { text: "short line tre", sylMap: [{tick:200,pos:0}], startTick: 200, endTick: 300, sectionEnd: false },
        { text: "this is a long line, that should be split into two parts", sylMap: [
            {tick:300,pos:0}, {tick:310,pos:5}, {tick:320,pos:8}, {tick:330,pos:10},
            {tick:340,pos:15}, {tick:350,pos:21}, {tick:360,pos:26},
            {tick:370,pos:31}, {tick:380,pos:34}, {tick:390,pos:40},
            {tick:400,pos:45}, {tick:410,pos:49}, {tick:420,pos:54}
        ], startTick: 300, endTick: 500, sectionEnd: false }
    ];
    var result = lb.splitLongLines(lines);
    // Median of [14,14,14,56] = 14, threshold = 21, line 4 (56) > 21
    assert.ok(result.length > 4, "should have split the long line");
    // Find the split line
    var found = false;
    for (var i = 0; i < result.length; i++) {
        if (result[i].text.indexOf("long line,") >= 0) found = true;
    }
    assert.ok(found, "first half should contain the comma");
});

test("splitLongLines does NOT split at uppercase (only at comma)", function() {
    var lines = [
        { text: "twelve chars.", sylMap: [{tick:0,pos:0}], startTick: 0, endTick: 100, sectionEnd: false },
        { text: "twelve chars.", sylMap: [{tick:100,pos:0}], startTick: 100, endTick: 200, sectionEnd: false },
        { text: "twelve chars.", sylMap: [{tick:200,pos:0}], startTick: 200, endTick: 300, sectionEnd: false },
        { text: "one two three Cuatro cinco seis siete", sylMap: [
            {tick:300,pos:0}, {tick:310,pos:4}, {tick:320,pos:8}, {tick:330,pos:14},
            {tick:340,pos:21}, {tick:350,pos:27}, {tick:360,pos:31}
        ], startTick: 300, endTick: 500, sectionEnd: false }
    ];
    var result = lb.splitLongLines(lines);
    // No comma in the long line -> should NOT split (uppercase alone is not a split point)
    assert.equal(result.length, 4, "should NOT split at uppercase: " + result.length);
});

test("splitLongLines does not split short lines", function() {
    var lines = [
        { text: "short one", sylMap: [], startTick: 0, endTick: 100, sectionEnd: false },
        { text: "short two", sylMap: [], startTick: 100, endTick: 200, sectionEnd: false },
        { text: "short tri", sylMap: [], startTick: 200, endTick: 300, sectionEnd: false }
    ];
    var result = lb.splitLongLines(lines);
    assert.equal(result.length, 3);
});

test("splitLongLines splits very long line even when comma is far from median", function() {
    // When median is low but line is 150+ chars, the comma should still be found
    var longText = "En esta noche clara de inquietos luceros lo que yo mas quiero te vengo a decir, en tanto que la luna extiende en el cielo su palido velo de plata y jazmin.";
    var lines = [
        { text: longText, sylMap: [], startTick: 0, endTick: 100, sectionEnd: false },
        { text: "short line one here.", sylMap: [], startTick: 100, endTick: 200, sectionEnd: false },
        { text: "another short line.", sylMap: [], startTick: 200, endTick: 300, sectionEnd: false }
    ];
    var result = lb.splitLongLines(lines);
    assert.ok(result.length >= 4, "should split long line: got " + result.length + " lines");
    assert.ok(result[0].text.length < longText.length, "first part should be shorter than original");
    assert.ok(result[0].text.indexOf("decir,") >= 0, "should split at comma: " + result[0].text);
});

test("cleanWordText replaces underties and synalepha dots", function() {
    assert.equal(lb.cleanWordText("da\u203Fes"), "da es");
    assert.equal(lb.cleanWordText("vi.da"), "vi da");
    assert.equal(lb.cleanWordText("normal word"), "normal word");
});

test("cleanWordText converts 3+ dots to ellipsis, 2 dots to small full stop", function() {
    assert.equal(lb.cleanWordText("te..."), "te\u2026", "3 dots → ellipsis");
    assert.equal(lb.cleanWordText("word...."), "word\u2026", "4 dots → ellipsis");
    assert.equal(lb.cleanWordText("A.."), "A\uFE52", "2 dots → small full stop");
    assert.equal(lb.cleanWordText("só.."), "só\uFE52", "2 dots → small full stop");
    // Single dot between letters is still synalepha
    assert.equal(lb.cleanWordText("da.es"), "da es");
    // Ellipsis preserved
    assert.equal(lb.cleanWordText("A\u2026"), "A\u2026");
});

test("cleanWordText converts double comma to small comma", function() {
    assert.equal(lb.cleanWordText("word,,"), "word\uFE50");
    assert.equal(lb.cleanWordText("normal,"), "normal,", "single comma unchanged");
});

test("mergeShortLines backward merge: 1-word line at end merges into previous", function() {
    var lines = [
        { text: "this is a normal length line here", sylMap: [{tick:0,pos:0}], startTick: 0, endTick: 480, sectionEnd: false },
        { text: "end", sylMap: [{tick:480,pos:0}], startTick: 480, endTick: 960, sectionEnd: true }
    ];
    var result = lb.mergeShortLines(lines);
    assert.equal(result.length, 1, "1-word line should merge backward: got " + result.length);
    assert.ok(result[0].text.indexOf("end") >= 0, "merged line should contain 'end': " + result[0].text);
    assert.equal(result[0].sectionEnd, true, "merged line should keep sectionEnd from the absorbed line");
});

test("applyStanzaFormatting converts semicolon to comma and lowercases next line", function() {
    var lines = [
        { text: "first part;" },
        { text: "Second part" },
        { text: "end" }
    ];
    lb.applyStanzaFormatting(lines);
    assert.equal(lines[0].text, "First part,");  // ; becomes ,
    assert.equal(lines[1].text, "second part,");  // lowercase after ,
    assert.equal(lines[2].text, "end.");
});

test("applyStanzaFormatting converts fullwidth comma same as semicolon", function() {
    var lines = [
        { text: "first part\uFF0C" },
        { text: "Second part" }
    ];
    lb.applyStanzaFormatting(lines);
    assert.equal(lines[0].text, "First part,");  // fullwidth comma becomes ,
    assert.equal(lines[1].text, "second part.");
});

test("applyStanzaFormatting converts semicolon to period on last line", function() {
    var lines = [
        { text: "only line;" }
    ];
    lb.applyStanzaFormatting(lines);
    assert.equal(lines[0].text, "Only line.");  // ; -> , -> . (last line)
});

test("applyStanzaFormatting converts small comma (U+FE50) to regular comma", function() {
    var lines = [
        { text: "rosas\uFE50" },
        { text: "y del sol" }
    ];
    lb.applyStanzaFormatting(lines);
    assert.equal(lines[0].text, "Rosas,");
    assert.equal(lines[1].text, "y del sol.");
});

test("applyStanzaFormatting converts small full stop (U+FE52) to regular period", function() {
    var lines = [
        { text: "rosas\uFE52" },
        { text: "y del sol" }
    ];
    lb.applyStanzaFormatting(lines);
    assert.equal(lines[0].text, "Rosas.");
    // Period counts as punctuation, no extra comma added
    assert.equal(lines[1].text, "y del sol.");
});
