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

// Draw a circle using 4 Bezier curves (PDF has no native circle operator)
// k = magic constant for approximating circle with cubic Bezier curves
function circleOperator(cx, cy, radius, fill, stroke) {
    var k = 0.5522848; // 4/3 * (sqrt(2) - 1)
    var r = radius;
    var kappa = r * k;
    
    var ops = "";
    ops += (cx + r).toFixed(2) + " " + cy.toFixed(2) + " m\n";
    ops += (cx + r).toFixed(2) + " " + (cy + kappa).toFixed(2) + " ";
    ops += (cx + kappa).toFixed(2) + " " + (cy + r).toFixed(2) + " ";
    ops += cx.toFixed(2) + " " + (cy + r).toFixed(2) + " c\n";
    ops += (cx - kappa).toFixed(2) + " " + (cy + r).toFixed(2) + " ";
    ops += (cx - r).toFixed(2) + " " + (cy + kappa).toFixed(2) + " ";
    ops += (cx - r).toFixed(2) + " " + cy.toFixed(2) + " c\n";
    ops += (cx - r).toFixed(2) + " " + (cy - kappa).toFixed(2) + " ";
    ops += (cx - kappa).toFixed(2) + " " + (cy - r).toFixed(2) + " ";
    ops += cx.toFixed(2) + " " + (cy - r).toFixed(2) + " c\n";
    ops += (cx + kappa).toFixed(2) + " " + (cy - r).toFixed(2) + " ";
    ops += (cx + r).toFixed(2) + " " + (cy - kappa).toFixed(2) + " ";
    ops += (cx + r).toFixed(2) + " " + cy.toFixed(2) + " c\n";
    
    if (fill) ops += "f\n";
    else if (stroke) ops += "S\n";
    
    return ops;
}

