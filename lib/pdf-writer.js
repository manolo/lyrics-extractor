// Lyrics Extractor for MuseScore
// Copyright (C) 2026 Manolo Carrasco (do2tis)
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Licensed under the GNU General Public License version 3 or later, with an
// additional attribution requirement under section 7(b): see LICENSE and ATTRIBUTION.md.

// PDF generator for lyrics+chords output
// Generates raw PDF without external libraries
// Shared between MuseScore extension and Node.js CLI

// WinAnsi encoding map for accented characters (code points > 127)
var WIN_ANSI = {
    "\u00c0": 192, "\u00c1": 193, "\u00c2": 194, "\u00c3": 195, "\u00c4": 196,
    "\u00c7": 199, "\u00c8": 200, "\u00c9": 201, "\u00ca": 202, "\u00cb": 203,
    "\u00cc": 204, "\u00cd": 205, "\u00ce": 206, "\u00cf": 207,
    "\u00d1": 209, "\u00d2": 210, "\u00d3": 211, "\u00d4": 212, "\u00d5": 213,
    "\u00d6": 214, "\u00d9": 217, "\u00da": 218, "\u00db": 219, "\u00dc": 220,
    "\u00e0": 224, "\u00e1": 225, "\u00e2": 226, "\u00e3": 227, "\u00e4": 228,
    "\u00e7": 231, "\u00e8": 232, "\u00e9": 233, "\u00ea": 234, "\u00eb": 235,
    "\u00ec": 236, "\u00ed": 237, "\u00ee": 238, "\u00ef": 239,
    "\u00f1": 241, "\u00f2": 242, "\u00f3": 243, "\u00f4": 244, "\u00f5": 245,
    "\u00f6": 246, "\u00f9": 249, "\u00fa": 250, "\u00fb": 251, "\u00fc": 252,
    "\u2019": 146, "\u201c": 147, "\u201d": 148, "\u2026": 133,
    "\u00bf": 191, "\u00a1": 161, "\u00ab": 171, "\u00bb": 187
};

// Musicl accidentals are drawn by an embedded Type3 font: the base-14 fonts have no
// glyph for them in any encoding. Each one maps to a character code in that font.
var ACCIDENTAL_CODES = {
    "\u266d": 1,
    "\u266f": 2,
    "\u266e": 3
};

// Type3 glyph programs, in a 1000-unit em (the font matrix scales by 0.001). Every
// glyph declares the same advance as a Courier character, 600 units, so a chord line
// keeps its alignment with the lyric line under it whatever the font size.
var ACCIDENTAL_GLYPHS = [
    // 1: flat, as the text fonts draw it: a short stem with a hollow bowl that swells
    // to the right and tapers to a point at the foot of the stem. The bowl is one
    // filled path whose outer and inner edges meet at that point, so the counter is
    // the gap left between its inner edge and the stem.
    "600 0 d0\n" +
    "152 -25 43 650 re f\n" +
    "195 340 m 420 315 465 120 203 -25 c 345 130 318 235 195 245 c f\n",
    // 2: sharp, two stems crossed by two rising beams
    "600 0 d0\n" +
    "180 -70 42 690 re f\n" +
    "372 -70 42 690 re f\n" +
    "105 130 m 495 185 l 495 248 l 105 193 l f\n" +
    "105 340 m 495 395 l 495 458 l 105 403 l f\n",
    // 3: natural, a stem down on the left and up on the right, joined by two beams
    "600 0 d0\n" +
    "185 -60 45 540 re f\n" +
    "350 40 45 540 re f\n" +
    "185 100 m 395 140 l 395 205 l 185 165 l f\n" +
    "185 300 m 395 340 l 395 405 l 185 365 l f\n"
];

// Characters with no WinAnsi code and no glyph of their own, written with a plain
// spelling the base fonts can print. Accidentals appear here as a fallback for any
// path that draws text without the accidental font; each replacement is one
// character wide, so the chord line stays aligned with the lyric line below it.
var PLAIN_SPELLING = {
    "♭": "b",  // musical flat
    "♯": "#",  // musical sharp
    "♮": "n",  // musical natural
    "–": "-",  // en dash
    "—": "-",  // em dash
    " ": " "   // no-break space
};

