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
    if (!debugData) return false;

    // Case 1: FretDiagram chord annotations that QML API could not read
    var fd = debugData.fretDiagramDebug;
    if (fd && fd.fretDiagramsFound && fd.fretDiagramsFound.length > 0) {
        for (var i = 0; i < fd.fretDiagramsFound.length; i++) {
            if (!fd.fretDiagramsFound[i].extracted) return true;
        }
    }

    // Case 2: FBox with fret diagrams (need diagram data for PDF rendering)
    if (debugData.hasFretBox) return true;

    return false;
}

// Find the .mscz file on disk by scoreName
function _findScorePath(scoreName, fileIO, process) {
    var home = fileIO.homePath();
    var baseName = scoreName.replace(/-\d+$/, "");
    var fileName = scoreName + ".mscz";

    // Try direct paths first (fast)
    var candidates = [
        home + "/Music/TunaAlcala/" + scoreName + "/" + fileName,
        home + "/Music/TunaAlcala/" + baseName + "/" + fileName,
        home + "/Music/" + scoreName + "/" + fileName,
        home + "/Music/" + baseName + "/" + fileName,
        home + "/Documents/" + fileName
    ];
    for (var i = 0; i < candidates.length; i++) {
        fileIO.source = candidates[i];
        if (fileIO.exists()) return candidates[i];
    }

    // Fallback: search with find command (handles mismatched dir names)
    if (process) {
        try {
            process.startWithArgs("find", [
                home + "/Music/TunaAlcala", "-name", fileName, "-maxdepth", "2"
            ]);
            process.waitForFinished(5000);
            var output = process.readAllStandardOutput();
            var found = output ? output.toString().trim().split("\n")[0] : "";
            if (found) {
                fileIO.source = found;
                if (fileIO.exists()) return found;
            }
        } catch (e) { /* find not available */ }
    }

    return "";
}

// Extract chords (and fretDiagrams) from the .mscz file on disk.
// opts: { scoreName, fileIO, process, XmlChordReader, Constants, cliPath, data }
// Returns: array of {tick, chord} or null if fallback failed/not needed.
// Side effect: sets opts.data.fretDiagrams when available.
function extractChords(opts) {
    var scorePath = _findScorePath(opts.scoreName, opts.fileIO, opts.process);
    if (!scorePath) {
        console.log("fretdiagram-fallback: score not found for '" + opts.scoreName + "'");
        return null;
    }

    var chords = null;

    // Strategy 1: tar extracts .mscx to stdout, parse in QML (no external dependencies)
    try {
        var mscxName = opts.scoreName + ".mscx";
        opts.process.startWithArgs("tar", ["xf", scorePath, "-O", mscxName]);
        opts.process.waitForFinished(10000);
        var tarOutput = opts.process.readAllStandardOutput();
        var xml = tarOutput ? tarOutput.toString() : "";

        if (xml.length > 100 && xml.indexOf("<museScore") > -1) {
            var xmlChords = opts.XmlChordReader.extractChords(xml, opts.Constants, opts.spelling);
            if (xmlChords.length > 0) {
                chords = xmlChords;
                if (opts.data) {
                    opts.data.fretDiagrams = opts.XmlChordReader.extractFretDiagrams(xml);
                }
                console.log("fretdiagram-fallback: tar: " + chords.length + " chords, " +
                    (opts.data && opts.data.fretDiagrams ? opts.data.fretDiagrams.length : 0) + " fretDiagrams");
            }
        }
    } catch (e) {
        console.log("fretdiagram-fallback: tar failed: " + e);
    }

    // Strategy 2: node extract-chords.js (requires Node.js installed)
    // Used when tar failed, or tar found no fretDiagrams (they may be in excerpts)
    var needNode = !chords || (opts.data && (!opts.data.fretDiagrams || opts.data.fretDiagrams.length === 0));
    if (opts.cliPath && needNode) {
        try {
            opts.process.startWithArgs("node", [opts.cliPath, scorePath]);
            opts.process.waitForFinished(10000);
            var nodeOutput = opts.process.readAllStandardOutput();
            var output = nodeOutput ? nodeOutput.toString() : "";

            if (output.length > 2) {
                var result = JSON.parse(output);
                if (result) {
                    if (!chords && result.chords && result.chords.length > 0) {
                        chords = result.chords;
                    }
                    if (opts.data && result.fretDiagrams && result.fretDiagrams.length > 0) {
                        opts.data.fretDiagrams = result.fretDiagrams;
                    }
                    console.log("fretdiagram-fallback: node: " +
                        (result.chords ? result.chords.length : 0) + " chords, " +
                        (result.fretDiagrams ? result.fretDiagrams.length : 0) + " fretDiagrams");
                }
            }
        } catch (e) {
            console.log("fretdiagram-fallback: node failed: " + e);
        }
    }

    if (!chords) {
        console.log("fretdiagram-fallback: all strategies failed");
    }
    return chords;
}

if (typeof exports !== "undefined") {
    exports.needsFallback = needsFallback;
    exports.extractChords = extractChords;
}
