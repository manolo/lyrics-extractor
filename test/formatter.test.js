var test = require("node:test");
var assert = require("node:assert/strict");
var fmt = require("../lib/formatter");

test("formatLines renders chord line above text", function() {
    var lines = [{
        text: "hello world",
        sylMap: [{ tick: 0, pos: 0 }, { tick: 480, pos: 6 }],
        startTick: 0,
        endTick: 480
    }];
    var chords = [{ tick: 0, chord: "Lam" }, { tick: 480, chord: "Re" }];

    var result = fmt.formatLines(lines, chords, null, -1);
    assert.equal(result.output, "Lam   Re\nhello world\n");
    assert.equal(result.lastChord, "Re");
});

test("formatLines skips duplicate chords", function() {
    var lines = [{
        text: "hello",
        sylMap: [{ tick: 0, pos: 0 }],
        startTick: 0,
        endTick: 480
    }];
    var chords = [{ tick: 0, chord: "Lam" }];

    var result = fmt.formatLines(lines, chords, "Lam", -1);
    assert.equal(result.output, "\nhello\n");
});

test("formatPerfLines renders title and intro chords", function() {
    var lines = [{
        text: "hello world",
        sylMap: [{ tick: 0, pos: 0, chord: "Lam" }],
        startTick: 0,
        endTick: 480,
        sectionEnd: false
    }];

    var output = fmt.formatPerfLines(lines, ["Re", "Sol"], null, "My Song");
    assert.ok(output.indexOf("MY SONG") >= 0);
    assert.ok(output.indexOf("Re  Sol") >= 0);
    assert.ok(output.indexOf("Lam") >= 0);
    assert.ok(output.indexOf("hello world") >= 0);
});

test("formatPerfLines does not suppress homeChord when late in line", function() {
    // homeChord = "Lam", line has only Lam at pos 40 (end of line)
    // Should NOT be suppressed because it's not at the start
    var lines = [{
        text: "word word word word word word word poca.",
        sylMap: [
            { tick: 0, pos: 0, chord: "Mi7" },
            { tick: 480, pos: 35, chord: "Lam" }
        ],
        startTick: 0, endTick: 480,
        sectionEnd: false
    }];
    var output = fmt.formatPerfLines(lines, [], "Lam", "", null);
    // Mi7 is different from lastChord (null initially... wait, homeChord="Lam", lastChord starts null)
    // Actually let me trace: lastChord=null from introChords (empty),
    // Mi7 at pos 0: placements=0, pos<=2, homeChord="Lam", Mi7!="Lam" -> no suppress, placed
    // Lam at pos 35: placements=1, not first placement -> placed
    assert.ok(output.indexOf("Lam") >= 0, "Lam should appear: " + output);
});

test("formatPerfLines suppresses homeChord at line start", function() {
    // homeChord = "Lam", first chord of line is Lam at pos 0
    // Should be suppressed
    var lines = [{
        text: "hello world",
        sylMap: [
            { tick: 0, pos: 0, chord: "Lam" },
            { tick: 480, pos: 6, chord: "Re" }
        ],
        startTick: 0, endTick: 480,
        sectionEnd: false
    }];
    // lastChord = "Mi7" (from intro), homeChord = "Lam"
    var output = fmt.formatPerfLines(lines, ["Mi7"], "Lam", "", null);
    // Lam at pos 0 should be suppressed (return to homeChord at line start)
    // Re at pos 6 should show
    var chordLines = output.split("\n").filter(function(l) { return l.indexOf("Re") >= 0; });
    assert.ok(chordLines.length > 0, "Re should appear");
    // Lam should NOT appear in chord lines (suppressed)
    for (var i = 0; i < chordLines.length; i++) {
        assert.ok(chordLines[i].indexOf("Lam") < 0, "Lam should be suppressed at line start: " + chordLines[i]);
    }
});

test("formatPerfLines adds blank line after sectionEnd", function() {
    var lines = [
        { text: "line1", sylMap: [], startTick: 0, endTick: 480, sectionEnd: true },
        { text: "line2", sylMap: [], startTick: 960, endTick: 1440, sectionEnd: false }
    ];

    var output = fmt.formatPerfLines(lines, [], null, "");
    // line1 has no chords: empty chord line + text + sectionEnd blank + line2 empty chord line + text
    assert.ok(output.indexOf("line1\n\n\nline2") >= 0, "should have section break: " + JSON.stringify(output));
});

test("formatPerfLines keeps blank line between stanzas when no chord changes", function() {
    var lines = [
        { text: "first verse line one,", sylMap: [{ tick: 0, pos: 0, chord: "Lam" }], startTick: 0, endTick: 480, sectionEnd: false },
        { text: "first verse line two.", sylMap: [{ tick: 480, pos: 0, chord: "Mi7" }], startTick: 480, endTick: 960, sectionEnd: true },
        // Second stanza: chord is still Mi7, no changes at all
        { text: "second verse starts here,", sylMap: [{ tick: 960, pos: 0, chord: "Mi7" }], startTick: 960, endTick: 1440, sectionEnd: false },
        { text: "second verse ends here.", sylMap: [{ tick: 1440, pos: 0, chord: "Mi7" }], startTick: 1440, endTick: 1920, sectionEnd: true }
    ];

    var output = fmt.formatPerfLines(lines, [], null, "", []);
    // Blank line must separate the two stanzas
    assert.ok(output.indexOf("first verse line two.\n\n") >= 0,
        "should have blank line after sectionEnd: " + JSON.stringify(output));
    // Second stanza should NOT have a chord line (no changes)
    assert.ok(output.indexOf("\n\nSecond verse starts here") >= 0 ||
              output.indexOf("\n\nsecond verse starts here") >= 0,
        "second stanza should start with text, no chord line: " + JSON.stringify(output));
});

test("expandTextForChords no expansion when chords fit", function() {
    var result = fmt.expandTextForChords("hello world foo", [
        { pos: 0, chord: "Lam" },
        { pos: 6, chord: "Re" }
    ]);
    assert.equal(result.chordLine, "Lam   Re");
    assert.equal(result.text, "hello world foo");
});

test("expandTextForChords inserts spaces when chord too long", function() {
    // "ab cd" with chords at pos 0 ("Sol#m7", 6 chars) and pos 3 ("Re")
    // Sol#m7 needs 6 chars + 1 space = 7, but "Re" is at pos 3, so need 4 extra spaces
    var result = fmt.expandTextForChords("ab cd", [
        { pos: 0, chord: "Sol#m7" },
        { pos: 3, chord: "Re" }
    ]);
    assert.equal(result.chordLine, "Sol#m7 Re");
    assert.equal(result.text, "ab     cd");
});

test("expandTextForChords handles empty placements", function() {
    var result = fmt.expandTextForChords("hello", []);
    assert.equal(result.chordLine, "");
    assert.equal(result.text, "hello");
});

