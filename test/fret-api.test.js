var test = require("node:test");
var assert = require("node:assert/strict");
var fallback = require("../extractors/fretdiagram-fallback");
var msExtractor = require("../extractors/musescore-extractor");

// ============================================================
// needsFallback: fretDiagramsExtracted flag (native API bypass)
// ============================================================

test("needsFallback returns false when fretDiagramsExtracted is true", function() {
    var debug = { fretDiagramsExtracted: true };
    assert.strictEqual(fallback.needsFallback(debug), false);
});

test("needsFallback returns false when fretDiagramsExtracted is true even with hasFretBox", function() {
    var debug = {
        fretDiagramsExtracted: true,
        hasFretBox: true,
        fretDiagramDebug: {
            fretDiagramsFound: [{ tick: 0, staff: 0, extracted: true }]
        }
    };
    assert.strictEqual(fallback.needsFallback(debug), false);
});

test("needsFallback returns false when fretDiagramsExtracted is true even with unextracted entries", function() {
    // fretDiagramsExtracted takes priority over individual entries
    var debug = {
        fretDiagramsExtracted: true,
        fretDiagramDebug: {
            fretDiagramsFound: [{ tick: 0, staff: 0 }]
        }
    };
    assert.strictEqual(fallback.needsFallback(debug), false);
});

test("needsFallback still returns true when fretDiagramsExtracted is false and FBox present", function() {
    var debug = {
        fretDiagramsExtracted: false,
        hasFretBox: true
    };
    assert.strictEqual(fallback.needsFallback(debug), true);
});

test("needsFallback still returns true when fretDiagramsExtracted absent and unextracted FDs", function() {
    var debug = {
        fretDiagramDebug: {
            fretDiagramsFound: [{ tick: 0, staff: 0 }]
        }
    };
    assert.strictEqual(fallback.needsFallback(debug), true);
});

// ============================================================
// _fretApiAvailableInScore: probe FretDiagram elements in FBox
// ============================================================

// Helper: build a mock score with MeasureBase chain containing FBox elements
function mockScore(measureBases) {
    if (measureBases.length === 0) {
        return { firstMeasure: null };
    }
    // Link prev/next
    for (var i = 0; i < measureBases.length; i++) {
        measureBases[i].prev = i > 0 ? measureBases[i - 1] : null;
        measureBases[i].next = i < measureBases.length - 1 ? measureBases[i + 1] : null;
    }
    return { firstMeasure: measureBases[0] };
}

function mockFretDiagram(opts) {
    var fd = { type: 63 };
    if (opts.hasAPI) {
        fd.dots = function() { return opts.dots || []; };
        fd.markers = function() { return opts.markers || []; };
        fd.barres = function() { return opts.barres || []; };
        fd.harmonyPlainText = opts.harmonyPlainText || "";
        fd.strings = opts.strings || 6;
        fd.frets = opts.frets || 4;
        fd.fretOffset = opts.fretOffset || 0;
    }
    // Without hasAPI, dots/markers/barres are not functions (simulating pre-4.7)
    return fd;
}

test("_fretApiAvailableInScore returns null when score has no measures", function() {
    var score = mockScore([]);
    assert.strictEqual(msExtractor._fretApiAvailableInScore(score), null);
});

test("_fretApiAvailableInScore returns null when no FretDiagram elements", function() {
    var score = mockScore([
        { elements: [{ type: 1 }, { type: 2 }] }
    ]);
    assert.strictEqual(msExtractor._fretApiAvailableInScore(score), null);
});

test("_fretApiAvailableInScore returns true when FretDiagram has dots() function", function() {
    var fd = mockFretDiagram({ hasAPI: true });
    var score = mockScore([{ elements: [fd] }]);
    assert.strictEqual(msExtractor._fretApiAvailableInScore(score), true);
});

test("_fretApiAvailableInScore returns false when FretDiagram lacks dots() function", function() {
    var fd = mockFretDiagram({ hasAPI: false });
    var score = mockScore([{ elements: [fd] }]);
    assert.strictEqual(msExtractor._fretApiAvailableInScore(score), false);
});

test("_fretApiAvailableInScore finds FretDiagram in second MeasureBase", function() {
    var fd = mockFretDiagram({ hasAPI: true });
    var score = mockScore([
        { elements: [{ type: 1 }] },
        { elements: [fd] }
    ]);
    assert.strictEqual(msExtractor._fretApiAvailableInScore(score), true);
});

// ============================================================
// _extractFretDiagramsFromScore: read diagram data via mock API
// ============================================================

test("_extractFretDiagramsFromScore returns empty for score without FBox", function() {
    var score = mockScore([{ elements: [{ type: 1 }] }]);
    var result = msExtractor._extractFretDiagramsFromScore(score);
    assert.deepStrictEqual(result, []);
});

test("_extractFretDiagramsFromScore returns empty for score with no measures", function() {
    var result = msExtractor._extractFretDiagramsFromScore({ firstMeasure: null });
    assert.deepStrictEqual(result, []);
});

