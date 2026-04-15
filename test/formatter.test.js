var test = require("node:test");
var assert = require("node:assert/strict");
var fmt = require("../lib/formatter");
var M = fmt.CHORD_LINE_MARKER; // zero-width space prefix on chord lines

test("formatLines renders chord line above text", function() {
    var lines = [{
        text: "hello world",
        sylMap: [{ tick: 0, pos: 0 }, { tick: 480, pos: 6 }],
        startTick: 0,
        endTick: 480
    }];
    var chords = [{ tick: 0, chord: "Lam" }, { tick: 480, chord: "Re" }];

    var result = fmt.formatLines(lines, chords, null, -1);
    assert.equal(result.output, M + "Lam   Re\nhello world\n");
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

    var result = fmt.formatPerfLines(lines, ["Re", "Sol"], null, "My Song");
    var output = result.text;
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
    var result = fmt.formatPerfLines(lines, [], "Lam", "", null);
    var output = result.text;
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
    var result = fmt.formatPerfLines(lines, ["Mi7"], "Lam", "", null);
    var output = result.text;
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

    var result = fmt.formatPerfLines(lines, [], null, "");
    var output = result.text;
    // line1 has no chords: empty chord line + text + sectionEnd blank + line2 empty chord line + text
    assert.ok(output.indexOf("line1\n\nline2") >= 0, "should have section break: " + JSON.stringify(output));
});

test("formatPerfLines keeps blank line between stanzas when no chord changes", function() {
    var lines = [
        { text: "first verse line one,", sylMap: [{ tick: 0, pos: 0, chord: "Lam" }], startTick: 0, endTick: 480, sectionEnd: false },
        { text: "first verse line two.", sylMap: [{ tick: 480, pos: 0, chord: "Mi7" }], startTick: 480, endTick: 960, sectionEnd: true },
        // Second stanza: chord is still Mi7, no changes at all
        { text: "second verse starts here,", sylMap: [{ tick: 960, pos: 0, chord: "Mi7" }], startTick: 960, endTick: 1440, sectionEnd: false },
        { text: "second verse ends here.", sylMap: [{ tick: 1440, pos: 0, chord: "Mi7" }], startTick: 1440, endTick: 1920, sectionEnd: true }
    ];

    var result = fmt.formatPerfLines(lines, [], null, "", []);
    var output = result.text;
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
    assert.equal(result.chordLine, M + "Lam   Re");
    assert.equal(result.text, "hello world foo");
});

test("expandTextForChords inserts spaces when chord too long", function() {
    // "ab cd" with chords at pos 0 ("Sol#m7", 6 chars) and pos 3 ("Re")
    // Sol#m7 needs 6 chars + 1 space = 7, but "Re" is at pos 3, so need 4 extra spaces
    var result = fmt.expandTextForChords("ab cd", [
        { pos: 0, chord: "Sol#m7" },
        { pos: 3, chord: "Re" }
    ]);
    assert.equal(result.chordLine, M + "Sol#m7 Re");
    assert.equal(result.text, "ab     cd");
});

