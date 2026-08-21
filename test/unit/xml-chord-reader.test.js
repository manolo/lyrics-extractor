// Lyrics Extractor for MuseScore
// Copyright (C) 2026 Manolo Carrasco (do2tis)
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Licensed under the GNU General Public License version 3 or later, with an
// additional attribution requirement under section 7(b): see LICENSE and ATTRIBUTION.md.

var test = require("node:test");
var assert = require("node:assert/strict");
var reader = require("../../score/xml-chord-reader");
var Constants = require("../../lib/constants");

// Score with FretDiagram chords (the case the plugin can't handle via QML API)
var FRETDIAGRAM_SCORE = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<museScore version="4.40">',
    '<Score>',
    '<Division>480</Division>',
    '<Part><Staff id="1"><StaffType group="pitched"/></Staff></Part>',
    '<Staff id="1">',
    '<Measure>',
    '<voice>',
    '<FretDiagram>',
    '<Harmony><harmonyInfo><root>18</root><name>m</name></harmonyInfo></Harmony>',
    '<fretDiagram><string no="0"><marker>cross</marker></string></fretDiagram>',
    '</FretDiagram>',
    '<Chord><durationType>quarter</durationType><Note><pitch>60</pitch></Note></Chord>',
    '<Chord><durationType>quarter</durationType><Note><pitch>62</pitch></Note></Chord>',
    '<FretDiagram>',
    '<Harmony><harmonyInfo><root>17</root></harmonyInfo></Harmony>',
    '<fretDiagram><string no="0"><marker>circle</marker></string></fretDiagram>',
    '</FretDiagram>',
    '<Chord><durationType>half</durationType><Note><pitch>64</pitch></Note></Chord>',
    '</voice>',
    '</Measure>',
    '</Staff>',
    '</Score>',
    '</museScore>'
].join("\n");

// Score with standalone Harmony
var HARMONY_SCORE = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<museScore version="4.40">',
    '<Score>',
    '<Division>480</Division>',
    '<Part><Staff id="1"><StaffType group="pitched"/></Staff></Part>',
    '<Staff id="1">',
    '<Measure>',
    '<voice>',
    '<Harmony><harmonyInfo><root>14</root></harmonyInfo></Harmony>',
    '<Chord><durationType>half</durationType><Note><pitch>60</pitch></Note></Chord>',
    '<Harmony><harmonyInfo><root>15</root><name>7</name></harmonyInfo></Harmony>',
    '<Chord><durationType>half</durationType><Note><pitch>64</pitch></Note></Chord>',
    '</voice>',
    '</Measure>',
    '</Staff>',
    '</Score>',
    '</museScore>'
].join("\n");

// Score with both FretDiagram and standalone Harmony
var MIXED_SCORE = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<museScore version="4.40">',
    '<Score>',
    '<Division>480</Division>',
    '<Part><Staff id="1"><StaffType group="pitched"/></Staff></Part>',
    '<Staff id="1">',
    '<Measure>',
    '<voice>',
    '<FretDiagram>',
    '<Harmony><harmonyInfo><root>14</root><name>m</name></harmonyInfo></Harmony>',
    '<fretDiagram></fretDiagram>',
    '</FretDiagram>',
    '<Chord><durationType>quarter</durationType><Note><pitch>60</pitch></Note></Chord>',
    '<Harmony><harmonyInfo><root>15</root></harmonyInfo></Harmony>',
    '<Chord><durationType>quarter</durationType><Note><pitch>62</pitch></Note></Chord>',
    '<Chord><durationType>half</durationType><Note><pitch>64</pitch></Note></Chord>',
    '</voice>',
    '</Measure>',
    '</Staff>',
    '</Score>',
    '</museScore>'
].join("\n");

test("extractChords extracts chords from FretDiagram elements", function() {
    var chords = reader.extractChords(FRETDIAGRAM_SCORE, Constants);
    assert.equal(chords.length, 2);
    assert.equal(chords[0].chord, "Em");  // root=18 (E) + name=m
    assert.equal(chords[0].tick, 0);
    assert.equal(chords[1].chord, "A");  // root=17 (A), no name, default=standard
    assert.equal(chords[1].tick, 960);    // after quarter + quarter = 480+480
});