test("expandTextForChords expands at word boundary when multiple chords at pos 0", function() {
    // 4 chords at pos 0: expansion should go to the space between "Yo…" and "text"
    var result = fmt.expandTextForChords("Yo… text here", [
        { pos: 0, chord: "La" },
        { pos: 0, chord: "Re" },
        { pos: 0, chord: "Mi" },
        { pos: 0, chord: "La" }
    ]);
    // Chords should be sequential: La Re Mi La
    assert.ok(result.chordLine.indexOf("La Re Mi La") >= 0,
        "chords should be sequential: " + result.chordLine);
    // "Yo…" should start at pos 0 (first chord aligns with first word)
    assert.equal(result.text.indexOf("Yo…"), 0,
        "Yo… should stay at pos 0: " + result.text);
    // Gap between "Yo…" and "text" should be expanded
    assert.ok(result.text.indexOf("text here") > 4,
        "gap should be expanded between words: " + result.text);
});

test("expandTextForChords trailing chords start after expanded text", function() {
    // Trailing chords (pos >= text.length) should start 1 position after expanded text,
    // not at their inflated natural position.
    var result = fmt.expandTextForChords("short text,", [
        { pos: 0, chord: "Lam" },
        { pos: 13, chord: "Re" },   // trailing (11 + 2)
        { pos: 16, chord: "Sol" }   // trailing
    ]);
    // Re and Sol should be right after text, not far away
    var reIdx = result.chordLine.indexOf("Re");
    var textLen = result.text.length;
    assert.ok(reIdx <= textLen + 2,
        "trailing Re should be near text end, not far: chordLine=" + result.chordLine + " textLen=" + textLen);
    assert.ok(result.chordLine.indexOf("Sol") === reIdx + 3,
        "Sol should be right after Re: " + result.chordLine);
});

test("expandTextForChords trailing chords do not expand text", function() {
    // Even with cumShift from in-text expansion, trailing chords must not add spaces to text
    var result = fmt.expandTextForChords("ab cd ef,", [
        { pos: 0, chord: "Sol#m7" },
        { pos: 3, chord: "Re" },
        { pos: 11, chord: "La7" },   // trailing
        { pos: 15, chord: "Mi" }     // trailing
    ]);
    // Text should only be expanded between "ab" and "cd", not at the end
    assert.ok(result.text.indexOf("ef,") >= 0, "ef, should be in text: " + result.text);
    // No trailing spaces in text beyond original content
    assert.equal(result.text.replace(/\s+$/, "").slice(-3), "ef,",
        "text should end with ef,: " + result.text);
});

test("expandTextForChords forward boundary search when no space before", function() {
    // When chord at pos 0 needs expansion and there's no space before,
    // search forward to the first space between words
    var result = fmt.expandTextForChords("Hello world", [
        { pos: 0, chord: "Lam7b5" },  // 6 chars, needs expansion
        { pos: 0, chord: "Re" }
    ]);
    // "Hello" should stay at pos 0, space inserted between "Hello" and "world"
    assert.equal(result.text.indexOf("Hello"), 0,
        "Hello should stay at pos 0: " + result.text);
    assert.ok(result.text.indexOf("world") > 6,
        "world should be pushed right: " + result.text);
});

test("expandTextForChords handles multiple tight chords", function() {
    // "a b c" with long chords at each position
    var result = fmt.expandTextForChords("a b c", [
        { pos: 0, chord: "Lam7" },
        { pos: 2, chord: "Sol7" },
        { pos: 4, chord: "Re" }
    ]);
    // Lam7(4) + 1 = pos 5 for Sol7, Sol7(4) + 1 = pos 10 for Re
    assert.ok(result.chordLine.indexOf("Lam7") >= 0, "should have Lam7");
    assert.ok(result.chordLine.indexOf("Sol7") >= 0, "should have Sol7");
    assert.ok(result.chordLine.indexOf("Re") >= 0, "should have Re");
    // Text needs expansion at pos 2 (3 extra) and pos 4 (5 extra from original)
    assert.ok(result.text.indexOf("a") === 0);
    assert.ok(result.text.length >= result.chordLine.length || result.text.length >= 5);
});

test("formatLines expands text for long chords", function() {
    var lines = [{
        text: "ab cd",
        sylMap: [{ tick: 0, pos: 0 }, { tick: 480, pos: 3 }],
        startTick: 0,
        endTick: 480
    }];
    var chords = [{ tick: 0, chord: "Sol#m7" }, { tick: 480, chord: "Re" }];

    var result = fmt.formatLines(lines, chords, null, -1);
    var resultLines = result.output.split("\n");
    // Chord line and text line should be aligned
    assert.ok(resultLines[0].indexOf("Sol#m7") === 0);
    assert.ok(resultLines[0].indexOf("Re") > 6);
    // Text should be expanded
    assert.ok(resultLines[1].length > 5);
});

test("formatLines places trailing chords after text, not inside it", function() {
    // Chords after endTick should be placed as trailing chords (text.length + 2),
    // not mapped to positions inside the text via findPosForTick.
    var lines = [{
        text: "del Arauca vibrador,",
        sylMap: [
            { tick: 0, pos: 0 },
            { tick: 240, pos: 4 },
            { tick: 480, pos: 11 }
        ],
        startTick: 0,
        endTick: 480
    }];
    var chords = [
        { tick: 0, chord: "Mi" },
        { tick: 480, chord: "La" },
        { tick: 720, chord: "Re#" }  // After endTick: trailing chord
    ];

    var result = fmt.formatLines(lines, chords, null, -1);
    var resultLines = result.output.split("\n");
    // Text should NOT have extra spaces inside it
    assert.equal(resultLines[1], "del Arauca vibrador,",
        "text should not be expanded by trailing chords: " + resultLines[1]);
    // Trailing chord Re# should appear after La in the chord line
    assert.ok(resultLines[0].indexOf("Re#") > resultLines[0].indexOf("La"),
        "Re# should be after La: " + resultLines[0]);
});

test("formatLines handles multiple trailing chords without expanding text", function() {
    var lines = [{
        text: "de la espuma,",
        sylMap: [
            { tick: 0, pos: 0 },
            { tick: 240, pos: 6 }
        ],
        startTick: 0,
        endTick: 240
    }];
    var chords = [
        { tick: 0, chord: "Mi" },
        { tick: 480, chord: "Re" },    // trailing
        { tick: 720, chord: "La7" }    // trailing
    ];

    var result = fmt.formatLines(lines, chords, null, -1);
    var resultLines = result.output.split("\n");
    // No extra spaces in the text
    assert.equal(resultLines[1], "de la espuma,",
        "text should not have extra spaces: " + resultLines[1]);
    // Both trailing chords present
    assert.ok(resultLines[0].indexOf("Re") >= 0, "Re should appear: " + resultLines[0]);
    assert.ok(resultLines[0].indexOf("La7") >= 0, "La7 should appear: " + resultLines[0]);
});