// Escape string for PDF text operator, encoding to WinAnsi
function escPdfString(str) {
    var out = "";
    for (var i = 0; i < str.length; i++) {
        var ch = str[i];
        if (PLAIN_SPELLING[ch]) ch = PLAIN_SPELLING[ch];
        if (ch === "(" || ch === ")" || ch === "\\") {
            out += "\\" + ch;
        } else if (WIN_ANSI[ch]) {
            out += "\\" + WIN_ANSI[ch].toString(8).padStart(3, "0");
        } else {
            var code = ch.charCodeAt(0);
            if (code >= 32 && code <= 126) {
                out += ch;
            } else if (code > 126 && code <= 255) {
                out += "\\" + code.toString(8).padStart(3, "0");
            } else {
                out += "?";
            }
        }
    }
    return out;
}

// Emit the show-text operators for a string, switching to the accidental font for the
// characters the text font cannot print, then back to the text font.
// fontRes: resource name of the text font, accRes: resource name of the Type3 font.
// Without accRes the plain spellings of escPdfString are used instead.
function showTextOps(text, fontRes, size, accRes) {
    if (!accRes) return "(" + escPdfString(text) + ") Tj\n";

    var ops = "";
    var run = "";
    for (var i = 0; i < text.length; i++) {
        var code = ACCIDENTAL_CODES[text[i]];
        if (code === undefined) {
            run += text[i];
            continue;
        }
        if (run) { ops += "(" + escPdfString(run) + ") Tj\n"; run = ""; }
        ops += "/" + accRes + " " + size + " Tf\n";
        ops += "(\\" + ("00" + code.toString(8)).slice(-3) + ") Tj\n";
        ops += "/" + fontRes + " " + size + " Tf\n";
    }
    if (run) ops += "(" + escPdfString(run) + ") Tj\n";
    return ops;
}

// Fretboard rendering: imported from fretboard-renderer.js
var FretboardRenderer;
if (typeof require !== "undefined") {
    FretboardRenderer = require("./fretboard-renderer");
}
// In QML, FretboardRenderer is set via setFretboardRenderer() below
function setFretboardRenderer(mod) { FretboardRenderer = mod; }

// Zero-width space marker: prefixed by the formatter to chord lines.
// Detect and strip it to identify chord lines without heuristic guessing.
var CHORD_LINE_MARKER = "\u200B";

function isChordLine(line) {
    return line.length > 0 && line.charAt(0) === CHORD_LINE_MARKER;
}

function stripMarker(line) {
    return (line.charAt(0) === CHORD_LINE_MARKER) ? line.substring(1) : line;
}

// The rule above orphan lyrics: dashes and blanks only, drawn rather than typeset.
// Checked before section labels, whose pattern ("- NAME -") a rule also satisfies.
function isRuleLine(line) {
    if (!/^[-\s]+$/.test(line) || line.trim() === "") return false;
    return line.replace(/[^-]/g, "").length >= 8;
}

// A4 page dimensions in points
var PAGE_W = 595;
var PAGE_H = 842;
var MARGIN_L = 50;
var MARGIN_R = 50;
var MARGIN_T = 45;
var MARGIN_B = 20;
// Credit printed sideways along the right edge of every page
var CREDIT_TEXT = "Lyrics Extractor for MuseScore © M.Carrasco (do2tis)";
var CREDIT_PT = 5;
var CREDIT_RGB = "0.75 0.75 0.75";

var FONT_SIZE_CHORD = 11;
var FONT_SIZE_LYRIC = 11;
var FONT_SIZE_TITLE = 18;
var FONT_SIZE_GROUP = 8;
var LINE_HEIGHT = 13;
var CHORD_TO_LYRIC_GAP = 9;  // tight gap between chord line and its lyric line
var STANZA_GAP = 10;
var TITLE_GAP = 16;

