// Fretboard diagram rendering for PDF output
// Isolated module: all fretboard diagram rendering logic lives here.
// To remove fretboard diagram support, delete this file and remove its
// import from pdf-writer.js and LyricsForm.qml.

// Draw a circle using 4 Bezier curves (PDF has no native circle operator)
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

// Render a single fretboard diagram to PDF stream operators.
// diagram: {chordName, strings: [{number, marker?, dot?}], fretOffset, numFrets, barre}
// x, y: top-left corner position
// escPdfString: function to escape text for PDF (injected from pdf-writer)
function renderFretDiagram(diagram, x, y, escPdfString) {
    var REDUCTION_FACTOR = 0.85;

    var DIAGRAM_W = 21.3 * REDUCTION_FACTOR;
    var STRING_SPACING = 4.5 * REDUCTION_FACTOR;
    var GRID_W = 5 * STRING_SPACING;
    var LABEL_SIZE = 7 * REDUCTION_FACTOR;
    var DOT_RADIUS = 1.2 * REDUCTION_FACTOR;
    var MARKER_SIZE = 2.5 * REDUCTION_FACTOR;
    var NUT_WIDTH_BASE = 1.2 * REDUCTION_FACTOR;
    var BARRE_HEIGHT = 2.4 * REDUCTION_FACTOR;

    var fretsToRender = diagram.fretOffset > 0 ? 4 : (diagram.numFrets || 4);
    var FRET_SPACING = 6.5 * REDUCTION_FACTOR;
    var GRID_H = FRET_SPACING * fretsToRender;

    var stream = "";
    var gridX = x + (DIAGRAM_W - GRID_W) / 2;
    var gridY = y - 10;

    // 1. Chord name (left-aligned with grid)
    stream += "BT\n/F2 " + LABEL_SIZE + " Tf\n0 0 0 rg\n";
    stream += gridX.toFixed(2) + " " + y.toFixed(2) + " Td\n";
    stream += "(" + escPdfString(diagram.chordName) + ") Tj\nET\n";

    // 2. Fretboard grid
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
        stream += "BT\n/F3 " + LABEL_SIZE + " Tf\n0 0 0 rg\n";
        stream += (gridX - 4).toFixed(2) + " " + (gridY - FRET_SPACING + 1).toFixed(2) + " Td\n";
        stream += "(" + (diagram.fretOffset + 1) + ") Tj\nET\n";
    }

    // 4. Barres (cejillas)
    if (diagram.barre) {
        var fretNum = diagram.barre.fret;
        if (fretNum >= 1 && fretNum <= fretsToRender) {
            var barreY = gridY - fretNum * FRET_SPACING + FRET_SPACING / 2;
            var startX = gridX + diagram.barre.start * STRING_SPACING;
            var barreEndIndex = diagram.barre.end === -1 ? 5 : diagram.barre.end;
            var endX = gridX + barreEndIndex * STRING_SPACING;
            var barreWidth = endX - startX;
            var radius = BARRE_HEIGHT / 2;

            stream += "0 0 0 rg\n";
            stream += "q\n";
            stream += (startX + radius).toFixed(2) + " " + (barreY - radius).toFixed(2) + " ";
            stream += (barreWidth - 2 * radius).toFixed(2) + " " + BARRE_HEIGHT.toFixed(2) + " re f\n";
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
            var fretNum2 = str.dot.fret;
            if (fretNum2 >= 1 && fretNum2 <= fretsToRender) {
                var dotY = gridY - fretNum2 * FRET_SPACING + FRET_SPACING / 2;
                stream += "0 0 0 rg\n";
                stream += circleOperator(stringX, dotY, DOT_RADIUS, true, false);
            }
        }
    }

    return stream;
}

// Height reserved for fretboard diagram header in PDF (in points)
var DIAGRAM_HEADER_HEIGHT = 56;

// Diagram spacing between centers (horizontal)
var DIAGRAM_SPACING = 28;

// Build placement commands for fretboard diagrams.
// Returns array of {type: "fretboard", x, y, diagram} for the PDF page.
function placeDiagrams(diagrams, startX, startY, maxWidth) {
    var commands = [];
    var x = startX;
    for (var i = 0; i < diagrams.length; i++) {
        commands.push({ type: "fretboard", x: x, y: startY, diagram: diagrams[i] });
        x += DIAGRAM_SPACING;
        if (x + DIAGRAM_SPACING > maxWidth) break;
    }
    return commands;
}

if (typeof exports !== "undefined") {
    exports.renderFretDiagram = renderFretDiagram;
    exports.placeDiagrams = placeDiagrams;
    exports.DIAGRAM_HEADER_HEIGHT = DIAGRAM_HEADER_HEIGHT;
    exports.DIAGRAM_SPACING = DIAGRAM_SPACING;
}