test("formatLines renders 4+ trailing chords as separate interlude line", function() {
    var lines = [{
        text: "rosas y del sol.",
        sylMap: [{ tick: 0, pos: 0 }, { tick: 480, pos: 6 }],
        startTick: 0,
        endTick: 480
    }];
    var chords = [
        { tick: 0, chord: "La" },
        { tick: 720, chord: "Mi" },
        { tick: 960, chord: "Re#" },
        { tick: 1200, chord: "Re" },
        { tick: 1440, chord: "Do#m" },
        { tick: 1680, chord: "Sim" }
    ];
    var result = fmt.formatLines(lines, chords, null, -1);
    // Text should not be expanded by trailing chords
    assert.ok(result.output.indexOf("rosas y del sol.") >= 0,
        "text intact: " + result.output);
    // 5 trailing chords (>= 4) should be on separate line, not on chord line
    assert.ok(result.output.indexOf("Mi  Re#  Re  Do#m  Sim") >= 0,
        "interlude line should appear: " + result.output);
    // The interlude should be after the text
    var textIdx = result.output.indexOf("rosas y del sol.");
    var interIdx = result.output.indexOf("Mi  Re#");
    assert.ok(interIdx > textIdx, "interlude after text: " + result.output);
});

test("formatLines keeps <4 trailing chords on chord line", function() {
    var lines = [{
        text: "hello world.",
        sylMap: [{ tick: 0, pos: 0 }],
        startTick: 0,
        endTick: 480
    }];
    var chords = [
        { tick: 0, chord: "Lam" },
        { tick: 720, chord: "Re" },
        { tick: 960, chord: "Sol" }
    ];
    var result = fmt.formatLines(lines, chords, null, -1);
    var resultLines = result.output.split("\n");
    // 2 trailing chords should be on the chord line (same line as Lam)
    assert.ok(resultLines[0].indexOf("Re") >= 0, "Re on chord line: " + resultLines[0]);
    assert.ok(resultLines[0].indexOf("Sol") >= 0, "Sol on chord line: " + resultLines[0]);
});

test("getInterludeChords returns chords in gap", function() {
    var chords = [
        { tick: 0, chord: "Lam" },
        { tick: 480, chord: "Re" },
        { tick: 960, chord: "Sol" },
        { tick: 1200, chord: "Do" },
        { tick: 1440, chord: "Lam" }
    ];
    // Gap from tick 480 to 1440, lastChord = "Re"
    var result = fmt.getInterludeChords(chords, 480, 1440, "Re");
    assert.deepEqual(result, ["Sol", "Do"]);
});

test("getInterludeChords skips duplicate lastChord", function() {
    var chords = [
        { tick: 0, chord: "Lam" },
        { tick: 500, chord: "Lam" },
        { tick: 960, chord: "Re" }
    ];
    var result = fmt.getInterludeChords(chords, 0, 1440, "Lam");
    assert.deepEqual(result, ["Re"]);
});

test("getInterludeChords returns empty when no chords in gap", function() {
    var chords = [
        { tick: 0, chord: "Lam" },
        { tick: 1440, chord: "Re" }
    ];
    var result = fmt.getInterludeChords(chords, 480, 1440, "Lam");
    assert.deepEqual(result, []);
});

test("formatPerfLines appends trailing chords (<4) to chord line", function() {
    var lines = [
        {
            text: "first stanza end",
            sylMap: [{ tick: 0, pos: 0, chord: "Lam" }],
            startTick: 0, endTick: 480,
            sectionEnd: true
        },
        {
            text: "second stanza start",
            sylMap: [{ tick: 1920, pos: 0, chord: "Lam" }],
            startTick: 1920, endTick: 2400,
            sectionEnd: false
        }
    ];
    var chords = [
        { tick: 0, chord: "Lam" },
        { tick: 960, chord: "Re" },
        { tick: 1200, chord: "Sol" },
        { tick: 1920, chord: "Lam" }
    ];
    var output = fmt.formatPerfLines(lines, [], null, "", chords);
    // Trailing chords (<4) should appear on the same chord line as the verse
    assert.ok(output.indexOf("Re") >= 0 && output.indexOf("Sol") >= 0, "trailing chords should appear: " + output);
    // They should be on the chord line (before the text line)
    var chordLineIdx = output.indexOf("Re");
    var textIdx = output.indexOf("first stanza end");
    assert.ok(chordLineIdx < textIdx, "trailing chords on chord line before text: " + output);
});

test("formatPerfLines renders 4+ trailing chords as separate melodic line", function() {
    var lines = [
        {
            text: "end of verse here.",
            sylMap: [{ tick: 0, pos: 0, chord: "Lam" }],
            startTick: 0, endTick: 480,
            sectionEnd: true
        },
        {
            text: "next stanza start",
            sylMap: [{ tick: 3840, pos: 0, chord: "Do" }],
            startTick: 3840, endTick: 4320,
            sectionEnd: false
        }
    ];
    var chords = [
        { tick: 0, chord: "Lam" },
        { tick: 960, chord: "Fa#7" },
        { tick: 1440, chord: "Sim" },
        { tick: 1920, chord: "Mi7" },
        { tick: 2400, chord: "La" },
        { tick: 3840, chord: "Do" }
    ];
    var output = fmt.formatPerfLines(lines, [], null, "", chords);
    // 4 trailing chords should appear as separate melodic line, not on chord line
    assert.ok(output.indexOf("Fa#7  Sim  Mi7  La") >= 0, "melodic line should appear: " + output);
    // The melodic line should be after the text, not above it
    var textIdx = output.indexOf("end of verse here.");
    var melodicIdx = output.indexOf("Fa#7  Sim  Mi7  La");
    assert.ok(melodicIdx > textIdx, "melodic line after text: " + output);
});

test("formatPerfLines no interlude when no chords in gap", function() {
    var lines = [
        {
            text: "stanza one",
            sylMap: [{ tick: 0, pos: 0, chord: "Lam" }],
            startTick: 0, endTick: 480,
            sectionEnd: true
        },
        {
            text: "stanza two",
            sylMap: [{ tick: 960, pos: 0, chord: "Lam" }],
            startTick: 960, endTick: 1440,
            sectionEnd: false
        }
    ];
    var chords = [
        { tick: 0, chord: "Lam" },
        { tick: 960, chord: "Lam" }
    ];
    var output = fmt.formatPerfLines(lines, [], null, "", chords);
    // No interlude, just stanza break
    assert.ok(output.indexOf("stanza one\n\n") >= 0 || output.indexOf("stanza one\nLam\n") >= 0);
    // Count blank lines: should only be the sectionEnd one
    var parts = output.split("\n\n");
    assert.ok(parts.length <= 2, "no extra blank lines for empty interlude");
});

