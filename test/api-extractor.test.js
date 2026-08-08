// score/api-extractor.js reads the score MuseScore has open, through the QML API, and it was
// at 34% of lines: the snapshot suite goes through the XML path instead, so the plugin's own
// reader was only ever exercised by hand in MuseScore.
//
// Everything it touches comes from curScore, which _setScore injects, so a stub score built
// out of plain objects is enough. The shapes below are the ones the module reads: staves with
// a part, segments chained through .next, elementAt(track) returning a chord with .lyrics,
// and annotations carrying harmonies, labels and rehearsal marks.

var test = require("node:test");
var assert = require("node:assert/strict");

global.Element = {
    CHORD: 93, REST: 25, HARMONY: 11, STAFF_TEXT: 52, SYSTEM_TEXT: 54,
    REHEARSAL_MARK: 63, EXPRESSION: 55, PLAYTECH_ANNOTATION: 56,
    FRET_DIAGRAM: 64, BAR_LINE: 10, MARKER: 30, JUMP: 31, VOLTA: 32
};

var api = require("../score/api-extractor");
var textUtils = require("../lib/text-utils");
api.setTextUtils(textUtils);

// --- stub builders ------------------------------------------------------------

function lyric(text, verse, syllabic) {
    return { text: text, verse: verse || 0, syllabic: syllabic || 0 };
}

// A part whose is() answers by identity, which is how the QML API compares them
function part(name) {
    var p = { trackName: name, show: true };
    p.is = function(other) { return other === p; };
    return p;
}

// spec: { staves: [{part, isTabStaff}], bars: [{ lyrics: {staff: [lyric...]},
//         harmonies: [{staff, text}], labels: [{type, text}] }] }
function stubScore(spec) {
    var staves = spec.staves || [{ part: part("Voice") }];
    var parts = [];
    staves.forEach(function(s) { if (s.part && parts.indexOf(s.part) < 0) parts.push(s.part); });

    var segments = (spec.bars || []).map(function(bar, i) {
        var anns = [];
        (bar.harmonies || []).forEach(function(h) {
            anns.push({ type: Element.HARMONY, text: h.text, track: (h.staff || 0) * 4 });
        });
        (bar.labels || []).forEach(function(l) {
            anns.push({ type: l.type, text: l.text, track: 0 });
        });
        return {
            tick: i * 1920,
            annotations: anns,
            elementAt: function(track) {
                var staff = Math.floor(track / 4);
                var lyr = (bar.lyrics || {})[staff];
                if (track % 4 !== 0) return null;
                if (!lyr) return { type: Element.REST, lyrics: [] };
                return { type: Element.CHORD, lyrics: lyr, duration: { ticks: 480 } };
            }
        };
    });
    for (var i = 0; i < segments.length; i++) segments[i].next = segments[i + 1] || null;

    var score = {
        nstaves: staves.length,
        staves: staves,
        parts: parts,
        firstSegment: function() { return segments[0] || null; },
        firstMeasure: spec.firstMeasure || null,
        metaTag: function(k) { return (spec.meta || {})[k] || ""; },
        excerpts: spec.excerpts || []
    };
    api._setScore(score);
    return score;
}

// --- findStaves ---------------------------------------------------------------

test("findStaves picks the staff with the most lyrics as the voice", function() {
    var voice = part("Voice"), guitar = part("Guitar");
    stubScore({
        staves: [{ part: voice }, { part: guitar }],
        bars: [
            { lyrics: { 0: [lyric("uno")] }, harmonies: [{ staff: 1, text: "Lam" }] },
            { lyrics: { 0: [lyric("dos")] }, harmonies: [{ staff: 1, text: "Re" }] }
        ]
    });

    var res = api.findStaves();
    assert.equal(res.voiceStaff, 0, "the staff carrying lyrics: " + JSON.stringify(res));
    assert.equal(res.harmonyStaff, 1, "and the one carrying chords");
    assert.equal(res.voiceStaves.length, 1);
    assert.equal(res.voiceStaves[0].count, 2, "two syllables counted");
});

test("findStaves counts every verse of a staff, not every note", function() {
    stubScore({
        bars: [{ lyrics: { 0: [lyric("uno", 0), lyric("dos", 1), lyric("tres", 2)] } }]
    });
    assert.equal(api.findStaves().voiceStaves[0].count, 3, "three verses on one note");
});

test("findStaves ignores the linked copy of a staff when choosing the chord staff", function() {
    // A part with two staves: the second is the tablature copy, and its chords are the same
    // ones, so they must not win the count
    var voice = part("Voice"), guitar = part("Guitar");
    stubScore({
        staves: [{ part: voice }, { part: guitar }, { part: guitar }],
        bars: [
            { lyrics: { 0: [lyric("uno")] },
              harmonies: [{ staff: 1, text: "Lam" }, { staff: 2, text: "Lam" }] },
            { harmonies: [{ staff: 2, text: "Re" }, { staff: 2, text: "Sol" }] }
        ]
    });

    var res = api.findStaves();
    assert.equal(res.harmonyStaff, 1,
        "the principal staff of the part, not its copy: " + JSON.stringify(res.harmonyStaves));
});