// Render a single fretboard diagram to PDF operators
// diagram: {chordName, strings: [{number, marker?, dot?, barre?}], fretOffset, barre}
// x, y: top-left corner position
function renderFretDiagram(diagram, x, y) {
    var REDUCTION_FACTOR = 0.85; // Global scaling factor for all diagram dimensions

    var DIAGRAM_W = 21.3 * REDUCTION_FACTOR;
    var STRING_SPACING = 4.5 * REDUCTION_FACTOR;
    var GRID_W = 5 * STRING_SPACING;
    var LABEL_SIZE = 7 * REDUCTION_FACTOR;
    var DOT_RADIUS = 1.2 * REDUCTION_FACTOR;
    var MARKER_SIZE = 2.5 * REDUCTION_FACTOR;
    var NUT_WIDTH_BASE = 1.2 * REDUCTION_FACTOR;
    var BARRE_HEIGHT = 2.4 * REDUCTION_FACTOR;

    // Determine number of frets to render:
    // - If fretOffset > 0: render exactly 4 frets (standard compact view with fret number)
    // - If fretOffset === 0: render numFrets frets (as many as specified in the diagram)
    var fretsToRender = diagram.fretOffset > 0 ? 4 : (diagram.numFrets || 4);
    var GRID_H = 26 * REDUCTION_FACTOR;
    var FRET_SPACING = GRID_H / fretsToRender;

    var stream = "";
    var gridX = x + (DIAGRAM_W - GRID_W) / 2;
    var gridY = y - 10;

    // 1. Chord name (left-aligned with grid)
    stream += "BT\n/F2 " + LABEL_SIZE + " Tf\n0 0 0 rg\n";
    stream += gridX.toFixed(2) + " " + y.toFixed(2) + " Td\n";
    stream += "(" + escPdfString(diagram.chordName) + ") Tj\nET\n";

    // 2. Fretboard grid (6 vertical strings, fretsToRender+1 horizontal fret lines)
    stream += "0.3 w\n0 0 0 RG\n";
    var NUT_WIDTH = diagram.fretOffset === 0 ? (NUT_WIDTH_BASE * REDUCTION_FACTOR) : 0.3;
    for (var s = 0; s < 6; s++) {
        var sx = gridX + s * STRING_SPACING;
        stream += sx.toFixed(2) + " " + (gridY + NUT_WIDTH / 2).toFixed(2) + " m ";
        stream += sx.toFixed(2) + " " + (gridY - GRID_H).toFixed(2) + " l S\n";
    }
    for (var f = 0; f <= fretsToRender; f++) {
        var fy = gridY - f * FRET_SPACING;
        var lw = (f === 0 && diagram.fretOffset === 0) ? NUT_WIDTH : 0.3;
        stream += lw + " w\n";
        stream += gridX.toFixed(2) + " " + fy.toFixed(2) + " m ";
        stream += (gridX + GRID_W).toFixed(2) + " " + fy.toFixed(2) + " l S\n";
    }

    // 3. Fret number (if not showing nut)
    if (diagram.fretOffset > 0) {
        stream += "BT\n/F2 " + (LABEL_SIZE - 1) + " Tf\n0.4 0.4 0.4 rg\n";
        stream += (gridX - 6).toFixed(2) + " " + (gridY - FRET_SPACING / 2 - 2).toFixed(2) + " Td\n";
        stream += "(" + (diagram.fretOffset + 1) + ") Tj\nET\n";
    }

    // 4. Barres (cejillas) - render first so dots appear on top
    if (diagram.barre) {
        var fretNum = diagram.barre.fret - diagram.fretOffset;
        if (fretNum >= 1 && fretNum <= fretsToRender) {
            var barreY = gridY - fretNum * FRET_SPACING + FRET_SPACING / 2;
            var startX = gridX + diagram.barre.start * STRING_SPACING;
            var endX = gridX + diagram.barre.end * STRING_SPACING;
            var barreWidth = endX - startX;
            var radius = BARRE_HEIGHT / 2;

            stream += "0 0 0 rg\n";
            stream += "q\n";
            stream += (startX + radius).toFixed(2) + " " + (barreY - radius).toFixed(2) + " ";
            stream += barreWidth - 2 * radius + " " + BARRE_HEIGHT + " re f\n";
            stream += circleOperator(startX + radius, barreY, radius, true, false);
            stream += circleOperator(endX - radius, barreY, radius, true, false);
            stream += "Q\n";
        }
    }

    // 5. String markers and dots
    for (var i = 0; i < diagram.strings.length; i++) {
        var str = diagram.strings[i];
        var stringX = gridX + str.number * STRING_SPACING;

        if (str.marker === "cross") {
            var markerY = gridY + 3;
            var mSize = MARKER_SIZE / 2;
            stream += "0.5 w\n0 0 0 RG\n";
            stream += (stringX - mSize).toFixed(2) + " " + (markerY + mSize).toFixed(2) + " m ";
            stream += (stringX + mSize).toFixed(2) + " " + (markerY - mSize).toFixed(2) + " l S\n";
            stream += (stringX - mSize).toFixed(2) + " " + (markerY - mSize).toFixed(2) + " m ";
            stream += (stringX + mSize).toFixed(2) + " " + (markerY + mSize).toFixed(2) + " l S\n";
        } else if (str.marker === "circle") {
            var markerY2 = gridY + 3;
            stream += "0.5 w\n0 0 0 RG\n";
            stream += circleOperator(stringX, markerY2, MARKER_SIZE / 2, false, true);
        } else if (str.dot) {
            var fretNum2 = str.dot.fret - diagram.fretOffset;
            if (fretNum2 >= 1 && fretNum2 <= fretsToRender) {
                var dotY = gridY - fretNum2 * FRET_SPACING + FRET_SPACING / 2;
                stream += "0 0 0 rg\n";
                stream += circleOperator(stringX, dotY, DOT_RADIUS, true, false);
            }
        }
    }

    return stream;
}