test("formatPerfLines shows interlude chords on backwards tick (repeat pass)", function() {
    // When sectionEnd with backwards tick (repeat), interlude chords from
    // start of score to next line's startTick should be shown
    var lines = [
        { text: "end of pass one.", sylMap: [{ tick: 960, pos: 0, chord: "Sol" }], startTick: 960, endTick: 1440, sectionEnd: true },
        // Backwards tick: second pass
        { text: "start of pass two.", sylMap: [{ tick: 480, pos: 0, chord: "Lam" }], startTick: 480, endTick: 960, sectionEnd: false }
    ];
    var chords = [
        { tick: 0, chord: "Re" },
        { tick: 240, chord: "Sol" },
        { tick: 480, chord: "Lam" },
        { tick: 960, chord: "Sol" }
    ];
    var output = fmt.formatPerfLines(lines, [], null, "", chords, null, null);
    // Interlude between pass 1 end and pass 2 start should show chords from tick 0 to 480
    assert.ok(output.indexOf("Re") >= 0, "should have interlude chord Re: " + output);
    // Re and Sol should appear as interlude between the two passes
    var endIdx = output.indexOf("end of pass one.");
    var startIdx = output.indexOf("start of pass two.");
    var between = output.substring(endIdx, startIdx);
    assert.ok(between.indexOf("Re") >= 0, "Re should be in interlude between passes: " + between);
});

test("formatPerfLines renders coda chords after last line", function() {
    var lines = [
        {
            text: "last line of song",
            sylMap: [{ tick: 0, pos: 0, chord: "Lam" }],
            startTick: 0, endTick: 480,
            sectionEnd: false
        }
    ];
    var chords = [
        { tick: 0, chord: "Lam" },
        { tick: 960, chord: "Re" },
        { tick: 1440, chord: "Sol" }
    ];
    var output = fmt.formatPerfLines(lines, [], null, "", chords);
    assert.ok(output.indexOf("Re  Sol") >= 0, "coda chords should appear: " + output);
    var idxText = output.indexOf("last line of song");
    var idxCoda = output.indexOf("Re  Sol");
    assert.ok(idxCoda > idxText, "coda after last line");
});

test("formatPerfLines no coda when no chords after last line", function() {
    var lines = [
        {
            text: "the end",
            sylMap: [{ tick: 0, pos: 0, chord: "Lam" }],
            startTick: 0, endTick: 480,
            sectionEnd: false
        }
    ];
    var chords = [{ tick: 0, chord: "Lam" }];
    var output = fmt.formatPerfLines(lines, [], null, "", chords);
    // Should just be the text line, no extra chord line
    assert.equal(output, "Lam\nthe end\n");
});

// ========================================
// abbreviateRepeatedStanzas
// ========================================

test("abbreviateRepeatedStanzas replaces duplicate stanza with incipit", function() {
    var lines = [
        { text: "En esta noche clara de inquietos luceros,", sylMap: [], startTick: 0, endTick: 480, sectionEnd: false },
        { text: "lo que yo mas quiero te vengo a decir.", sylMap: [], startTick: 480, endTick: 960, sectionEnd: true },
        { text: "Clavelitos, clavelitos, clavelitos de mi corazon,", sylMap: [], startTick: 960, endTick: 1440, sectionEnd: false },
        { text: "yo te traigo clavelitos colorados igual que un clavel.", sylMap: [], startTick: 1440, endTick: 1920, sectionEnd: true },
        { text: "En tanto que la luna extiende en el cielo,", sylMap: [], startTick: 1920, endTick: 2400, sectionEnd: false },
        { text: "su palido velo de plata y jazmin.", sylMap: [], startTick: 2400, endTick: 2880, sectionEnd: true },
        // Same estribillo text (duplicate)
        { text: "Clavelitos, clavelitos, clavelitos de mi corazon,", sylMap: [{ tick: 2880, pos: 0, chord: "Re" }], startTick: 2880, endTick: 3360, sectionEnd: false },
        { text: "yo te traigo clavelitos colorados igual que un clavel.", sylMap: [], startTick: 3360, endTick: 3840, sectionEnd: true }
    ];

    var result = fmt.abbreviateRepeatedStanzas(lines);

    // 3 stanzas: verse1, estribillo (full), verse2, estribillo (abbreviated)
    // The 4th stanza (duplicate estribillo) should be abbreviated
    assert.equal(result.length, 7, "should have 7 lines (6 original + 1 abbreviated): got " + result.length);

    var lastLine = result[result.length - 1];
    assert.ok(lastLine.text.indexOf("...") >= 0, "abbreviated line should end with ...: " + lastLine.text);
    assert.ok(lastLine.text.indexOf("Clavelitos") >= 0, "should start with Clavelitos: " + lastLine.text);
    assert.equal(lastLine.sectionEnd, true, "abbreviated line should have sectionEnd");
    assert.equal(lastLine.sylMap.length, 0, "abbreviated line should have no sylMap chords");
});

test("abbreviateRepeatedStanzas does not modify unique stanzas", function() {
    var lines = [
        { text: "first verse line one,", sylMap: [], startTick: 0, endTick: 480, sectionEnd: false },
        { text: "first verse line two.", sylMap: [], startTick: 480, endTick: 960, sectionEnd: true },
        { text: "second verse different text,", sylMap: [], startTick: 960, endTick: 1440, sectionEnd: false },
        { text: "second verse also different.", sylMap: [], startTick: 1440, endTick: 1920, sectionEnd: true }
    ];

    var result = fmt.abbreviateRepeatedStanzas(lines);
    assert.equal(result.length, 4, "should keep all 4 lines");
    assert.equal(result[0].text, "first verse line one,");
    assert.equal(result[3].text, "second verse also different.");
});

test("abbreviateRepeatedStanzas handles short first line by concatenating", function() {
    var lines = [
        { text: "Short.", sylMap: [], startTick: 0, endTick: 480, sectionEnd: false },
        { text: "second line of estribillo and more text here.", sylMap: [], startTick: 480, endTick: 960, sectionEnd: true },
        { text: "a verse in between with different text.", sylMap: [], startTick: 960, endTick: 1440, sectionEnd: true },
        // Duplicate
        { text: "Short.", sylMap: [], startTick: 1440, endTick: 1920, sectionEnd: false },
        { text: "second line of estribillo and more text here.", sylMap: [], startTick: 1920, endTick: 2400, sectionEnd: true }
    ];

    var result = fmt.abbreviateRepeatedStanzas(lines);
    var abbrev = result[result.length - 1];
    assert.ok(abbrev.text.indexOf("...") >= 0, "should have ...: " + abbrev.text);
    // Should concatenate since "Short." is < 30 chars
    assert.ok(abbrev.text.length > 10, "should be longer than just 'Short...': " + abbrev.text);
});

