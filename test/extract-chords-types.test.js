// Tests for chord and section title classification by element type
// in extractors/musescore-api.js

var test = require("node:test");
var assert = require("node:assert/strict");

// Set up MuseScore-like globals BEFORE requiring the extractor.
global.Element = {
    HARMONY: 11,
    STAFF_TEXT: 52,
    EXPRESSION: 42,
    PLAYTECH_ANNOTATION: 56,
    REHEARSAL_MARK: 60,
    FRET_DIAGRAM: 63,
    SYSTEM_TEXT: 53,
    BAR_LINE: 10,
    CHORD: 1,
    REST: 2,
    MARKER: 70,
    JUMP: 71,
    VOLTA: 80
};

var msExtractor = require("../extractors/musescore-api");

// Build a single-segment score with the given annotations.
// Each annotation may have: type, text, track, harmonyPlainText.
function makeMockScore(annotationsByTick) {
    var ticks = Object.keys(annotationsByTick).map(Number).sort(function(a, b) { return a - b; });
    var segments = ticks.map(function(t) {
        return { tick: t, annotations: annotationsByTick[t], next: null };
    });
    for (var i = 0; i < segments.length - 1; i++) segments[i].next = segments[i + 1];
    return {
        firstSegment: function() { return segments[0]; }
    };
}

function setScore(score) {
    global.curScore = score;
}

// ============================================================
// extractChords: by element type
// ============================================================

test("extractChords picks up Element.HARMONY annotations on the harmony staff", function() {
    setScore(makeMockScore({
        0: [{ type: Element.HARMONY, text: "Lam", track: 0 }],
        480: [{ type: Element.HARMONY, text: "Mi7", track: 0 }]
    }));
    var chords = msExtractor.extractChords(0);
    assert.equal(chords.length, 2);
    assert.deepStrictEqual(chords[0], { tick: 0, chord: "Lam" });
    assert.deepStrictEqual(chords[1], { tick: 480, chord: "Mi7" });
});

test("extractChords accepts Element.HARMONY from any staff when harmonyStaffIdx is -1", function() {
    setScore(makeMockScore({
        0: [{ type: Element.HARMONY, text: "Do", track: 0 }],
        240: [{ type: Element.HARMONY, text: "Sol", track: 8 }]
    }));
    var chords = msExtractor.extractChords(-1);
    assert.equal(chords.length, 2);
});

test("extractChords filters Element.HARMONY by harmony staff", function() {
    setScore(makeMockScore({
        0: [{ type: Element.HARMONY, text: "Lam", track: 0 }],
        240: [{ type: Element.HARMONY, text: "Sol", track: 8 }]  // staff 2
    }));
    var chords = msExtractor.extractChords(0);
    assert.equal(chords.length, 1);
    assert.equal(chords[0].chord, "Lam");
});

test("extractChords picks up StaffText (type 52) on the harmony staff as inline chord", function() {
    setScore(makeMockScore({
        0: [{ type: Element.HARMONY, text: "Lam", track: 0 }],
        480: [{ type: 52, text: "Solo", track: 0 }]
    }));
    var chords = msExtractor.extractChords(0);
    assert.equal(chords.length, 2);
    assert.equal(chords[1].chord, "Solo");
});

test("extractChords picks up Expression (type 42) on the harmony staff as inline chord", function() {
    setScore(makeMockScore({
        0: [{ type: Element.HARMONY, text: "Lam", track: 0 }],
        480: [{ type: 42, text: "rit.", track: 0 }]
    }));
    var chords = msExtractor.extractChords(0);
    assert.equal(chords.length, 2);
    assert.equal(chords[1].chord, "rit.");
});

test("extractChords filters StaffText/Expression by harmony staff", function() {
    setScore(makeMockScore({
        0: [{ type: 52, text: "Solo", track: 8 }],   // staff 2, not harmony staff
        240: [{ type: 42, text: "rit.", track: 4 }]  // staff 1
    }));
    var chords = msExtractor.extractChords(0);
    assert.equal(chords.length, 0, "annotations on other staves should be filtered out");
});

test("extractChords reads chord from FretDiagram via harmonyPlainText (4.7+ API)", function() {
    setScore(makeMockScore({
        0: [{ type: 63, harmonyPlainText: "Lam", track: 0 }],
        480: [{ type: 63, harmonyPlainText: "Mi7", track: 0 }]
    }));
    var chords = msExtractor.extractChords(0);
    assert.equal(chords.length, 2);
    assert.equal(chords[0].chord, "Lam");
    assert.equal(chords[1].chord, "Mi7");
});

test("extractChords skips FretDiagram chord on a different staff but still records it", function() {
    setScore(makeMockScore({
        0: [{ type: 63, harmonyPlainText: "Lam", track: 8 }]  // staff 2
    }));
    var chords = msExtractor.extractChords(0);
    assert.equal(chords.length, 0, "chord on non-harmony staff filtered out");
});

test("extractChords records FretDiagram without harmonyPlainText for fallback", function() {
    setScore(makeMockScore({
        0: [{ type: 63, track: 0 }]  // no harmonyPlainText -> simulates pre-4.7 API
    }));
    var chords = msExtractor.extractChords(0);
    assert.equal(chords.length, 0, "no chord extracted via API");
});

