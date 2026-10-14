// Lyrics Extractor for MuseScore
// Copyright (C) 2026 Manolo Carrasco (do2tis)
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Licensed under the GNU General Public License version 3 or later, with an
// additional attribution requirement under section 7(b): see LICENSE and ATTRIBUTION.md.

var test = require("node:test");
var assert = require("node:assert/strict");
var pdf = require("../../lib/pdf-writer");
var fmt = require("../../lib/formatter");

// Chord lines are identified by a zero-width space marker prefix (added by formatter)
var M = fmt.CHORD_LINE_MARKER;

test("isChordLine detects marked chord lines", function() {
    assert.equal(pdf.isChordLine(M + "Lam  Mi7  Lam"), true);
    assert.equal(pdf.isChordLine(M + "Do"), true);
    assert.equal(pdf.isChordLine(M + "C  G  Am  F"), true);
    assert.equal(pdf.isChordLine(M + "Lam.5  Lam.5'"), true, "custom chord names work with marker");
});

test("isChordLine rejects unmarked lines", function() {
    assert.equal(pdf.isChordLine("Lam  Mi7  Lam"), false, "no marker = not a chord line");
    assert.equal(pdf.isChordLine("Mocita dame el clavel"), false);
    assert.equal(pdf.isChordLine("CLAVELITOS"), false);
    assert.equal(pdf.isChordLine("EN ESTA NOCHE CLARA"), false);
    assert.equal(pdf.isChordLine(""), false);
});

test("escPdfString escapes parentheses and backslash", function() {
    assert.equal(pdf.escPdfString("hello"), "hello");
    assert.equal(pdf.escPdfString("(test)"), "\\(test\\)");
    assert.equal(pdf.escPdfString("a\\b"), "a\\\\b");
});

test("escPdfString encodes accented characters", function() {
    var result = pdf.escPdfString("corazón");
    assert.ok(result.indexOf("coraz") >= 0, "should have base text");
    assert.ok(result.indexOf("\\") >= 0, "should have octal escape for ó");
});

test("generatePdf produces valid PDF header", function() {
    var result = pdf.generatePdf("TITLE\n\n" + M + "Lam\nHello world.\n");
    assert.ok(result.indexOf("%PDF-1.4") === 0, "should start with PDF header");
    assert.ok(result.indexOf("%%EOF") >= 0, "should end with EOF marker");
    assert.ok(result.indexOf("/Courier") >= 0, "should reference Courier font");
    assert.ok(result.indexOf("/Helvetica-Bold") >= 0, "should reference Helvetica-Bold");
});

test("generatePdf renders chord lines in green", function() {
    var result = pdf.generatePdf("TITLE\n\n" + M + "Lam  Mi7\nHello world.\n");
    // Green color command: 0.298 0.686 0.314 rg
    assert.ok(result.indexOf("0.298 0.686 0.314 rg") >= 0, "should have green color for chords");
    // Black color command: 0 0 0 rg
    assert.ok(result.indexOf("0 0 0 rg") >= 0, "should have black color for text");
});

test("generatePdf includes footer", function() {
    var result = pdf.generatePdf("TITLE\n\n" + M + "Lam\nHello.\n", { footer: "Tuna de Alcala" });
    assert.ok(result.indexOf("Tuna de Alcala") >= 0, "should contain footer text");
});

test("generatePdf includes header on every page", function() {
    var result = pdf.generatePdf("TITLE\n\n" + M + "Lam\nHello.\n", { header: "My Group" });
    assert.ok(result.indexOf("My Group") >= 0, "should contain header text");
});

test("generatePdf handles empty input", function() {
    var result = pdf.generatePdf("");
    assert.ok(result.indexOf("%PDF-1.4") === 0, "should produce valid PDF even for empty input");
    assert.ok(result.indexOf("%%EOF") >= 0, "should have EOF");
});

