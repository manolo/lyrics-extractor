// FretDiagram chord extraction fallback
//
// WORKAROUND: MuseScore 4 QML API does not expose the nested Harmony element
// inside FretDiagram objects. This module extracts chords by reading the .mscz
// file from disk using tar (built-in on macOS/Linux/Windows 10+) or node.
//
// TO REMOVE THIS HACK: If a future MuseScore version exposes FretDiagram.harmony
// in the QML plugin API, delete this file along with:
//   - extractors/xml-chord-reader.js
//   - cli/extract-chords.js
// And remove the import + call from ui/LyricsForm.qml

// Check if fallback is needed:
// 1. FretDiagram annotations in measures with unextracted chords (QML API limitation)
// 2. FBox frame with fret diagrams detected (need to extract diagram data for PDF)
function needsFallback(debugData) {
    if (!debugData) {
        console.log("[fallback] needsFallback: NO (no debugData)");
        return false;
    }

    // Case 1: FretDiagram chord annotations that QML API could not read
    var fd = debugData.fretDiagramDebug;
    var unextracted = 0;
    var totalFD = 0;
    if (fd && fd.fretDiagramsFound && fd.fretDiagramsFound.length > 0) {
        totalFD = fd.fretDiagramsFound.length;
        for (var i = 0; i < totalFD; i++) {
            if (!fd.fretDiagramsFound[i].extracted) unextracted++;
        }
    }

    var hasFBox = !!debugData.hasFretBox;
    var need = (unextracted > 0) || hasFBox;
    console.log("[fallback] needsFallback: " + (need ? "YES" : "NO") +
                " (FretDiagrams=" + totalFD + ", unextracted=" + unextracted +
                ", FBox=" + hasFBox + ")");
    return need;
}

// Find the .mscz file on disk by scoreName, inside a user-configured directory.
// See specs/11-scores-directory.md.
// Search order: <dir>/<name>/<name>.mscz, <dir>/<name>.mscz, recursive find inside <dir>.
function _findScorePath(scoreName, fileIO, process, scoresDirectory) {
    console.log("[fallback] _findScorePath: scoreName='" + scoreName +
                "', scoresDirectory='" + scoresDirectory + "'");
    if (!process) {
        console.log("[fallback] _findScorePath: ABORT (no process)");
        return "";
    }
    if (!scoresDirectory) {
        console.log("[fallback] _findScorePath: ABORT (no scoresDirectory)");
        return "";
    }

    var isWindows = (typeof Qt !== "undefined" && Qt.platform && Qt.platform.os === "windows");
    var sep = isWindows ? "\\" : "/";
    var fileName = scoreName + ".mscz";

    // 1. Per-song folder convention: <dir>/<name>/<name>.mscz
    var p1 = scoresDirectory + sep + scoreName + sep + fileName;
    fileIO.source = p1;
    if (fileIO.exists()) {
        console.log("[fallback] _findScorePath: FOUND (per-song folder): " + p1);
        return p1;
    }
    console.log("[fallback] _findScorePath: not at " + p1);

    // 2. Flat: <dir>/<name>.mscz
    var p2 = scoresDirectory + sep + fileName;
    fileIO.source = p2;
    if (fileIO.exists()) {
        console.log("[fallback] _findScorePath: FOUND (flat): " + p2);
        return p2;
    }
    console.log("[fallback] _findScorePath: not at " + p2);

    // 3. Recursive search inside scoresDirectory only
    console.log("[fallback] _findScorePath: trying recursive search in " + scoresDirectory);
    if (isWindows) {
        try {
            process.startWithArgs("where", ["/r", scoresDirectory, fileName]);
            process.waitForFinished(5000);
            var w = process.readAllStandardOutput();
            var wf = w ? w.toString().trim().split("\r\n")[0] : "";
            if (wf) {
                console.log("[fallback] _findScorePath: FOUND (where): " + wf);
                return wf;
            }
        } catch (e) {
            console.log("[fallback] _findScorePath: where failed: " + e);
        }
    } else {
        try {
            process.startWithArgs("find", [
                scoresDirectory, "-name", fileName, "-not", "-path", "*/.*"
            ]);
            process.waitForFinished(5000);
            var o = process.readAllStandardOutput();
            var f = o ? o.toString().trim().split("\n")[0] : "";
            if (f) {
                console.log("[fallback] _findScorePath: FOUND (find): " + f);
                return f;
            }
        } catch (e) {
            console.log("[fallback] _findScorePath: find failed: " + e);
        }
    }

    console.log("[fallback] _findScorePath: NOT FOUND");
    return "";
}