test("abbreviated stanza has extra blank line before it", function() {
    var lines = [
        { text: "Verse text here.", sylMap: [{ tick: 0, pos: 0, chord: "Lam" }], startTick: 0, endTick: 480, sectionEnd: true },
        { text: "Estribillo full text here.", sylMap: [{ tick: 480, pos: 0, chord: "Re" }], startTick: 480, endTick: 960, sectionEnd: true },
        { text: "Another verse.", sylMap: [{ tick: 960, pos: 0, chord: "Sol" }], startTick: 960, endTick: 1440, sectionEnd: true },
        // Duplicate estribillo
        { text: "Estribillo full text here.", sylMap: [{ tick: 1440, pos: 0, chord: "Re" }], startTick: 1440, endTick: 1920, sectionEnd: true }
    ];
    var output = fmt.formatPerfLines(lines, [], null, "", []);
    // The abbreviated line should have double blank line before it (sectionEnd \n + abbreviated \n)
    assert.ok(output.indexOf("\n\n\n") >= 0, "should have double blank line before abbreviated stanza: " + JSON.stringify(output));
});

test("formatPerfLines abbreviates repeated stanzas in output", function() {
    var lines = [
        { text: "Verse one text here with enough words.", sylMap: [{ tick: 0, pos: 0, chord: "Lam" }], startTick: 0, endTick: 480, sectionEnd: true },
        { text: "Estribillo text that will repeat later.", sylMap: [{ tick: 480, pos: 0, chord: "Re" }], startTick: 480, endTick: 960, sectionEnd: true },
        { text: "Verse two different text with other words.", sylMap: [{ tick: 960, pos: 0, chord: "Sol" }], startTick: 960, endTick: 1440, sectionEnd: true },
        // Same estribillo
        { text: "Estribillo text that will repeat later.", sylMap: [{ tick: 1440, pos: 0, chord: "Re" }], startTick: 1440, endTick: 1920, sectionEnd: true }
    ];

    var output = fmt.formatPerfLines(lines, [], null, "", []);
    // The second estribillo should be abbreviated
    assert.ok(output.indexOf("Estribillo text that will repeat later.") >= 0, "first estribillo should be full");
    assert.ok(output.indexOf("Estribillo text that will repeat later...") >= 0, "second estribillo should be abbreviated: " + output);
});

// ========================================
// System texts rendering
// ========================================

test("formatPerfLines renders title with ==== decoration", function() {
    var lines = [{
        text: "hello world",
        sylMap: [{ tick: 0, pos: 0, chord: "Lam" }],
        startTick: 0, endTick: 480,
        sectionEnd: false
    }];
    var output = fmt.formatPerfLines(lines, [], null, "Test Song");
    assert.ok(output.indexOf("==== TEST SONG ====") >= 0, "title should be decorated with ====: " + output);
});

test("formatPerfLines renders system text as dash-decorated label", function() {
    var lines = [{
        text: "hello world",
        sylMap: [{ tick: 960, pos: 0, chord: "Lam" }],
        startTick: 960, endTick: 1440,
        sectionEnd: false
    }];
    var systemTexts = [{ tick: 480, text: "Estribillo" }];
    var output = fmt.formatPerfLines(lines, [], null, "", [], null, systemTexts);
    assert.ok(output.indexOf("- ESTRIBILLO -") >= 0, "system text should be decorated with dashes: " + output);
});

test("formatPerfLines renders system text after intro chords when between intro and lyrics", function() {
    // System text at tick 500 is AFTER the intro chords start (tick 0) but BEFORE lyrics (tick 960)
    // It should appear AFTER the intro chords, BEFORE the first lyric line
    var lines = [{
        text: "hello world",
        sylMap: [{ tick: 960, pos: 0, chord: "Lam" }],
        startTick: 960, endTick: 1440,
        sectionEnd: false
    }];
    var chords = [{ tick: 0, chord: "Re" }, { tick: 480, chord: "Sol" }];
    var systemTexts = [{ tick: 500, text: "Solista" }];
    var output = fmt.formatPerfLines(lines, ["Re", "Sol"], null, "", chords, null, systemTexts);
    var introIdx = output.indexOf("Re  Sol");
    var sysIdx = output.indexOf("- SOLISTA -");
    var textIdx = output.indexOf("hello world");
    assert.ok(introIdx >= 0, "should have intro chords: " + output);
    assert.ok(sysIdx >= 0, "should have system text: " + output);
    assert.ok(introIdx < sysIdx, "intro chords before system text: " + output);
    assert.ok(sysIdx < textIdx, "system text before lyrics: " + output);
});

test("formatPerfLines renders system text before intro chords when at intro start", function() {
    // System text at tick 0 (same as first chord) should appear BEFORE intro chords
    var lines = [{
        text: "hello world",
        sylMap: [{ tick: 960, pos: 0, chord: "Lam" }],
        startTick: 960, endTick: 1440,
        sectionEnd: false
    }];
    var chords = [{ tick: 0, chord: "Re" }, { tick: 480, chord: "Sol" }];
    var systemTexts = [{ tick: 0, text: "Alborada" }];
    var output = fmt.formatPerfLines(lines, ["Re", "Sol"], null, "", chords, null, systemTexts);
    var sysIdx = output.indexOf("- ALBORADA -");
    var introIdx = output.indexOf("Re  Sol");
    assert.ok(sysIdx >= 0, "should have system text: " + output);
    assert.ok(introIdx >= 0, "should have intro chords: " + output);
    assert.ok(sysIdx < introIdx, "system text at intro start should come before intro chords: " + output);
});

test("formatPerfLines repeats system text on backwards tick jump (repeat pass)", function() {
    // Two pass scenario: lines go tick 0, 960, then back to 0 (repeat).
    // System text at tick 0 should appear before both the first and repeated pass.
    var lines = [
        {
            text: "first pass line one.",
            sylMap: [{ tick: 0, pos: 0, chord: "Lam" }],
            startTick: 0, endTick: 480,
            sectionEnd: false
        },
        {
            text: "first pass line two.",
            sylMap: [{ tick: 960, pos: 0, chord: "Re" }],
            startTick: 960, endTick: 1440,
            sectionEnd: true
        },
        {
            text: "second pass line one.",
            sylMap: [{ tick: 0, pos: 0, chord: "Sol" }],
            startTick: 0, endTick: 480,
            sectionEnd: false
        }
    ];
    var systemTexts = [{ tick: 0, text: "Estribillo" }];
    var output = fmt.formatPerfLines(lines, [], null, "", [], null, systemTexts);
    // When ticks go backwards (repeat pass), prevStartTick resets to -1,
    // allowing the system text at tick 0 to match again.
    var firstIdx = output.indexOf("- ESTRIBILLO -");
    assert.ok(firstIdx >= 0, "should have first occurrence: " + output);
    var secondIdx = output.indexOf("- ESTRIBILLO -", firstIdx + 1);
    assert.ok(secondIdx >= 0, "should have second occurrence on repeat pass: " + output);
});