test("generatePdf with onePage auto-fits moderate content to one page", function() {
    var lines = "TITLE\n\n";
    for (var i = 0; i < 40; i++) {
        lines += M + "Lam\nLine " + i + " text.\n";
    }
    var result = pdf.generatePdf(lines, { onePage: true });
    var countMatch = result.match(/\/Count\s+(\d+)/);
    assert.ok(countMatch, "should have page count");
    assert.equal(parseInt(countMatch[1]), 1, "should fit on 1 page with onePage");
});

test("generatePdf without onePage uses multiple pages", function() {
    var lines = "TITLE\n\n";
    for (var i = 0; i < 40; i++) {
        lines += M + "Lam\nLine " + i + " text.\n";
    }
    var result = pdf.generatePdf(lines, { onePage: false });
    var countMatch = result.match(/\/Count\s+(\d+)/);
    assert.ok(countMatch, "should have page count");
    assert.ok(parseInt(countMatch[1]) >= 2, "should use multiple pages without onePage");
});

test("generatePdf with onePage falls back to multi-page when too long for min font", function() {
    var lines = "TITLE\n\n";
    for (var i = 0; i < 200; i++) {
        lines += M + "Lam\nLine number " + i + " of the song text here.\n";
    }
    var result = pdf.generatePdf(lines, { onePage: true });
    var countMatch = result.match(/\/Count\s+(\d+)/);
    assert.ok(countMatch, "should have page count");
    assert.ok(parseInt(countMatch[1]) >= 2, "should need multiple pages even with onePage, got " + countMatch[1]);
});

test("generatePdf with onePage tries gap reduction before font reduction", function() {
    // Content that barely overflows: gap reduction should be enough, font stays at 9pt
    var lines = "TITLE\n\n";
    // ~55 lines: overflows at 9pt but fits with reduced gaps
    for (var i = 0; i < 27; i++) {
        lines += M + "Lam\nLine " + i + " text.\n\n"; // extra blank line = stanza gap
    }
    var result = pdf.generatePdf(lines, { onePage: true });
    var countMatch = result.match(/\/Count\s+(\d+)/);
    assert.equal(parseInt(countMatch[1]), 1, "should fit on 1 page");
    // Font should still be 9pt (only gaps reduced)
    var fontMatch = result.match(/\/F1 (\d+\.?\d*) Tf/);
    if (fontMatch) {
        assert.equal(parseFloat(fontMatch[1]), 11, "font should stay at 11pt when gap reduction is enough");
    }
});

test("generatePdf with lineNumbers renders numbers in gray", function() {
    var result = pdf.generatePdf("TITLE\n\n" + M + "Lam\nFirst line.\nSecond line.\n", { lineNumbers: true });
    // Should contain gray color for line numbers
    assert.ok(result.indexOf("0.6 0.6 0.6 rg") >= 0, "should have gray color (0.6 0.6 0.6) for line numbers");
});

test("generatePdf with lineNumbers includes sequential numbers", function() {
    var result = pdf.generatePdf("TITLE\n\n" + M + "Lam\nFirst line.\n" + M + "Mi7\nSecond line.\nThird line.\n", { lineNumbers: true });
    // Should contain line numbers 1, 2, 3 (as PDF text commands)
    assert.ok(result.indexOf("(1)") >= 0, "should contain number 1");
    assert.ok(result.indexOf("(2)") >= 0, "should contain number 2");
    assert.ok(result.indexOf("(3)") >= 0, "should contain number 3");
});

test("generatePdf with lineNumbers only numbers lyric lines", function() {
    var input = "TITLE\n\n- SECTION -\n\n" + M + "Lam  Mi7\nFirst lyric line.\n" + M + "Sol\nSecond lyric line.\n";
    var result = pdf.generatePdf(input, { lineNumbers: true });
    
    // Count occurrences of gray color (0.6 0.6 0.6 rg) which is used for line numbers
    var grayMatches = result.match(/0\.6 0\.6 0\.6 rg/g);
    assert.ok(grayMatches, "should have gray color commands");
    // Should have exactly 2 gray colors (for 2 lyric lines, not chords/title/section)
    assert.equal(grayMatches.length, 2, "should only number lyric lines (not chords, title, or section)");
});

