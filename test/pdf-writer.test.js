var test = require("node:test");
var assert = require("node:assert/strict");
var pdf = require("../lib/pdf-writer");

test("isChordLine detects solfeo chord lines", function() {
    assert.equal(pdf.isChordLine("Lam  Mi7  Lam"), true);
    assert.equal(pdf.isChordLine("     Fa#7  Sim"), true);
    assert.equal(pdf.isChordLine("Do"), true);
    assert.equal(pdf.isChordLine("Sol7"), true);
    assert.equal(pdf.isChordLine("Re  La7  Sol"), true);
});

test("isChordLine detects anglo chord lines", function() {
    assert.equal(pdf.isChordLine("Am  E7  Am"), true);
    assert.equal(pdf.isChordLine("F#7  Bm"), true);
    assert.equal(pdf.isChordLine("C  G  Am  F"), true);
});

test("isChordLine rejects lyric lines", function() {
    assert.equal(pdf.isChordLine("Mocita dame el clavel"), false);
    assert.equal(pdf.isChordLine("yo te traigo clavelitos"), false);
    assert.equal(pdf.isChordLine("En esta noche clara"), false);
    assert.equal(pdf.isChordLine(""), false);
});

test("isChordLine rejects title lines (ALL CAPS text)", function() {
    // "CLAVELITOS" has no chord pattern, just uppercase word
    assert.equal(pdf.isChordLine("CLAVELITOS"), false);
    assert.equal(pdf.isChordLine("EN ESTA NOCHE CLARA"), false);
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
    var result = pdf.generatePdf("TITLE\n\nLam\nHello world.\n");
    assert.ok(result.indexOf("%PDF-1.4") === 0, "should start with PDF header");
    assert.ok(result.indexOf("%%EOF") >= 0, "should end with EOF marker");
    assert.ok(result.indexOf("/Courier") >= 0, "should reference Courier font");
    assert.ok(result.indexOf("/Helvetica-Bold") >= 0, "should reference Helvetica-Bold");
});

test("generatePdf renders chord lines in green", function() {
    var result = pdf.generatePdf("TITLE\n\nLam  Mi7\nHello world.\n");
    // Green color command: 0.298 0.686 0.314 rg
    assert.ok(result.indexOf("0.298 0.686 0.314 rg") >= 0, "should have green color for chords");
    // Black color command: 0 0 0 rg
    assert.ok(result.indexOf("0 0 0 rg") >= 0, "should have black color for text");
});

test("generatePdf includes group header", function() {
    var result = pdf.generatePdf("TITLE\n\nLam\nHello.\n", { header: "Tuna de Alcala" });
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
        lines += "Lam\nLine " + i + " text.\n";
    }
    var result = pdf.generatePdf(lines, { onePage: true });
    var countMatch = result.match(/\/Count\s+(\d+)/);
    assert.ok(countMatch, "should have page count");
    assert.equal(parseInt(countMatch[1]), 1, "should fit on 1 page with onePage");
});

test("generatePdf without onePage uses multiple pages", function() {
    var lines = "TITLE\n\n";
    for (var i = 0; i < 40; i++) {
        lines += "Lam\nLine " + i + " text.\n";
    }
    var result = pdf.generatePdf(lines, { onePage: false });
    var countMatch = result.match(/\/Count\s+(\d+)/);
    assert.ok(countMatch, "should have page count");
    assert.ok(parseInt(countMatch[1]) >= 2, "should use multiple pages without onePage");
});

test("generatePdf with onePage falls back to multi-page when too long for min font", function() {
    var lines = "TITLE\n\n";
    for (var i = 0; i < 200; i++) {
        lines += "Lam\nLine number " + i + " of the song text here.\n";
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
        lines += "Lam\nLine " + i + " text.\n\n"; // extra blank line = stanza gap
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
