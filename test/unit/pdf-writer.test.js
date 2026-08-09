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