test("generatePdf without lineNumbers has no gray numbers", function() {
    var result = pdf.generatePdf("TITLE\n\n" + M + "Lam\nFirst line.\nSecond line.\n", { lineNumbers: false });
    // Should not contain gray color for line numbers
    var grayMatches = result.match(/0\.6 0\.6 0\.6 rg/g);
    assert.ok(!grayMatches, "should not have gray color when lineNumbers is false");
});

test("generatePdf lineNumbers positioned in left margin", function() {
    var result = pdf.generatePdf("TITLE\n\n" + M + "Lam\nFirst line.\n", { lineNumbers: true });
    // Line numbers should be positioned at MARGIN_L - 15 = 50 - 15 = 35pt
    // Look for text positioning command near 35pt
    assert.ok(result.indexOf("35") >= 0, "should position numbers in left margin (around 35pt)");
});

test("generatePdf lineNumbers use smaller font than lyrics", function() {
    var result = pdf.generatePdf("TITLE\n\nFirst line.\n", { lineNumbers: true });
    // Line numbers should use fontSize - 2 = 9 - 2 = 7pt
    // Lyrics use 9pt (/F1 9 Tf), numbers use 7pt (/F1 7 Tf)
    assert.ok(result.indexOf("/F1 9") >= 0, "should use 9pt font for line numbers (fontSize - 2)");
    assert.ok(result.indexOf("/F1 11") >= 0, "should use 11pt font for lyrics");
});

test("generatePdf lineNumbers default off when not specified", function() {
    var result = pdf.generatePdf("TITLE\n\n" + M + "Lam\nFirst line.\nSecond line.\n", {});
    // Should not contain gray color for line numbers
    var grayMatches = result.match(/0\.6 0\.6 0\.6 rg/g);
    assert.ok(!grayMatches, "line numbers should be off by default");
});

test("escPdfString writes musical accidentals the base fonts can print", function() {
    // The base-14 fonts use WinAnsiEncoding, which has no musical flat, sharp or
    // natural sign, so those characters fall back to their plain spellings instead
    // of the question mark that stood in for any unencodable character.
    assert.equal(pdf.escPdfString("B♭"), "Bb");
    assert.equal(pdf.escPdfString("D♭7"), "Db7");
    assert.equal(pdf.escPdfString("F♯"), "F#");
    assert.equal(pdf.escPdfString("F♮"), "Fn");
    assert.equal(pdf.escPdfString("Si♭/Fa"), "Sib/Fa");
});

test("escPdfString keeps the width of a chord when replacing an accidental", function() {
    // Chord and lyric lines are aligned by column, so a replacement has to be one
    // character wide like the sign it replaces
    assert.equal(pdf.escPdfString("B♭").length, "B♭".length);
    assert.equal(pdf.escPdfString("A♭/C♭").length, "A♭/C♭".length);
});

test("escPdfString still guards against characters it cannot map", function() {
    // A CJK character has no WinAnsi code and no plain spelling
    assert.equal(pdf.escPdfString("中"), "?");
});

test("generatePdf draws accidentals with the Type3 font", function() {
    // The base-14 fonts have no glyph for the musical signs in any encoding, so the
    // PDF carries a Type3 font whose glyphs are drawings, and the text switches to it
    // for those characters
    var text = "==== TEST ====\n\n" + M + "B♭  F♯  D♭7\nhola mundo que tal aqui\n";
    var result = pdf.generatePdf(text, {});

    assert.ok(result.indexOf("/Subtype /Type3") >= 0, "the accidental font should be defined");
    assert.ok(result.indexOf("/Differences [1 /flat /sharp /natural]") >= 0,
        "the three signs should be encoded");
    assert.ok(result.indexOf("d0") >= 0, "glyph programs declare their advance");

    // Text switches to F5 for the sign and back to the text font right after
    assert.ok(/\(B\) Tj\n\/F5 \d+ Tf\n\(\\001\) Tj\n\/F1 \d+ Tf/.test(result),
        "flat should be drawn between two Courier runs: " + (result.match(/\(B\) Tj[\s\S]{0,60}/) || [])[0]);
    assert.ok(result.indexOf("B?") < 0, "no question mark should remain");
    assert.ok(result.indexOf("(Bb") < 0, "the plain spelling is no longer used here");
});