test("formatPerfLines intro system text reappears on repeat pass", function() {
    // System text between intro chords and first lyric should appear after intro
    // AND again when ticks go backwards (second repeat pass)
    var lines = [
        { text: "first verse.", sylMap: [{ tick: 200, pos: 0, chord: "Lam" }], startTick: 200, endTick: 480, sectionEnd: false },
        { text: "more text.", sylMap: [{ tick: 960, pos: 0, chord: "Re" }], startTick: 960, endTick: 1440, sectionEnd: true },
        // Second pass (backwards tick)
        { text: "second verse.", sylMap: [{ tick: 200, pos: 0, chord: "Sol" }], startTick: 200, endTick: 480, sectionEnd: false }
    ];
    var chords = [{ tick: 0, chord: "Do" }];
    var systemTexts = [{ tick: 100, text: "Solista" }];
    var output = fmt.formatPerfLines(lines, [], null, "", chords, null, systemTexts);
    var first = output.indexOf("- SOLISTA -");
    assert.ok(first >= 0, "should have first occurrence: " + output);
    var second = output.indexOf("- SOLISTA -", first + 1);
    assert.ok(second >= 0, "intro system text should reappear on repeat pass: " + output);
});

test("formatPerfLines intro label appears before interlude on backwards tick", function() {
    // "Alborada" at tick 0 labels the intro. When the repeat loops back,
    // it should appear before the interlude chords (same as at the beginning).
    // "Solista" at tick 100 is a section label that repeats in the main loop.
    var lines = [
        { text: "verse one.", sylMap: [{ tick: 200, pos: 0, chord: "Lam" }], startTick: 200, endTick: 480, sectionEnd: false },
        { text: "more text.", sylMap: [{ tick: 960, pos: 0, chord: "Re" }], startTick: 960, endTick: 1440, sectionEnd: true },
        // Second pass (backwards tick)
        { text: "verse two.", sylMap: [{ tick: 200, pos: 0, chord: "Sol" }], startTick: 200, endTick: 480, sectionEnd: false }
    ];
    var chords = [{ tick: 50, chord: "Do" }];
    var systemTexts = [
        { tick: 0, text: "Alborada" },
        { tick: 100, text: "Solista" }
    ];
    var output = fmt.formatPerfLines(lines, ["Do"], null, "", chords, null, systemTexts);

    // Alborada: appears at intro AND before interlude (backwards tick plays intro again)
    var alb1 = output.indexOf("- ALBORADA -");
    assert.ok(alb1 >= 0, "should have first Alborada: " + output);
    var alb2 = output.indexOf("- ALBORADA -", alb1 + 1);
    assert.ok(alb2 >= 0, "Alborada should appear before interlude on repeat: " + output);

    // Solista: twice (section label after first chord)
    var sol1 = output.indexOf("- SOLISTA -");
    assert.ok(sol1 >= 0, "should have first Solista: " + output);
    var sol2 = output.indexOf("- SOLISTA -", sol1 + 1);
    assert.ok(sol2 >= 0, "Solista should repeat on second pass: " + output);
});

test("formatPerfLines abbreviates labeled interlude chords on repeat", function() {
    // Two passes: interlude between them has label "INTRO" + chords.
    // Second occurrence should show only label (chords already emitted).
    var lines = [
        { text: "verse one.", sylMap: [{ tick: 200, pos: 0, chord: "Lam" }], startTick: 200, endTick: 960, sectionEnd: true },
        // Second pass (backwards tick)
        { text: "verse two.", sylMap: [{ tick: 200, pos: 0, chord: "Sol" }], startTick: 200, endTick: 960, sectionEnd: false }
    ];
    var chords = [{ tick: 0, chord: "Re" }, { tick: 50, chord: "Sol" }, { tick: 200, chord: "Lam" }];
    var systemTexts = [{ tick: 0, text: "Intro" }];
    var output = fmt.formatPerfLines(lines, ["Re", "Sol"], null, "", chords, null, systemTexts);

    // First INTRO should have chords
    var intro1 = output.indexOf("- INTRO -");
    assert.ok(intro1 >= 0, "should have first INTRO: " + output);
    var chordsAfter1 = output.indexOf("Re  Sol", intro1);
    assert.ok(chordsAfter1 >= 0, "first INTRO should have chords: " + output);

    // Second INTRO (interlude on backwards tick) should have label only
    var intro2 = output.indexOf("- INTRO -", intro1 + 1);
    assert.ok(intro2 >= 0, "should have second INTRO: " + output);
    var chordsAfter2 = output.indexOf("Re  Sol", intro2);
    // The chords after second INTRO should NOT be there (or should be far away)
    if (chordsAfter2 >= 0) {
        assert.ok(chordsAfter2 > intro2 + 50, "second INTRO should not have chords immediately after: " + output);
    }
});

test("formatPerfLines abbreviated stanza with label shows only label", function() {
    // Two identical stanzas, second has a system text label before it.
    // The abbreviated line should be skipped, showing only the label.
    var lines = [
        { text: "Estribillo text here with enough words.", sylMap: [{ tick: 0, pos: 0, chord: "Lam" }], startTick: 0, endTick: 480, sectionEnd: true },
        { text: "Some verse.", sylMap: [{ tick: 960, pos: 0, chord: "Re" }], startTick: 960, endTick: 1440, sectionEnd: true },
        // Duplicate stanza (same text)
        { text: "Estribillo text here with enough words.", sylMap: [{ tick: 0, pos: 0, chord: "Lam" }], startTick: 0, endTick: 480, sectionEnd: true }
    ];
    var systemTexts = [{ tick: 0, text: "Estribillo" }, { tick: 960, text: "Verso" }];
    var output = fmt.formatPerfLines(lines, [], null, "", [], null, systemTexts);

    // First estribillo: full text
    assert.ok(output.indexOf("Estribillo text here") >= 0, "first estribillo should be full: " + output);

    // Second estribillo: should be abbreviated. With label, only label shown.
    var secondLabel = output.lastIndexOf("- ESTRIBILLO -");
    var firstLabel = output.indexOf("- ESTRIBILLO -");
    assert.ok(secondLabel > firstLabel, "should have two ESTRIBILLO labels: " + output);

    // Count full occurrences of the estribillo text
    var fullCount = 0;
    var idx = 0;
    while ((idx = output.indexOf("Estribillo text here", idx)) >= 0) { fullCount++; idx++; }
    assert.equal(fullCount, 1, "full estribillo text should appear only once: " + output);
});

test("findPosForTick returns correct position", function() {
    var sylMap = [
        { tick: 0, pos: 0 },
        { tick: 480, pos: 5 },
        { tick: 960, pos: 12 }
    ];
    assert.equal(fmt.findPosForTick(sylMap, 480).pos, 5);
    assert.equal(fmt.findPosForTick(sylMap, 700).pos, 5);
    assert.equal(fmt.findPosForTick(sylMap, 960).pos, 12);
});

