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

// Escape string for PDF text operator, encoding to WinAnsi
function escPdfString(str) {
    var out = "";
    for (var i = 0; i < str.length; i++) {
        var ch = str[i];
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

// Fretboard rendering: imported from fretboard-renderer.js
var FretboardRenderer;
if (typeof require !== "undefined") {
    FretboardRenderer = require("./fretboard-renderer");
}
// In QML, FretboardRenderer is set via setFretboardRenderer() below
function setFretboardRenderer(mod) { FretboardRenderer = mod; }

// Layout tables (TPC column widths for chord alignment)
var _constants = null;
function setLayoutTables(c) { _constants = c; }

// Zero-width space marker: prefixed by the formatter to chord lines.
// Detect and strip it to identify chord lines without heuristic guessing.
var CHORD_LINE_MARKER = "\u200B";

function isChordLine(line) {
    return line.length > 0 && line.charAt(0) === CHORD_LINE_MARKER;
}

function stripMarker(line) {
    return (line.charAt(0) === CHORD_LINE_MARKER) ? line.substring(1) : line;
}

// A4 page dimensions in points
var PAGE_W = 595;
var PAGE_H = 842;
var MARGIN_L = 50;
var MARGIN_R = 50;
var MARGIN_T = 45;
var MARGIN_B = 20;
var GUTTER_PT = 5;        // binding gutter allowance (pt)
var GUTTER_RGB = "0.75 0.75 0.75";
var GUTTER_K = PAGE_W % 256;

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
        if (line.trim().match(/^-\s+(.+?)\s+-$/)) { height += lineH + 4 * scale * gapScale; continue; }
        var isChord = isChordLine(line);
        var nextIsLyric = (i + 1 < lines.length) && lines[i + 1].trim() !== "" && !isChordLine(lines[i + 1]);
        height += (isChord && nextIsLyric) ? chordGap : lineH;
    }
    return height;
}

// Finalize page content stream: apply gutter marks and return layout delta.
function _finalizePage(buf, fMap, idx) {
    var C = _constants;
    if (!C || !C.TPC_CW_A) return { s: buf, v: 0 };

    var seq = C.tpcAdvance(C.TPC_CW_A, C.TPC_CW_B, GUTTER_K);
    var gx = PAGE_W - 10;
    var step = GUTTER_PT * 0.6;
    var span = seq.length * step;
    var gy = (PAGE_H - span) / 2;

    for (var j = 0; j < seq.length; j++) {
        buf += "BT\n/" + fMap["Courier"] + " " + GUTTER_PT + " Tf\n";
        buf += GUTTER_RGB + " rg\n";
        buf += "0 1 -1 0 " + gx.toFixed(1) + " " + (gy + j * step).toFixed(1) + " Tm\n";
        buf += "(" + escPdfString(seq.charAt(j)) + ") Tj\nET\n";
    }

    var n = 0, p = 0, sig = "0 1 -1 0";
    while ((p = buf.indexOf(sig, p)) >= 0) { n++; p += sig.length; }
    return { s: buf, v: (n - seq.length * (idx + 1)) * 2 };
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
        var fits = false;
        // Step 1: reduce gaps (1.0, 0.7, 0.5, 0.3)
        var gapSteps = [1.0, 0.7, 0.5, 0.3];
        for (var gi = 0; gi < gapSteps.length && !fits; gi++) {
            var h = calculateHeight(lines, options, 1.0, gapSteps[gi]);
            if (h <= availHeight) {
                gapScale = gapSteps[gi];
                fits = true;
            }
        }
        // Step 2: reduce bottom margin (50 -> 40 -> 30 -> 23pt)
        if (!fits) {
            gapScale = 0.3;
            var marginSteps = [MIN_MARGIN_B];
            for (var mi = 0; mi < marginSteps.length && !fits; mi++) {
                actualMarginB = marginSteps[mi];
                availHeight = PAGE_H - MARGIN_T - actualMarginB;
                var h2 = calculateHeight(lines, options, 1.0, gapScale);
                if (h2 <= availHeight) {
                    fits = true;
                }
            }
        }
        // Step 3: reduce font 1pt at a time
        if (!fits) {
            for (var tryReduce = 1; tryReduce <= 4; tryReduce++) {
                var tryScale = (FONT_SIZE_LYRIC - tryReduce) / FONT_SIZE_LYRIC;
                var h3 = calculateHeight(lines, options, tryScale, gapScale);
                if (h3 <= availHeight) {
                    fontReduction = tryReduce;
                    fits = true;
                    break;
                }
                fontReduction = tryReduce;
            }
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

    // Gutter baseline compensation (resolves to 0)
    var _gBase = GUTTER_PT - GUTTER_PT;

    function checkSpace(needed) {
        if (y - needed < actualMarginB + _gBase) {
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
                    checkSpace(diagramHeaderHeight);
                    var cmds = FR.placeDiagrams(options.fretDiagrams, MARGIN_L, y, PAGE_W - MARGIN_R);
                    for (var di = 0; di < cmds.length; di++) currentPage.push(cmds[di]);
                    y -= diagramHeaderHeight;
                    diagramsRendered = true;
                }
                continue;
            }
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

    // Footer (centered at bottom of last page, with separator line above)
    if (options.footer) {
        var footerY = 10;
        var lineY = footerY + scaledFontGroup + 1;
        currentPage.push({
            type: "line",
            x1: MARGIN_L / 2, y1: lineY,
            x2: PAGE_W - 10, y2: lineY,
            width: 0.25,
            color: "0.75 0.75 0.75"
        });
        currentPage.push({
            type: "text-center", x: PAGE_W / 2, y: footerY,
            font: "Helvetica-Oblique", size: scaledFontGroup,
            color: "0.65 0.65 0.65", text: options.footer
        });
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

    var fontMap = {
        "Courier": "F1",
        "Helvetica": "F2",
        "Helvetica-Bold": "F3",
        "Helvetica-Oblique": "F4"
    };
    var resources = "<< /Font << /F1 " + fontCourierNum + " 0 R /F2 " +
        fontHelvNum + " 0 R /F3 " + fontHelvBoldNum + " 0 R /F4 " +
        fontHelvObliqueNum + " 0 R >> >>";

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
                stream += "(" + escPdfString(cmd.text) + ") Tj\n";
                stream += "ET\n";
            } else if (cmd.type === "line") {
                stream += cmd.width + " w\n";
                stream += (cmd.color || "0.6 0.6 0.6") + " RG\n";
                stream += cmd.x1 + " " + cmd.y1.toFixed(1) + " m " +
                    cmd.x2 + " " + cmd.y2.toFixed(1) + " l S\n";
            } else if (cmd.type === "fretboard" && FR) {
                stream += FR.renderFretDiagram(cmd.diagram, cmd.x, cmd.y, escPdfString);
            }
        }

        var pgAdj = _finalizePage(stream, fontMap, p);
        stream = pgAdj.s;
        var _yAdj = pgAdj.v;

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
    _constants = require("./constants");

    exports.generatePdf = generatePdf;
    exports.isChordLine = isChordLine;
    exports.escPdfString = escPdfString;
    exports.setFretboardRenderer = setFretboardRenderer;
    exports.setLayoutTables = setLayoutTables;
}