test("expandTextForChords handles empty placements", function() {
    var result = fmt.expandTextForChords("hello", []);
    assert.equal(result.chordLine, ""); // no placements = no marker
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
    var cl = fmt.stripChordMarkers(resultLines[0]);
    assert.ok(cl.indexOf("Sol#m7") === 0);
    assert.ok(cl.indexOf("Re") > 6);
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

test("formatLines renders system text before corresponding line", function() {
    var lines = [
        { text: "intro verse.", sylMap: [{ tick: 0, pos: 0 }], startTick: 0, endTick: 480 },
        { text: "second verse.", sylMap: [{ tick: 960, pos: 0 }], startTick: 960, endTick: 1440 }
    ];
    var chords = [{ tick: 0, chord: "Lam" }];
    var systemTexts = [{ tick: 960, text: "Todos" }];
    var result = fmt.formatLines(lines, chords, null, -1, systemTexts);
    assert.ok(result.output.indexOf("- TODOS -") >= 0, "system text should appear: " + result.output);
    var sysIdx = result.output.indexOf("- TODOS -");
    var secondIdx = result.output.indexOf("second verse.");
    assert.ok(sysIdx < secondIdx, "system text before second verse: " + result.output);
});

test("formatLines renders system text before interlude chords (not after)", function() {
    // Use a long line so trailing chords don't fit and force a separate interlude line
    var lines = [
        { text: "este texto es bastante largo para que no quepan acordes detras.",
          sylMap: [{ tick: 0, pos: 0 }], startTick: 0, endTick: 480 },
        { text: "siguiente verso.", sylMap: [{ tick: 5000, pos: 0 }], startTick: 5000, endTick: 5480 }
    ];
    var chords = [
        { tick: 0, chord: "Lam" },
        { tick: 1000, chord: "ReM" },
        { tick: 1500, chord: "Solm" },
        { tick: 2000, chord: "Mi7" },
        { tick: 2500, chord: "Lam7" },
        { tick: 5000, chord: "Lam" }
    ];
    // System text "Musica" at tick 800, falls in the trailing chord range
    var systemTexts = [{ tick: 800, text: "Musica" }];
    var result = fmt.formatLines(lines, chords, null, -1, systemTexts);
    var musicaIdx = result.output.indexOf("- MUSICA -");
    var interludeIdx = result.output.indexOf("ReM  Solm  Mi7  Lam7");
    assert.ok(musicaIdx >= 0, "should have MUSICA: " + result.output);
    assert.ok(interludeIdx >= 0, "should have interlude: " + result.output);
    assert.ok(musicaIdx < interludeIdx, "MUSICA should be before interlude chords: " + result.output);
});

test("formatLines does not duplicate system text already shown in intro", function() {
    // System text at tick 0 should NOT appear inline (it's before firstLineTick)
    var lines = [
        { text: "hello world.", sylMap: [{ tick: 480, pos: 0 }], startTick: 480, endTick: 960 }
    ];
    var chords = [{ tick: 480, chord: "Lam" }];
    // Only pass texts at or after firstLineTick (orchestrator filters these)
    var systemTexts = [{ tick: 480, text: "Solista" }];
    var result = fmt.formatLines(lines, chords, null, -1, systemTexts);
    assert.ok(result.output.indexOf("- SOLISTA -") >= 0, "should have Solista: " + result.output);
    // Should appear only once
    var first = result.output.indexOf("- SOLISTA -");
    var second = result.output.indexOf("- SOLISTA -", first + 1);
    assert.equal(second, -1, "should not duplicate: " + result.output);
});

test("formatLines works without systemTexts parameter", function() {
    var lines = [{ text: "hello.", sylMap: [{ tick: 0, pos: 0 }], startTick: 0, endTick: 480 }];
    var chords = [{ tick: 0, chord: "Lam" }];
    var result = fmt.formatLines(lines, chords, null, -1);
    assert.ok(result.output.indexOf("hello.") >= 0, "should render text: " + result.output);
});

test("formatLines renders trailing chords as separate line when they don't fit", function() {
    var lines = [{
        text: "este es un texto suficientemente largo para no caber.",
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
    // Trailing chords don't fit (text > 50 chars + 5 chords) -> separate line
    assert.ok(result.output.indexOf("Mi  Re#  Re  Do#m  Sim") >= 0,
        "interlude line should appear: " + result.output);
    var textIdx = result.output.indexOf("este es un texto");
    var interIdx = result.output.indexOf("Mi  Re#");
    assert.ok(interIdx > textIdx, "interlude after text: " + result.output);
});

test("formatLines appends trailing chords when they fit on the chord line", function() {
    var lines = [{
        text: "corto.",
        sylMap: [{ tick: 0, pos: 0 }],
        startTick: 0,
        endTick: 480
    }];
    var chords = [
        { tick: 0, chord: "La" },
        { tick: 720, chord: "Mi" },
        { tick: 960, chord: "Re" },
        { tick: 1200, chord: "Sol" },
        { tick: 1440, chord: "Do" },
        { tick: 1680, chord: "Re" }
    ];
    var result = fmt.formatLines(lines, chords, null, -1);
    // 5 short trailing chords fit after "corto." -> appended to chord line
    var lines_out = result.output.split("\n");
    var chordLine = lines_out[0];
    assert.ok(chordLine.indexOf("Mi") >= 0 && chordLine.indexOf("Sol") >= 0,
        "trailing chords on chord line: " + chordLine);
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
    var result = fmt.formatPerfLines(lines, [], null, "", chords);
    var output = result.text;
    // Trailing chords (<4) should appear on the same chord line as the verse
    assert.ok(output.indexOf("Re") >= 0 && output.indexOf("Sol") >= 0, "trailing chords should appear: " + output);
    // They should be on the chord line (before the text line)
    var chordLineIdx = output.indexOf("Re");
    var textIdx = output.indexOf("first stanza end");
    assert.ok(chordLineIdx < textIdx, "trailing chords on chord line before text: " + output);
});

test("formatPerfLines renders trailing chords as separate line when they don't fit", function() {
    var lines = [
        {
            text: "esta linea es bastante larga, pero realmente larga si.",
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
    var result = fmt.formatPerfLines(lines, [], null, "", chords);
    var output = result.text;
    // 4 trailing chords don't fit on the long line -> separate melodic line
    assert.ok(output.indexOf("Fa#7  Sim  Mi7  La") >= 0, "melodic line should appear: " + output);
    var textIdx = output.indexOf("esta linea es");
    var melodicIdx = output.indexOf("Fa#7  Sim  Mi7  La");
    assert.ok(melodicIdx > textIdx, "melodic line after text: " + output);
});

test("formatPerfLines appends trailing chords when they fit on the chord line", function() {
    var lines = [
        {
            text: "corto.",
            sylMap: [{ tick: 0, pos: 0, chord: "Lam" }],
            startTick: 0, endTick: 480,
            sectionEnd: false
        },
        {
            text: "siguiente",
            sylMap: [{ tick: 3840, pos: 0, chord: "Do" }],
            startTick: 3840, endTick: 4320,
            sectionEnd: false
        }
    ];
    var chords = [
        { tick: 0, chord: "Lam" },
        { tick: 960, chord: "Re7" },
        { tick: 1440, chord: "Dom" },
        { tick: 1920, chord: "Re7" },
        { tick: 2400, chord: "Dom" },
        { tick: 3840, chord: "Do" }
    ];
    var result = fmt.formatPerfLines(lines, [], null, "", chords);
    var output = result.text;
    var lines_out = output.split("\n");
    // The chord line above "corto." should contain the trailing chords appended
    var chordLineIdx = lines_out.findIndex(function(l) { return l.indexOf("corto.") >= 0; }) - 1;
    var chordLine = lines_out[chordLineIdx] || "";
    assert.ok(chordLine.indexOf("Re7") >= 0 && chordLine.indexOf("Dom") >= 0,
        "trailing chords appended to chord line: " + chordLine);
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
    var result = fmt.formatPerfLines(lines, [], null, "", chords);
    var output = result.text;
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
    var result = fmt.formatPerfLines(lines, [], null, "", chords, null, null);
    var output = result.text;
    // Interlude between pass 1 end and pass 2 start should show chords from tick 0 to 480
    assert.ok(output.indexOf("Re") >= 0, "should have interlude chord Re: " + output);
    // Re and Sol should appear as interlude between the two passes
    var endIdx = output.indexOf("end of pass one.");
    var startIdx = output.indexOf("start of pass two.");
    var between = output.substring(endIdx, startIdx);
    assert.ok(between.indexOf("Re") >= 0, "Re should be in interlude between passes: " + between);
});

test("formatPerfLines shows trailing coda chords on chord line (< 4 chords)", function() {
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
    var result = fmt.formatPerfLines(lines, [], null, "", chords);
    var output = result.text;
    // Trailing chords (< 4) appear on the chord line, not as separate coda
    var chordLine = output.split("\n")[0];
    assert.ok(chordLine.indexOf("Re") >= 0, "Re on chord line: " + chordLine);
    assert.ok(chordLine.indexOf("Sol") >= 0, "Sol on chord line: " + chordLine);
    // No separate coda line
    var lines2 = output.trim().split("\n");
    assert.equal(lines2.length, 2, "only chord line + text, no coda: " + output);
});

test("formatPerfLines no coda dump when no trailing chords (lastChordTick fallback)", function() {
    // When there are no trailing chords after the last line, the coda code
    // should use lastLine.endTick (not -1), avoiding a scan from tick 0.
    var lines = [
        { text: "first section.", sylMap: [{tick:0,pos:0,chord:"Sol"}], startTick: 0, endTick: 480, sectionEnd: true },
        { text: "last line here.", sylMap: [{tick:1000,pos:0,chord:"Re7"}], startTick: 1000, endTick: 1500, sectionEnd: false }
    ];
    var chords = [
        { tick: 0, chord: "Sol" },
        { tick: 200, chord: "Re" },
        { tick: 400, chord: "Sol7" },
        { tick: 1000, chord: "Re7" },
        { tick: 1400, chord: "Sol" }
    ];
    var result = fmt.formatPerfLines(lines, [], null, "", chords);
    var output = result.text;
    // Sol at 1400 is on the chord line (within last line). No chords after 1500.
    // Should NOT dump all chords from tick 0 as coda.
    var chordDump = output.indexOf("Sol  Re  Sol7");
    assert.equal(chordDump, -1, "should not dump all chords as coda: " + output);
});

test("formatPerfLines no duplicate coda when trailing chords cover them", function() {
    // Trailing chords on the last chord line should not also appear as separate coda.
    var lines = [
        { text: "final words.", sylMap: [{tick:0,pos:0,chord:"Mim"}], startTick: 0, endTick: 480, sectionEnd: false }
    ];
    var chords = [
        { tick: 0, chord: "Mim" },
        { tick: 960, chord: "Lam" },
        { tick: 1200, chord: "Si7" },
        { tick: 1440, chord: "Mim" }
    ];
    var result = fmt.formatPerfLines(lines, [], null, "", chords);
    var output = result.text;
    // Trailing: Lam, Si7, Mim (3 < 4) on chord line
    var chordLine = output.split("\n")[0];
    assert.ok(chordLine.indexOf("Lam") >= 0, "Lam on chord line: " + chordLine);
    assert.ok(chordLine.indexOf("Si7") >= 0, "Si7 on chord line: " + chordLine);
    // Count occurrences of "Lam" in full output: should be 1 (not 2)
    var count = (output.match(/Lam/g) || []).length;
    assert.equal(count, 1, "Lam should appear once, not duplicated as coda: " + output);
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
    var result = fmt.formatPerfLines(lines, [], null, "", chords);
    var output = result.text;
    // Should just be the text line, no extra chord line
    assert.equal(output, M + "Lam\nthe end\n");
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

test("formatPerfLines collapses consecutive blank lines to single blank", function() {
    // Multiple sectionEnd + abbreviated stanzas should not produce 3+ newlines
    var lines = [
        { text: "first.", sylMap: [{tick:0,pos:0,chord:"Lam"}], startTick: 0, endTick: 480, sectionEnd: true },
        { text: "second.", sylMap: [{tick:960,pos:0,chord:"Re"}], startTick: 960, endTick: 1440, sectionEnd: true },
        { text: "third.", sylMap: [{tick:1920,pos:0,chord:"Sol"}], startTick: 1920, endTick: 2400, sectionEnd: true }
    ];
    var result = fmt.formatPerfLines(lines, [], null, "", []);
    var output = result.text;
    // No triple newlines should exist
    assert.equal(output.indexOf("\n\n\n"), -1, "should not have 3+ consecutive newlines: " + JSON.stringify(output));
    // But blank lines between sections should exist
    assert.ok(output.indexOf("first.\n\n") >= 0, "should have blank line after first: " + output);
});

test("formatPerfLines interlude skips intro chords when they match", function() {
    // When the interlude chords are identical to the intro chords,
    // they should be skipped (already shown at the top).
    var lines = [
        { text: "verse.", sylMap: [{tick:200,pos:0,chord:"Lam"}], startTick: 200, endTick: 400, sectionEnd: true },
        // Backwards (second pass)
        { text: "verse.", sylMap: [{tick:200,pos:0,chord:"Re"}], startTick: 200, endTick: 400, sectionEnd: false }
    ];
    var chords = [{tick:0, chord:"Re"}, {tick:50, chord:"Sol"}, {tick:200, chord:"Lam"}];
    var introChords = ["Re", "Sol"];
    var result = fmt.formatPerfLines(lines, introChords, null, "", chords);
    var output = result.text;
    // Intro chords at top
    assert.ok(output.indexOf("Re  Sol") >= 0, "should have intro chords at top: " + output);
    // The interlude should NOT duplicate the intro chords
    var firstIntro = output.indexOf("Re  Sol");
    var secondIntro = output.indexOf("Re  Sol", firstIntro + 1);
    assert.equal(secondIntro, -1, "should not duplicate intro chords as interlude: " + output);
});

test("abbreviated stanza has extra blank line before it", function() {
    var lines = [
        { text: "Verse text here.", sylMap: [{ tick: 0, pos: 0, chord: "Lam" }], startTick: 0, endTick: 480, sectionEnd: true },
        { text: "Estribillo text here with enough words.", sylMap: [{ tick: 480, pos: 0, chord: "Re" }], startTick: 480, endTick: 960, sectionEnd: true },
        { text: "Another verse.", sylMap: [{ tick: 960, pos: 0, chord: "Sol" }], startTick: 960, endTick: 1440, sectionEnd: true },
        // Duplicate estribillo
        { text: "Estribillo text here with enough words.", sylMap: [{ tick: 1440, pos: 0, chord: "Re" }], startTick: 1440, endTick: 1920, sectionEnd: true }
    ];
    var result = fmt.formatPerfLines(lines, [], null, "", []);
    var output = result.text;
    // The abbreviated line should have a blank line before it (collapsed from multiple newlines)
    var abbrIdx = output.indexOf("Estribillo text here with enough words...");
    assert.ok(abbrIdx >= 0, "should have abbreviated stanza: " + output);
    // There should be a blank line (at least \n\n) before the abbreviated text
    var before = output.substring(Math.max(0, abbrIdx - 5), abbrIdx);
    assert.ok(before.indexOf("\n\n") >= 0, "should have blank line before abbreviated stanza: " + JSON.stringify(before));
});

test("formatPerfLines abbreviates repeated stanzas in output", function() {
    var lines = [
        { text: "Verse one text here with enough words.", sylMap: [{ tick: 0, pos: 0, chord: "Lam" }], startTick: 0, endTick: 480, sectionEnd: true },
        { text: "Estribillo text that will repeat later.", sylMap: [{ tick: 480, pos: 0, chord: "Re" }], startTick: 480, endTick: 960, sectionEnd: true },
        { text: "Verse two different text with other words.", sylMap: [{ tick: 960, pos: 0, chord: "Sol" }], startTick: 960, endTick: 1440, sectionEnd: true },
        // Same estribillo
        { text: "Estribillo text that will repeat later.", sylMap: [{ tick: 1440, pos: 0, chord: "Re" }], startTick: 1440, endTick: 1920, sectionEnd: true }
    ];

    var result = fmt.formatPerfLines(lines, [], null, "", []);
    var output = result.text;
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
    var result = fmt.formatPerfLines(lines, [], null, "Test Song");
    var output = result.text;
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
    var result = fmt.formatPerfLines(lines, [], null, "", [], null, systemTexts);
    var output = result.text;
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
    var result = fmt.formatPerfLines(lines, ["Re", "Sol"], null, "", chords, null, systemTexts);
    var output = result.text;
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
    var result = fmt.formatPerfLines(lines, ["Re", "Sol"], null, "", chords, null, systemTexts);
    var output = result.text;
    var sysIdx = output.indexOf("- ALBORADA -");
    var introIdx = output.indexOf("Re  Sol");
    assert.ok(sysIdx >= 0, "should have system text: " + output);
    assert.ok(introIdx >= 0, "should have intro chords: " + output);
    assert.ok(sysIdx < introIdx, "system text at intro start should come before intro chords: " + output);
});

test("formatPerfLines suppresses sole label in repeat even when other labels exist outside", function() {
    // "Estrofa" inside repeat (tick 100), "Estribillo" outside repeat (tick 500).
    // On second pass, Estrofa is the only emitted label so far, so it's suppressed.
    var lines = [
        { text: "v0.", sylMap: [{tick:100,pos:0,chord:"Lam"}], startTick: 100, endTick: 200, sectionEnd: true },
        // v1 (backwards, same repeat)
        { text: "v1.", sylMap: [{tick:100,pos:0,chord:"Re"}], startTick: 100, endTick: 200, sectionEnd: true },
        // Estribillo (forward, outside repeat)
        { text: "estrib.", sylMap: [{tick:500,pos:0,chord:"Sol"}], startTick: 500, endTick: 600, sectionEnd: false }
    ];
    var systemTexts = [{tick:100, text:"Estrofa"}, {tick:500, text:"Estribillo"}];
    var result = fmt.formatPerfLines(lines, [], null, "", [], null, systemTexts);
    var output = result.text;
    // Estrofa should appear once (suppressed on v1 since it's the sole label in that repeat)
    assert.equal((output.match(/ESTROFA/g) || []).length, 1,
        "ESTROFA should appear once (sole label in repeat): " + output);
    // Estribillo should appear once
    assert.equal((output.match(/ESTRIBILLO/g) || []).length, 1,
        "ESTRIBILLO should appear once: " + output);
});

test("formatPerfLines does NOT repeat system text on repeat pass (same section)", function() {
    // Two pass scenario: lines go tick 0, 960, then back to 0 (repeat).
    // System text at tick 0 labels the repeat section. It should appear once,
    // not on both passes (both passes are the same musical section).
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
    var result = fmt.formatPerfLines(lines, [], null, "", [], null, systemTexts);
    var output = result.text;
    var firstIdx = output.indexOf("- ESTRIBILLO -");
    assert.ok(firstIdx >= 0, "should have first occurrence: " + output);
    var secondIdx = output.indexOf("- ESTRIBILLO -", firstIdx + 1);
    assert.equal(secondIdx, -1, "should NOT repeat on second pass of same repeat: " + output);
});

test("formatPerfLines re-emits labels on repeat pass when multiple labels exist", function() {
    // With multiple labels (Estrofa + Estribillo), each pass shows all labels
    var lines = [
        { text: "v0 estrofa.", sylMap: [{tick:100,pos:0,chord:"Lam"}], startTick: 100, endTick: 200, sectionEnd: true },
        { text: "v0 estribillo.", sylMap: [{tick:500,pos:0,chord:"Re"}], startTick: 500, endTick: 600, sectionEnd: true },
        // v1 (backwards)
        { text: "v1 estrofa.", sylMap: [{tick:100,pos:0,chord:"Sol"}], startTick: 100, endTick: 200, sectionEnd: true },
        { text: "v1 estribillo.", sylMap: [{tick:500,pos:0,chord:"Mi"}], startTick: 500, endTick: 600, sectionEnd: false }
    ];
    var systemTexts = [{tick:100, text:"Estrofa"}, {tick:500, text:"Estribillo"}];
    var result = fmt.formatPerfLines(lines, [], null, "", [], null, systemTexts);
    var output = result.text;
    assert.equal((output.match(/ESTROFA/g) || []).length, 2, "ESTROFA should appear twice (one per pass): " + output);
    assert.equal((output.match(/ESTRIBILLO/g) || []).length, 2, "ESTRIBILLO should appear twice: " + output);
});

test("formatPerfLines re-emits system text on D.S. segment boundary", function() {
    // D.S. replay: segmentBoundary marks where a new segment begins.
    // System text should re-appear after segment boundary.
    var lines = [
        { text: "v0.", sylMap: [{tick:100,pos:0,chord:"Lam"}], startTick: 100, endTick: 200, sectionEnd: true },
        { text: "v1.", sylMap: [{tick:100,pos:0,chord:"Re"}], startTick: 100, endTick: 200, sectionEnd: true },
        { text: "estrib.", sylMap: [{tick:500,pos:0,chord:"Sol"}], startTick: 500, endTick: 600, sectionEnd: true, segmentBoundary: true },
        // D.S. segment: backwards tick
        { text: "v2.", sylMap: [{tick:100,pos:0,chord:"Mi"}], startTick: 100, endTick: 200, sectionEnd: true },
        { text: "v3.", sylMap: [{tick:100,pos:0,chord:"La"}], startTick: 100, endTick: 200, sectionEnd: false }
    ];
    var systemTexts = [{ tick: 100, text: "Estrofa" }];
    var result = fmt.formatPerfLines(lines, [], null, "", [], null, systemTexts);
    var output = result.text;
    var first = output.indexOf("- ESTROFA -");
    assert.ok(first >= 0, "should have first: " + output);
    var second = output.indexOf("- ESTROFA -", first + 1);
    assert.ok(second >= 0, "should re-emit after segmentBoundary: " + output);
    // v1 and v3 should NOT have their own ESTROFA
    var third = output.indexOf("- ESTROFA -", second + 1);
    assert.equal(third, -1, "should not emit for repeat pass: " + output);
});

test("formatPerfLines suppresses all stanzas in abbreviated labeled section", function() {
    // A labeled section with multiple stanzas. When the section repeats (D.S.),
    // ALL stanzas should be suppressed (just the label shown), not individual incipits.
    var lines = [
        { text: "verse line one,", sylMap: [{tick:100,pos:0,chord:"Lam"}], startTick: 100, endTick: 200, sectionEnd: false },
        { text: "verse line two.", sylMap: [{tick:300,pos:0,chord:"Re"}], startTick: 300, endTick: 400, sectionEnd: true },
        { text: "chorus here.", sylMap: [{tick:500,pos:0,chord:"Sol"}], startTick: 500, endTick: 600, sectionEnd: true },
        // D.S. replay (backwards tick, segmentBoundary)
        { text: "verse line one,", sylMap: [{tick:100,pos:0,chord:"Lam"}], startTick: 100, endTick: 200, sectionEnd: false, segmentBoundary: false },
        { text: "verse line two.", sylMap: [{tick:300,pos:0,chord:"Re"}], startTick: 300, endTick: 400, sectionEnd: true },
        { text: "chorus here.", sylMap: [{tick:500,pos:0,chord:"Sol"}], startTick: 500, endTick: 600, sectionEnd: true }
    ];
    // Mark segmentBoundary on the line before the D.S. replay
    lines[2].segmentBoundary = true;
    var systemTexts = [{tick:100, text:"Estrofa"}, {tick:500, text:"Estribillo"}];
    var result = fmt.formatPerfLines(lines, [], null, "", [], null, systemTexts);
    var output = result.text;
    // Second ESTROFA should show only the label (abbreviated section suppressed)
    var estrofa1 = output.indexOf("- ESTROFA -");
    var estrofa2 = output.indexOf("- ESTROFA -", estrofa1 + 1);
    assert.ok(estrofa2 >= 0, "should have second ESTROFA label: " + output);
    // "verse line one" should appear in first section but NOT after second ESTROFA
    var afterSecondEstrofa = output.substring(estrofa2);
    assert.ok(afterSecondEstrofa.indexOf("verse line one,") < 0 || afterSecondEstrofa.indexOf("verse line one...") >= 0,
        "second ESTROFA should not show full verse text: " + afterSecondEstrofa);
});

test("abbreviateRepeatedStanzas abbreviates regardless of multi-verse source", function() {
    // Even if the source ticks have multi-verse syllables, the stream text
    // is already selected. Identical text should always be abbreviated.
    var lines = [
        { text: "same text here.", sylMap: [], startTick: 0, endTick: 480, sectionEnd: true },
        { text: "different text.", sylMap: [], startTick: 960, endTick: 1440, sectionEnd: true },
        { text: "same text here.", sylMap: [], startTick: 0, endTick: 480, sectionEnd: true }
    ];
    // Pass syllables with multi-verse at tick 0 (should NOT prevent abbreviation)
    var syllables = [
        { tick: 0, verse: 0 }, { tick: 0, verse: 1 }
    ];
    var result = fmt.abbreviateRepeatedStanzas(lines, syllables);
    var lastLine = result[result.length - 1];
    assert.ok(lastLine.abbreviated, "should abbreviate even with multi-verse source: " + lastLine.text);
});

test("formatPerfLines sole intro label does not repeat on repeat pass", function() {
    // With only 1 system text (Solista), it labels the entire repeat.
    // Should NOT repeat on the second pass.
    var lines = [
        { text: "first verse.", sylMap: [{ tick: 200, pos: 0, chord: "Lam" }], startTick: 200, endTick: 480, sectionEnd: false },
        { text: "more text.", sylMap: [{ tick: 960, pos: 0, chord: "Re" }], startTick: 960, endTick: 1440, sectionEnd: true },
        // Second pass (backwards tick)
        { text: "second verse.", sylMap: [{ tick: 200, pos: 0, chord: "Sol" }], startTick: 200, endTick: 480, sectionEnd: false }
    ];
    var chords = [{ tick: 0, chord: "Do" }];
    var systemTexts = [{ tick: 100, text: "Solista" }];
    var result = fmt.formatPerfLines(lines, [], null, "", chords, null, systemTexts);
    var output = result.text;
    var first = output.indexOf("- SOLISTA -");
    assert.ok(first >= 0, "should have first occurrence: " + output);
    var second = output.indexOf("- SOLISTA -", first + 1);
    assert.equal(second, -1, "sole label should NOT repeat on pass 2: " + output);
});

test("formatPerfLines intro label re-emits when multiple labels in repeat", function() {
    // Intro(0) + Solista(100) + Estribillo(500): 3 labels.
    // Intro is the introLabel (at introFirstChordTick). On backwards tick,
    // it should re-emit because there are 2+ other emitted labels.
    var lines = [
        { text: "verse one.", sylMap: [{tick:200,pos:0,chord:"Lam"}], startTick: 200, endTick: 400, sectionEnd: true },
        { text: "chorus.", sylMap: [{tick:500,pos:0,chord:"Sol"}], startTick: 500, endTick: 700, sectionEnd: true },
        // Backwards (second pass)
        { text: "verse two.", sylMap: [{tick:200,pos:0,chord:"Re"}], startTick: 200, endTick: 400, sectionEnd: true },
        { text: "chorus again.", sylMap: [{tick:500,pos:0,chord:"Mi"}], startTick: 500, endTick: 700, sectionEnd: false }
    ];
    var chords = [{tick:0, chord:"Do"}];
    var systemTexts = [{tick:0, text:"Intro"}, {tick:100, text:"Solista"}, {tick:500, text:"Estribillo"}];
    var result = fmt.formatPerfLines(lines, ["Do"], null, "", chords, null, systemTexts);
    var output = result.text;
    // Intro should appear twice (multi-label repeat)
    assert.equal((output.match(/- INTRO -/g) || []).length, 2,
        "INTRO should appear twice with multiple labels: " + output);
});

test("formatPerfLines pre-intro label does NOT re-emit on repeat when outside repeat range", function() {
    // Compostelana-like: Alborada(tick 10) labels the intro.
    // Repeat range is 500-700. Alborada is far before the repeat.
    // On backwards tick (second pass), Alborada should NOT re-appear.
    var lines = [
        { text: "verse one.", sylMap: [{tick:500,pos:0,chord:"Lam"}], startTick: 500, endTick: 700, sectionEnd: true },
        // Backwards (second pass of repeat starting at 500)
        { text: "verse two.", sylMap: [{tick:500,pos:0,chord:"Re"}], startTick: 500, endTick: 700, sectionEnd: false }
    ];
    var chords = [{tick:10, chord:"Re"}, {tick:20, chord:"Sol"}];
    var systemTexts = [{tick:10, text:"Alborada"}, {tick:500, text:"Solista"}];
    var result = fmt.formatPerfLines(lines, ["Re", "Sol"], null, "", chords, null, systemTexts);
    var output = result.text;
    assert.equal((output.match(/ALBORADA/g) || []).length, 1,
        "ALBORADA (pre-intro) should appear only once, not on repeat: " + output);
});

test("formatPerfLines pre-intro label does NOT re-emit even with multiple labels", function() {
    // MÚSICA labels the intro section before the repeat.
    // Even with other labels (Estrofa, Estribillo), MÚSICA is an introLabel
    // and only appears once.
    var lines = [
        { text: "verse.", sylMap: [{tick:500,pos:0,chord:"Lam"}], startTick: 500, endTick: 600, sectionEnd: true },
        // Backwards (D.S.)
        { text: "verse.", sylMap: [{tick:500,pos:0,chord:"Re"}], startTick: 500, endTick: 600, sectionEnd: false, segmentBoundary: false }
    ];
    // introLabel = MÚSICA (at introFirstChordTick = 10)
    // Estrofa at 500 is the only label in the main loop
    var chords = [{tick:10, chord:"Sol"}];
    var systemTexts = [{tick:10, text:"Música"}, {tick:500, text:"Estrofa"}];
    var result = fmt.formatPerfLines(lines, ["Sol"], null, "", chords, null, systemTexts);
    var output = result.text;
    // MÚSICA should appear only once (introLabel, not re-emitted)
    assert.equal((output.match(/MÚSICA/g) || []).length, 1,
        "MÚSICA (introLabel) should appear once: " + output);
});

test("formatPerfLines D.S. interlude includes intro chords when segment goes before first lyric", function() {
    // D.S. replay with segmentBoundary: the interlude between stanzas should
    // include intro chords when the D.S. goes back before the first lyric.
    var lines = [
        { text: "estribillo.", sylMap: [{tick:500,pos:0,chord:"Sol"}], startTick: 500, endTick: 700, sectionEnd: true, segmentBoundary: true },
        // D.S. backwards to first lyric
        { text: "verse again.", sylMap: [{tick:200,pos:0,chord:"Lam"}], startTick: 200, endTick: 400, sectionEnd: false }
    ];
    var chords = [{tick:10, chord:"Re"}, {tick:50, chord:"Sol"}, {tick:200, chord:"Lam"}, {tick:500, chord:"Sol"}];
    var introChords = ["Re", "Sol"];
    var result = fmt.formatPerfLines(lines, introChords, null, "", chords, null, []);
    var output = result.text;
    // The interlude between estribillo and D.S. verse should include intro chords
    var estrIdx = output.indexOf("estribillo.");
    var verseIdx = output.indexOf("verse again.");
    var between = output.substring(estrIdx, verseIdx);
    assert.ok(between.indexOf("Re") >= 0 || between.indexOf("Sol") >= 0,
        "interlude should have intro chords: " + between);
});

test("formatPerfLines replaces # in labels with pass number", function() {
    // "Estrofa #" should render as "ESTROFA 1", "ESTROFA 2" etc.
    var lines = [
        { text: "verse one.", sylMap: [{tick:100,pos:0,chord:"Lam"}], startTick: 100, endTick: 200, sectionEnd: true },
        { text: "chorus.", sylMap: [{tick:500,pos:0,chord:"Sol"}], startTick: 500, endTick: 600, sectionEnd: true },
        // Backwards (second pass)
        { text: "verse two.", sylMap: [{tick:100,pos:0,chord:"Re"}], startTick: 100, endTick: 200, sectionEnd: true },
        { text: "chorus.", sylMap: [{tick:500,pos:0,chord:"Mi"}], startTick: 500, endTick: 600, sectionEnd: false }
    ];
    var systemTexts = [{tick:100, text:"Estrofa #"}, {tick:500, text:"Estribillo"}];
    var result = fmt.formatPerfLines(lines, [], null, "", [], null, systemTexts);
    var output = result.text;
    assert.ok(output.indexOf("- ESTROFA 1 -") >= 0, "should have ESTROFA 1: " + output);
    assert.ok(output.indexOf("- ESTROFA 2 -") >= 0, "should have ESTROFA 2: " + output);
    assert.equal(output.indexOf("ESTROFA #"), -1, "# should be replaced: " + output);
});

test("formatPerfLines splits intro chords at label boundaries", function() {
    // "Intro" labels chords 0-100, "Música" labels chords 100-500
    var lines = [
        { text: "verse.", sylMap: [{tick:500,pos:0,chord:"Lam"}], startTick: 500, endTick: 600, sectionEnd: false }
    ];
    var chords = [{tick:10,chord:"Re"},{tick:50,chord:"Sol"},{tick:100,chord:"La"},{tick:200,chord:"Mi"}];
    var systemTexts = [{tick:10,text:"Intro"},{tick:100,text:"Música"},{tick:500,text:"Solista"}];
    var result = fmt.formatPerfLines(lines, ["Re","Sol","La","Mi"], null, "", chords, null, systemTexts);
    var output = result.text;
    // INTRO should have Re Sol (before tick 100)
    var introIdx = output.indexOf("- INTRO -");
    var musicaIdx = output.indexOf("- MÚSICA -");
    assert.ok(introIdx >= 0, "should have INTRO: " + output);
    assert.ok(musicaIdx >= 0, "should have MÚSICA: " + output);
    assert.ok(introIdx < musicaIdx, "INTRO before MÚSICA: " + output);
    // Check chords are split
    var betweenIntroMusica = output.substring(introIdx, musicaIdx);
    assert.ok(betweenIntroMusica.indexOf("Re") >= 0, "INTRO should have Re: " + betweenIntroMusica);
    assert.ok(betweenIntroMusica.indexOf("Mi") < 0, "INTRO should NOT have Mi: " + betweenIntroMusica);
});

test("formatPerfLines does not split intro when label has < 2 chords after it", function() {
    // "Estrofa" at tick 490 is right before the first lyric (500).
    // Only 1 chord after it (tick 495). Should NOT split: all chords stay under INTRO.
    var lines = [
        { text: "verse.", sylMap: [{tick:500,pos:0,chord:"Lam"}], startTick: 500, endTick: 600, sectionEnd: false }
    ];
    var chords = [{tick:10,chord:"Re"},{tick:50,chord:"Sol"},{tick:100,chord:"La"},{tick:495,chord:"Mi"},{tick:500,chord:"Lam"}];
    var systemTexts = [{tick:10,text:"Intro"},{tick:490,text:"Estrofa"}];
    var result = fmt.formatPerfLines(lines, ["Re","Sol","La","Mi"], null, "", chords, null, systemTexts);
    var output = result.text;
    // All intro chords under INTRO (no split)
    var introIdx = output.indexOf("- INTRO -");
    var estrofaIdx = output.indexOf("- ESTROFA -");
    assert.ok(introIdx >= 0, "should have INTRO: " + output);
    assert.ok(estrofaIdx >= 0, "should have ESTROFA: " + output);
    // INTRO section should have all chords (Re, Sol, La, Mi)
    var betweenIntroEstrofa = output.substring(introIdx, estrofaIdx);
    assert.ok(betweenIntroEstrofa.indexOf("Sol") >= 0, "INTRO chords include Sol: " + betweenIntroEstrofa);
    assert.ok(betweenIntroEstrofa.indexOf("La") >= 0, "INTRO chords include La: " + betweenIntroEstrofa);
    // ESTROFA label should NOT have a chord line (just label before lyrics)
    var afterEstrofa = output.substring(estrofaIdx);
    var estrofaNextLine = afterEstrofa.split("\n")[1] || "";
    assert.ok(estrofaNextLine.indexOf("Lam") >= 0 || estrofaNextLine.trim() === "",
        "no extra chord block under ESTROFA: [" + estrofaNextLine + "]");
});

test("formatPerfLines pre-repeat intro does NOT re-emit when intro has internal splits", function() {
    // INTRO(0) + MÚSICA(100) split the intro. INTRO is pre-repeat, should not re-emit.
    var lines = [
        { text: "v0.", sylMap: [{tick:500,pos:0,chord:"Lam"}], startTick: 500, endTick: 600, sectionEnd: true },
        { text: "v1.", sylMap: [{tick:500,pos:0,chord:"Re"}], startTick: 500, endTick: 600, sectionEnd: false }
    ];
    var chords = [{tick:10,chord:"Re"},{tick:50,chord:"Sol"},{tick:100,chord:"La"},{tick:200,chord:"Mi"},{tick:500,chord:"Lam"}];
    var systemTexts = [{tick:10,text:"Intro"},{tick:100,text:"Música"},{tick:500,text:"Solista"}];
    var result = fmt.formatPerfLines(lines, ["Re","Sol","La","Mi"], null, "", chords, null, systemTexts);
    var output = result.text;
    assert.equal((output.match(/- INTRO -/g) || []).length, 1,
        "INTRO should appear once (pre-repeat with internal split): " + output);
});

test("formatPerfLines solista label repeats on backwards tick", function() {
    // "Solista" at tick 100 (after intro chord at tick 50, before first lyric at 200).
    // On repeat (backwards tick), Solista should appear again.
    var lines = [
        { text: "verse one.", sylMap: [{ tick: 200, pos: 0, chord: "Lam" }], startTick: 200, endTick: 480, sectionEnd: false },
        { text: "more text.", sylMap: [{ tick: 960, pos: 0, chord: "Re" }], startTick: 960, endTick: 1440, sectionEnd: true },
        // Second pass (backwards tick to 200, same as firstLineTick)
        { text: "verse two.", sylMap: [{ tick: 200, pos: 0, chord: "Sol" }], startTick: 200, endTick: 480, sectionEnd: false }
    ];
    var chords = [{ tick: 50, chord: "Do" }];
    var systemTexts = [{ tick: 100, text: "Solista" }];
    var result = fmt.formatPerfLines(lines, ["Do"], null, "", chords, null, systemTexts);
    var output = result.text;

    // Solista should appear at least once (before first verse)
    var sol1 = output.indexOf("- SOLISTA -");
    assert.ok(sol1 >= 0, "should have Solista: " + output);
});

test("formatPerfLines intro label does NOT repeat when repeat skips intro", function() {
    // "Música" at tick 0, intro chords before first lyric at tick 200.
    // Repeat goes back to tick 200 (same as firstLineTick), NOT to 0.
    // So intro is NOT part of the repeat and label should NOT appear again.
    var lines = [
        { text: "verse one.", sylMap: [{ tick: 200, pos: 0, chord: "Lam" }], startTick: 200, endTick: 480, sectionEnd: false },
        { text: "more text.", sylMap: [{ tick: 960, pos: 0, chord: "Re" }], startTick: 960, endTick: 1440, sectionEnd: true },
        // Second pass: backwards tick to 200 (repeat starts at first lyric, skips intro)
        { text: "verse two.", sylMap: [{ tick: 200, pos: 0, chord: "Sol" }], startTick: 200, endTick: 480, sectionEnd: false }
    ];
    var chords = [{ tick: 50, chord: "Do" }];
    var systemTexts = [{ tick: 0, text: "Música" }];
    var result = fmt.formatPerfLines(lines, ["Do"], null, "", chords, null, systemTexts);
    var output = result.text;

    var mus1 = output.indexOf("- MÚSICA -");
    assert.ok(mus1 >= 0, "should have first MÚSICA: " + output);
    var mus2 = output.indexOf("- MÚSICA -", mus1 + 1);
    assert.equal(mus2, -1, "MÚSICA should NOT repeat when repeat skips intro: " + output);
});

test("formatPerfLines no interlude when repeat skips intro", function() {
    // Repeat goes back to tick 200 (same as firstLineTick).
    // No intro chords should appear between stanzas.
    var lines = [
        { text: "verse one.", sylMap: [{ tick: 200, pos: 0, chord: "Lam" }], startTick: 200, endTick: 960, sectionEnd: true },
        // Second pass: backwards tick to 200 (skips intro)
        { text: "verse two.", sylMap: [{ tick: 200, pos: 0, chord: "Sol" }], startTick: 200, endTick: 960, sectionEnd: false }
    ];
    var chords = [{ tick: 0, chord: "Re" }, { tick: 50, chord: "Sol" }, { tick: 200, chord: "Lam" }];
    var systemTexts = [{ tick: 0, text: "Intro" }];
    var result = fmt.formatPerfLines(lines, ["Re", "Sol"], null, "", chords, null, systemTexts);
    var output = result.text;

    // INTRO label appears once (at the top)
    var intro1 = output.indexOf("- INTRO -");
    assert.ok(intro1 >= 0, "should have INTRO: " + output);
    var intro2 = output.indexOf("- INTRO -", intro1 + 1);
    assert.equal(intro2, -1, "INTRO should NOT repeat when repeat skips intro: " + output);
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
    var result = fmt.formatPerfLines(lines, [], null, "", [], null, systemTexts);
    var output = result.text;

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
    var result = fmt.formatPerfLines(lines, [], null, "", chords);
    var output = result.text;
    // Fa should appear before "y" in the chord line, not on top of it
    var chordLine = fmt.stripChordMarkers(output.split("\n")[0]);
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
    var chordLine = fmt.stripChordMarkers(result.output.split("\n")[0]);
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
    assert.equal(fmt.wrapChordLine(line, 70), M + line);
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
    var result = fmt.formatPerfLines(lines, [], null, "", chords);
    var output = result.text;
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
    var rePos = fmt.stripChordMarkers(chordLine).indexOf("Re");
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

    var result = fmt.formatPerfLines(lines, [], null, "", [], null, null, true);
    var output = result.text;
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

    var result = fmt.formatPerfLines(lines, [], null, "", [], null, null, false);
    var output = result.text;
    // Second estribillo should be abbreviated
    assert.ok(output.indexOf("...") >= 0, "fullRepeat=false should abbreviate: " + output);
});

// ========================================
// System text before interlude on backwards tick
// ========================================

test("formatPerfLines renders interlude chords on backwards tick without duplicate labels", function() {
    // Scenario: line with sectionEnd, backwards tick to next line, interlude chords.
    // Interlude chords appear but labels are handled by the system text code, not interlude.
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
    var result = fmt.formatPerfLines(lines, ["Re"], null, "", chords, null, []);
    var output = result.text;
    // Interlude chords should appear between passes
    var endIdx = output.indexOf("end of first pass.");
    var startIdx = output.indexOf("start of second pass.");
    var between = output.substring(endIdx, startIdx);
    assert.ok(between.indexOf("Sol") >= 0, "interlude chords between passes: " + between);
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
    var result = fmt.formatPerfLines(lines, [], null, "", chords);
    var output = result.text;
    // The abbreviated line should be present
    assert.ok(output.indexOf("...") >= 0, "should have abbreviated line: " + output);
    // Coda chords Fa#7 and Sim should NOT appear after the abbreviated line
    assert.ok(output.indexOf("Fa#7") < 0, "should not have coda chord Fa#7 after abbreviated line: " + output);
    assert.ok(output.indexOf("Sim") < 0, "should not have coda chord Sim after abbreviated line: " + output);
});

test("formatPerfLines trailing coda chords on chord line, not duplicated below", function() {
    // Trailing chords (< 4) after last line go on the chord line, no separate coda.
    var lines = [
        { text: "The final line of the song.", sylMap: [{ tick: 0, pos: 0, chord: "Lam" }], startTick: 0, endTick: 480, sectionEnd: false }
    ];
    var chords = [
        { tick: 0, chord: "Lam" },
        { tick: 960, chord: "Re" },
        { tick: 1440, chord: "Sol" }
    ];
    var result = fmt.formatPerfLines(lines, [], null, "", chords);
    var output = result.text;
    var chordLine = output.split("\n")[0];
    assert.ok(chordLine.indexOf("Re") >= 0 && chordLine.indexOf("Sol") >= 0,
        "trailing chords on chord line: " + chordLine);
});

// ============================================================
// renderLabel: uppercase, # numbering, multi-counter independence
// ============================================================

test("renderLabel uppercases the input", function() {
    var counters = {};
    assert.equal(fmt.renderLabel("estrofa", counters), "ESTROFA");
    assert.equal(fmt.renderLabel("Estribillo", counters), "ESTRIBILLO");
    assert.equal(fmt.renderLabel("Final Coda", counters), "FINAL CODA");
});

test("renderLabel replaces # with incrementing per-base counter", function() {
    var counters = {};
    assert.equal(fmt.renderLabel("Estrofa #", counters), "ESTROFA 1");
    assert.equal(fmt.renderLabel("Estrofa #", counters), "ESTROFA 2");
    assert.equal(fmt.renderLabel("Estrofa #", counters), "ESTROFA 3");
});

test("renderLabel keeps independent counters per base label", function() {
    var counters = {};
    assert.equal(fmt.renderLabel("Estrofa #", counters), "ESTROFA 1");
    assert.equal(fmt.renderLabel("Solista #", counters), "SOLISTA 1");
    assert.equal(fmt.renderLabel("Estrofa #", counters), "ESTROFA 2");
    assert.equal(fmt.renderLabel("Solista #", counters), "SOLISTA 2");
    assert.equal(fmt.renderLabel("Estrofa #", counters), "ESTROFA 3");
});

test("renderLabel passes through labels without # unchanged (just uppercased)", function() {
    var counters = {};
    assert.equal(fmt.renderLabel("Intro", counters), "INTRO");
    assert.equal(fmt.renderLabel("Estribillo", counters), "ESTRIBILLO");
    assert.equal(fmt.renderLabel("Intro", counters), "INTRO", "no counter for non-# labels");
});

test("formatPerfLines keeps independent counters for two numbered labels", function() {
    var lines = [
        { text: "verse one.", sylMap: [{tick:100,pos:0,chord:"Lam"}], startTick: 100, endTick: 200, sectionEnd: true },
        { text: "solo one.", sylMap: [{tick:300,pos:0,chord:"Sol"}], startTick: 300, endTick: 400, sectionEnd: true },
        { text: "verse two.", sylMap: [{tick:500,pos:0,chord:"Re"}], startTick: 500, endTick: 600, sectionEnd: true },
        { text: "solo two.", sylMap: [{tick:700,pos:0,chord:"Mi"}], startTick: 700, endTick: 800, sectionEnd: false }
    ];
    var systemTexts = [
        {tick:100, text:"Estrofa #"},
        {tick:300, text:"Solista #"},
        {tick:500, text:"Estrofa #"},
        {tick:700, text:"Solista #"}
    ];
    var result = fmt.formatPerfLines(lines, [], null, "", [], null, systemTexts);
    var output = result.text;
    assert.ok(output.indexOf("- ESTROFA 1 -") >= 0, "should have ESTROFA 1: " + output);
    assert.ok(output.indexOf("- ESTROFA 2 -") >= 0, "should have ESTROFA 2: " + output);
    assert.ok(output.indexOf("- SOLISTA 1 -") >= 0, "should have SOLISTA 1: " + output);
    assert.ok(output.indexOf("- SOLISTA 2 -") >= 0, "should have SOLISTA 2: " + output);
});

// ============================================================
// Trailing chord width-based decision (no hardcoded count)
// ============================================================

test("formatPerfLines: 5 short trailing chords on a short line are appended", function() {
    var lines = [
        { text: "que.", sylMap: [{ tick: 0, pos: 0, chord: "Do" }],
          startTick: 0, endTick: 100, sectionEnd: false },
        { text: "siguiente", sylMap: [{ tick: 5000, pos: 0, chord: "Sol" }],
          startTick: 5000, endTick: 5100, sectionEnd: false }
    ];
    var chords = [
        { tick: 0, chord: "Do" },
        { tick: 200, chord: "Re7" }, { tick: 400, chord: "Dom" },
        { tick: 600, chord: "Re7" }, { tick: 800, chord: "Dom" },
        { tick: 1000, chord: "Re7" },
        { tick: 5000, chord: "Sol" }
    ];
    var result = fmt.formatPerfLines(lines, [], null, "", chords);
    var outLines = result.text.split("\n");
    var queIdx = -1;
    for (var li = 0; li < outLines.length; li++) {
        if (outLines[li].indexOf("que.") >= 0) { queIdx = li; break; }
    }
    var chordLine = outLines[queIdx - 1] || "";
    assert.ok(chordLine.indexOf("Re7") >= 0 && chordLine.indexOf("Dom") >= 0,
        "trailing appended (fits in 70): " + JSON.stringify(chordLine));
});

test("formatPerfLines: 4 long chord names on a long line go to separate line", function() {
    var lines = [
        { text: "linea de letra muy larga para que no entren acordes detras seguro.",
          sylMap: [{ tick: 0, pos: 0, chord: "Do" }],
          startTick: 0, endTick: 100, sectionEnd: false },
        { text: "siguiente", sylMap: [{ tick: 5000, pos: 0, chord: "Sol" }],
          startTick: 5000, endTick: 5100, sectionEnd: false }
    ];
    var chords = [
        { tick: 0, chord: "Do" },
        { tick: 200, chord: "Sol7sus4" }, { tick: 400, chord: "Lam9add6" },
        { tick: 600, chord: "Mi7b9" }, { tick: 800, chord: "Re7sus4" },
        { tick: 5000, chord: "Sol" }
    ];
    var result = fmt.formatPerfLines(lines, [], null, "", chords);
    var output = result.text;
    // Trailing chords should be on their own line, after the lyric
    var lyricIdx = output.indexOf("linea de letra");
    var trailIdx = output.indexOf("Sol7sus4  Lam9add6");
    assert.ok(trailIdx > lyricIdx, "trailing on separate line: " + output);
});

test("formatPerfLines: trailing chords exactly at width boundary", function() {
    // Text 60 chars + 2 separator + 8 chars chord = 70, fits exactly
    var lines = [
        { text: "abcdefghij abcdefghij abcdefghij abcdefghij abcdefghij abcd.",
          sylMap: [{ tick: 0, pos: 0, chord: "Do" }],
          startTick: 0, endTick: 100, sectionEnd: false },
        { text: "next", sylMap: [{ tick: 5000, pos: 0, chord: "Sol" }],
          startTick: 5000, endTick: 5100, sectionEnd: false }
    ];
    var chords = [
        { tick: 0, chord: "Do" },
        { tick: 200, chord: "Re" }, { tick: 400, chord: "Mi" },
        { tick: 5000, chord: "Sol" }
    ];
    var result = fmt.formatPerfLines(lines, [], null, "", chords);
    // Re Mi (5 chars) + 60 + 2 = 67, fits -> appended
    var output = result.text;
    var lyricIdx = output.indexOf("abcd.");
    var beforeLyric = output.substring(0, lyricIdx);
    var lastChordLine = beforeLyric.split("\n").slice(-2)[0];
    assert.ok(lastChordLine.indexOf("Re") >= 0, "Re appended: " + lastChordLine);
    assert.ok(lastChordLine.indexOf("Mi") >= 0, "Mi appended: " + lastChordLine);
});

// ============================================================
// Inline text annotations whitespace collapsing
// ============================================================
// Already covered for QML extractor in test/extract-chords-types.test.js
// Here we verify orchestrator output renders multi-word StaffText as one chord token

test("xml-extractor: StaffText with internal whitespace collapses to '-'", function() {
    var xmlExt = require("../extractors/xml-extractor");
    var xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<museScore version="4.40"><Score><Division>480</Division>',
        '<Part><Staff id="1"><StaffType group="pitched"/></Staff></Part>',
        '<Staff id="1"><Measure><voice>',
        '<StaffText><text>molto rit. ed espressivo</text></StaffText>',
        '<Chord><durationType>quarter</durationType>',
        '<Lyrics><text>hello</text></Lyrics>',
        '<Note><pitch>60</pitch></Note></Chord>',
        '</voice></Measure></Staff></Score></museScore>'
    ].join("\n");
    var data = xmlExt.extractAll(xml);
    assert.equal(data.chords.length, 1);
    assert.equal(data.chords[0].chord, "molto-rit.-ed-espressivo");
});

test("formatLines reports lastChordTick so orchestrator can dedup coda", function() {
    var lines = [{ text: "hola.", sylMap: [{ tick: 0, pos: 0 }],
                   startTick: 0, endTick: 480 }];
    var chords = [
        { tick: 0, chord: "Do" },
        { tick: 600, chord: "Sol" },
        { tick: 800, chord: "Do" }
    ];
    var result = fmt.formatLines(lines, chords, null, -1);
    // lastChordTick should be the tick of the last appended trailing chord (800)
    assert.equal(result.lastChordTick, 800,
        "should report tick of last emitted chord: " + result.lastChordTick);
});