test("formatPerfLines positions gap chord before next word (> 1 beat gap)", function() {
    // Chord "Fa" is assigned to syllable "y" at pos 6, but the actual chord tick
    // falls in a gap > 1 beat before "y". It should be positioned before "y".
    var lines = [{
        text: "sitio y es",
        sylMap: [
            { tick: 0, pos: 0, chord: "Sol7" },
            { tick: 960, pos: 6, chord: "Fa" }  // gap of 960 ticks (2 beats) from prev
        ],
        startTick: 0, endTick: 960, sectionEnd: false
    }];
    var chords = [
        { tick: 0, chord: "Sol7" },
        { tick: 720, chord: "Fa" }  // Fa plays at tick 720, before "y" at 960
    ];
    var output = fmt.formatPerfLines(lines, [], null, "", chords);
    // Fa should appear before "y" in the chord line, not on top of it
    var chordLine = output.split("\n")[0];
    var faIdx = chordLine.indexOf("Fa");
    assert.ok(faIdx >= 0, "Fa should appear: " + output);
    assert.ok(faIdx < 6, "Fa should be before pos 6 (y): pos=" + faIdx + " line: " + chordLine);
});

test("formatLines adjusts snapped chord to not overlap word", function() {
    // When findPosForTick snaps to next syllable, formatLines backs up by chord length
    var lines = [{
        text: "ese sitio y es en",
        sylMap: [
            { tick: 0, pos: 0 },
            { tick: 480, pos: 4 },
            { tick: 960, pos: 10 },  // "y"
            { tick: 1200, pos: 12 }
        ],
        startTick: 0, endTick: 1200
    }];
    // Chord at tick 800: midpoint of 480-960 is 720, 800 > 720 so snaps to pos 10
    // formatLines should adjust: 10 - chord.length back to avoid covering "y"
    var chords = [
        { tick: 0, chord: "Sol7" },
        { tick: 800, chord: "Fa" },
        { tick: 960, chord: "Sol7" }
    ];
    var result = fmt.formatLines(lines, chords, null, -1);
    var chordLine = result.output.split("\n")[0];
    var textLine = result.output.split("\n")[1];
    // "Fa" should end before "y" in the text
    var faEnd = chordLine.indexOf("Fa") + 2;
    var yPos = textLine.indexOf("y");
    assert.ok(faEnd <= yPos, "Fa should end before y: faEnd=" + faEnd + " yPos=" + yPos + " chord=[" + chordLine + "] text=[" + textLine + "]");
});

// ========================================
// wrapChordLine
// ========================================

test("wrapChordLine returns short line unchanged", function() {
    var line = "Lam  Re  Sol";
    assert.equal(fmt.wrapChordLine(line, 70), line);
});

test("wrapChordLine splits long line at double-space boundary", function() {
    // Build a chord line longer than 40 chars
    var line = "Lam  Re  Sol  Mi7  La  Fa#m  Sim7  Do#  Re7  Sol#m";
    var result = fmt.wrapChordLine(line, 40);
    var parts = result.split("\n");
    assert.ok(parts.length >= 2, "should split into at least 2 lines: " + result);
    for (var i = 0; i < parts.length; i++) {
        assert.ok(parts[i].length <= 45, "each line should be near maxWidth: " + parts[i].length);
    }
});

test("wrapChordLine splits very long line into multiple lines", function() {
    var chords = [];
    for (var i = 0; i < 30; i++) chords.push("Lam");
    var line = chords.join("  ");
    var result = fmt.wrapChordLine(line, 40);
    var parts = result.split("\n");
    assert.ok(parts.length >= 3, "should split into 3+ lines for very long input: " + parts.length);
});

// ========================================
// expandTextForChords: word boundary expansion
// ========================================

test("expandTextForChords shifts expansion to word boundary when two chords inside same word", function() {
    // "abcdef ghij" with chords at pos 2 and pos 4 (both inside "abcdef")
    // Expansion should happen at a space boundary, not inside the word
    var result = fmt.expandTextForChords("abcdef ghij", [
        { pos: 0, chord: "Sol#m7" },
        { pos: 2, chord: "Re" },
        { pos: 4, chord: "Lam" }
    ]);
    // The text should not have spaces injected inside "abcdef"
    // Spaces should be at pos 0 (before "abcdef") or at the space between words
    // Check that no space appears between characters of the first word in original text
    var firstWord = result.text.split(/\s+/)[0];
    // The first word might be padded before it, but should not be split
    assert.ok(result.text.indexOf("ab cdef") < 0, "should not split inside 'abcdef': " + result.text);
    assert.ok(result.chordLine.indexOf("Sol#m7") >= 0);
    assert.ok(result.chordLine.indexOf("Re") >= 0);
    assert.ok(result.chordLine.indexOf("Lam") >= 0);
});

// ========================================
// formatPerfLines: gap chord positioning
// ========================================

test("formatPerfLines shifts chord to space before word when gap > 960 ticks", function() {
    // Chord changes in a large gap (>960 ticks) between syllables.
    // The chord position should shift to the space before the next word.
    var lines = [{
        text: "primera palabra segunda tercera",
        sylMap: [
            { tick: 0, pos: 0, chord: "Lam" },
            // Large gap: 1440 ticks between these two syllables
            { tick: 1920, pos: 16, chord: "Re" }
        ],
        startTick: 0, endTick: 1920,
        sectionEnd: false
    }];
    var chords = [
        { tick: 0, chord: "Lam" },
        { tick: 960, chord: "Re" }
    ];
    var output = fmt.formatPerfLines(lines, [], null, "", chords);
    // "Re" chord should appear, positioned at the space before "segunda"
    assert.ok(output.indexOf("Re") >= 0, "Re should appear: " + output);
    // The chord line should show Re shifted left (before the word, not at pos 16)
    var outputLines = output.split("\n");
    var chordLine = "";
    for (var i = 0; i < outputLines.length; i++) {
        if (outputLines[i].indexOf("Re") >= 0 && outputLines[i].indexOf("primera") < 0) {
            chordLine = outputLines[i];
            break;
        }
    }
    assert.ok(chordLine.length > 0, "should find chord line with Re: " + output);
    // Re should appear before position 16 (shifted to space before word)
    var rePos = chordLine.indexOf("Re");
    assert.ok(rePos < 16, "Re should be shifted before pos 16: pos=" + rePos + " line=" + chordLine);
});

// ========================================
// --full flag disables abbreviation
// ========================================