// Extract chords (and fretDiagrams) from the .mscz file on disk.
// opts: { scoreName, fileIO, process, XmlChordReader, Constants, cliPath, data, scoresDirectory, spelling, noDiagrams }
// Returns: array of {tick, chord} or null if fallback failed/not needed.
// Side effect: sets opts.data.fretDiagrams and opts.data.scorePath when available.
function extractChords(opts) {
    console.log("[fallback] extractChords: START scoreName='" + opts.scoreName + "'");
    var scorePath = _findScorePath(opts.scoreName, opts.fileIO, opts.process, opts.scoresDirectory);
    if (!scorePath) {
        console.log("[fallback] extractChords: ABORT score not found for '" + opts.scoreName + "'");
        return null;
    }
    if (opts.data) opts.data.scorePath = scorePath;
    console.log("[fallback] extractChords: using scorePath=" + scorePath);

    var chords = null;

    // Strategy 1: tar extracts .mscx to stdout, parse in QML (no external dependencies)
    try {
        var mscxName = opts.scoreName + ".mscx";
        console.log("[fallback] tar: extracting " + mscxName + " from " + scorePath);
        opts.process.startWithArgs("tar", ["xf", scorePath, "-O", mscxName]);
        opts.process.waitForFinished(10000);
        var tarOutput = opts.process.readAllStandardOutput();
        var xml = tarOutput ? tarOutput.toString() : "";
        console.log("[fallback] tar: read " + xml.length + " bytes");

        if (xml.length > 100 && xml.indexOf("<museScore") > -1) {
            var xmlChords = opts.XmlChordReader.extractChords(xml, opts.Constants, opts.spelling);
            console.log("[fallback] tar: parsed " + xmlChords.length + " chords from XML");
            if (xmlChords.length > 0) {
                chords = xmlChords;
                if (opts.data) {
                    opts.data.fretDiagrams = opts.XmlChordReader.extractFretDiagrams(xml);
                }
                var fdCount = (opts.data && opts.data.fretDiagrams) ? opts.data.fretDiagrams.length : 0;
                console.log("[fallback] tar: OK " + chords.length + " chords, " + fdCount + " fretDiagrams");
            } else {
                console.log("[fallback] tar: no chords found in XML");
            }
        } else {
            console.log("[fallback] tar: invalid XML output (no <museScore> tag)");
        }
    } catch (e) {
        console.log("[fallback] tar: FAILED " + e);
    }

    // Strategy 2: node extract-chords.js (requires Node.js installed)
    // Used when:
    //  - tar failed to extract chords, OR
    //  - the score has FBox + the user wants diagrams in PDF, and tar found no diagrams
    //    (FBox diagrams typically live in guitar excerpts, which tar can't reach)
    var fdCountSoFar = (opts.data && opts.data.fretDiagrams) ? opts.data.fretDiagrams.length : 0;
    var hasFBox = !!(opts.data && opts.data._debug && opts.data._debug.hasFretBox);
    var wantsDiagrams = hasFBox && !opts.noDiagrams;
    var needNode = !chords || (wantsDiagrams && fdCountSoFar === 0);
    console.log("[fallback] node: needed=" + needNode +
                " (chords=" + (chords ? chords.length : 0) +
                ", fretDiagrams=" + fdCountSoFar +
                ", hasFBox=" + hasFBox +
                ", noDiagrams=" + !!opts.noDiagrams +
                ", wantsDiagrams=" + wantsDiagrams + ")");
    if (opts.cliPath && needNode) {
        try {
            console.log("[fallback] node: running " + opts.cliPath + " " + scorePath);
            opts.process.startWithArgs("node", [opts.cliPath, scorePath]);
            opts.process.waitForFinished(10000);
            var nodeOutput = opts.process.readAllStandardOutput();
            var output = nodeOutput ? nodeOutput.toString() : "";
            console.log("[fallback] node: read " + output.length + " bytes");

            if (output.length > 2) {
                var result = JSON.parse(output);
                if (result) {
                    if (!chords && result.chords && result.chords.length > 0) {
                        chords = result.chords;
                    }
                    if (opts.data && result.fretDiagrams && result.fretDiagrams.length > 0) {
                        opts.data.fretDiagrams = result.fretDiagrams;
                    }
                    console.log("[fallback] node: OK " +
                        (result.chords ? result.chords.length : 0) + " chords, " +
                        (result.fretDiagrams ? result.fretDiagrams.length : 0) + " fretDiagrams");
                }
            } else {
                console.log("[fallback] node: empty output");
            }
        } catch (e) {
            console.log("[fallback] node: FAILED " + e);
        }
    }

    if (!chords) {
        console.log("[fallback] extractChords: END all strategies failed");
    } else {
        console.log("[fallback] extractChords: END returning " + chords.length + " chords");
    }
    return chords;
}

if (typeof exports !== "undefined") {
    exports.needsFallback = needsFallback;
    exports.extractChords = extractChords;
}
