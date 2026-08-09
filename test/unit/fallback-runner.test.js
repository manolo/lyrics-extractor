var test = require("node:test");
var assert = require("node:assert/strict");
var fallback = require("../../score/fallback-runner");

// needsFallback tests

test("needsFallback returns false when no debugData", function() {
    assert.strictEqual(fallback.needsFallback(null), false);
    assert.strictEqual(fallback.needsFallback(undefined), false);
});

test("needsFallback returns false when no fretDiagrams and no FBox", function() {
    assert.strictEqual(fallback.needsFallback({}), false);
    assert.strictEqual(fallback.needsFallback({ fretDiagramDebug: {} }), false);
    assert.strictEqual(fallback.needsFallback({ fretDiagramDebug: { fretDiagramsFound: [] } }), false);
});

test("needsFallback returns true when unextracted fretDiagrams exist", function() {
    var debug = {
        fretDiagramDebug: {
            fretDiagramsFound: [
                { extracted: false },
                { extracted: true }
            ]
        }
    };
    assert.strictEqual(fallback.needsFallback(debug), true);
});

test("needsFallback returns false when all fretDiagrams are extracted", function() {
    var debug = {
        fretDiagramDebug: {
            fretDiagramsFound: [
                { extracted: true },
                { extracted: true }
            ]
        }
    };
    assert.strictEqual(fallback.needsFallback(debug), false);
});

test("needsFallback returns true when FBox present", function() {
    assert.strictEqual(fallback.needsFallback({ hasFretBox: true }), true);
});

test("needsFallback returns true when FBox present even if all FretDiagrams extracted", function() {
    var debug = {
        hasFretBox: true,
        fretDiagramDebug: {
            fretDiagramsFound: [{ extracted: true }]
        }
    };
    assert.strictEqual(fallback.needsFallback(debug), true);
});

test("needsFallback returns false when FBox false and no unextracted diagrams", function() {
    var debug = {
        hasFretBox: false,
        fretDiagramDebug: {
            fretDiagramsFound: [{ extracted: true }]
        }
    };
    assert.strictEqual(fallback.needsFallback(debug), false);
});

// ========================================
// _logMsg buffer
// ========================================

test("_logMsg accumulates messages in buffer", function() {
    // extractChords resets the log, so call it to get a fresh buffer
    fallback.extractChords({
        scoreName: "LogTest",
        data: { _debug: {} },
        fileIO: { source: "", exists: function() { return false; } },
        process: null,
        scoresDirectory: ""
    });
    var log = fallback._getLog();
    assert.ok(log.length > 0, "log should have messages");
    assert.ok(log[0].indexOf("[fallback]") >= 0, "messages should have [fallback] prefix");
});

test("extractChords saves log to data._debug.fallbackLog", function() {
    var data = { _debug: {} };
    fallback.extractChords({
        scoreName: "LogSave",
        data: data,
        fileIO: { source: "", exists: function() { return false; } },
        process: null,
        scoresDirectory: ""
    });
    assert.ok(Array.isArray(data._debug.fallbackLog), "fallbackLog should be an array");
    assert.ok(data._debug.fallbackLog.length > 0, "fallbackLog should have entries");
});

test("extractChords resets log on each call", function() {
    var data1 = { _debug: {} };
    fallback.extractChords({
        scoreName: "First",
        data: data1,
        fileIO: { source: "", exists: function() { return false; } },
        process: null,
        scoresDirectory: ""
    });
    var data2 = { _debug: {} };
    fallback.extractChords({
        scoreName: "Second",
        data: data2,
        fileIO: { source: "", exists: function() { return false; } },
        process: null,
        scoresDirectory: ""
    });
    // Second log should not contain "First"
    var hasFirst = data2._debug.fallbackLog.some(function(l) { return l.indexOf("First") >= 0; });
    assert.ok(!hasFirst, "log should be reset between calls");
    var hasSecond = data2._debug.fallbackLog.some(function(l) { return l.indexOf("Second") >= 0; });
    assert.ok(hasSecond, "log should contain current call");
});

// ========================================
// _findScorePath
// ========================================

function mockFileIO(existingPaths) {
    var src = "";
    return {
        get source() { return src; },
        set source(v) { src = v; },
        exists: function() { return existingPaths.indexOf(src) >= 0; }
    };
}

function mockProcess(output) {
    return {
        startWithArgs: function() {},
        waitForFinished: function() {},
        readAllStandardOutput: function() {
            return { toString: function() { return output || ""; } };
        }
    };
}