test("formatPerfLines with fullRepeat=true does not abbreviate repeated stanzas", function() {
    // Two identical stanzas: with fullRepeat=true, both should appear in full
    var lines = [
        { text: "Verse one text here with enough words.", sylMap: [{ tick: 0, pos: 0, chord: "Lam" }], startTick: 0, endTick: 480, sectionEnd: true },
        { text: "Estribillo text that will repeat later.", sylMap: [{ tick: 480, pos: 0, chord: "Re" }], startTick: 480, endTick: 960, sectionEnd: true },
        { text: "Verse two different text with other words.", sylMap: [{ tick: 960, pos: 0, chord: "Sol" }], startTick: 960, endTick: 1440, sectionEnd: true },
        // Same estribillo (duplicate)
        { text: "Estribillo text that will repeat later.", sylMap: [{ tick: 1440, pos: 0, chord: "Re" }], startTick: 1440, endTick: 1920, sectionEnd: true }
    ];

    var output = fmt.formatPerfLines(lines, [], null, "", [], null, null, true);
    // Both occurrences of the estribillo should be full (no "...")
    assert.ok(output.indexOf("...") < 0, "fullRepeat=true should not abbreviate: " + output);
    // Count full occurrences
    var count = 0;
    var idx = 0;
    while ((idx = output.indexOf("Estribillo text that will repeat later.", idx)) >= 0) {
        count++;
        idx++;
    }
    assert.equal(count, 2, "both stanzas should appear in full: " + output);
});

test("formatPerfLines with fullRepeat=false abbreviates repeated stanzas", function() {
    // Same data as above, but with fullRepeat=false (default)
    var lines = [
        { text: "Verse one text here with enough words.", sylMap: [{ tick: 0, pos: 0, chord: "Lam" }], startTick: 0, endTick: 480, sectionEnd: true },
        { text: "Estribillo text that will repeat later.", sylMap: [{ tick: 480, pos: 0, chord: "Re" }], startTick: 480, endTick: 960, sectionEnd: true },
        { text: "Verse two different text with other words.", sylMap: [{ tick: 960, pos: 0, chord: "Sol" }], startTick: 960, endTick: 1440, sectionEnd: true },
        // Same estribillo (duplicate)
        { text: "Estribillo text that will repeat later.", sylMap: [{ tick: 1440, pos: 0, chord: "Re" }], startTick: 1440, endTick: 1920, sectionEnd: true }
    ];

    var output = fmt.formatPerfLines(lines, [], null, "", [], null, null, false);
    // Second estribillo should be abbreviated
    assert.ok(output.indexOf("...") >= 0, "fullRepeat=false should abbreviate: " + output);
});

// ========================================
// System text before interlude on backwards tick
// ========================================

test("formatPerfLines shows system text before interlude chords on backwards tick", function() {
    // Scenario: line with sectionEnd, backwards tick to next line,
    // system text between them (after introFirstChordTick), interlude chords.
    // The system text should appear before the interlude chords.
    // introChords must be non-empty so introFirstChordTick is set (chords[0].tick).
    var lines = [
        {
            text: "end of first pass.",
            sylMap: [{ tick: 960, pos: 0, chord: "Sol" }],
            startTick: 960, endTick: 1440,
            sectionEnd: true
        },
        // Backwards tick (repeat pass)
        {
            text: "start of second pass.",
            sylMap: [{ tick: 480, pos: 0, chord: "Lam" }],
            startTick: 480, endTick: 960,
            sectionEnd: false
        }
    ];
    var chords = [
        { tick: 0, chord: "Re" },
        { tick: 240, chord: "Sol" },
        { tick: 480, chord: "Lam" },
        { tick: 960, chord: "Sol" }
    ];
    // System text at tick 1500 (after line endTick 1440, after introFirstChordTick 0)
    // Must pass introChords so introFirstChordTick = chords[0].tick = 0
    var systemTexts = [{ tick: 1500, text: "Intro" }];
    var output = fmt.formatPerfLines(lines, ["Re"], null, "", chords, null, systemTexts);

    // The interlude chords (Sol at 240) should appear between the two passes
    // (Re at 0 is skipped because lastChord is "Re" from introChords)
    var endTextIdx = output.indexOf("end of first pass.");
    var startTextIdx = output.indexOf("start of second pass.");

    // The system text "INTRO" should appear before the interlude chords
    var introLabelIdx = output.indexOf("- INTRO -");
    assert.ok(introLabelIdx >= 0, "should have system text label: " + output);
    assert.ok(introLabelIdx > endTextIdx, "system text should be after first pass: " + output);
    assert.ok(introLabelIdx < startTextIdx, "system text should be before second pass: " + output);
});

// ========================================
// No outro after last abbreviated line
// ========================================

test("formatPerfLines does not append coda chords after last abbreviated line", function() {
    // When the last line of the song is an abbreviated estribillo (incipit + "..."),
    // no coda/outro chords should be appended. The song ends cleanly.
    var lines = [
        { text: "Verse one text here with enough words.", sylMap: [{ tick: 0, pos: 0, chord: "Lam" }], startTick: 0, endTick: 480, sectionEnd: true },
        { text: "Estribillo text that will repeat later.", sylMap: [{ tick: 480, pos: 0, chord: "Re" }], startTick: 480, endTick: 960, sectionEnd: true },
        { text: "Verse two different text with other words.", sylMap: [{ tick: 960, pos: 0, chord: "Sol" }], startTick: 960, endTick: 1440, sectionEnd: true },
        // Same estribillo (will be abbreviated)
        { text: "Estribillo text that will repeat later.", sylMap: [{ tick: 1440, pos: 0, chord: "Re" }], startTick: 1440, endTick: 1920, sectionEnd: true }
    ];
    // Chords that exist after the last line's endTick (would be coda chords)
    var chords = [
        { tick: 0, chord: "Lam" },
        { tick: 480, chord: "Re" },
        { tick: 960, chord: "Sol" },
        { tick: 1440, chord: "Re" },
        { tick: 2400, chord: "Fa#7" },
        { tick: 2880, chord: "Sim" }
    ];
    var output = fmt.formatPerfLines(lines, [], null, "", chords);
    // The abbreviated line should be present
    assert.ok(output.indexOf("...") >= 0, "should have abbreviated line: " + output);
    // Coda chords Fa#7 and Sim should NOT appear after the abbreviated line
    assert.ok(output.indexOf("Fa#7") < 0, "should not have coda chord Fa#7 after abbreviated line: " + output);
    assert.ok(output.indexOf("Sim") < 0, "should not have coda chord Sim after abbreviated line: " + output);
});

test("formatPerfLines still appends coda chords after non-abbreviated last line", function() {
    // When the last line is NOT abbreviated, coda chords should still appear.
    var lines = [
        { text: "The final line of the song.", sylMap: [{ tick: 0, pos: 0, chord: "Lam" }], startTick: 0, endTick: 480, sectionEnd: false }
    ];
    var chords = [
        { tick: 0, chord: "Lam" },
        { tick: 960, chord: "Re" },
        { tick: 1440, chord: "Sol" }
    ];
    var output = fmt.formatPerfLines(lines, [], null, "", chords);
    assert.ok(output.indexOf("Re  Sol") >= 0, "coda chords should appear after non-abbreviated last line: " + output);
});