test("_extractFretDiagramsFromScore extracts diagram with dots and markers", function() {
    var fd = mockFretDiagram({
        hasAPI: true,
        harmonyPlainText: "Lam",
        strings: 6,
        frets: 4,
        fretOffset: 0,
        dots: [
            { string: 1, fret: 1, dotType: 0 },
            { string: 2, fret: 2, dotType: 0 }
        ],
        markers: [
            { string: 0, markerType: 2 },  // cross
            { string: 5, markerType: 1 }   // circle
        ],
        barres: []
    });
    var score = mockScore([{ elements: [fd] }]);
    var result = msExtractor._extractFretDiagramsFromScore(score);

    assert.equal(result.length, 1);
    assert.equal(result[0].chordName, "Lam");
    assert.equal(result[0].strings.length, 6);
    assert.equal(result[0].fretOffset, 0);
    assert.equal(result[0].numFrets, 4);
    assert.equal(result[0].barre, null);

    // String 0: cross marker
    assert.equal(result[0].strings[0].number, 0);
    assert.equal(result[0].strings[0].marker, "cross");
    assert.strictEqual(result[0].strings[0].dot, undefined);

    // String 1: dot at fret 1
    assert.equal(result[0].strings[1].number, 1);
    assert.equal(result[0].strings[1].dot.fret, 1);
    assert.strictEqual(result[0].strings[1].marker, undefined);

    // String 2: dot at fret 2
    assert.equal(result[0].strings[2].number, 2);
    assert.equal(result[0].strings[2].dot.fret, 2);

    // String 5: circle marker
    assert.equal(result[0].strings[5].number, 5);
    assert.equal(result[0].strings[5].marker, "circle");
});

test("_extractFretDiagramsFromScore extracts barre", function() {
    var fd = mockFretDiagram({
        hasAPI: true,
        harmonyPlainText: "Fa",
        strings: 6,
        frets: 4,
        fretOffset: 0,
        dots: [{ string: 2, fret: 2, dotType: 0 }, { string: 3, fret: 3, dotType: 0 }],
        markers: [],
        barres: [{ fret: 1, startString: 0, endString: 5 }]
    });
    var score = mockScore([{ elements: [fd] }]);
    var result = msExtractor._extractFretDiagramsFromScore(score);

    assert.equal(result.length, 1);
    assert.equal(result[0].chordName, "Fa");
    assert.ok(result[0].barre);
    assert.equal(result[0].barre.fret, 1);
    assert.equal(result[0].barre.start, 0);
    assert.equal(result[0].barre.end, 5);
});

test("_extractFretDiagramsFromScore handles fretOffset", function() {
    var fd = mockFretDiagram({
        hasAPI: true,
        harmonyPlainText: "Fa#",
        strings: 6,
        frets: 4,
        fretOffset: 4,
        dots: [{ string: 0, fret: 3, dotType: 0 }],
        markers: [],
        barres: []
    });
    var score = mockScore([{ elements: [fd] }]);
    var result = msExtractor._extractFretDiagramsFromScore(score);

    assert.equal(result.length, 1);
    assert.equal(result[0].fretOffset, 4);
    assert.equal(result[0].numFrets, 4);
});

test("_extractFretDiagramsFromScore skips FretDiagram without harmonyPlainText", function() {
    var fd = mockFretDiagram({
        hasAPI: true,
        harmonyPlainText: "",
        dots: [],
        markers: [],
        barres: []
    });
    var score = mockScore([{ elements: [fd] }]);
    var result = msExtractor._extractFretDiagramsFromScore(score);
    assert.deepStrictEqual(result, []);
});

test("_extractFretDiagramsFromScore skips non-FretDiagram elements", function() {
    var fd = mockFretDiagram({
        hasAPI: true,
        harmonyPlainText: "Do",
        dots: [],
        markers: [],
        barres: []
    });
    var other = { type: 1 };
    var score = mockScore([{ elements: [other, fd] }]);
    var result = msExtractor._extractFretDiagramsFromScore(score);

    assert.equal(result.length, 1);
    assert.equal(result[0].chordName, "Do");
});

test("_extractFretDiagramsFromScore deduplicates identical diagrams", function() {
    var makeFd = function() {
        return mockFretDiagram({
            hasAPI: true,
            harmonyPlainText: "Do",
            strings: 6,
            frets: 4,
            fretOffset: 0,
            dots: [{ string: 1, fret: 2, dotType: 0 }],
            markers: [{ string: 0, markerType: 2 }],
            barres: []
        });
    };
    var score = mockScore([{ elements: [makeFd(), makeFd()] }]);
    var result = msExtractor._extractFretDiagramsFromScore(score);
    assert.equal(result.length, 1, "should deduplicate identical diagrams");
});