test("extractChords skips Element.HARMONY with empty text", function() {
    setScore(makeMockScore({
        0: [{ type: Element.HARMONY, text: "", track: 0 }],
        240: [{ type: Element.HARMONY, text: "Lam", track: 0 }]
    }));
    var chords = msExtractor.extractChords(0);
    assert.equal(chords.length, 1);
    assert.equal(chords[0].chord, "Lam");
});

test("extractChords ignores other annotation types (REHEARSAL_MARK, SYSTEM_TEXT)", function() {
    setScore(makeMockScore({
        0: [
            { type: Element.REHEARSAL_MARK, text: "A", track: 0 },
            { type: Element.SYSTEM_TEXT, text: "INTRO", track: 0 }
        ],
        240: [{ type: Element.HARMONY, text: "Lam", track: 0 }]
    }));
    var chords = msExtractor.extractChords(0);
    assert.equal(chords.length, 1);
    assert.equal(chords[0].chord, "Lam");
});

// ============================================================
// extractSystemTexts: by element type
// ============================================================

test("extractSystemTexts picks up SYSTEM_TEXT and REHEARSAL_MARK (type 60), but NOT STAFF_TEXT", function() {
    setScore(makeMockScore({
        0: [{ type: Element.SYSTEM_TEXT, text: "INTRO", track: 0 }],
        480: [{ type: Element.STAFF_TEXT, text: "Solo", track: 0 }],
        960: [{ type: 60, text: "A", track: 0 }],
        1440: [{ type: Element.REHEARSAL_MARK, text: "B", track: 0 }]
    }));
    var texts = msExtractor.extractSystemTexts();
    assert.equal(texts.length, 3, "STAFF_TEXT should not be a section title");
    assert.equal(texts[0].text, "INTRO");
    assert.equal(texts[1].text, "A");
    assert.equal(texts[2].text, "B");
});

test("extractSystemTexts ignores Element.HARMONY and FretDiagram", function() {
    setScore(makeMockScore({
        0: [
            { type: Element.HARMONY, text: "Lam", track: 0 },
            { type: 63, harmonyPlainText: "Mi7", track: 0 }
        ],
        480: [{ type: Element.SYSTEM_TEXT, text: "ESTROFA", track: 0 }]
    }));
    var texts = msExtractor.extractSystemTexts();
    assert.equal(texts.length, 1);
    assert.equal(texts[0].text, "ESTROFA");
});

test("extractSystemTexts skips empty text", function() {
    setScore(makeMockScore({
        0: [{ type: Element.SYSTEM_TEXT, text: "", track: 0 }],
        240: [{ type: Element.SYSTEM_TEXT, text: "INTRO", track: 0 }]
    }));
    var texts = msExtractor.extractSystemTexts();
    assert.equal(texts.length, 1);
    assert.equal(texts[0].text, "INTRO");
});

test("extractSystemTexts sorts by tick", function() {
    setScore(makeMockScore({
        960: [{ type: Element.SYSTEM_TEXT, text: "ESTRIBILLO", track: 0 }],
        0: [{ type: Element.SYSTEM_TEXT, text: "INTRO", track: 0 }],
        480: [{ type: Element.SYSTEM_TEXT, text: "ESTROFA", track: 0 }]
    }));
    var texts = msExtractor.extractSystemTexts();
    assert.equal(texts.length, 3);
    assert.equal(texts[0].text, "INTRO");
    assert.equal(texts[1].text, "ESTROFA");
    assert.equal(texts[2].text, "ESTRIBILLO");
});

// ============================================================
// Cross-classification: same element type STAFF_TEXT
// ============================================================

test("STAFF_TEXT on the harmony staff becomes a chord and never a section title", function() {
    setScore(makeMockScore({
        0: [{ type: Element.STAFF_TEXT, text: "Solo", track: 0 }]
    }));
    var chords = msExtractor.extractChords(0);
    var texts = msExtractor.extractSystemTexts();
    assert.equal(chords.length, 1, "STAFF_TEXT on harmony staff is chord");
    assert.equal(chords[0].chord, "Solo");
    assert.equal(texts.length, 0, "STAFF_TEXT should never appear as section title");
});

test("PlayTechAnnotation (type 56) on the harmony staff is extracted as inline chord", function() {
    setScore(makeMockScore({
        0: [{ type: Element.HARMONY, text: "Lam", track: 0 }],
        480: [{ type: 56, text: "harmonics", track: 0 }],
        960: [{ type: 56, text: "pizz.", track: 0 }]
    }));
    var chords = msExtractor.extractChords(0);
    assert.equal(chords.length, 3);
    assert.equal(chords[1].chord, "harmonics");
    assert.equal(chords[2].chord, "pizz.");
});

test("PlayTechAnnotation on a non-harmony staff is filtered out", function() {
    setScore(makeMockScore({
        0: [{ type: 56, text: "harmonics", track: 8 }]  // staff 2
    }));
    var chords = msExtractor.extractChords(0);
    assert.equal(chords.length, 0);
});

test("inline text with internal whitespace is collapsed to '-'", function() {
    setScore(makeMockScore({
        0: [{ type: Element.STAFF_TEXT, text: "Staff text", track: 0 }],
        480: [{ type: 56, text: "molto rit.", track: 0 }],
        960: [{ type: 42, text: "  multiple   spaces  ", track: 0 }]
    }));
    var chords = msExtractor.extractChords(0);
    assert.equal(chords.length, 3);
    assert.equal(chords[0].chord, "Staff-text");
    assert.equal(chords[1].chord, "molto-rit.");
    assert.equal(chords[2].chord, "-multiple-spaces-");
});