test("extractChords extracts standalone Harmony elements", function() {
    var chords = reader.extractChords(HARMONY_SCORE, Constants);
    assert.equal(chords.length, 2);
    assert.equal(chords[0].chord, "C");   // root=14 (C), no name, default=standard
    assert.equal(chords[0].tick, 0);
    assert.equal(chords[1].chord, "G7");   // root=15 (G) + name=7
    assert.equal(chords[1].tick, 960);     // after half = 960
});

test("extractChords handles mixed FretDiagram and Harmony", function() {
    var chords = reader.extractChords(MIXED_SCORE, Constants);
    assert.equal(chords.length, 2);
    assert.equal(chords[0].chord, "Cm");   // root=14 (C) + name=m -> FretDiagram
    assert.equal(chords[0].tick, 0);
    assert.equal(chords[1].chord, "G");  // root=15 (G), standalone Harmony, default=standard
    assert.equal(chords[1].tick, 480);
});

test("extractChords excludes linked staves", function() {
    var xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<museScore version="4.40">',
        '<Score>',
        '<Division>480</Division>',
        '<Part>',
        '<Staff id="1"><StaffType group="pitched"/></Staff>',
        '<Staff id="2"><linkedTo>1</linkedTo><StaffType group="tablature"/></Staff>',
        '</Part>',
        '<Staff id="1">',
        '<Measure><voice>',
        '<FretDiagram><Harmony><harmonyInfo><root>14</root></harmonyInfo></Harmony><fretDiagram></fretDiagram></FretDiagram>',
        '<Chord><durationType>whole</durationType><Note><pitch>60</pitch></Note></Chord>',
        '</voice></Measure>',
        '</Staff>',
        '<Staff id="2">',
        '<Measure><voice>',
        '<FretDiagram><Harmony><harmonyInfo><root>14</root></harmonyInfo></Harmony><fretDiagram></fretDiagram></FretDiagram>',
        '<FretDiagram><Harmony><harmonyInfo><root>18</root><name>m</name></harmonyInfo></Harmony><fretDiagram></fretDiagram></FretDiagram>',
        '<Chord><durationType>whole</durationType><Note><pitch>60</pitch></Note></Chord>',
        '</voice></Measure>',
        '</Staff>',
        '</Score>',
        '</museScore>'
    ].join("\n");

    var chords = reader.extractChords(xml, Constants);
    assert.equal(chords.length, 1, "should only have chords from non-linked staff");
    assert.equal(chords[0].chord, "C");
});

test("extractChords handles time signature changes", function() {
    var xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<museScore version="4.40">',
        '<Score>',
        '<Division>480</Division>',
        '<Part><Staff id="1"><StaffType group="pitched"/></Staff></Part>',
        '<Staff id="1">',
        '<Measure>',
        '<voice>',
        '<TimeSig><sigN>3</sigN><sigD>4</sigD></TimeSig>',
        '<FretDiagram><Harmony><harmonyInfo><root>14</root></harmonyInfo></Harmony><fretDiagram></fretDiagram></FretDiagram>',
        '<Chord><durationType>quarter</durationType><Note><pitch>60</pitch></Note></Chord>',
        '<Chord><durationType>quarter</durationType><Note><pitch>62</pitch></Note></Chord>',
        '<Chord><durationType>quarter</durationType><Note><pitch>64</pitch></Note></Chord>',
        '</voice>',
        '</Measure>',
        '<Measure>',
        '<voice>',
        '<FretDiagram><Harmony><harmonyInfo><root>15</root></harmonyInfo></Harmony><fretDiagram></fretDiagram></FretDiagram>',
        '<Chord><durationType>quarter</durationType><Note><pitch>65</pitch></Note></Chord>',
        '<Chord><durationType>half</durationType><Note><pitch>67</pitch></Note></Chord>',
        '</voice>',
        '</Measure>',
        '</Staff>',
        '</Score>',
        '</museScore>'
    ].join("\n");

    var chords = reader.extractChords(xml, Constants);
    assert.equal(chords.length, 2);
    assert.equal(chords[0].tick, 0);
    assert.equal(chords[1].tick, 1440, "second chord at tick 1440 (3 quarters in 3/4)");
});

