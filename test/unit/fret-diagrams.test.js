// Chord diagrams are read from the guitar part of the score and drawn in the PDF, so the text
// snapshots cannot see them: test_le_FretDiagrams.mscz would raise the coverage of
// score/xml-extractor.js without checking a single value. This reads that score back and
// checks what came out, which is what makes the fixture worth having.
//
// The score is written by test/its/build-fret-diagrams.js, and its comment says what each
// diagram is there for.

var test = require("node:test");
var assert = require("node:assert/strict");
var path = require("path");

var reader = require("../../score/mscz-reader");
var extractor = require("../../score/xml-extractor");

var SCORE = path.join(__dirname, "..", "its", "scores", "test_le_FretDiagrams.mscz");

function diagrams() {
    var excerpts = reader.readGuitarExcerpts(SCORE).map(function(e) { return e.xml; });
    return extractor.extractAll(reader.readScore(SCORE), excerpts, "solfeggio", {}).fretDiagrams;
}

function byName(list, name) {
    return list.filter(function(d) { return d.chordName === name; })[0];
}

// A string as the renderer sees it: its marker, the fret of its dot, or nothing at all
function shape(diagram) {
    return diagram.strings.map(function(s) {
        return s.marker || (s.dot ? String(s.dot.fret) : "-");
    }).join(" ");
}

test("the diagrams are found in the guitar part, not in the main score", function() {
    // MuseScore keeps the fret frame in the tablature part, so a reader that only looks at the
    // main score finds nothing: this is what the plugin's "chord diagrams not found" was about
    var main = extractor.extractAll(reader.readScore(SCORE), [], "solfeggio", {});
    assert.deepEqual(main.fretDiagrams, [], "the main score carries no fret frame");

    assert.equal(diagrams().length, 5, "and the part carries five drawable diagrams");
});

test("a diagram with a root note and a modifier is named from both", function() {
    var lam = byName(diagrams(), "Lam");
    assert.ok(lam, "the A minor diagram is there");
    assert.equal(shape(lam), "cross circle 2 2 1 circle");
    assert.equal(lam.numFrets, 4, "four frets unless the score says otherwise");
    assert.equal(lam.fretOffset, 0);
    assert.equal(lam.barre, null);
});

test("a diagram with no root note keeps the name as it was typed", function() {
    var solm = byName(diagrams(), "Solm");
    assert.ok(solm, "a chord MuseScore did not parse is still a chord: " +
        diagrams().map(function(d) { return d.chordName; }).join(", "));
    assert.equal(shape(solm), "cross cross 5 5 3 3");
});

test("a barre is read with the strings it spans and the fret it sits on", function() {
    var fa = byName(diagrams(), "Fa");
    assert.deepEqual(fa.barre, { start: 0, end: 5, fret: 1 });
});

test("a diagram up the neck keeps its fret count and its offset", function() {
    var sib = byName(diagrams(), "Sib7");
    assert.ok(sib, "the flat root is spelled in solfeo");
    assert.equal(sib.numFrets, 8);
    assert.equal(sib.fretOffset, 5, "five frets up, so the diagram is labelled from the sixth");
});

test("the same diagram written twice is kept once", function() {
    var lams = diagrams().filter(function(d) { return d.chordName === "Lam"; });
    assert.equal(lams.length, 1, "the player only needs to be shown the shape once");
});

test("a hidden diagram is not drawn", function() {
    assert.equal(byName(diagrams(), "Do"), undefined,
        "a diagram made invisible in the score is invisible in the PDF too");
});

test("a dot on fret zero and an unknown marker leave the string empty", function() {
    var re = byName(diagrams(), "Re");
    assert.equal(shape(re), "cross cross - 2 3 -",
        "six strings are still reported, two of them with nothing on them");
});

test("a diagram that cannot be named is dropped", function() {
    // Four of them: no chord attached, a chord with nothing in it, a chord that is neither a
    // root nor a name, and a root that is not a note. None can be labelled, so none is drawn
    assert.equal(diagrams().length, 5, "eleven diagrams in the score, five that can be drawn");
});