test("findStaves skips the staves of a part that is not shown", function() {
    var shown = part("Voice"), hidden = part("Guitar");
    hidden.show = false;
    hidden.startTrack = 4;
    hidden.endTrack = 8;
    stubScore({
        staves: [{ part: shown }, { part: hidden }],
        bars: [
            { lyrics: { 0: [lyric("uno")], 1: [lyric("nunca")] },
              harmonies: [{ staff: 1, text: "Lam" }] }
        ]
    });

    var res = api.findStaves();
    assert.equal(res.voiceStaves.length, 1, "only the shown staff is offered");
    assert.equal(res.voiceStaves[0].idx, 0);
});

test("findStaves on a score with neither lyrics nor chords reports none", function() {
    stubScore({ bars: [{}] });
    var res = api.findStaves();
    assert.equal(res.voiceStaff, -1);
    assert.equal(res.harmonyStaff, -1);
});

// --- extractChords ------------------------------------------------------------

test("extractChords reads the harmonies of the staff it is given", function() {
    stubScore({
        staves: [{ part: part("Voice") }, { part: part("Guitar") }],
        bars: [
            { harmonies: [{ staff: 1, text: "Lam" }] },
            { harmonies: [{ staff: 1, text: "Re" }] }
        ]
    });

    var chords = api.extractChords(1);
    assert.deepEqual(chords.map(function(c) { return c.chord; }), ["Lam", "Re"]);
    assert.deepEqual(chords.map(function(c) { return c.tick; }), [0, 1920]);
});

test("extractChords keeps staff text as an annotation rather than a chord", function() {
    stubScore({
        bars: [
            { harmonies: [{ staff: 0, text: "Lam" }],
              labels: [{ type: Element.STAFF_TEXT, text: "Muy lento" }] }
        ]
    });

    var chords = api.extractChords(0);
    var texts = chords.filter(function(c) { return c.isText; });
    assert.equal(texts.length, 1, "the staff text is there: " + JSON.stringify(chords));
    assert.equal(texts[0].chord, "Muy-lento", "with its spaces joined, so it stays one token");
    assert.ok(chords.some(function(c) { return c.chord === "Lam" && !c.isText; }),
        "and the chord is still a chord");
});

// --- extractSystemTexts -------------------------------------------------------

test("extractSystemTexts takes system texts and rehearsal marks as labels", function() {
    stubScore({
        bars: [
            { labels: [{ type: Element.SYSTEM_TEXT, text: "Estrofa" }] },
            { labels: [{ type: Element.REHEARSAL_MARK, text: "A" }] }
        ]
    });

    var labels = api.extractSystemTexts().map(function(t) { return t.text; });
    assert.deepEqual(labels, ["Estrofa", "A"]);
});

test("extractSystemTexts drops a rehearsal mark that names its own bar", function() {
    // MuseScore numbers rehearsal marks after their bar for rehearsal references, so a mark
    // reading 2 in the second bar is a bar reference and not a section
    stubScore({
        bars: [
            { labels: [{ type: Element.REHEARSAL_MARK, text: "1" }] },
            { labels: [{ type: Element.REHEARSAL_MARK, text: "2" }] }
        ],
        firstMeasure: null
    });

    var labels = api.extractSystemTexts().map(function(t) { return t.text; });
    // With no measure list the module cannot tell, and keeping them is the safe direction
    assert.ok(labels.length <= 2, "never invents labels: " + labels);
});

test("extractSystemTexts drops a label that is only a repeat count", function() {
    stubScore({
        bars: [
            { labels: [{ type: Element.SYSTEM_TEXT, text: "Estribillo" }] },
            { labels: [{ type: Element.SYSTEM_TEXT, text: "3x" }] },
            { labels: [{ type: Element.SYSTEM_TEXT, text: "x2" }] }
        ]
    });

    assert.deepEqual(api.extractSystemTexts().map(function(t) { return t.text; }), ["Estribillo"],
        "the repeat barline already carries how many times to play");
});

test("extractSystemTexts deduplicates the same label on several staves", function() {
    stubScore({
        bars: [{ labels: [
            { type: Element.SYSTEM_TEXT, text: "Estrofa" },
            { type: Element.SYSTEM_TEXT, text: "Estrofa" }
        ] }]
    });

    assert.equal(api.extractSystemTexts().length, 1, "a label written on two staves is one label");
});

// --- findPartStaffGroups ------------------------------------------------------

test("findPartStaffGroups reports the staves of each part in order", function() {
    var voice = part("Voice"), guitar = part("Guitar");
    stubScore({ staves: [{ part: voice }, { part: guitar }, { part: guitar }], bars: [{}] });

    assert.deepEqual(api.findPartStaffGroups(), [[0], [1, 2]],
        "the first staff of a part leads it and the rest are its copies");
});

test("findPartStaffGroups returns nothing when the parts cannot be read", function() {
    api._setScore({ staves: null, parts: null, firstSegment: function() { return null; } });
    assert.deepEqual(api.findPartStaffGroups(), [], "the caller then leaves the score alone");
});

// --- _isRepeatCountLabel ------------------------------------------------------

test("_isRepeatCountLabel is anchored to the whole text", function() {
    ["3x", "X3", " 4 x "].forEach(function(t) {
        assert.equal(api._isRepeatCountLabel(t), true, JSON.stringify(t));
    });
    ["Estrofa 3x", "3", "x", "Mix", ""].forEach(function(t) {
        assert.equal(api._isRepeatCountLabel(t), false, JSON.stringify(t));
    });
});