test("extractChords handles tuplets correctly", function() {
    var xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<museScore version="4.40">',
        '<Score>',
        '<Division>480</Division>',
        '<Part><Staff id="1"><StaffType group="pitched"/></Staff></Part>',
        '<Staff id="1">',
        '<Measure>',
        '<voice>',
        '<FretDiagram><Harmony><harmonyInfo><root>14</root></harmonyInfo></Harmony><fretDiagram></fretDiagram></FretDiagram>',
        '<Tuplet><normalNotes>2</normalNotes><actualNotes>3</actualNotes></Tuplet>',
        '<Chord><durationType>quarter</durationType><Note><pitch>60</pitch></Note></Chord>',
        '<Chord><durationType>quarter</durationType><Note><pitch>62</pitch></Note></Chord>',
        '<Chord><durationType>quarter</durationType><Note><pitch>64</pitch></Note></Chord>',
        '<endTuplet/>',
        '<FretDiagram><Harmony><harmonyInfo><root>15</root></harmonyInfo></Harmony><fretDiagram></fretDiagram></FretDiagram>',
        '<Chord><durationType>half</durationType><Note><pitch>65</pitch></Note></Chord>',
        '</voice>',
        '</Measure>',
        '</Staff>',
        '</Score>',
        '</museScore>'
    ].join("\n");

    var chords = reader.extractChords(xml, Constants);
    assert.equal(chords.length, 2);
    assert.equal(chords[0].tick, 0);
    assert.equal(chords[1].tick, 960, "chord after triplet at 960");
});

test("extractChords skips grace notes in tick calculation", function() {
    var xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<museScore version="4.40">',
        '<Score>',
        '<Division>480</Division>',
        '<Part><Staff id="1"><StaffType group="pitched"/></Staff></Part>',
        '<Staff id="1">',
        '<Measure>',
        '<voice>',
        '<FretDiagram><Harmony><harmonyInfo><root>14</root></harmonyInfo></Harmony><fretDiagram></fretDiagram></FretDiagram>',
        '<Chord><durationType>quarter</durationType><Note><pitch>60</pitch></Note></Chord>',
        '<Chord><durationType>eighth</durationType><acciaccatura/><Note><pitch>61</pitch></Note></Chord>',
        '<FretDiagram><Harmony><harmonyInfo><root>15</root></harmonyInfo></Harmony><fretDiagram></fretDiagram></FretDiagram>',
        '<Chord><durationType>quarter</durationType><Note><pitch>62</pitch></Note></Chord>',
        '</voice>',
        '</Measure>',
        '</Staff>',
        '</Score>',
        '</museScore>'
    ].join("\n");

    var chords = reader.extractChords(xml, Constants);
    assert.equal(chords.length, 2);
    assert.equal(chords[1].tick, 480, "grace note should not shift tick");
});

test("extractChords returns empty array for invalid XML", function() {
    assert.equal(reader.extractChords("not xml", Constants).length, 0);
});

test("extractChords handles irregular measure len", function() {
    var xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<museScore version="4.40">',
        '<Score>',
        '<Division>480</Division>',
        '<Part><Staff id="1"><StaffType group="pitched"/></Staff></Part>',
        '<Staff id="1">',
        '<Measure len="1/4">',
        '<voice>',
        '<Harmony><harmonyInfo><root>14</root></harmonyInfo></Harmony>',
        '<Chord><durationType>quarter</durationType><Note><pitch>60</pitch></Note></Chord>',
        '</voice>',
        '</Measure>',
        '<Measure>',
        '<voice>',
        '<Harmony><harmonyInfo><root>15</root></harmonyInfo></Harmony>',
        '<Chord><durationType>whole</durationType><Note><pitch>62</pitch></Note></Chord>',
        '</voice>',
        '</Measure>',
        '</Staff>',
        '</Score>',
        '</museScore>'
    ].join("\n");

    var chords = reader.extractChords(xml, Constants);
    assert.equal(chords.length, 2);
    assert.equal(chords[1].tick, 480, "second measure starts at 480 (after 1/4 pickup)");
});

