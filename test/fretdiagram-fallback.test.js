var test = require("node:test");
var assert = require("node:assert/strict");
var fallback = require("../extractors/fretdiagram-fallback");

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

// extractChords returns null when no process/scoresDirectory

test("extractChords returns null when no scoresDirectory", function() {
    var result = fallback.extractChords({
        scoreName: "Test",
        fileIO: { homePath: function() { return "/tmp"; } },
        process: null,
        scoresDirectory: ""
    });
    assert.strictEqual(result, null);
});

test("extractChords returns null when no process", function() {
    var result = fallback.extractChords({
        scoreName: "Test",
        fileIO: { homePath: function() { return "/tmp"; } },
        process: null,
        scoresDirectory: "/some/path"
    });
    assert.strictEqual(result, null);
});