test("_findScorePath finds per-song folder convention", function() {
    var fio = mockFileIO(["/scores/MySong/MySong.mscz"]);
    var result = fallback._findScorePath("MySong", fio, mockProcess(), "/scores");
    assert.equal(result, "/scores/MySong/MySong.mscz");
});

test("_findScorePath finds flat structure", function() {
    var fio = mockFileIO(["/scores/MySong.mscz"]);
    var result = fallback._findScorePath("MySong", fio, mockProcess(), "/scores");
    assert.equal(result, "/scores/MySong.mscz");
});

test("_findScorePath prefers per-song folder over flat", function() {
    var fio = mockFileIO(["/scores/MySong/MySong.mscz", "/scores/MySong.mscz"]);
    var result = fallback._findScorePath("MySong", fio, mockProcess(), "/scores");
    assert.equal(result, "/scores/MySong/MySong.mscz");
});

test("_findScorePath falls back to recursive find on Unix", function() {
    var fio = mockFileIO([]);
    var proc = mockProcess("/scores/sub/MySong.mscz\n");
    var result = fallback._findScorePath("MySong", fio, proc, "/scores");
    assert.equal(result, "/scores/sub/MySong.mscz");
});

test("_findScorePath returns empty when not found", function() {
    var fio = mockFileIO([]);
    var proc = mockProcess("");
    var result = fallback._findScorePath("MySong", fio, proc, "/scores");
    assert.equal(result, "");
});

test("_findScorePath returns empty when no process", function() {
    var fio = mockFileIO([]);
    var result = fallback._findScorePath("MySong", fio, null, "/scores");
    assert.equal(result, "");
});

test("_findScorePath returns empty when no scoresDirectory", function() {
    var fio = mockFileIO([]);
    var result = fallback._findScorePath("MySong", fio, mockProcess(), "");
    assert.equal(result, "");
});

test("_findScorePath normalizes backslashes to forward slashes", function() {
    var fio = mockFileIO(["C:/Users/test/Scores/Song/Song.mscz"]);
    var result = fallback._findScorePath("Song", fio, mockProcess(), "C:\\Users\\test\\Scores");
    assert.equal(result, "C:/Users/test/Scores/Song/Song.mscz");
});

test("_findScorePath handles process exception gracefully", function() {
    var fio = mockFileIO([]);
    var proc = {
        startWithArgs: function() { throw new Error("no such command"); },
        waitForFinished: function() {},
        readAllStandardOutput: function() { return { toString: function() { return ""; } }; }
    };
    var result = fallback._findScorePath("MySong", fio, proc, "/scores");
    assert.equal(result, "");
});

// ========================================
// extractChords: scorePath direct pass
// ========================================

test("extractChords uses scorePath directly when provided", function() {
    var tarCalled = false;
    var tarPath = "";
    var proc = {
        startWithArgs: function(cmd, args) {
            if (cmd === "tar") { tarCalled = true; tarPath = args[1]; }
        },
        waitForFinished: function() {},
        readAllStandardOutput: function() {
            return { toString: function() { return ""; } };
        }
    };
    var data = { _debug: {} };
    fallback.extractChords({
        scoreName: "Test",
        scorePath: "/direct/path/Test.mscz",
        data: data,
        fileIO: { source: "", exists: function() { return false; } },
        process: proc,
        scoresDirectory: "/other",
        XmlChordReader: { extractChords: function() { return []; }, extractFretDiagrams: function() { return []; } },
        Constants: {}
    });
    assert.ok(tarCalled, "tar should be called");
    assert.equal(tarPath, "/direct/path/Test.mscz", "tar should use scorePath directly");
});

test("extractChords falls back to _findScorePath when no scorePath", function() {
    var data = { _debug: {} };
    fallback.extractChords({
        scoreName: "Test",
        data: data,
        fileIO: { source: "", exists: function() { return false; } },
        process: null,
        scoresDirectory: "/scores"
    });
    // Should log the _findScorePath attempt
    var log = data._debug.fallbackLog || [];
    var hasFind = log.some(function(l) { return l.indexOf("_findScorePath") >= 0; });
    assert.ok(hasFind, "should attempt _findScorePath when no scorePath");
});

// ========================================
// extractChords: tar guitar excerpt extraction
// ========================================

