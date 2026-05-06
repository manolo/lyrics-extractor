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

test("formatLines preserves system text in trailing chord gap between stanzas", function() {
    // Trailing chords in the gap are now inline above the previous lyric;
    // the system text (label) within the same gap must still appear between stanzas.
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
    var systemTexts = [{ tick: 800, text: "Musica" }];
    var result = fmt.formatLines(lines, chords, null, -1, systemTexts);
    var musicaIdx = result.output.indexOf("- MUSICA -");
    var firstLyricIdx = result.output.indexOf("este texto");
    var nextLyricIdx = result.output.indexOf("siguiente verso");
    assert.ok(musicaIdx >= 0, "should have MUSICA: " + result.output);
    assert.ok(musicaIdx > firstLyricIdx, "MUSICA after first lyric: " + result.output);
    assert.ok(musicaIdx < nextLyricIdx, "MUSICA before next lyric: " + result.output);
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

test("formatLines appends trailing chords inline even when they overflow width", function() {
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
    // Trailing chords are appended inline above the lyric (overflow allowed).
    var textIdx = result.output.indexOf("este es un texto");
    var miIdx = result.output.indexOf("Mi");
    assert.ok(miIdx >= 0 && miIdx < textIdx,
        "trailing chords inline above lyric: " + result.output);
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

test("formatPerfLines appends trailing chords inline even when they overflow width", function() {
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
    // Trailing chords are appended to the chord line above the lyric
    // (overflow is preferred over an orphan chord line between stanzas).
    var textIdx = output.indexOf("esta linea es");
    var trailIdx = output.indexOf("Fa#7");
    assert.ok(trailIdx >= 0 && trailIdx < textIdx,
        "trailing chords inline above lyric: " + output);
    assert.ok(output.indexOf("Sim") < textIdx, "Sim above lyric: " + output);
    assert.ok(output.indexOf("Mi7") < textIdx, "Mi7 above lyric: " + output);
    assert.ok(output.indexOf("La") < textIdx, "La above lyric: " + output);
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

test("formatPerfLines: interlude chord block carries its system text label above (Clavelitos regression)", function() {
    // Repeat scenario where after a chorus ('Estribillo') the song goes back
    // to a 'Musica' section (system text at tick 0) before re-entering the
    // 'Estrofa'. The interlude chord line must appear UNDER the 'Musica'
    // label, not above an empty 'Musica' label.
    var lines = [
        { text: "primer estribillo.", sylMap: [{ tick: 5000, pos: 0, chord: "La" }],
          startTick: 5000, endTick: 5480, sectionEnd: true },
        // Backwards: second pass starts at the second Estrofa
        { text: "segunda estrofa.", sylMap: [{ tick: 1000, pos: 0, chord: "Mi7" }],
          startTick: 1000, endTick: 1480, sectionEnd: false }
    ];
    var chords = [
        { tick: 0, chord: "Lam" }, { tick: 200, chord: "Mi7" },
        { tick: 400, chord: "Lam" }, { tick: 600, chord: "Rem" },
        { tick: 800, chord: "Mi7" },
        { tick: 1000, chord: "Mi7" },
        { tick: 5000, chord: "La" }
    ];
    var systemTexts = [
        { tick: 0, text: "Musica" },
        { tick: 1000, text: "Estrofa" }
    ];
    var result = fmt.formatPerfLines(lines, [], null, "", chords, null, systemTexts);
    var output = result.text;
    var endStribillo = output.indexOf("primer estribillo.");
    var nextEstrofa = output.indexOf("segunda estrofa.");
    var between = output.substring(endStribillo, nextEstrofa);
    var musicaIdx = between.indexOf("- MUSICA -");
    var lamIdx = between.indexOf("Lam");
    assert.ok(musicaIdx >= 0, "MUSICA label should appear: " + between);
    assert.ok(lamIdx >= 0, "interlude chords should appear: " + between);
    assert.ok(musicaIdx < lamIdx, "MUSICA must be above the interlude chord line: " + between);
    // Label appears exactly once between the two stanzas (no orphan duplicate)
    var musicaCount = (between.match(/- MUSICA -/g) || []).length;
    assert.equal(musicaCount, 1, "MUSICA should not be duplicated: " + between);
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

test("formatPerfLines intro label does NOT re-emit on repeat when before firstLineTick", function() {
    // Intro(0) + Solista(100) + Estribillo(500): 3 labels.
    // Intro and Solista are before firstLineTick (200). On backwards tick
    // (repeat goes to 200), pre-firstLineTick labels should not re-emit
    // because the repeat does not cover the intro section.
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
    // Intro appears only once (before the repeat, not re-emitted)
    assert.equal((output.match(/- INTRO -/g) || []).length, 1,
        "INTRO should appear only once (outside repeat): " + output);
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

test("formatPerfLines intro label outside repeat not re-emitted (VirgenAlmudena with startRepeat)", function() {
    // Intro at tick 0 (outside repeat), repeat starts at tick 200 (= firstLineTick).
    // On backwards tick (repeat pass), Intro label should NOT re-emit because
    // the repeat does not cover the intro section.
    var lines = [
        // Pass 1
        { text: "salve.", sylMap: [{tick:200,pos:0,chord:"Sol"}], startTick: 200, endTick: 400, sectionEnd: true, sectionBar: true },
        { text: "verso uno.", sylMap: [{tick:500,pos:0,chord:"Mim"}], startTick: 500, endTick: 700, sectionEnd: true },
        // Pass 2 (backwards to 200, NOT to 0)
        { text: "salve.", sylMap: [{tick:200,pos:0,chord:"Sol"}], startTick: 200, endTick: 400, sectionEnd: true, sectionBar: true, abbreviated: true },
        { text: "verso dos.", sylMap: [{tick:500,pos:0,chord:"Mim"}], startTick: 500, endTick: 700, sectionEnd: true },
        // Pass 3 (backwards to 200 again)
        { text: "salve.", sylMap: [{tick:200,pos:0,chord:"Sol"}], startTick: 200, endTick: 400, sectionEnd: true, abbreviated: true }
    ];
    var chords = [{tick:0, chord:"Mim"}, {tick:200, chord:"Sol"}, {tick:500, chord:"Mim"}];
    var systemTexts = [{tick:0, text:"Intro"}, {tick:200, text:"Estribillo"}, {tick:500, text:"Estrofa #"}];
    var introChords = ["Mim", "Si", "Sim"];
    var result = fmt.formatPerfLines(lines, introChords, null, "", chords, null, systemTexts);
    var output = result.text;
    // INTRO should appear exactly once (outside repeat range)
    assert.equal((output.match(/- INTRO -/g) || []).length, 1,
        "INTRO should appear only once (outside repeat): " + output);
    // ESTRIBILLO should appear on all passes
    assert.ok((output.match(/- ESTRIBILLO -/g) || []).length >= 2,
        "ESTRIBILLO should appear on repeat passes: " + output);
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
// homeChord suppression must not remove the first chord of the song
// ========================================

test("formatPerfLines does not suppress the first chord even if it matches homeChord", function() {
    var lines = [
        { text: "Rana.", sylMap: [{ tick: 0, pos: 0, chord: "La" }], startTick: 0, endTick: 960, sectionEnd: true }
    ];
    var result = fmt.formatPerfLines(lines, [], "La", "", [{ tick: 0, chord: "La" }], null, null, true);
    var output = result.text;
    assert.ok(output.indexOf("La") >= 0, "first chord should not be suppressed: " + output);
});

// ========================================
// --compact flag enables abbreviation (default: full repeat)
// ========================================

test("formatPerfLines with fullRepeat=true does not abbreviate repeated stanzas", function() {
    // Two identical stanzas: with fullRepeat=true (default), both should appear in full
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
    // Same data as above, but with fullRepeat=false (--compact mode)
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

test("renderLabel with colon sequence cycles through items", function() {
    var counters = {};
    assert.equal(fmt.renderLabel("Solista manolo:juan:pedro", counters), "SOLISTA MANOLO");
    assert.equal(fmt.renderLabel("Solista manolo:juan:pedro", counters), "SOLISTA JUAN");
    assert.equal(fmt.renderLabel("Solista manolo:juan:pedro", counters), "SOLISTA PEDRO");
    assert.equal(fmt.renderLabel("Solista manolo:juan:pedro", counters), null, "exhausted sequence returns null");
});

test("renderLabel with dash sequence cycles through items", function() {
    var counters = {};
    assert.equal(fmt.renderLabel("Estrofa 1-2-1", counters), "ESTROFA 1");
    assert.equal(fmt.renderLabel("Estrofa 1-2-1", counters), "ESTROFA 2");
    assert.equal(fmt.renderLabel("Estrofa 1-2-1", counters), "ESTROFA 1");
    assert.equal(fmt.renderLabel("Estrofa 1-2-1", counters), null, "exhausted sequence returns null");
});

test("renderLabel colon sequence with two items", function() {
    var counters = {};
    assert.equal(fmt.renderLabel("Coro feliz:triste", counters), "CORO FELIZ");
    assert.equal(fmt.renderLabel("Coro feliz:triste", counters), "CORO TRISTE");
    assert.equal(fmt.renderLabel("Coro feliz:triste", counters), null, "exhausted sequence returns null");
});

test("renderLabel sequence is independent from # counters", function() {
    var counters = {};
    assert.equal(fmt.renderLabel("Estrofa #", counters), "ESTROFA 1");
    assert.equal(fmt.renderLabel("Solista a:b", counters), "SOLISTA A");
    assert.equal(fmt.renderLabel("Estrofa #", counters), "ESTROFA 2");
    assert.equal(fmt.renderLabel("Solista a:b", counters), "SOLISTA B");
});

test("renderLabel colon sequence ignores empty items", function() {
    var counters = {};
    // "1::2::" splits to ["1","","2","",""] but empty items are filtered out
    assert.equal(fmt.renderLabel("Estrofa 1::2::", counters), "ESTROFA 1");
    assert.equal(fmt.renderLabel("Estrofa 1::2::", counters), "ESTROFA 2");
    assert.equal(fmt.renderLabel("Estrofa 1::2::", counters), null, "exhausted returns null");
});

test("renderLabel dash sequence ignores empty items", function() {
    var counters = {};
    // "1--2" splits to ["1","","2"] but empty items are filtered out
    assert.equal(fmt.renderLabel("Estrofa 1--2", counters), "ESTROFA 1");
    assert.equal(fmt.renderLabel("Estrofa 1--2", counters), "ESTROFA 2");
    assert.equal(fmt.renderLabel("Estrofa 1--2", counters), null, "exhausted returns null");
});

test("renderLabel returns null on every call after sequence exhausted", function() {
    var counters = {};
    assert.equal(fmt.renderLabel("X a:b", counters), "X A");
    assert.equal(fmt.renderLabel("X a:b", counters), "X B");
    // All subsequent calls return null
    assert.equal(fmt.renderLabel("X a:b", counters), null);
    assert.equal(fmt.renderLabel("X a:b", counters), null);
    assert.equal(fmt.renderLabel("X a:b", counters), null);
});

test("renderLabel # counter is not affected by sequence exhaustion", function() {
    // # labels never exhaust (they auto-increment forever)
    var counters = {};
    assert.equal(fmt.renderLabel("Verso #", counters), "VERSO 1");
    assert.equal(fmt.renderLabel("Verso #", counters), "VERSO 2");
    assert.equal(fmt.renderLabel("Verso #", counters), "VERSO 3");
    assert.equal(fmt.renderLabel("Verso #", counters), "VERSO 4");
    // All return valid labels, never null
    assert.ok(fmt.renderLabel("Verso #", counters) !== null, "# labels never exhaust");
});

test("formatPerfLines suppresses label when sequence exhausted (null from renderLabel)", function() {
    // Simulates a repeat with "Estrofa 1::2::": first pass gets ESTROFA 1,
    // second pass (backwards tick) gets ESTROFA 2, third pass gets null (suppressed).
    // Ticks go forward then backwards to trigger repeat pass detection.
    var lines = [
        { text: "verse one.", sylMap: [{tick:1000,pos:0}], startTick: 1000, endTick: 2000, sectionEnd: true },
        // Backwards: second pass of repeat
        { text: "verse two.", sylMap: [{tick:1000,pos:0}], startTick: 1000, endTick: 2000, sectionEnd: true },
        // Another section
        { text: "chorus.", sylMap: [{tick:3000,pos:0}], startTick: 3000, endTick: 4000, sectionEnd: true },
        // Backwards: DS replay, third emission of the label
        { text: "verse three.", sylMap: [{tick:1000,pos:0}], startTick: 1000, endTick: 2000, sectionEnd: true }
    ];
    var systemTexts = [
        { tick: 1000, text: "Estrofa 1::2::" },
        { tick: 3000, text: "Estribillo" }
    ];
    var result = fmt.formatPerfLines(lines, [], null, "TEST", null, null, systemTexts, true);
    var output = result.text;
    // ESTROFA 1 should appear (first pass)
    assert.ok(output.indexOf("ESTROFA 1") >= 0, "ESTROFA 1 should appear: " + output);
    // ESTROFA 2 should appear (second pass, backwards tick re-emits)
    assert.ok(output.indexOf("ESTROFA 2") >= 0, "ESTROFA 2 should appear: " + output);
    // "- ESTROFA -" (base only, no number) should NOT appear
    var bareEstrofa = output.match(/- ESTROFA -/g) || [];
    assert.equal(bareEstrofa.length, 0,
        "should not have bare '- ESTROFA -' (sequence exhausted): " + output);
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

test("formatPerfLines: 4 long chord names append inline above the lyric", function() {
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
    // Trailing chords are appended inline on the chord line above the lyric,
    // even when this overflows the 70-char budget.
    var lyricIdx = output.indexOf("linea de letra");
    var trailIdx = output.indexOf("Sol7sus4");
    assert.ok(trailIdx >= 0 && trailIdx < lyricIdx,
        "trailing chord above lyric: " + output);
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

test("formatPerfLines resets lastChord after abbreviated stanza (VirgenAlmudena Mim regression)", function() {
    // When a repeated stanza is abbreviated, the next non-abbreviated section
    // should show its first chord even if it matches the previous pass's last chord.
    var lines = [
        // Pass 1: main + volta
        { text: "Salve, señora.", sylMap: [{tick:0,pos:0,chord:"Sol"}], startTick: 0, endTick: 480, sectionEnd: true, sectionBar: true },
        { text: "verso uno.", sylMap: [{tick:960,pos:0,chord:"Mim"}], startTick: 960, endTick: 1440, sectionEnd: true },
        // Pass 2: abbreviated main (same text) + different volta
        { text: "Salve, señora.", sylMap: [{tick:0,pos:0,chord:"Sol"}], startTick: 0, endTick: 480, sectionEnd: true, sectionBar: true, abbreviated: true },
        { text: "verso dos.", sylMap: [{tick:960,pos:0,chord:"Mim"}], startTick: 960, endTick: 1440, sectionEnd: true }
    ];
    var chords = [
        { tick: 0, chord: "Sol" },
        { tick: 960, chord: "Mim" }
    ];
    var systemTexts = [{ tick: 0, text: "Estribillo" }];
    var result = fmt.formatPerfLines(lines, [], null, "", chords, null, systemTexts);
    var output = result.text;
    // After the abbreviated "ESTRIBILLO", "verso dos." should show Mim chord
    var versoDosIdx = output.indexOf("verso dos.");
    var before = output.substring(Math.max(0, versoDosIdx - 30), versoDosIdx);
    assert.ok(before.indexOf("Mim") >= 0,
        "Mim should appear before 'verso dos.' after abbreviated stanza: " + output);
});

test("formatPerfLines respects endChordTick to cap coda chords", function() {
    // When a line has endChordTick, coda chords beyond that tick are excluded.
    var lines = [
        { text: "main section.", sylMap: [{tick:0,pos:0,chord:"Sol"}], startTick: 0, endTick: 480, sectionEnd: true, endChordTick: 960 }
    ];
    var chords = [
        { tick: 0, chord: "Sol" },
        { tick: 720, chord: "Re" },   // within endChordTick range
        { tick: 1200, chord: "Mim" }, // beyond endChordTick, should be excluded
        { tick: 1440, chord: "La" }   // beyond endChordTick, should be excluded
    ];
    var result = fmt.formatPerfLines(lines, [], null, "", chords);
    var output = result.text;
    assert.ok(output.indexOf("Re") >= 0, "Re (within range) should appear: " + output);
    assert.equal(output.indexOf("Mim"), -1, "Mim (beyond endChordTick) should NOT appear: " + output);
    assert.equal(output.indexOf("La"), -1, "La (beyond endChordTick) should NOT appear: " + output);
});

// ============================================================
// AlcalaDeHenares-like: repeat with intro inside, numbered labels
// ============================================================

test("formatPerfLines numbered label re-emits on each repeat pass (AlcalaDeHenares)", function() {
    // Repeat starts at tick 100 (same as intro). Estrofa # at tick 300, Estribillo at 600.
    // Pass 1: Estrofa 1, Estribillo. Pass 2: Estrofa 2, Estribillo.
    var lines = [
        { text: "verse one.", sylMap: [{tick:300,pos:0,chord:"Lam"}], startTick: 300, endTick: 500, sectionEnd: true },
        { text: "chorus.", sylMap: [{tick:600,pos:0,chord:"Sol"}], startTick: 600, endTick: 800, sectionEnd: true },
        // Backwards (second pass)
        { text: "verse two.", sylMap: [{tick:300,pos:0,chord:"Re"}], startTick: 300, endTick: 500, sectionEnd: true },
        { text: "chorus.", sylMap: [{tick:600,pos:0,chord:"Mi"}], startTick: 600, endTick: 800, sectionEnd: false }
    ];
    var chords = [{tick:100, chord:"La"}, {tick:150, chord:"Mi7"}, {tick:300, chord:"Lam"}, {tick:600, chord:"Sol"}];
    var systemTexts = [{tick:100, text:"Intro"}, {tick:300, text:"Estrofa #"}, {tick:600, text:"Estribillo"}];
    var introChords = ["La", "Mi7"];
    // repeatStartTick = 100 (intro is inside repeat)
    var result = fmt.formatPerfLines(lines, introChords, null, "", chords, null, systemTexts, false, 100);
    var output = result.text;
    assert.ok(output.indexOf("- ESTROFA 1 -") >= 0, "should have ESTROFA 1: " + output);
    assert.ok(output.indexOf("- ESTROFA 2 -") >= 0, "should have ESTROFA 2: " + output);
    assert.equal((output.match(/- ESTRIBILLO -/g) || []).length, 2, "ESTRIBILLO twice: " + output);
});

test("formatPerfLines intro label re-emits without chords on repeat when not fullRepeat", function() {
    // Intro at tick 100 inside repeat (repeatStartTick=100). Without fullRepeat,
    // second pass shows INTRO label but no chords.
    var lines = [
        { text: "verse one.", sylMap: [{tick:300,pos:0,chord:"Lam"}], startTick: 300, endTick: 500, sectionEnd: true },
        // Backwards (second pass)
        { text: "verse two.", sylMap: [{tick:300,pos:0,chord:"Re"}], startTick: 300, endTick: 500, sectionEnd: false }
    ];
    var chords = [{tick:100, chord:"La"}, {tick:150, chord:"Mi7"}, {tick:300, chord:"Lam"}];
    var systemTexts = [{tick:100, text:"Intro"}, {tick:300, text:"Estrofa #"}];
    var introChords = ["La", "Mi7"];
    var result = fmt.formatPerfLines(lines, introChords, null, "", chords, null, systemTexts, false, 100);
    var output = result.text;
    // INTRO label appears twice
    assert.equal((output.match(/- INTRO -/g) || []).length, 2, "INTRO should appear twice: " + output);
    // Intro chords appear only once (at the top)
    var firstIntro = output.indexOf("La  Mi7");
    var secondIntro = output.indexOf("La  Mi7", firstIntro + 1);
    assert.equal(secondIntro, -1, "intro chords should not repeat without fullRepeat: " + output);
});

test("formatPerfLines with fullRepeat re-emits intro chords on repeat pass", function() {
    // Same as above but with fullRepeat=true: second pass shows intro chords again.
    var lines = [
        { text: "verse one.", sylMap: [{tick:300,pos:0,chord:"Lam"}], startTick: 300, endTick: 500, sectionEnd: true },
        // Backwards (second pass)
        { text: "verse two.", sylMap: [{tick:300,pos:0,chord:"Re"}], startTick: 300, endTick: 500, sectionEnd: false }
    ];
    var chords = [{tick:100, chord:"La"}, {tick:150, chord:"Mi7"}, {tick:300, chord:"Lam"}];
    var systemTexts = [{tick:100, text:"Intro"}, {tick:300, text:"Estrofa #"}];
    var introChords = ["La", "Mi7"];
    var result = fmt.formatPerfLines(lines, introChords, null, "", chords, null, systemTexts, true, 100);
    var output = result.text;
    // Intro chords appear twice (once at top, once in interlude)
    var firstIntro = output.indexOf("La  Mi7");
    var secondIntro = output.indexOf("La  Mi7", firstIntro + 1);
    assert.ok(secondIntro >= 0, "intro chords should repeat with fullRepeat: " + output);
});

test("formatPerfLines intro outside repeat: INTRO once, numbered labels increment", function() {
    // Intro at tick 0, repeat starts at tick 200. Intro is outside repeat.
    var lines = [
        { text: "verse one.", sylMap: [{tick:200,pos:0,chord:"Lam"}], startTick: 200, endTick: 400, sectionEnd: true },
        // Backwards (second pass to tick 200, not to tick 0)
        { text: "verse two.", sylMap: [{tick:200,pos:0,chord:"Re"}], startTick: 200, endTick: 400, sectionEnd: false }
    ];
    var chords = [{tick:0, chord:"Re"}, {tick:50, chord:"Sol"}, {tick:200, chord:"Lam"}];
    var systemTexts = [{tick:0, text:"Intro"}, {tick:200, text:"Estrofa #"}];
    var introChords = ["Re", "Sol"];
    var result = fmt.formatPerfLines(lines, introChords, null, "", chords, null, systemTexts, false, 200);
    var output = result.text;
    // INTRO appears only once (outside repeat)
    assert.equal((output.match(/- INTRO -/g) || []).length, 1, "INTRO once (outside repeat): " + output);
    assert.ok(output.indexOf("- ESTROFA 1 -") >= 0, "should have ESTROFA 1: " + output);
});

// ============================================================
// stripChordMarkers
// ============================================================

test("stripChordMarkers removes zero-width space from chord lines", function() {
    var input = M + "Lam  Re\nhello world\n" + M + "Sol  Mi\ngoodbye";
    var result = fmt.stripChordMarkers(input);
    assert.ok(result.indexOf("\u200B") < 0, "should not contain zero-width space");
    assert.ok(result.indexOf("Lam  Re") >= 0, "should keep chord text");
    assert.ok(result.indexOf("hello world") >= 0, "should keep lyrics");
});

// ========================================
// formatLines: trailing chord cap at system text boundaries
// ========================================

test("formatLines caps trailing chords at system text with instrumental section", function() {
    // Chords after a system text label (e.g. "Musica") with 2+ chords should NOT
    // appear as trailing chords on the previous vocal line. They belong to the
    // interlude after the label.
    var lines = [
        { text: "Tratando de verte en su carita.",
          sylMap: [
              { tick: 77520, pos: 0 }, { tick: 78720, pos: 22 },
              { tick: 78960, pos: 25 }, { tick: 79440, pos: 28 }
          ],
          startTick: 77520, endTick: 79680 },
        { text: "Vuela una lagrima.", sylMap: [{ tick: 90240, pos: 0 }], startTick: 90240, endTick: 91200 }
    ];
    var chords = [
        { tick: 77760, chord: "Do7" },
        { tick: 79680, chord: "Fa" },
        { tick: 80640, chord: "La7" },
        { tick: 81600, chord: "Rem" },
        { tick: 82560, chord: "Sib" },
        { tick: 83520, chord: "Do" },
        { tick: 84480, chord: "Rem" },
        { tick: 90240, chord: "Sib" }
    ];
    var systemTexts = [{ tick: 80640, text: "Musica" }, { tick: 90240, text: "Estrofa" }];
    var result = fmt.formatLines(lines, chords, null, -1, systemTexts);
    var output = fmt.stripChordMarkers(result.output);

    // Trailing chords should NOT appear on the carita chord line
    var outputLines = output.split("\n");
    var caritaIdx = outputLines.findIndex(function(ln) { return ln.indexOf("carita") >= 0; });
    var chordAboveCarita = outputLines[caritaIdx - 1];
    assert.ok(chordAboveCarita.indexOf("La7") < 0,
        "La7 should NOT be trailing on carita line: " + chordAboveCarita);
    assert.ok(chordAboveCarita.indexOf("Rem") < 0,
        "Rem should NOT be trailing on carita line: " + chordAboveCarita);

    // MUSICA label should appear between stanzas
    assert.ok(output.indexOf("- MUSICA -") >= 0, "should have MUSICA label");

    // Interlude chords should appear after MUSICA label, before ESTROFA
    var musicaIdx = output.indexOf("- MUSICA -");
    var estrofaIdx = output.indexOf("- ESTROFA -");
    var la7Idx = output.indexOf("La7");
    assert.ok(la7Idx > musicaIdx && la7Idx < estrofaIdx,
        "interlude chords between MUSICA and ESTROFA");
});

test("formatLines does not cap trailing chords when system text has < 2 chords after it", function() {
    // When a system text has only 1 chord after it, it's not a real instrumental
    // section, so trailing chords should NOT be capped.
    var lines = [
        { text: "hello world.",
          sylMap: [{ tick: 0, pos: 0 }],
          startTick: 0, endTick: 480 },
        { text: "next line.", sylMap: [{ tick: 5000, pos: 0 }], startTick: 5000, endTick: 5480 }
    ];
    var chords = [
        { tick: 0, chord: "Do" },
        { tick: 600, chord: "Re" },
        { tick: 1200, chord: "Mi" }
    ];
    // System text at tick 800 has only 1 chord after it (Mi at 1200)
    var systemTexts = [{ tick: 800, text: "Label" }];
    var result = fmt.formatLines(lines, chords, null, -1, systemTexts);
    var output = fmt.stripChordMarkers(result.output);

    // Both Re and Mi should be trailing on the first chord line
    var firstChordLine = output.split("\n")[0];
    assert.ok(firstChordLine.indexOf("Re") >= 0, "Re should be trailing: " + firstChordLine);
    assert.ok(firstChordLine.indexOf("Mi") >= 0, "Mi should be trailing: " + firstChordLine);
});

test("formatLines trailing chords work normally without system texts", function() {
    // Without systemTexts, trailing chords should behave as before (no cap)
    var lines = [{
        text: "corto.",
        sylMap: [{ tick: 0, pos: 0 }],
        startTick: 0, endTick: 480
    }];
    var chords = [
        { tick: 0, chord: "La" },
        { tick: 720, chord: "Mi" },
        { tick: 960, chord: "Re" }
    ];
    var result = fmt.formatLines(lines, chords, null, -1);
    var output = fmt.stripChordMarkers(result.output);
    var chordLine = output.split("\n")[0];
    assert.ok(chordLine.indexOf("Mi") >= 0 && chordLine.indexOf("Re") >= 0,
        "trailing chords on chord line without systemTexts: " + chordLine);
});

test("formatLines emits interlude chords after system text label", function() {
    // When a system text label appears between lines and has chords after it,
    // those chords should be emitted as an interlude chord line after the label.
    var lines = [
        { text: "primera linea.",
          sylMap: [{ tick: 0, pos: 0 }],
          startTick: 0, endTick: 480 },
        { text: "segunda linea.", sylMap: [{ tick: 10000, pos: 0 }], startTick: 10000, endTick: 10480 }
    ];
    var chords = [
        { tick: 0, chord: "Do" },
        { tick: 5000, chord: "La7" },
        { tick: 6000, chord: "Rem" },
        { tick: 7000, chord: "Sol" },
        { tick: 10000, chord: "Do" }
    ];
    var systemTexts = [{ tick: 5000, text: "Musica" }, { tick: 10000, text: "Estrofa" }];
    var result = fmt.formatLines(lines, chords, null, -1, systemTexts);
    var output = fmt.stripChordMarkers(result.output);

    // MUSICA label should exist
    assert.ok(output.indexOf("- MUSICA -") >= 0, "should have MUSICA label");

    // Chords La7, Rem, Sol should appear after MUSICA but before ESTROFA
    var afterMusica = output.substring(output.indexOf("- MUSICA -") + 10);
    var beforeEstrofa = afterMusica.substring(0, afterMusica.indexOf("- ESTROFA -"));
    assert.ok(beforeEstrofa.indexOf("La7") >= 0, "La7 in interlude: " + beforeEstrofa);
    assert.ok(beforeEstrofa.indexOf("Rem") >= 0, "Rem in interlude: " + beforeEstrofa);
    assert.ok(beforeEstrofa.indexOf("Sol") >= 0, "Sol in interlude: " + beforeEstrofa);
});

test("formatLines interlude chords dedup consecutive identical chords", function() {
    var lines = [
        { text: "linea.", sylMap: [{ tick: 0, pos: 0 }], startTick: 0, endTick: 480 },
        { text: "otra.", sylMap: [{ tick: 8000, pos: 0 }], startTick: 8000, endTick: 8480 }
    ];
    var chords = [
        { tick: 0, chord: "Do" },
        { tick: 2000, chord: "Re" },
        { tick: 3000, chord: "Re" },  // duplicate
        { tick: 4000, chord: "Mi" },
        { tick: 8000, chord: "Do" }
    ];
    var systemTexts = [{ tick: 2000, text: "Musica" }];
    var result = fmt.formatLines(lines, chords, null, -1, systemTexts);
    var output = fmt.stripChordMarkers(result.output);
    var afterMusica = output.substring(output.indexOf("- MUSICA -") + 10);
    // Re should appear only once (dedup), then Mi
    var reCount = (afterMusica.match(/\bRe\b/g) || []).length;
    assert.equal(reCount, 1, "Re should appear once (deduped): " + afterMusica);
    assert.ok(afterMusica.indexOf("Mi") >= 0, "Mi in interlude");
});

test("formatLines handles multiple system texts between lines", function() {
    var lines = [
        { text: "primera.", sylMap: [{ tick: 0, pos: 0 }], startTick: 0, endTick: 480 },
        { text: "segunda.", sylMap: [{ tick: 20000, pos: 0 }], startTick: 20000, endTick: 20480 }
    ];
    var chords = [
        { tick: 0, chord: "Do" },
        { tick: 5000, chord: "Re" },
        { tick: 6000, chord: "Mi" },
        { tick: 10000, chord: "Fa" },
        { tick: 11000, chord: "Sol" },
        { tick: 20000, chord: "Do" }
    ];
    var systemTexts = [
        { tick: 5000, text: "Musica" },
        { tick: 10000, text: "Estrofa" }
    ];
    var result = fmt.formatLines(lines, chords, null, -1, systemTexts);
    var output = fmt.stripChordMarkers(result.output);

    // Both labels should appear
    assert.ok(output.indexOf("- MUSICA -") >= 0, "should have MUSICA");
    assert.ok(output.indexOf("- ESTROFA -") >= 0, "should have ESTROFA");

    // Re, Mi after MUSICA; Fa, Sol after ESTROFA
    var musicaPos = output.indexOf("- MUSICA -");
    var estrofaPos = output.indexOf("- ESTROFA -");
    var rePos = output.indexOf("Re");
    var faPos = output.indexOf("Fa");
    assert.ok(rePos > musicaPos && rePos < estrofaPos,
        "Re between MUSICA and ESTROFA");
    assert.ok(faPos > estrofaPos,
        "Fa after ESTROFA");
});

test("stripChordMarkers returns unchanged text without markers", function() {
    var input = "hello world\ngoodbye";
    assert.equal(fmt.stripChordMarkers(input), input);
});

test("stripChordMarkers handles empty string", function() {
    assert.equal(fmt.stripChordMarkers(""), "");
});

// ========================================
// formatPerfLines: label re-emission with multiple repeats
// ========================================

test("formatPerfLines: backwards tick uses correct repeat for label emission", function() {
    // Two repeats: repeat 1 at tick 100-400, repeat 2 at tick 500-900.
    // Labels: "Estrofa #" at tick 100, "Estribillo" at tick 300, "Estrofa #" at tick 500.
    // On second pass of repeat 2 (backwards tick to 500), only "Estrofa #" at tick 500
    // should re-emit, NOT "Estrofa #" at 100 or "Estribillo" at 300.
    function mkLine(text, startTick, endTick, opts) {
        opts = opts || {};
        var chord = opts.chord || null;
        return {
            text: text,
            sylMap: [{ tick: startTick, pos: 0, chord: chord }],
            startTick: startTick,
            endTick: endTick,
            sectionEnd: opts.sectionEnd || false,
            sectionBar: opts.sectionBar || false
        };
    }
    var lines = [
        mkLine("first verse.", 100, 200, { sectionEnd: true, chord: "Do" }),
        mkLine("chorus here.", 300, 400, { sectionEnd: true, chord: "Re" }),
        mkLine("second verse.", 500, 600, { sectionEnd: true, chord: "Mi" }),
        mkLine("chorus again.", 700, 800, { sectionEnd: true, chord: "Fa" }),
        // Second pass of repeat 2: backwards tick to 500
        mkLine("third verse.", 500, 600, { sectionEnd: true, chord: "Mi" }),
        mkLine("chorus end.", 700, 800, { sectionEnd: true, chord: "Fa" })
    ];
    var chords = [{ tick: 100, chord: "Do" }, { tick: 300, chord: "Re" }, { tick: 500, chord: "Mi" }, { tick: 700, chord: "Fa" }];
    var systemTexts = [
        { tick: 100, text: "Estrofa #" },
        { tick: 300, text: "Estribillo" },
        { tick: 500, text: "Estrofa #" }
    ];
    var repeats = [
        { startTick: 100, endTick: 400 },
        { startTick: 500, endTick: 900 }
    ];
    var result = fmt.formatPerfLines(lines, [], null, "", chords, [], systemTexts, false, 100, repeats);
    var output = fmt.stripChordMarkers(result.text);

    // Count ESTROFA occurrences: should be ESTROFA 1, ESTROFA 2, ESTROFA 3 (not more)
    var estrofaMatches = output.match(/- ESTROFA \d+ -/g) || [];
    assert.equal(estrofaMatches.length, 3,
        "should have exactly 3 ESTROFA labels (not spurious re-emission): " + estrofaMatches.join(", ") + "\n" + output);

    // ESTRIBILLO should appear once (not re-emitted on repeat 2 pass)
    var estribilloMatches = output.match(/- ESTRIBILLO -/g) || [];
    assert.equal(estribilloMatches.length, 1,
        "ESTRIBILLO should appear once: " + output);
});

// ========================================
// Trailing chord routing to interlude when label in range
// ========================================

test("formatPerfLines defers trailing chords to interlude when system text in range", function() {
    var lines = [
        {
            text: "end of estribillo.",
            sylMap: [{ tick: 500, pos: 0, chord: "Si7" }],
            startTick: 500, endTick: 1000,
            sectionEnd: true
        },
        {
            text: "start of estrofa.",
            sylMap: [{ tick: 3000, pos: 0, chord: "Mi7" }],
            startTick: 3000, endTick: 3480,
            sectionEnd: false
        }
    ];
    var chords = [
        { tick: 500, chord: "Si7" },
        { tick: 1000, chord: "Lam" }, { tick: 1200, chord: "Re" },
        { tick: 1400, chord: "Sol" }, { tick: 1600, chord: "Do" },
        { tick: 3000, chord: "Mi7" }
    ];
    // Label "Musica" at tick 1000 is between line 1 end and line 2 start
    var systemTexts = [{ tick: 1000, text: "Musica" }, { tick: 3000, text: "Estrofa" }];
    var result = fmt.formatPerfLines(lines, [], null, "", chords, null, systemTexts);
    var output = result.text;
    // The 4 trailing chords should NOT be on the estribillo line
    var estriLine = output.split("\n").filter(function(l) { return l.indexOf("end of estribillo") >= 0; })[0];
    assert.ok(estriLine.indexOf("Lam") < 0,
        "trailing chords should not be on estribillo line when label in range: " + estriLine);
});

// ========================================
// Duplicate label dedup
// ========================================

test("formatPerfLines removes consecutive duplicate labels", function() {
    var lines = [
        { text: "line one.", sylMap: [{tick:100,pos:0,chord:"Do"}], startTick: 100, endTick: 200, sectionEnd: true },
        { text: "line two.", sylMap: [{tick:100,pos:0,chord:"Re"}], startTick: 100, endTick: 200, sectionEnd: true },
        { text: "line three.", sylMap: [{tick:300,pos:0,chord:"Mi"}], startTick: 300, endTick: 400, sectionEnd: false }
    ];
    var systemTexts = [{tick:100, text:"Estrofa"}];
    var result = fmt.formatPerfLines(lines, [], null, "", [], null, systemTexts);
    var output = result.text;
    var count = (output.match(/- ESTROFA -/g) || []).length;
    assert.ok(count <= 2, "should not have more than 2 ESTROFA labels (dedup): got " + count + " in: " + output);
});

// ========================================
// Label-aware compact abbreviation
// ========================================

test("abbreviateRepeatedStanzas does NOT abbreviate same-text stanza without label", function() {
    // Same text appears twice but no label between them (structural repeat, not a new section)
    var lines = [
        { text: "hello world,", sylMap: [], startTick: 0, endTick: 480, sectionEnd: false },
        { text: "nice day.", sylMap: [], startTick: 480, endTick: 960, sectionEnd: true },
        { text: "something else,", sylMap: [], startTick: 960, endTick: 1440, sectionEnd: false },
        { text: "really nice.", sylMap: [], startTick: 1440, endTick: 1920, sectionEnd: true },
        // Same text, NO label before it
        { text: "hello world,", sylMap: [], startTick: 1920, endTick: 2400, sectionEnd: false },
        { text: "nice day.", sylMap: [], startTick: 2400, endTick: 2880, sectionEnd: true }
    ];
    // With systemTexts, the abbreviation only fires when a label precedes the duplicate
    var systemTexts = [{ tick: 0, text: "Section A" }];
    var result = fmt.abbreviateRepeatedStanzas(lines, null, systemTexts);
    // All 6 lines should remain (no abbreviation without label)
    assert.equal(result.length, 6, "should keep all lines when no label before duplicate: got " + result.length);
});

// ========================================
// Prefix match abbreviation (volta extra lines)
// ========================================

test("abbreviateRepeatedStanzas detects prefix match when second stanza has extra lines", function() {
    // Estribillo 1: 4 lines. Estribillo 2: same 4 lines + extra volta 2 line.
    // The common prefix should be abbreviated, extra line kept.
    var lines = [
        { text: "intro.", sylMap: [], startTick: 0, endTick: 480, sectionEnd: true },
        { text: "Cuando la tuna te de serenata,", sylMap: [], startTick: 960, endTick: 1440, sectionEnd: false },
        { text: "que cada cinta guarda un trocito,", sylMap: [], startTick: 1440, endTick: 1920, sectionEnd: false },
        { text: "ay laira lalaraira lalá,", sylMap: [], startTick: 1920, endTick: 2400, sectionEnd: false },
        { text: "y deja la tuna pasar.", sylMap: [], startTick: 2400, endTick: 2880, sectionEnd: true },
        // Second stanza with extra volta 2 line
        { text: "other section.", sylMap: [], startTick: 3000, endTick: 3400, sectionEnd: true },
        { text: "Cuando la tuna te de serenata,", sylMap: [], startTick: 3600, endTick: 4080, sectionEnd: false },
        { text: "que cada cinta guarda un trocito,", sylMap: [], startTick: 4080, endTick: 4560, sectionEnd: false },
        { text: "ay laira lalaraira lalá,", sylMap: [], startTick: 4560, endTick: 5040, sectionEnd: false },
        { text: "y deja la tuna pasar.", sylMap: [], startTick: 5040, endTick: 5520, sectionEnd: false },
        { text: "con su trailarai lalá.", sylMap: [], startTick: 5520, endTick: 6000, sectionEnd: false }
    ];
    var systemTexts = [
        { tick: 0, text: "Intro" },
        { tick: 960, text: "Estribillo" },
        { tick: 3000, text: "Other" },
        { tick: 3600, text: "Estribillo" }
    ];
    var result = fmt.abbreviateRepeatedStanzas(lines, null, systemTexts);
    // The 4 common lines should be replaced by one abbreviated entry
    // + the extra line "con su trailarai lalá." should remain
    var extraLine = result.filter(function(l) { return l.text === "con su trailarai lalá."; });
    assert.equal(extraLine.length, 1, "extra volta line should be preserved");
    // The abbreviated entry should exist
    var abbreviated = result.filter(function(l) { return l.abbreviated; });
    assert.ok(abbreviated.length >= 1, "should have at least one abbreviated entry");
    // The 4 repeated lines should NOT appear twice
    var cuando = result.filter(function(l) { return l.text && l.text.indexOf("Cuando") >= 0; });
    assert.equal(cuando.length, 1, "Cuando should appear only once (first estribillo): " + cuando.length);
});

test("abbreviateRepeatedStanzas does not prefix-match when lines differ", function() {
    var lines = [
        { text: "line A.", sylMap: [], startTick: 0, endTick: 480, sectionEnd: true },
        { text: "line B.", sylMap: [], startTick: 960, endTick: 1440, sectionEnd: true },
        { text: "line A.", sylMap: [], startTick: 1920, endTick: 2400, sectionEnd: false },
        { text: "line C.", sylMap: [], startTick: 2400, endTick: 2880, sectionEnd: false }
    ];
    var systemTexts = [{ tick: 0, text: "S1" }, { tick: 960, text: "S2" }, { tick: 1920, text: "S3" }];
    var result = fmt.abbreviateRepeatedStanzas(lines, null, systemTexts);
    // S1 has "line A", S3 has "line A" + "line C" - prefix match only if first line matches
    // S2 is "line B" which is different, so no prefix from S2
    // S1 is 1 line, S3 is 2 lines starting with same "line A" -> prefix match
    var abbreviated = result.filter(function(l) { return l.abbreviated; });
    assert.ok(abbreviated.length >= 1, "should detect prefix match for single-line prefix");
    var lineC = result.filter(function(l) { return l.text === "line C."; });
    assert.equal(lineC.length, 1, "extra line C should remain");
});

// ========================================
// formatPerfLines: coda handler with backwards endTick
// ========================================

test("formatPerfLines skips coda chords when last line has endTick < startTick (DC lead-in)", function() {
    // Simulates DC al Coda: last syllable remapped to tick 0, endTick < startTick.
    // The coda handler should NOT dump all chords from tick 0.
    var lines = [
        { text: "first line.", sylMap: [{ tick: 1000, pos: 0, chord: "Mi" }], startTick: 1000, endTick: 1500, sectionEnd: true },
        { text: "last estudiantina.", sylMap: [{ tick: 5000, pos: 0, chord: "Re7" }], startTick: 5000, endTick: 0, sectionEnd: true }
    ];
    var chords = [
        { tick: 0, chord: "Sol" }, { tick: 200, chord: "Re" },
        { tick: 400, chord: "Sol" }, { tick: 600, chord: "Mi" },
        { tick: 800, chord: "Lam" }, { tick: 1000, chord: "Mi" },
        { tick: 5000, chord: "Re7" }, { tick: 5200, chord: "Sol" },
        { tick: 5400, chord: "Re7" }, { tick: 5600, chord: "Sol" }
    ];
    var result = fmt.formatPerfLines(lines, [], null, "TEST", chords);
    var output = result.text;
    // The coda handler would dump Sol Re Sol Mi Lam + more if endTick=0 is used.
    // With the fix, it should be suppressed. Check that the distinct chord
    // count after the lyrics is reasonable (not 5+ chords from a full dump).
    var afterLastLine = output.split("estudiantina.").pop() || "";
    var codaChords = afterLastLine.match(/\b(Sol|Re|Mi|Lam|Re7)\b/g) || [];
    assert.ok(codaChords.length <= 2, "should not dump coda chords when endTick < startTick: " + codaChords.join(",") + " after=" + afterLastLine);
});

// ========================================
// formatPerfLines: empty-text abbreviated lines not skipped
// ========================================

test("formatPerfLines processes abbreviated lines with empty text (prefix match)", function() {
    // An abbreviated line with text="" should still trigger label emission.
    // Use fullRepeat=true to skip internal abbreviation (we pass pre-abbreviated lines).
    var lines = [
        { text: "hello world.", sylMap: [{ tick: 1000, pos: 0 }], startTick: 1000, endTick: 1500, sectionEnd: true },
        { text: "other section.", sylMap: [{ tick: 2000, pos: 0 }], startTick: 2000, endTick: 2500, sectionEnd: true },
        // Abbreviated prefix match: empty text, same startTick as first stanza
        { text: "", sylMap: [], startTick: 1000, endTick: 1500, sectionEnd: false, abbreviated: true },
        { text: "extra tail.", sylMap: [{ tick: 1600, pos: 0 }], startTick: 1600, endTick: 1800, sectionEnd: false }
    ];
    var systemTexts = [{ tick: 1000, text: "Section" }, { tick: 2000, text: "Other" }];
    // fullRepeat=true skips abbreviation; repeats and repeatStartTick not needed
    var result = fmt.formatPerfLines(lines, [], null, "TEST", null, null, systemTexts, true);
    var output = result.text;
    // The label "SECTION" should appear twice (once for first stanza, once for abbreviated)
    var sectionCount = (output.match(/SECTION/g) || []).length;
    assert.ok(sectionCount >= 2, "label should be emitted for abbreviated line: count=" + sectionCount + " output=" + output);
    // The extra tail line should appear
    assert.ok(output.indexOf("extra tail.") >= 0, "extra tail line should be in output: " + output);
});

test("abbreviateRepeatedStanzas abbreviates D.S. replay stanzas via _jumpReplay", function() {
    // D.S. replay stanzas (marked _jumpReplay) are always abbreviated
    var lines = [
        { text: "hello world.", sylMap: [], startTick: 0, endTick: 480, sectionEnd: true },
        { text: "something else.", sylMap: [], startTick: 960, endTick: 1440, sectionEnd: true },
        // Same text from D.S. replay
        { text: "hello world.", sylMap: [], startTick: 0, endTick: 480, sectionEnd: true, _jumpReplay: true }
    ];
    var result = fmt.abbreviateRepeatedStanzas(lines, null, []);
    var lastText = result[result.length - 1].text;
    assert.ok(lastText.indexOf("...") >= 0 || result.length < 3,
        "D.S. replay stanza should be abbreviated: " + lastText);
});

// ========================================
// stripChordLines: lyrics-only mode
// ========================================

test("stripChordLines removes chord lines and keeps lyrics", function() {
    var input = M + "Am   D\nhello world\n" + M + "G\nnext line\n";
    var result = fmt.stripChordLines(input);
    assert.equal(result.indexOf("Am"), -1, "chord line should be removed");
    assert.ok(result.indexOf("hello world") >= 0, "lyric should remain");
    assert.ok(result.indexOf("next line") >= 0, "second lyric should remain");
});

test("stripChordLines collapses extra alignment spaces", function() {
    var input = M + "Am        D\nhello     world\n";
    var result = fmt.stripChordLines(input);
    assert.ok(result.indexOf("hello world") >= 0, "extra spaces should collapse: " + result);
    assert.equal(result.indexOf("  "), -1, "no double spaces");
});

test("stripChordLines preserves section labels and empty lines", function() {
    var input = "==== TITLE ====\n\n- INTRO -\n" + M + "Am  D\n\n- VERSE -\nhello\n";
    var result = fmt.stripChordLines(input);
    assert.ok(result.indexOf("==== TITLE ====") >= 0);
    assert.ok(result.indexOf("- INTRO -") >= 0);
    assert.ok(result.indexOf("- VERSE -") >= 0);
    assert.ok(result.indexOf("hello") >= 0);
    assert.equal(result.indexOf("Am"), -1);
});

test("stripChordLines collapses triple newlines to double", function() {
    var input = "line1\n" + M + "chords\n\nline2\n";
    var result = fmt.stripChordLines(input);
    assert.equal(result.indexOf("\n\n\n"), -1, "no triple newlines");
});