// Calculate total height needed for content with given scale factors
// scale: font/line scale, gapScale: extra reduction for stanza gaps and title gap
function calculateHeight(lines, options, scale, gapScale) {
    if (gapScale === undefined) gapScale = 1.0;
    var lineH = LINE_HEIGHT * scale;
    var chordGap = CHORD_TO_LYRIC_GAP * scale;
    var stanzaGap = STANZA_GAP * scale * gapScale;
    var titleGap = TITLE_GAP * scale * gapScale;
    var height = 0;

    var firstNonEmpty = true;
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (line.trim() === "") { height += stanzaGap; continue; }
        if (firstNonEmpty) {
            firstNonEmpty = false;
            var titleText = line.trim().replace(/^====\s*/, "").replace(/\s*====\s*$/, "");
            if (titleText === titleText.toUpperCase() && titleText.length > 0 && !isChordLine(titleText)) {
                height += titleGap; continue;
            }
        }
        if (isRuleLine(line)) { height += lineH; continue; }
        if (line.trim().match(/^-\s+(.+?)\s+-$/)) { height += lineH + 4 * scale * gapScale; continue; }
        var isChord = isChordLine(line);
        var nextIsLyric = (i + 1 < lines.length) && lines[i + 1].trim() !== "" && !isChordLine(lines[i + 1]);
        height += (isChord && nextIsLyric) ? chordGap : lineH;
    }
    return height;
}

// Append the credit line, rotated 90 degrees and centred on the right edge.
// Courier advances 0.6em per character, so the run is 0.6 * size * length long.
function _appendCredit(buf, fMap) {
    var x = PAGE_W - 10;
    var y = (PAGE_H - CREDIT_TEXT.length * CREDIT_PT * 0.6) / 2;

    buf += "BT\n/" + fMap["Courier"] + " " + CREDIT_PT + " Tf\n";
    buf += CREDIT_RGB + " rg\n";
    buf += "0 1 -1 0 " + x.toFixed(1) + " " + y.toFixed(1) + " Tm\n";
    buf += "(" + escPdfString(CREDIT_TEXT) + ") Tj\nET\n";
    return buf;
}

