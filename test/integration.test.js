var test = require("node:test");
var assert = require("node:assert/strict");
var path = require("path");
var msczReader = require("../cli/mscz-reader");
var xmlExtractor = require("../extractors/xml-extractor");
var orchestrator = require("../lib/orchestrator");

var FIXTURE_PATH = path.join(__dirname, "fixture.mscz");

test("integration: fixture.mscz reads and extracts correctly", function() {
    var xml = msczReader.readScore(FIXTURE_PATH);
    assert.ok(xml.length > 100, "XML should be substantial");
    assert.ok(xml.indexOf("<museScore") >= 0, "Should contain museScore root element");
    assert.ok(xml.indexOf("<Score") >= 0, "Should contain Score element");
});

test("integration: fixture.mscz spelling detection", function() {
    var spelling = msczReader.readSpelling(FIXTURE_PATH);
    assert.equal(spelling, "solfeggio", "fixture has solfeo spelling in score_style.mss");
});

test("integration: fixture.mscz data structure integrity", function() {
    var xml = msczReader.readScore(FIXTURE_PATH);
    var spelling = msczReader.readSpelling(FIXTURE_PATH);
    var data = xmlExtractor.extractAll(xml, [], spelling);

    assert.ok(data.syllables.length >= 3, "Should have syllables");
    assert.ok(data.chords.length >= 2, "Should have chords");
    assert.equal(data.repeats.length, 1, "Should have 1 repeat");

    // All syllables should have required fields
    for (var i = 0; i < data.syllables.length; i++) {
        var s = data.syllables[i];
        assert.ok(typeof s.tick === "number", "syllable should have tick");
        assert.ok(typeof s.verse === "number", "syllable should have verse");
        assert.ok(typeof s.text === "string" && s.text.length > 0, "syllable should have text");
        assert.ok(["single", "begin", "end", "middle"].indexOf(s.syllabic) >= 0, "syllable should have valid syllabic");
    }

    // All chords should have required fields
    for (var j = 0; j < data.chords.length; j++) {
        var c = data.chords[j];
        assert.ok(typeof c.tick === "number", "chord should have tick");
        assert.ok(typeof c.chord === "string" && c.chord.length > 0, "chord should have chord name");
    }
});

test("integration: fixture.mscz produces solfeo chord names", function() {
    var xml = msczReader.readScore(FIXTURE_PATH);
    var spelling = msczReader.readSpelling(FIXTURE_PATH);
    var data = xmlExtractor.extractAll(xml, [], spelling);

    // With solfeo spelling, chords should use solfeo names
    assert.equal(data.chords[0].chord, "Lam", "first chord should be Lam (solfeo)");
    assert.equal(data.chords[1].chord, "Mi7", "second chord should be Mi7 (solfeo)");
    assert.equal(data.chords[2].chord, "La", "third chord should be La (solfeo)");
});

test("integration: fixture.mscz produces anglo chord names with standard spelling", function() {
    var xml = msczReader.readScore(FIXTURE_PATH);
    var data = xmlExtractor.extractAll(xml, [], "standard");

    assert.equal(data.chords[0].chord, "Am", "first chord should be Am (anglo)");
    assert.equal(data.chords[1].chord, "E7", "second chord should be E7 (anglo)");
    assert.equal(data.chords[2].chord, "A", "third chord should be A (anglo)");
});

test("integration: fixture.mscz orchestrator produces output", function() {
    var xml = msczReader.readScore(FIXTURE_PATH);
    var spelling = msczReader.readSpelling(FIXTURE_PATH);
    var data = xmlExtractor.extractAll(xml, [], spelling);
    var output = orchestrator.processExtraction(data);

    assert.ok(output, "Should produce output");
    assert.ok(output.indexOf("TEST FIXTURE") >= 0, "Should contain title");
    assert.ok(output.indexOf("Mi7") >= 0, "Should contain solfeo chord Mi7");
    assert.ok(output.indexOf("Hel") >= 0, "Should contain lyrics");
});