test("extractChords TPC Anglo reconstruction for solfeo chords", function() {
    var xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<museScore version="4.40">',
        '<Score>',
        '<Division>480</Division>',
        '<Part><Staff id="1"><StaffType group="pitched"/></Staff></Part>',
        '<Staff id="1">',
        '<Measure>',
        '<voice>',
        '<FretDiagram>',
        '<Harmony><harmonyInfo><root>16</root><name>o</name></harmonyInfo></Harmony>',
        '<fretDiagram></fretDiagram>',
        '</FretDiagram>',
        '<Chord><durationType>half</durationType><Note><pitch>60</pitch></Note></Chord>',
        '<FretDiagram>',
        '<Harmony><harmonyInfo><root>13</root><name>a#7</name></harmonyInfo></Harmony>',
        '<fretDiagram></fretDiagram>',
        '</FretDiagram>',
        '<Chord><durationType>half</durationType><Note><pitch>65</pitch></Note></Chord>',
        '</voice>',
        '</Measure>',
        '</Staff>',
        '</Score>',
        '</museScore>'
    ].join("\n");

    var chords = reader.extractChords(xml, Constants);
    assert.equal(chords.length, 2);
    assert.equal(chords[0].chord, "Do", "TPC 16 (D) + name 'o' = 'Do'");
    assert.equal(chords[1].chord, "Fa#7", "TPC 13 (F) + name 'a#7' = 'Fa#7'");
});

// --- extractFretDiagrams tests ---

test("extractFretDiagrams extracts diagrams from FBox", function() {
    var xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<museScore version="4.40">',
        '<Score>',
        '<Division>480</Division>',
        '<Part><Staff id="1"><StaffType group="pitched"/></Staff></Part>',
        '<Staff id="1">',
        '<FBox>',
        '<FretDiagram>',
        '<Harmony><harmonyInfo><root>16</root><name>o</name></harmonyInfo></Harmony>',
        '<fretDiagram>',
        '<string no="0"><marker>cross</marker></string>',
        '<string no="2"><dot fret="2"/></string>',
        '<string no="4"><marker>circle</marker></string>',
        '</fretDiagram>',
        '</FretDiagram>',
        '<FretDiagram>',
        '<fretOffset>3</fretOffset>',
        '<frets>5</frets>',
        '<Harmony><harmonyInfo><root>17</root><name>m</name></harmonyInfo></Harmony>',
        '<fretDiagram>',
        '<string no="1"><dot fret="1"/></string>',
        '<barre start="0" end="5">1</barre>',
        '</fretDiagram>',
        '</FretDiagram>',
        '</FBox>',
        '</Staff>',
        '</Score>',
        '</museScore>'
    ].join("\n");

    var diagrams = reader.extractFretDiagrams(xml);
    assert.equal(diagrams.length, 2);

    assert.equal(diagrams[0].chordName, "Reo"); // TPC 16 = Re (Spanish) + "o" = "Reo"
    assert.equal(diagrams[0].fretOffset, 0);
    assert.equal(diagrams[0].numFrets, 4); // default
    assert.equal(diagrams[0].strings.length, 3);
    assert.equal(diagrams[0].strings[0].marker, "cross");
    assert.equal(diagrams[0].strings[1].dot.fret, 2);
    assert.equal(diagrams[0].strings[2].marker, "circle");

    assert.equal(diagrams[1].chordName, "Lam");
    assert.equal(diagrams[1].fretOffset, 3);
    assert.equal(diagrams[1].numFrets, 5);
    assert.equal(diagrams[1].barre.start, 0);
    assert.equal(diagrams[1].barre.end, 5);
    assert.equal(diagrams[1].barre.fret, 1);
});

test("extractFretDiagrams returns empty when no FBox", function() {
    var xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<museScore version="4.40">',
        '<Score><Division>480</Division>',
        '<Part><Staff id="1"><StaffType group="pitched"/></Staff></Part>',
        '<Staff id="1"><Measure><voice>',
        '<Chord><durationType>whole</durationType><Note><pitch>60</pitch></Note></Chord>',
        '</voice></Measure></Staff>',
        '</Score></museScore>'
    ].join("\n");

    assert.equal(reader.extractFretDiagrams(xml).length, 0);
});