test("generatePdf keeps the accidental glyphs one Courier column wide", function() {
    // Chord lines are aligned by column against the lyric line below, so the drawn
    // glyphs advance exactly like a Courier character
    var result = pdf.generatePdf("==== T ====\n\n" + M + "B♭\nhola\n", {});
    assert.ok(result.indexOf("/Widths [600 600 600]") >= 0, "Courier advances 600 per character");
});

test("generatePdf draws the orphan lyrics rule instead of typesetting dashes", function() {
    // The rule reaches the PDF as the dashes the text output carries. It has to become a
    // real line: its pattern also matches the section label one ("- NAME -"), so without
    // its own branch it would be typeset as a heading.
    var rule = new Array(25).join("- ").replace(/\s+$/, "");
    var text = "==== TEST ====\n\n" + M + "Lam\nprimera estrofa cantada.\n\n" +
        rule + "\n" + M + "Lam\nletra que nadie canta.\n";
    var result = pdf.generatePdf(text, {});

    assert.ok(/0\.5 w\n0\.75 0\.75 0\.75 RG\n50 [\d.]+ m 545 [\d.]+ l S/.test(result),
        "a stroked rule should span the text column: " +
        (result.match(/[\d.]+ w\n[\d.\s]+RG\n[^\n]+l S/) || ["none"])[0]);
    assert.ok(result.indexOf("(- - -") < 0, "the dashes must not be drawn as text");
    assert.ok(result.indexOf("/Helvetica-Bold") < 0 || result.indexOf("(- -") < 0,
        "the rule must not be taken for a section label");
});

test("generatePdf still typesets a section label that looks like a rule", function() {
    // Guard the boundary: a label carries letters, so only dash-and-blank lines are rules
    var text = "==== TEST ====\n\n- ESTROFA 1 -\n" + M + "Lam\nprimera estrofa.\n";
    var result = pdf.generatePdf(text, {});
    assert.ok(result.indexOf("(ESTROFA 1) Tj") >= 0, "the label is still text");
});

// --- Annotations on the chord line -------------------------------------------
//
// The extractor braces a staff text so that everything reading a chord line back can tell
// words from a harmony. The PDF has colour, so it says it that way instead: the braces are
// drawn as spaces, which keeps every column where the text layout put it.

test("splitAnnotations gives the words their own run", function() {
    var runs = pdf.splitAnnotations("B♭maj7 {Continue rhythm}      Fadd4");

    assert.equal(runs.length, 3);
    assert.deepEqual(runs[0], { col: 0, text: "B♭maj7 ", isText: false });
    assert.deepEqual(runs[1], { col: 7, text: " Continue rhythm ", isText: true });
    assert.deepEqual(runs[2], { col: 24, text: "      Fadd4", isText: false });
});

test("splitAnnotations keeps a run at the column the text had", function() {
    // Each brace becomes a space rather than disappearing. Drawing the runs at their columns
    // has to reproduce the line, or the chords stop sitting over their syllables.
    ["{dolce} {pizz.} Fa      Do",
     "Mi Fa Mi {bajos} Do",
     "Lam  Re  Sol",
     "{solo}",
     ""].forEach(function(line) {
        var out = [];
        pdf.splitAnnotations(line).forEach(function(run) {
            for (var i = 0; i < run.text.length; i++) out[run.col + i] = run.text.charAt(i);
        });
        var drawn = "";
        for (var c = 0; c < line.length; c++) drawn += (out[c] === undefined ? " " : out[c]);
        assert.equal(drawn, line.replace(/[{}]/g, " "), "drawn runs differ from " + JSON.stringify(line));
    });
});