// Detect if a line is a chord line (all tokens look like chord symbols)
function isChordLine(line) {
    var trimmed = line.trim();
    if (!trimmed) return false;
    var tokens = trimmed.split(/\s+/);
    for (var i = 0; i < tokens.length; i++) {
        var t = tokens[i];
        // Solfeo: Do, Re, Mi, Fa, Sol, La, Si + optional accidental + modifiers
        // Anglo: A-G + optional accidental + modifiers
        if (t.length > 8) return false;
        if (!t.match(/^(Do|Re|Mi|Fa|Sol|La|Si|[A-G])[#b]?[a-zA-Z0-9+\-\/°ø()]*$/)) {
            return false;
        }
    }
    return true;
}

// A4 page dimensions in points
var PAGE_W = 595;
var PAGE_H = 842;
var MARGIN_L = 50;
var MARGIN_R = 50;
var MARGIN_T = 60;
var MARGIN_B = 50;

var FONT_SIZE_CHORD = 9;
var FONT_SIZE_LYRIC = 9;
var FONT_SIZE_TITLE = 18;
var FONT_SIZE_GROUP = 11;
var LINE_HEIGHT = 13;
var CHORD_TO_LYRIC_GAP = 9;  // tight gap between chord line and its lyric line
var STANZA_GAP = 10;
var TITLE_GAP = 24;

// Calculate total height needed for content with given scale factors
// scale: font/line scale, gapScale: extra reduction for stanza gaps and title gap
function calculateHeight(lines, options, scale, gapScale) {
    if (gapScale === undefined) gapScale = 1.0;
    var lineH = LINE_HEIGHT * scale;
    var chordGap = CHORD_TO_LYRIC_GAP * scale;
    var stanzaGap = STANZA_GAP * scale * gapScale;
    var titleGap = TITLE_GAP * scale * gapScale;
    var height = 0;

    if (options && options.header) height += 36; // header is NOT scaled

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

// Generate PDF from text output
// options: { header: string, onePage: boolean, lineNumbers: boolean }
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
    var MIN_MARGIN_B = 23; // ~0.8cm
    var actualMarginB = MARGIN_B;
    var availHeight = PAGE_H - MARGIN_T - actualMarginB;
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
            var marginSteps = [40, 30, MIN_MARGIN_B];
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
    if (options.fretDiagrams && options.fretDiagrams.length > 0) {
        diagramHeaderHeight = 64; // 75 * 0.85
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

    // Group header (right-aligned)
    if (options.header) {
        checkSpace(30 * scale);
        currentPage.push({
            type: "text-right", x: PAGE_W - MARGIN_R, y: y,
            font: "Helvetica", size: scaledFontGroup,
            color: "0.3 0.3 0.3", text: options.header
        });
        y -= 6 * scale;
        currentPage.push({
            type: "line",
            x1: MARGIN_L, y1: y,
            x2: PAGE_W - MARGIN_R, y2: y,
            width: 0.5
        });
        y -= 30 * scale;
    }

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
                if (!diagramsRendered && options.fretDiagrams && options.fretDiagrams.length > 0) {
                    checkSpace(diagramHeaderHeight);
                    var diagramY = y;
                    var diagramX = MARGIN_L;
                    var diagramSpacing = 24; // 28 * 0.85

                    for (var di = 0; di < options.fretDiagrams.length; di++) {
                        currentPage.push({
                            type: "fretboard",
                            x: diagramX,
                            y: diagramY,
                            diagram: options.fretDiagrams[di]
                        });
                        diagramX += diagramSpacing;

                        if (diagramX + diagramSpacing > PAGE_W - MARGIN_R) break;
                    }

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
            var numberText = lineNumber.toString();
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
                text: line
            });
        }
        y -= gap;
    }

    // Flush last page
    if (currentPage.length > 0) pages.push(currentPage);
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

    var fontMap = {
        "Courier": "F1",
        "Helvetica": "F2",
        "Helvetica-Bold": "F3"
    };
    var resources = "<< /Font << /F1 " + fontCourierNum + " 0 R /F2 " +
        fontHelvNum + " 0 R /F3 " + fontHelvBoldNum + " 0 R >> >>";

    // Create page objects and content streams
    var pageNums = [];
    for (var p = 0; p < pages.length; p++) {
        var cmds = pages[p];
        var stream = "";
        for (var c = 0; c < cmds.length; c++) {
            var cmd = cmds[c];
            if (cmd.type === "text" || cmd.type === "text-right") {
                var textX = cmd.x;
                if (cmd.type === "text-right") {
                    // Approximate text width for Helvetica: avg ~0.5 * fontSize per char
                    var approxWidth = cmd.text.length * cmd.size * 0.5;
                    textX = cmd.x - approxWidth;
                }
                stream += "BT\n";
                stream += "/" + fontMap[cmd.font] + " " + cmd.size + " Tf\n";
                stream += cmd.color + " rg\n";
                stream += textX.toFixed(1) + " " + cmd.y.toFixed(1) + " Td\n";
                stream += "(" + escPdfString(cmd.text) + ") Tj\n";
                stream += "ET\n";
            } else if (cmd.type === "line") {
                stream += cmd.width + " w\n";
                stream += "0.6 0.6 0.6 RG\n";
                stream += cmd.x1 + " " + cmd.y1.toFixed(1) + " m " +
                    cmd.x2 + " " + cmd.y2.toFixed(1) + " l S\n";
            } else if (cmd.type === "fretboard") {
                stream += renderFretDiagram(cmd.diagram, cmd.x, cmd.y);
            }
        }

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
}