test("extractChords extracts fretDiagrams from guitar excerpt via tar", function() {
    var callCount = 0;
    var responses = [
        // 1st tar call: main .mscx (valid XML with chords)
        '<museScore><Score><Division>480</Division><Staff id="1"><Measure><voice>' +
        '<Harmony><harmonyInfo><root>17</root><name>m</name></harmonyInfo></Harmony>' +
        '<Chord><durationType>whole</durationType></Chord></voice></Measure></Staff></Score></museScore>',
        // 2nd tar call: tar tf listing
        "Test.mscx\nExcerpts/6_Guitarra/6_Guitarra.mscx\nExcerpts/7_Guitarra-tab/7_Guitarra-tab.mscx\n",
        // 3rd tar call: guitar excerpt with FBox
        '<museScore><Score><Division>480</Division><Staff id="1"><FBox>' +
        '<FretDiagram><Harmony><harmonyInfo><root>17</root><name>m</name></harmonyInfo></Harmony>' +
        '<fretDiagram><fret>0</fret><string no="0"><marker>cross</marker></string></fretDiagram>' +
        '</FretDiagram></FBox></Staff></Score></museScore>'
    ];
    var proc = {
        startWithArgs: function() {},
        waitForFinished: function() {},
        readAllStandardOutput: function() {
            var r = responses[callCount] || "";
            callCount++;
            return { toString: function() { return r; } };
        }
    };
    var data = {
        _debug: { hasFretBox: true },
    };
    var XmlChordReader = require("../../score/xml-chord-reader");
    var Constants = require("../../lib/constants");
    var chords = fallback.extractChords({
        scoreName: "Test",
        scorePath: "/path/Test.mscz",
        data: data,
        fileIO: { source: "", exists: function() { return false; } },
        process: proc,
        XmlChordReader: XmlChordReader,
        Constants: Constants,
        spelling: "solfeggio",
        noDiagrams: false
    });
    assert.ok(chords, "should return chords");
    assert.ok(chords.length > 0, "should have chords");
    assert.ok(data.fretDiagrams, "should have fretDiagrams");
    assert.ok(data.fretDiagrams.length > 0, "should have at least one diagram");
    assert.equal(data.fretDiagrams[0].chordName, "Lam");
});

test("extractChords always attempts excerpt extraction when FBox present", function() {
    // Regression: the fallback used to honor an opts.noDiagrams flag and skip
    // excerpt extraction. That flag was removed so toggling "No chord diagrams"
    // in the PDF section works without re-extracting. The fallback must always
    // try to extract diagrams when FBox is present (even when no guitar excerpt
    // is found, no error should occur).
    var callCount = 0;
    var responses = [
        '<museScore><Score><Division>480</Division><Staff id="1"><Measure><voice>' +
        '<Harmony><harmonyInfo><root>17</root><name>m</name></harmonyInfo></Harmony>' +
        '<Chord><durationType>whole</durationType></Chord></voice></Measure></Staff></Score></museScore>',
        ""  // tar tf listing: no guitar excerpt found
    ];
    var calls = [];
    var proc = {
        startWithArgs: function(cmd, args) { calls.push(args.slice()); },
        waitForFinished: function() {},
        readAllStandardOutput: function() {
            var r = responses[callCount] || "";
            callCount++;
            return { toString: function() { return r; } };
        }
    };
    var data = { _debug: { hasFretBox: true } };
    var XmlChordReader = require("../../score/xml-chord-reader");
    var Constants = require("../../lib/constants");
    fallback.extractChords({
        scoreName: "Test",
        scorePath: "/path/Test.mscz",
        data: data,
        fileIO: { source: "", exists: function() { return false; } },
        process: proc,
        XmlChordReader: XmlChordReader,
        Constants: Constants,
        spelling: "solfeggio"
    });
    // The "tar tf" listing call must have been made (proves we attempted excerpts)
    var sawListing = calls.some(function(a) { return a[0] === "tf"; });
    assert.ok(sawListing, "should attempt to list archive contents to find guitar excerpts");
});

// ========================================
// extractChords returns null when no process/scoresDirectory
// ========================================

test("extractChords returns null when no scoresDirectory and no scorePath", function() {
    var data = { _debug: {} };
    var result = fallback.extractChords({
        scoreName: "Test",
        data: data,
        fileIO: { source: "", exists: function() { return false; } },
        process: null,
        scoresDirectory: ""
    });
    assert.strictEqual(result, null);
});

test("extractChords returns null when no process and no scorePath", function() {
    var data = { _debug: {} };
    var result = fallback.extractChords({
        scoreName: "Test",
        data: data,
        fileIO: { source: "", exists: function() { return false; } },
        process: null,
        scoresDirectory: "/some/path"
    });
    assert.strictEqual(result, null);
});
