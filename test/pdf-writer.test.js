var test = require("node:test");
var assert = require("node:assert/strict");
var pdf = require("../lib/pdf-writer");
var fmt = require("../lib/formatter");

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

test("generatePdf includes group header", function() {
    var result = pdf.generatePdf("TITLE\n\n" + M + "Lam\nHello.\n", { header: "Tuna de Alcala" });
    assert.ok(result.indexOf("Tuna de Alcala") >= 0, "should contain group name");
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
        assert.equal(parseFloat(fontMatch[1]), 9, "font should stay at 9pt when gap reduction is enough");
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
    assert.ok(result.indexOf("/F1 7") >= 0, "should use 7pt font for line numbers (fontSize - 2)");
    assert.ok(result.indexOf("/F1 9") >= 0, "should use 9pt font for lyrics");
});

test("generatePdf lineNumbers default off when not specified", function() {
    var result = pdf.generatePdf("TITLE\n\n" + M + "Lam\nFirst line.\nSecond line.\n", {});
    // Should not contain gray color for line numbers
    var grayMatches = result.match(/0\.6 0\.6 0\.6 rg/g);
    assert.ok(!grayMatches, "line numbers should be off by default");
});