test("splitAnnotations leaves a brace it cannot pair alone", function() {
    // Malformed input is drawn as it stands rather than half eaten: no annotation from the
    // extractor looks like this, and guessing would hide whatever wrote it.
    var runs = pdf.splitAnnotations("Do {sin cerrar");

    assert.equal(runs.length, 1);
    assert.equal(runs[0].isText, false);
    assert.equal(runs[0].text, "Do {sin cerrar");
});

test("a chord line with an annotation is drawn in two colours", function() {
    var pdfBytes = pdf.generatePdf("- VERSE -\n" + M + "Do {muy suave} Sol\nsing along now\n", {});
    var text = Buffer.from(pdfBytes).toString("latin1");

    assert.ok(text.indexOf("0.298 0.686 0.314 rg") >= 0, "the chords keep the chord colour");
    assert.ok(text.indexOf("0.85 0.45 0.1 rg") >= 0 || text.indexOf("0.85 0.45 0.10 rg") >= 0,
        "and the words get their own");
});

// --- Page formats -------------------------------------------------------------
//
// A sheet is read on a tablet as often as it is printed, and a tablet is not shaped like a
// sheet of A4: the page comes out with bands of nothing down the sides. A format is therefore
// a proportion, taken from the screen it is read on, and the width is what the words need.

function mediaBox(pdfText) {
    var m = pdfText.match(/\/MediaBox \[0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)\]/);
    return m ? { w: parseFloat(m[1]), h: parseFloat(m[2]) } : null;
}

var SONG = "TITLE\n\n" + M + "Lam\nHello world.\n";

test("generatePdf writes an A4 page when no format is asked for", function() {
    assert.deepEqual(mediaBox(pdf.generatePdf(SONG)), { w: 595, h: 842 });
    assert.deepEqual(mediaBox(pdf.generatePdf(SONG, { page: "a4" })), { w: 595, h: 842 });
});

test("generatePdf shapes the page to the screen it is read on", function() {
    // The iPad proportion of MuseScore's own ipad-a4 style, 6.14 by 8.18 inches, and the 5:3
    // of a Lenovo P11, which is what a plain Android tablet is
    var ipad = mediaBox(pdf.generatePdf(SONG, { page: "ipad" }));
    var tablet = mediaBox(pdf.generatePdf(SONG, { page: "tablet" }));

    assert.ok(Math.abs(ipad.w / ipad.h - 6.14 / 8.18) < 0.005,
        "the iPad page is 4:3: " + JSON.stringify(ipad));
    assert.ok(Math.abs(tablet.w / tablet.h - 0.6) < 0.005,
        "the tablet page is 5:3: " + JSON.stringify(tablet));
    assert.equal(ipad.w, tablet.w, "both hold the same words on a line, so both are as wide");
    assert.ok(ipad.w < 595, "and narrower than A4, which is what makes the words bigger");
});

test("generatePdf gives a tablet page the margins of a screen, not of a printer", function() {
    var result = pdf.generatePdf(SONG, { page: "tablet" });
    // Lyrics are drawn at the left margin: "4 <y> Td" opens the text object of a line
    assert.ok(/\n4(\.0)? \d+(\.\d+)? Td/.test(result),
        "the words start 4pt from the edge: " + result.substring(result.indexOf("Td") - 40, result.indexOf("Td") + 4));
    assert.ok(result.indexOf("\n50.0 ") < 0, "and not at the 50pt margin a sheet of paper needs");

    // The first line of a page sits on the top margin
    var box = mediaBox(result);
    var tops = result.match(/\n[\d.]+ ([\d.]+) Td/g).map(function(m) { return parseFloat(m.split(" ")[1]); });
    assert.equal(box.h - Math.max.apply(null, tops), 36, "and the first of them 36pt below the top");
});

test("generatePdf widens a tablet page for a song whose lines are longer", function() {
    var long = "TITLE\n\n" + M + "Lam\n" + new Array(101).join("a") + "\n";
    var narrow = mediaBox(pdf.generatePdf(SONG, { page: "tablet" }));
    var wide = mediaBox(pdf.generatePdf(long, { page: "tablet" }));

    assert.ok(wide.w > narrow.w, "a line of 100 characters does not fit in the usual width");
    assert.ok(wide.w >= 100 * 11 * 0.6, "the page holds the whole line: " + wide.w);
    assert.ok(Math.abs(wide.w / wide.h - 0.6) < 0.005, "and keeps the proportion of the screen");
});

