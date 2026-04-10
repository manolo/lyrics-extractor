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

// Check if the extracted data has FretDiagram annotations with unextracted chords
function needsFallback(debugData) {
    var fd = debugData && debugData.fretDiagramDebug;
    if (!fd || !fd.fretDiagramsFound || fd.fretDiagramsFound.length === 0) {
        return false;
    }
    for (var i = 0; i < fd.fretDiagramsFound.length; i++) {
        if (!fd.fretDiagramsFound[i].extracted) return true;
    }
    return false;
}

// Find the .mscz file on disk by scoreName
function _findScorePath(scoreName, fileIO) {
    var home = fileIO.homePath();
    var candidates = [
        home + "/Music/TunaAlcala/" + scoreName + "/" + scoreName + ".mscz",
        home + "/Music/" + scoreName + "/" + scoreName + ".mscz",
        home + "/Documents/" + scoreName + ".mscz"
    ];
    for (var i = 0; i < candidates.length; i++) {
        fileIO.source = candidates[i];
        if (fileIO.exists()) return candidates[i];
    }
    return "";
}

// Extract chords (and fretDiagrams) from the .mscz file on disk.
// opts: { scoreName, fileIO, process, XmlChordReader, Constants, cliPath, data }
// Returns: array of {tick, chord} or null if fallback failed/not needed.
// Side effect: sets opts.data.fretDiagrams when available.
function extractChords(opts) {
    var scorePath = _findScorePath(opts.scoreName, opts.fileIO);
    if (!scorePath) {
        console.log("fretdiagram-fallback: score not found for '" + opts.scoreName + "'");
        return null;
    }

    // Strategy 1: tar extracts .mscx to stdout, parse in QML (no external dependencies)
    try {
        var mscxName = opts.scoreName + ".mscx";
        opts.process.startWithArgs("tar", ["xf", scorePath, "-O", mscxName]);
        opts.process.waitForFinished(10000);
        var tarOutput = opts.process.readAllStandardOutput();
        var xml = tarOutput ? tarOutput.toString() : "";

        if (xml.length > 100 && xml.indexOf("<museScore") > -1) {
            var xmlChords = opts.XmlChordReader.extractChords(xml, opts.Constants);
            if (xmlChords.length > 0) {
                // Also extract fretDiagrams for PDF rendering
                if (opts.data) {
                    opts.data.fretDiagrams = opts.XmlChordReader.extractFretDiagrams(xml);
                }
                console.log("fretdiagram-fallback: tar: " + xmlChords.length + " chords, " +
                    (opts.data && opts.data.fretDiagrams ? opts.data.fretDiagrams.length : 0) + " fretDiagrams");
                return xmlChords;
            }
        }
    } catch (e) {
        console.log("fretdiagram-fallback: tar failed: " + e);
    }

    // Strategy 2: node extract-chords.js (requires Node.js installed)
    if (opts.cliPath) {
        try {
            opts.process.startWithArgs("node", [opts.cliPath, scorePath]);
            opts.process.waitForFinished(10000);
            var nodeOutput = opts.process.readAllStandardOutput();
            var output = nodeOutput ? nodeOutput.toString() : "";

            if (output.length > 2) {
                var result = JSON.parse(output);
                if (result && result.chords && result.chords.length > 0) {
                    if (opts.data && result.fretDiagrams) {
                        opts.data.fretDiagrams = result.fretDiagrams;
                    }
                    console.log("fretdiagram-fallback: node: " + result.chords.length + " chords");
                    return result.chords;
                }
            }
        } catch (e) {
            console.log("fretdiagram-fallback: node failed: " + e);
        }
    }

    console.log("fretdiagram-fallback: all strategies failed");
    return null;
}

if (typeof exports !== "undefined") {
    exports.needsFallback = needsFallback;
    exports.extractChords = extractChords;
}