test("extractFretDiagrams deduplicates identical diagrams", function() {
    var xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<museScore version="4.40">',
        '<Score><Division>480</Division>',
        '<Part><Staff id="1"><StaffType group="pitched"/></Staff></Part>',
        '<Staff id="1">',
        '<FBox>',
        '<FretDiagram>',
        '<Harmony><harmonyInfo><root>14</root></harmonyInfo></Harmony>',
        '<fretDiagram><string no="0"><marker>cross</marker></string></fretDiagram>',
        '</FretDiagram>',
        '<FretDiagram>',
        '<Harmony><harmonyInfo><root>14</root></harmonyInfo></Harmony>',
        '<fretDiagram><string no="0"><marker>cross</marker></string></fretDiagram>',
        '</FretDiagram>',
        '</FBox>',
        '</Staff></Score></museScore>'
    ].join("\n");

    assert.equal(reader.extractFretDiagrams(xml).length, 1, "duplicate diagrams should be deduplicated");
});

test("extractFretDiagrams skips hidden diagrams", function() {
    var xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<museScore version="4.40">',
        '<Score><Division>480</Division>',
        '<Part><Staff id="1"><StaffType group="pitched"/></Staff></Part>',
        '<Staff id="1"><FBox>',
        '<FretDiagram>',
        '<Harmony><harmonyInfo><root>14</root></harmonyInfo></Harmony>',
        '<fretDiagram><string no="0"><marker>cross</marker></string></fretDiagram>',
        '</FretDiagram>',
        '<FretDiagram>',
        '<visible>0</visible>',
        '<Harmony><harmonyInfo><root>15</root></harmonyInfo></Harmony>',
        '<fretDiagram><string no="0"><marker>circle</marker></string></fretDiagram>',
        '</FretDiagram>',
        '</FBox></Staff></Score></museScore>'
    ].join("\n");

    var diagrams = reader.extractFretDiagrams(xml);
    assert.equal(diagrams.length, 1, "should skip hidden diagram");
    assert.equal(diagrams[0].chordName, "Do");
});

test("extractFretDiagrams extracts literal chord names without root TPC", function() {
    var xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<museScore version="4.40">',
        '<Score><Division>480</Division>',
        '<Part><Staff id="1"><StaffType group="pitched"/></Staff></Part>',
        '<Staff id="1"><FBox>',
        '<FretDiagram>',
        '<Harmony><harmonyInfo><name>Rem</name></harmonyInfo></Harmony>',
        '<fretDiagram><string no="1"><dot fret="1"/></string></fretDiagram>',
        '</FretDiagram>',
        '<FretDiagram>',
        '<Harmony><harmonyInfo><name>Si7</name></harmonyInfo></Harmony>',
        '<fretDiagram><string no="0"><marker>circle</marker></string></fretDiagram>',
        '</FretDiagram>',
        '</FBox></Staff></Score></museScore>'
    ].join("\n");

    var diagrams = reader.extractFretDiagrams(xml);
    assert.equal(diagrams.length, 2, "should extract literal chord names");
    assert.equal(diagrams[0].chordName, "Rem");
    assert.equal(diagrams[1].chordName, "Si7");
});

// ============================================================
// Inline text annotations (StaffText, Expression, PlayTechAnnotation)
// ============================================================

test("extractChords picks up StaffText, Expression and PlayTechAnnotation as chord text", function() {
    var xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<museScore version="4.40"><Score><Division>480</Division>',
        '<Part><Staff id="1"><StaffType group="pitched"/></Staff></Part>',
        '<Staff id="1"><Measure><voice>',
        '<StaffText><text>Staff text</text></StaffText>',
        '<Chord><durationType>quarter</durationType><Note><pitch>60</pitch></Note></Chord>',
        '<PlayTechAnnotation><playTechType>harmonics</playTechType><text>harmonics</text></PlayTechAnnotation>',
        '<Chord><durationType>quarter</durationType><Note><pitch>62</pitch></Note></Chord>',
        '<Expression><text>rit.</text></Expression>',
        '<Harmony><harmonyInfo><root>15</root></harmonyInfo></Harmony>',
        '<Chord><durationType>half</durationType><Note><pitch>64</pitch></Note></Chord>',
        '</voice></Measure></Staff></Score></museScore>'
    ].join("\n");

    var chords = reader.extractChords(xml, Constants, "solfeggio");
    var names = chords.map(function(c) { return c.chord; });
    // Internal whitespace is collapsed to '-' so each text is one token
    assert.ok(names.indexOf("Staff-text") >= 0, "should have Staff-text: " + names);
    assert.ok(names.indexOf("harmonics") >= 0, "should have harmonics: " + names);
    assert.ok(names.indexOf("rit.") >= 0, "should have rit.: " + names);
    assert.ok(names.indexOf("Sol") >= 0, "should have Sol: " + names);
});