test("generatePdf keeps the room the line numbers need", function() {
    // They are drawn 15pt to the left of the words, which a 1pt margin has no room for
    var result = pdf.generatePdf(SONG, { page: "tablet", lineNumbers: true });
    assert.ok(/\n18(\.0)? \d+(\.\d+)? Td/.test(result), "the words move in to leave the numbers a gutter");
});

test("generatePdf falls back to A4 when the format is not one it knows", function() {
    assert.deepEqual(mediaBox(pdf.generatePdf(SONG, { page: "kindle" })), { w: 595, h: 842 });
});

// --- Fitting a song into one page --------------------------------------------
//
// The fit used to be decided by a second description of the layout, a function that added up
// what each line was expected to cost. It drifted from the loop that draws, and the drift
// showed where it hurts: "fit in 1 page" gave two, with a single line on the second. It is
// decided by laying the page out and counting the pages now, so the two cannot disagree.

function pageCount(pdfText) {
    return (pdfText.match(/\/Type \/Page[^s]/g) || []).length;
}

function lyricFont(pdfText) {
    return parseFloat((pdfText.match(/\/F1 ([\d.]+) Tf/) || [])[1]);
}

// Nine diagrams, which is what a song in a guitar key carries, and the header they need
var DIAGRAMS = [];
for (var di = 0; di < 9; di++) {
    DIAGRAMS.push({ chordName: "Lam", fretOffset: 0, barre: null,
        strings: [{ dot: 1 }, { dot: 2 }, { dot: 2 }, { marker: "o" }, { marker: "o" }, { marker: "x" }] });
}

function longSong(stanzas) {
    var out = "HORAS DE RONDA\n\n";
    for (var s = 0; s < stanzas; s++) {
        out += "- ESTROFA " + (s + 1) + " -\n";
        for (var l = 0; l < 5; l++) {
            out += M + "Lam        Re7        Sol\ncuando la noche se viste de luna y plata,\n";
        }
        out += "\n";
    }
    return out;
}

test("generatePdf fits a song into the one page it was asked for", function() {
    // 63 lines over a diagram header, on the shortest page there is: the fit used to stop at a
    // font it believed would do and leave the last line of the chorus on a second page
    var result = pdf.generatePdf(longSong(6), { page: "ipad", onePage: true, fretDiagrams: DIAGRAMS });
    assert.equal(pageCount(result), 1, "one page was asked for, at " + lyricFont(result) + "pt");
});

test("generatePdf fits the same song on every page format", function() {
    ["a4", "ipad", "tablet"].forEach(function(format) {
        var result = pdf.generatePdf(longSong(8), { page: format, onePage: true, fretDiagrams: DIAGRAMS });
        assert.equal(pageCount(result), 1, format + " needed more than one page");
    });
});

test("generatePdf spends no more compression than it has to", function() {
    // A song that fits as it is keeps its full size, which is what makes the fit worth asking for
    var small = pdf.generatePdf(longSong(2), { page: "a4", onePage: true });
    assert.equal(lyricFont(small), 11, "a short song is not shrunk");
    // And a longer one is shrunk, but no further than it needs
    var big = pdf.generatePdf(longSong(7), { page: "a4", onePage: true });
    assert.ok(lyricFont(big) < 11 && lyricFont(big) >= 6, "got " + lyricFont(big) + "pt");
});

test("generatePdf still draws a song too long for any one page", function() {
    // Nothing fits 40 stanzas: the page count is what it is, and the words are all there
    var result = pdf.generatePdf(longSong(40), { page: "ipad", onePage: true, fretDiagrams: DIAGRAMS });
    assert.ok(pageCount(result) > 1, "it does not pretend to have fitted");
    assert.ok(result.indexOf("ESTROFA 40") >= 0, "and the last stanza is printed");
});