// Generate PDF from text output
// options: { header: string, footer: string, onePage: boolean, lineNumbers: boolean }
function generatePdf(textOutput, options) {
    options = options || {};
    var lines = textOutput.split("\n");

    // Remove trailing empty lines
    while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
        lines.pop();
    }

    // Auto-fit to one page when onePage option is set.
    // Step 1: try reducing spacing (stanza/title gaps).
    // Step 2: try reducing bottom margin (down to 23pt = ~0.8cm).
    // Step 3: reduce font 1pt at a time.
    // Header is NEVER reduced.
    var MIN_MARGIN_B = 20; // ~7mm
    var actualMarginB = MARGIN_B;
    // Reserve space for fretboard diagram header if present
    var diagramReserve = 0;
    if (options.fretDiagrams && options.fretDiagrams.length > 0) {
        diagramReserve = FretboardRenderer ? FretboardRenderer.DIAGRAM_HEADER_HEIGHT : 64;
    }
    var availHeight = PAGE_H - MARGIN_T - actualMarginB - diagramReserve;
    var fontReduction = 0;
    var gapScale = 1.0;
    if (options.onePage) {
        // Find the least compression that fits: try all combinations of
        // font reduction (0-4pt) and gap scale (1.0, 0.7, 0.5, 0.3),
        // preferring less font reduction, then less gap reduction.
        var gapSteps = [1.0, 0.7, 0.5, 0.3];
        var fits = false;
        for (var tryReduce = 0; tryReduce <= 4 && !fits; tryReduce++) {
            var tryScale = (FONT_SIZE_LYRIC - tryReduce) / FONT_SIZE_LYRIC;
            for (var gi = 0; gi < gapSteps.length && !fits; gi++) {
                var h = calculateHeight(lines, options, tryScale, gapSteps[gi]);
                if (h <= availHeight) {
                    fontReduction = tryReduce;
                    gapScale = gapSteps[gi];
                    fits = true;
                }
            }
        }
        // Last resort: reduce bottom margin
        if (!fits) {
            fontReduction = 4;
            gapScale = 0.3;
            actualMarginB = MIN_MARGIN_B;
            availHeight = PAGE_H - MARGIN_T - actualMarginB - diagramReserve;
        }
    }
    var scale = (FONT_SIZE_LYRIC - fontReduction) / FONT_SIZE_LYRIC;

    // Calculate diagram header height if diagrams exist
    var diagramHeaderHeight = 0;
    var FR = FretboardRenderer; // shorthand
    if (options.fretDiagrams && options.fretDiagrams.length > 0) {
        diagramHeaderHeight = FR ? FR.DIAGRAM_HEADER_HEIGHT : 64;
    }

    var scaledLineHeight = LINE_HEIGHT * scale;
    var scaledChordGap = CHORD_TO_LYRIC_GAP * scale;
    var scaledStanzaGap = STANZA_GAP * scale * gapScale;
    var scaledTitleGap = TITLE_GAP * scale * gapScale;
    var scaledFontChord = FONT_SIZE_CHORD * scale;
    var scaledFontLyric = FONT_SIZE_LYRIC * scale;
    var scaledFontTitle = FONT_SIZE_TITLE * scale;
    var scaledFontGroup = FONT_SIZE_GROUP * scale;
    var scaledFontSection = FONT_SIZE_LYRIC * scale;

    // Build pages: each page is an array of draw commands
    var pages = [];
    var currentPage = [];
    var y = PAGE_H - MARGIN_T; // Start at top, no pre-reservation for diagrams

    function newPage() {
        if (currentPage.length > 0) pages.push(currentPage);
        currentPage = [];
        y = PAGE_H - MARGIN_T; // Reset to top on new page
    }

    function checkSpace(needed) {
        if (y - needed < actualMarginB) {
            newPage();
        }
    }

    // Pre-count lyric lines to know the width needed for right-aligned numbering
    var totalLyricLines = 0;
    if (options.lineNumbers) {
        for (var pi = 0; pi < lines.length; pi++) {
            var pl = lines[pi];
            if (pl.trim() === "") continue;
            if (pl.trim().match(/^-\s+(.+?)\s+-$/)) continue;
            if (isChordLine(pl)) continue;
            // Skip the title line (rendered separately, not numbered)
            if (pi === 0 || (pi > 0 && lines[pi].trim().indexOf("====") === 0)) continue;
            totalLyricLines++;
        }
    }
    var lineNumberWidth = totalLyricLines >= 100 ? 3 : (totalLyricLines >= 10 ? 2 : 1);

    // Process lines
    var firstNonEmpty = true;
    var diagramsRendered = false;
    var lineNumber = 1;
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];

        if (line.trim() === "") {
            y -= scaledStanzaGap;
            continue;
        }

        if (firstNonEmpty) {
            firstNonEmpty = false;
            var titleText = line.trim().replace(/^====\s*/, "").replace(/\s*====\s*$/, "");
            if (titleText === titleText.toUpperCase() && titleText.length > 0 && !isChordLine(titleText)) {
                checkSpace(scaledTitleGap);
                currentPage.push({
                    type: "text", x: MARGIN_L, y: y,
                    font: "Helvetica-Bold", size: scaledFontTitle,
                    color: "0 0 0", text: titleText
                });
                y -= scaledTitleGap;

                // Render fretboard diagrams after title, before lyrics
                if (!diagramsRendered && FR && options.fretDiagrams && options.fretDiagrams.length > 0) {
                    y -= 4; // extra gap between title and diagrams
                    checkSpace(diagramHeaderHeight);
                    var cmds = FR.placeDiagrams(options.fretDiagrams, MARGIN_L, y, PAGE_W - MARGIN_R);
                    for (var di = 0; di < cmds.length; di++) currentPage.push(cmds[di]);
                    y -= diagramHeaderHeight;
                    diagramsRendered = true;
                }
                continue;
            }
        }

        if (isRuleLine(line)) {
            checkSpace(scaledLineHeight);
            var ruleY = y + scaledFontLyric / 3;
            currentPage.push({
                type: "line",
                x1: MARGIN_L, y1: ruleY,
                x2: PAGE_W - MARGIN_R, y2: ruleY,
                width: 0.5,
                color: "0.75 0.75 0.75"
            });
            y -= scaledLineHeight;
            continue;
        }

        var sectionMatch = line.trim().match(/^-\s+(.+?)\s+-$/);
        if (sectionMatch) {
            checkSpace(scaledLineHeight + 4 * scale * gapScale);
            y -= 4 * scale * gapScale;
            currentPage.push({
                type: "text", x: MARGIN_L, y: y,
                font: "Helvetica-Bold", size: scaledFontSection,
                color: "0.3 0.3 0.3", text: sectionMatch[1]
            });
            y -= scaledLineHeight;
            continue;
        }

        var isChord = isChordLine(line);
        var nextIsLyric = (i + 1 < lines.length) && lines[i + 1].trim() !== "" && !isChordLine(lines[i + 1]);
        var gap = (isChord && nextIsLyric) ? scaledChordGap : scaledLineHeight;
        checkSpace(gap);

        // Add line numbers for lyrics when option is enabled
        if (options.lineNumbers && !isChord) {
            var numberSize = scaledFontLyric - 2;
            // Right-align: pad with leading spaces to lineNumberWidth so the
            // last digit always sits at the same column.
            var numberText = lineNumber.toString();
            while (numberText.length < lineNumberWidth) numberText = " " + numberText;
            // Position number in the left margin, outside the text flow
            var numberX = MARGIN_L - 15; // 15pt to the left of text margin
            currentPage.push({
                type: "text",
                x: numberX,
                y: y,
                font: "Courier",
                size: numberSize,
                color: "0.6 0.6 0.6",
                text: numberText
            });
            currentPage.push({
                type: "text",
                x: MARGIN_L,
                y: y,
                font: "Courier",
                size: scaledFontLyric,
                color: "0 0 0",
                text: line
            });
            lineNumber++;
        } else {
            currentPage.push({
                type: "text", x: MARGIN_L, y: y,
                font: "Courier", size: isChord ? scaledFontChord : scaledFontLyric,
                color: isChord ? "0.298 0.686 0.314" : "0 0 0",
                text: stripMarker(line)
            });
        }
        y -= gap;
    }

    // Flush last page
    if (currentPage.length > 0) pages.push(currentPage);

    // Header (right-aligned at top of every page)
    if (options.header) {
        for (var hi = 0; hi < pages.length; hi++) {
            pages[hi].push({
                type: "text-right", x: PAGE_W - MARGIN_R, y: PAGE_H - MARGIN_T + scaledFontGroup + 4,
                font: "Helvetica-Oblique", size: scaledFontGroup,
                color: "0.5 0.5 0.5", text: options.header
            });
        }
    }

    // Footer (centered at bottom of every page, with separator line above)
    if (options.footer) {
        var footerY = 10;
        var lineY = footerY + scaledFontGroup + 1;
        for (var fi = 0; fi < pages.length; fi++) {
            pages[fi].push({
                type: "line",
                x1: MARGIN_L / 2, y1: lineY,
                x2: PAGE_W - 10, y2: lineY,
                width: 0.25,
                color: "0.75 0.75 0.75"
            });
            pages[fi].push({
                type: "text-center", x: PAGE_W / 2, y: footerY,
                font: "Helvetica-Oblique", size: scaledFontGroup,
                color: "0.65 0.65 0.65", text: options.footer
            });
        }
    }
    if (pages.length === 0) pages.push([]);

    // Build PDF objects
    var objects = [];
    var objOffsets = [];

    function addObj(content) {
        var num = objects.length + 1;
        objects.push(content);
        return num;
    }

    // 1: Catalog
    var catalogNum = addObj(null); // placeholder
    // 2: Pages
    var pagesNum = addObj(null); // placeholder
    // 3: Font Courier
    var fontCourierNum = addObj(
        "<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>"
    );
    // 4: Font Helvetica
    var fontHelvNum = addObj(
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"
    );
    // 5: Font Helvetica-Bold
    var fontHelvBoldNum = addObj(
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"
    );
    // 6: Font Helvetica-Oblique
    var fontHelvObliqueNum = addObj(
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>"
    );

    // 7+: accidental font. A Type3 font carries its glyphs as content streams, so the
    // flat, sharp and natural signs are drawn rather than taken from a font file, and
    // nothing has to be embedded or shipped with the extension.
    var glyphNums = [];
    for (var g = 0; g < ACCIDENTAL_GLYPHS.length; g++) {
        glyphNums.push(addObj(
            "<< /Length " + ACCIDENTAL_GLYPHS[g].length + " >>\nstream\n" +
            ACCIDENTAL_GLYPHS[g] + "endstream"
        ));
    }
    var fontAccNum = addObj(
        "<< /Type /Font /Subtype /Type3" +
        " /FontBBox [0 -70 500 740]" +
        " /FontMatrix [0.001 0 0 0.001 0 0]" +
        " /CharProcs << /flat " + glyphNums[0] + " 0 R /sharp " + glyphNums[1] +
        " 0 R /natural " + glyphNums[2] + " 0 R >>" +
        " /Encoding << /Type /Encoding /Differences [1 /flat /sharp /natural] >>" +
        " /FirstChar 1 /LastChar 3 /Widths [600 600 600]" +
        " /Resources << >> >>"
    );

    var fontMap = {
        "Courier": "F1",
        "Helvetica": "F2",
        "Helvetica-Bold": "F3",
        "Helvetica-Oblique": "F4"
    };
    var ACC_RES = "F5";
    var resources = "<< /Font << /F1 " + fontCourierNum + " 0 R /F2 " +
        fontHelvNum + " 0 R /F3 " + fontHelvBoldNum + " 0 R /F4 " +
        fontHelvObliqueNum + " 0 R /F5 " + fontAccNum + " 0 R >> >>";

    // Create page objects and content streams
    var pageNums = [];
    for (var p = 0; p < pages.length; p++) {
        var cmds = pages[p];
        var stream = "";
        for (var c = 0; c < cmds.length; c++) {
            var cmd = cmds[c];
            if (cmd.type === "text" || cmd.type === "text-right" || cmd.type === "text-center") {
                var textX = cmd.x;
                if (cmd.type === "text-right") {
                    var approxWidth = cmd.text.length * cmd.size * 0.5;
                    textX = cmd.x - approxWidth;
                } else if (cmd.type === "text-center") {
                    var approxWidth = cmd.text.length * cmd.size * 0.5;
                    textX = cmd.x - approxWidth / 2;
                }
                stream += "BT\n";
                stream += "/" + fontMap[cmd.font] + " " + cmd.size + " Tf\n";
                stream += cmd.color + " rg\n";
                stream += textX.toFixed(1) + " " + cmd.y.toFixed(1) + " Td\n";
                stream += showTextOps(cmd.text, fontMap[cmd.font], cmd.size, ACC_RES);
                stream += "ET\n";
            } else if (cmd.type === "line") {
                stream += cmd.width + " w\n";
                stream += (cmd.color || "0.6 0.6 0.6") + " RG\n";
                stream += cmd.x1 + " " + cmd.y1.toFixed(1) + " m " +
                    cmd.x2 + " " + cmd.y2.toFixed(1) + " l S\n";
            } else if (cmd.type === "fretboard" && FR) {
                stream += FR.renderFretDiagram(cmd.diagram, cmd.x, cmd.y, escPdfString, {
                    accidentalFont: ACC_RES,
                    showTextOps: showTextOps
                });
            }
        }

        stream = _appendCredit(stream, fontMap);

        var streamNum = addObj(
            "<< /Length " + stream.length + " >>\nstream\n" + stream + "endstream"
        );
        var pageNum = addObj(
            "<< /Type /Page /Parent " + pagesNum + " 0 R " +
            "/MediaBox [0 0 " + PAGE_W + " " + PAGE_H + "] " +
            "/Contents " + streamNum + " 0 R " +
            "/Resources " + resources + " >>"
        );
        pageNums.push(pageNum);
    }

    // Fill in catalog and pages
    objects[catalogNum - 1] = "<< /Type /Catalog /Pages " + pagesNum + " 0 R >>";
    var kids = pageNums.map(function(n) { return n + " 0 R"; }).join(" ");
    objects[pagesNum - 1] = "<< /Type /Pages /Kids [" + kids + "] /Count " + pages.length + " >>";

    // Serialize PDF
    var pdf = "%PDF-1.4\n";
    for (var o = 0; o < objects.length; o++) {
        objOffsets.push(pdf.length);
        pdf += (o + 1) + " 0 obj\n" + objects[o] + "\nendobj\n";
    }

    // Xref table
    var xrefOffset = pdf.length;
    pdf += "xref\n0 " + (objects.length + 1) + "\n";
    pdf += "0000000000 65535 f \n";
    for (var x = 0; x < objOffsets.length; x++) {
        pdf += objOffsets[x].toString().padStart(10, "0") + " 00000 n \n";
    }

    // Trailer
    pdf += "trailer\n<< /Size " + (objects.length + 1) + " /Root " + catalogNum + " 0 R >>\n";
    pdf += "startxref\n" + xrefOffset + "\n%%EOF\n";

    return pdf;
}

if (typeof exports !== "undefined") {
    exports.generatePdf = generatePdf;
    exports.isChordLine = isChordLine;
    exports.escPdfString = escPdfString;
    exports.setFretboardRenderer = setFretboardRenderer;
}
