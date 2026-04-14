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

// Debug log buffer: captured in data._debug.fallbackLog for diagnostics
var _log = [];
function _logMsg(msg) {
    console.log(msg);
    _log.push(msg);
}

// Check if fallback is needed:
// 1. FretDiagram annotations in measures with unextracted chords (QML API limitation)
// 2. FBox frame with fret diagrams detected (need to extract diagram data for PDF)
function needsFallback(debugData) {
    if (!debugData) {
        _logMsg("[fallback] needsFallback: NO (no debugData)");
        return false;
    }

    // Native API (4.7+) already extracted everything
    if (debugData.fretDiagramsExtracted) {
        _logMsg("[fallback] needsFallback: NO (native API extracted diagrams)");
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
    _logMsg("[fallback] needsFallback: " + (need ? "YES" : "NO") +
                " (FretDiagrams=" + totalFD + ", unextracted=" + unextracted +
                ", FBox=" + hasFBox + ")");
    return need;
}

// Find the .mscz file on disk by scoreName, inside a user-configured directory.
// See specs/11-scores-directory.md.
// Search order: <dir>/<name>/<name>.mscz, <dir>/<name>.mscz, recursive find inside <dir>.
function _findScorePath(scoreName, fileIO, process, scoresDirectory) {
    _logMsg("[fallback] _findScorePath: scoreName='" + scoreName +
                "', scoresDirectory='" + scoresDirectory + "'");
    if (!process) {
        _logMsg("[fallback] _findScorePath: ABORT (no process)");
        return "";
    }
    if (!scoresDirectory) {
        _logMsg("[fallback] _findScorePath: ABORT (no scoresDirectory)");
        return "";
    }

    var isWindows = (typeof Qt !== "undefined" && Qt.platform && Qt.platform.os === "windows");
    var fileName = scoreName + ".mscz";
    // Normalize to forward slashes (Qt FileIO accepts both on all platforms)
    var dir = scoresDirectory.replace(/\\/g, "/");

    // 1. Per-song folder convention: <dir>/<name>/<name>.mscz
    var p1 = dir + "/" + scoreName + "/" + fileName;
    fileIO.source = p1;
    if (fileIO.exists()) {
        _logMsg("[fallback] _findScorePath: FOUND (per-song folder): " + p1);
        return p1;
    }
    _logMsg("[fallback] _findScorePath: not at " + p1);

    // 2. Flat: <dir>/<name>.mscz
    var p2 = dir + "/" + fileName;
    fileIO.source = p2;
    if (fileIO.exists()) {
        _logMsg("[fallback] _findScorePath: FOUND (flat): " + p2);
        return p2;
    }
    _logMsg("[fallback] _findScorePath: not at " + p2);

    // 3. Recursive search inside scoresDirectory only
    _logMsg("[fallback] _findScorePath: trying recursive search in " + dir);
    if (isWindows) {
        try {
            var winDir = dir.replace(/\//g, "\\");
            process.startWithArgs("cmd", ["/c", "dir", "/b", "/s", winDir + "\\" + fileName]);
            process.waitForFinished(5000);
            var w = process.readAllStandardOutput();
            var wf = w ? w.toString().trim().split("\r\n")[0] : "";
            _logMsg("[fallback] _findScorePath: dir /b /s result='" + wf + "'");
            if (wf) {
                _logMsg("[fallback] _findScorePath: FOUND (dir): " + wf);
                return wf;
            }
        } catch (e) {
            _logMsg("[fallback] _findScorePath: dir failed: " + e);
        }
    } else {
        try {
            process.startWithArgs("find", [
                dir, "-name", fileName, "-not", "-path", "*/.*"
            ]);
            process.waitForFinished(5000);
            var o = process.readAllStandardOutput();
            var f = o ? o.toString().trim().split("\n")[0] : "";
            if (f) {
                _logMsg("[fallback] _findScorePath: FOUND (find): " + f);
                return f;
            }
        } catch (e) {
            _logMsg("[fallback] _findScorePath: find failed: " + e);
        }
    }

    _logMsg("[fallback] _findScorePath: NOT FOUND");
    return "";
}

// Extract chords (and fretDiagrams) from the .mscz file on disk.
// opts: { scoreName, fileIO, process, XmlChordReader, Constants, cliPath, data, scoresDirectory, spelling, noDiagrams }
// Returns: array of {tick, chord} or null if fallback failed/not needed.
// Side effect: sets opts.data.fretDiagrams and opts.data.scorePath when available.
function extractChords(opts) {
    _log = [];
    function _saveLog() {
        if (opts.data && opts.data._debug) opts.data._debug.fallbackLog = _log.slice();
    }
    _logMsg("[fallback] extractChords: START scoreName='" + opts.scoreName + "'");
    // Use curScore.path directly if available, otherwise search in scoresDirectory
    var scorePath = "";
    if (opts.scorePath) {
        _logMsg("[fallback] extractChords: using curScore.path=" + opts.scorePath);
        scorePath = opts.scorePath;
    } else {
        scorePath = _findScorePath(opts.scoreName, opts.fileIO, opts.process, opts.scoresDirectory);
    }
    if (!scorePath) {
        _logMsg("[fallback] extractChords: ABORT score not found for '" + opts.scoreName + "'");
        _saveLog();
        return null;
    }
    if (opts.data) opts.data.scorePath = scorePath;
    _logMsg("[fallback] extractChords: using scorePath=" + scorePath);

    var chords = null;

    // Strategy 1: tar extracts .mscx to stdout, parse in QML (no external dependencies)
    try {
        var mscxName = opts.scoreName + ".mscx";
        _logMsg("[fallback] tar: extracting " + mscxName + " from " + scorePath);
        opts.process.startWithArgs("tar", ["xf", scorePath, "-O", mscxName]);
        opts.process.waitForFinished(10000);
        var tarOutput = opts.process.readAllStandardOutput();
        var xml = tarOutput ? tarOutput.toString() : "";
        _logMsg("[fallback] tar: read " + xml.length + " bytes");

        if (xml.length > 100 && xml.indexOf("<museScore") > -1) {
            var xmlChords = opts.XmlChordReader.extractChords(xml, opts.Constants, opts.spelling);
            _logMsg("[fallback] tar: parsed " + xmlChords.length + " chords from XML");
            if (xmlChords.length > 0) {
                chords = xmlChords;
                if (opts.data) {
                    opts.data.fretDiagrams = opts.XmlChordReader.extractFretDiagrams(xml);
                }
                var fdCount = (opts.data && opts.data.fretDiagrams) ? opts.data.fretDiagrams.length : 0;
                _logMsg("[fallback] tar: OK " + chords.length + " chords, " + fdCount + " fretDiagrams");
            } else {
                _logMsg("[fallback] tar: no chords found in XML");
            }
        } else {
            _logMsg("[fallback] tar: invalid XML output (no <museScore> tag)");
        }
    } catch (e) {
        _logMsg("[fallback] tar: FAILED " + e);
    }

    // Strategy 1b: tar extracts guitar excerpt .mscx for FBox diagrams
    var fdCountSoFar = (opts.data && opts.data.fretDiagrams) ? opts.data.fretDiagrams.length : 0;
    var hasFBox = !!(opts.data && opts.data._debug && opts.data._debug.hasFretBox);
    var wantsDiagrams = hasFBox && !opts.noDiagrams;
    if (wantsDiagrams && fdCountSoFar === 0) {
        try {
            // List .mscz contents to find guitar excerpt
            _logMsg("[fallback] tar: listing archive to find guitar excerpt");
            opts.process.startWithArgs("tar", ["tf", scorePath]);
            opts.process.waitForFinished(5000);
            var listing = opts.process.readAllStandardOutput();
            var files = listing ? listing.toString().split("\n") : [];
            var guitarFiles = [];
            for (var fi = 0; fi < files.length; fi++) {
                var f = files[fi].trim().toLowerCase();
                if (f.indexOf("excerpt") >= 0 && f.indexOf(".mscx") >= 0 &&
                    (f.indexOf("guitar") >= 0 || f.indexOf("guitarra") >= 0)) {
                    guitarFiles.push(files[fi].trim());
                }
            }
            _logMsg("[fallback] tar: found " + guitarFiles.length + " guitar excerpts");
            for (var gi = 0; gi < guitarFiles.length && fdCountSoFar === 0; gi++) {
                _logMsg("[fallback] tar: extracting excerpt " + guitarFiles[gi]);
                opts.process.startWithArgs("tar", ["xf", scorePath, "-O", guitarFiles[gi]]);
                opts.process.waitForFinished(10000);
                var excerptOutput = opts.process.readAllStandardOutput();
                var excerptXml = excerptOutput ? excerptOutput.toString() : "";
                _logMsg("[fallback] tar: excerpt read " + excerptXml.length + " bytes");
                if (excerptXml.length > 100 && excerptXml.indexOf("<museScore") > -1) {
                    var excerptDiagrams = opts.XmlChordReader.extractFretDiagrams(excerptXml);
                    if (excerptDiagrams && excerptDiagrams.length > 0) {
                        if (opts.data) opts.data.fretDiagrams = excerptDiagrams;
                        fdCountSoFar = excerptDiagrams.length;
                        _logMsg("[fallback] tar: excerpt OK " + fdCountSoFar + " fretDiagrams");
                    } else {
                        _logMsg("[fallback] tar: excerpt has no fretDiagrams");
                    }
                }
            }
            if (guitarFiles.length === 0) {
                _logMsg("[fallback] tar: no guitar excerpt found in archive");
            }
        } catch (e) {
            _logMsg("[fallback] tar excerpt: FAILED " + e);
        }
    }

    // Strategy 2: node extract-chords.js (requires Node.js installed)
    // Used when tar strategies failed
    var needNode = !chords || (wantsDiagrams && fdCountSoFar === 0);
    _logMsg("[fallback] node: needed=" + needNode +
                " (chords=" + (chords ? chords.length : 0) +
                ", fretDiagrams=" + fdCountSoFar +
                ", hasFBox=" + hasFBox +
                ", noDiagrams=" + !!opts.noDiagrams +
                ", wantsDiagrams=" + wantsDiagrams + ")");
    if (opts.cliPath && needNode) {
        try {
            _logMsg("[fallback] node: running " + opts.cliPath + " " + scorePath);
            opts.process.startWithArgs("node", [opts.cliPath, scorePath]);
            opts.process.waitForFinished(10000);
            var nodeOutput = opts.process.readAllStandardOutput();
            var output = nodeOutput ? nodeOutput.toString() : "";
            _logMsg("[fallback] node: read " + output.length + " bytes");

            if (output.length > 2) {
                var result = JSON.parse(output);
                if (result) {
                    if (!chords && result.chords && result.chords.length > 0) {
                        chords = result.chords;
                    }
                    if (opts.data && result.fretDiagrams && result.fretDiagrams.length > 0) {
                        opts.data.fretDiagrams = result.fretDiagrams;
                    }
                    _logMsg("[fallback] node: OK " +
                        (result.chords ? result.chords.length : 0) + " chords, " +
                        (result.fretDiagrams ? result.fretDiagrams.length : 0) + " fretDiagrams");
                }
            } else {
                _logMsg("[fallback] node: empty output");
            }
        } catch (e) {
            _logMsg("[fallback] node: FAILED " + e);
        }
    }

    if (!chords) {
        _logMsg("[fallback] extractChords: END all strategies failed");
    } else {
        _logMsg("[fallback] extractChords: END returning " + chords.length + " chords");
    }
    _saveLog();
    return chords;
}

if (typeof exports !== "undefined") {
    exports.needsFallback = needsFallback;
    exports.extractChords = extractChords;
}