test("extractChords reads bass note of slash chords", function() {
    var xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<museScore version="4.40"><Score>',
        '<Division>480</Division>',
        '<Part><Staff id="1"><StaffType group="pitched"/></Staff></Part>',
        '<Staff id="1"><Measure><voice>',
        '<FretDiagram>',
        '<Harmony><harmonyInfo><root>12</root><bass>13</bass></harmonyInfo></Harmony>',
        '<fretDiagram></fretDiagram>',
        '</FretDiagram>',
        '<Chord><durationType>half</durationType><Note><pitch>60</pitch></Note></Chord>',
        '<Harmony><harmonyInfo><root>17</root><name>m</name><bass>18</bass></harmonyInfo></Harmony>',
        '<Chord><durationType>half</durationType><Note><pitch>62</pitch></Note></Chord>',
        '</voice></Measure></Staff></Score></museScore>'
    ].join("\n");

    var chords = reader.extractChords(xml, Constants, "standard");
    var names = chords.map(function(c) { return c.chord; });
    assert.ok(names.indexOf("Bb/F") >= 0, "should include Bb/F: " + names);
    assert.ok(names.indexOf("Am/E") >= 0, "should include Am/E: " + names);
});

test("extractChords applies voice-level location offsets", function() {
    var xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<museScore version="4.40"><Score>',
        '<Division>480</Division>',
        '<Part><Staff id="1"><StaffType group="pitched"/></Staff></Part>',
        '<Staff id="1"><Measure><voice>',
        '<Chord><durationType>whole</durationType><Note><pitch>60</pitch></Note></Chord>',
        '<location><fractions>-1/4</fractions></location>',
        '<Harmony><harmonyInfo><root>14</root></harmonyInfo></Harmony>',
        '</voice></Measure></Staff></Score></museScore>'
    ].join("\n");

    var chords = reader.extractChords(xml, Constants, "standard");
    assert.equal(chords.length, 1);
    assert.equal(chords[0].tick, 1440, "location -1/4 should rewind one quarter from 1920");
});

// --- An annotation sharing a tick with a harmony -----------------------------
//
// This reader is what the dialog falls back to when the fret diagrams have to be read from
// the file on disk, so it answers the same question as xml-extractor and needs the same
// answer: a staff text is flagged, and the flag survives the filter to the chord staff.
// Without it, findChordAtTick has no tie-break and the annotation takes the harmony's tick.

var chordUtils = require("../../lib/chord-utils");

var SAME_TICK_SCORE = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<museScore version="4.40">',
    '<Score>',
    '<Division>480</Division>',
    '<Part><Staff id="1"><StaffType group="pitched"/></Staff></Part>',
    '<Staff id="1">',
    '<Measure>',
    '<voice>',
    '<Harmony><harmonyInfo><root>16</root><name>maj7</name></harmonyInfo></Harmony>',
    '<StaffText><text>Continue rhythm</text></StaffText>',
    '<Chord><durationType>half</durationType><Note><pitch>60</pitch></Note></Chord>',
    '</voice>',
    '</Measure>',
    '</Staff>',
    '</Score>',
    '</museScore>'
].join("\n");

test("extractChords marks a staff text as an annotation, not as a chord", function() {
    var chords = reader.extractChords(SAME_TICK_SCORE, Constants);

    assert.equal(chords.length, 2, "both the harmony and the staff text are on the chord line");
    var annotation = chords[0].isText ? chords[0] : chords[1];
    var harmony = chords[0].isText ? chords[1] : chords[0];

    assert.equal(annotation.isText, true);
    assert.equal(harmony.isText, undefined);
    assert.equal(chordUtils.findChordAtTick(chords, harmony.tick), harmony.chord,
        "the harmony holds its tick, whatever order the file wrote the two in");
});