test("_extractFretDiagramsFromScore keeps diagrams with different fingerings", function() {
    var fd1 = mockFretDiagram({
        hasAPI: true,
        harmonyPlainText: "Do",
        strings: 6,
        frets: 4,
        fretOffset: 0,
        dots: [{ string: 1, fret: 2, dotType: 0 }],
        markers: [{ string: 0, markerType: 2 }],
        barres: []
    });
    var fd2 = mockFretDiagram({
        hasAPI: true,
        harmonyPlainText: "Do",
        strings: 6,
        frets: 4,
        fretOffset: 0,
        dots: [{ string: 1, fret: 3, dotType: 0 }],
        markers: [{ string: 0, markerType: 2 }],
        barres: []
    });
    var score = mockScore([{ elements: [fd1, fd2] }]);
    var result = msExtractor._extractFretDiagramsFromScore(score);
    assert.equal(result.length, 2, "should keep diagrams with different fingerings");
});

test("_extractFretDiagramsFromScore extracts from multiple MeasureBases", function() {
    var fd1 = mockFretDiagram({
        hasAPI: true,
        harmonyPlainText: "Do",
        strings: 6, frets: 4, fretOffset: 0,
        dots: [], markers: [{ string: 0, markerType: 1 }], barres: []
    });
    var fd2 = mockFretDiagram({
        hasAPI: true,
        harmonyPlainText: "Sol",
        strings: 6, frets: 4, fretOffset: 0,
        dots: [], markers: [{ string: 0, markerType: 1 }], barres: []
    });
    var score = mockScore([
        { elements: [fd1] },
        { elements: [{ type: 1 }] },
        { elements: [fd2] }
    ]);
    var result = msExtractor._extractFretDiagramsFromScore(score);
    assert.equal(result.length, 2);
    assert.equal(result[0].chordName, "Do");
    assert.equal(result[1].chordName, "Sol");
});

test("_extractFretDiagramsFromScore handles dots() throwing", function() {
    var fd = {
        type: 63,
        harmonyPlainText: "Re",
        strings: 6,
        frets: 4,
        fretOffset: 0,
        dots: function() { throw new Error("API error"); },
        markers: function() { return []; },
        barres: function() { return []; }
    };
    var score = mockScore([{ elements: [fd] }]);
    var result = msExtractor._extractFretDiagramsFromScore(score);
    // Should still extract, just with no dots
    assert.equal(result.length, 1);
    assert.equal(result[0].chordName, "Re");
});

test("_extractFretDiagramsFromScore handles markers() throwing", function() {
    var fd = {
        type: 63,
        harmonyPlainText: "Mi",
        strings: 6,
        frets: 4,
        fretOffset: 0,
        dots: function() { return [{ string: 0, fret: 1, dotType: 0 }]; },
        markers: function() { throw new Error("API error"); },
        barres: function() { return []; }
    };
    var score = mockScore([{ elements: [fd] }]);
    var result = msExtractor._extractFretDiagramsFromScore(score);
    assert.equal(result.length, 1);
    assert.equal(result[0].chordName, "Mi");
    assert.equal(result[0].strings[0].dot.fret, 1);
});

test("_extractFretDiagramsFromScore handles barres() throwing", function() {
    var fd = {
        type: 63,
        harmonyPlainText: "La",
        strings: 6,
        frets: 4,
        fretOffset: 0,
        dots: function() { return []; },
        markers: function() { return []; },
        barres: function() { throw new Error("API error"); }
    };
    var score = mockScore([{ elements: [fd] }]);
    var result = msExtractor._extractFretDiagramsFromScore(score);
    assert.equal(result.length, 1);
    assert.equal(result[0].barre, null);
});

test("_extractFretDiagramsFromScore markerType 1 maps to circle", function() {
    var fd = mockFretDiagram({
        hasAPI: true,
        harmonyPlainText: "Sol",
        strings: 6, frets: 4, fretOffset: 0,
        dots: [],
        markers: [{ string: 0, markerType: 1 }],
        barres: []
    });
    var score = mockScore([{ elements: [fd] }]);
    var result = msExtractor._extractFretDiagramsFromScore(score);
    assert.equal(result[0].strings[0].marker, "circle");
});

test("_extractFretDiagramsFromScore markerType 2 maps to cross", function() {
    var fd = mockFretDiagram({
        hasAPI: true,
        harmonyPlainText: "Sol",
        strings: 6, frets: 4, fretOffset: 0,
        dots: [],
        markers: [{ string: 0, markerType: 2 }],
        barres: []
    });
    var score = mockScore([{ elements: [fd] }]);
    var result = msExtractor._extractFretDiagramsFromScore(score);
    assert.equal(result[0].strings[0].marker, "cross");
});

test("_extractFretDiagramsFromScore takes first barre only", function() {
    var fd = mockFretDiagram({
        hasAPI: true,
        harmonyPlainText: "Fa",
        strings: 6, frets: 5, fretOffset: 0,
        dots: [],
        markers: [],
        barres: [
            { fret: 1, startString: 0, endString: 5 },
            { fret: 3, startString: 2, endString: 4 }
        ]
    });
    var score = mockScore([{ elements: [fd] }]);
    var result = msExtractor._extractFretDiagramsFromScore(score);
    assert.equal(result[0].barre.fret, 1);
    assert.equal(result[0].barre.start, 0);
    assert.equal(result[0].barre.end, 5);
});
