var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("fs");
var path = require("path");
var msczReader = require("../cli/mscz-reader");
var xmlExtractor = require("../extractors/xml-extractor");
var orchestrator = require("../lib/orchestrator");

var RONDALLA_PATH = path.join(process.env.HOME, "Music/TunaAlcala/Rondalla/Rondalla.mscz");
var GOLDEN_PATH = path.join(__dirname, "golden-rondalla.txt");

test("integration: Rondalla.mscz produces golden output", function() {
    if (!fs.existsSync(RONDALLA_PATH)) {
        console.log("Skipping: Rondalla.mscz not found at " + RONDALLA_PATH);
        return;
    }

    var xml = msczReader.readScore(RONDALLA_PATH);
    var data = xmlExtractor.extractAll(xml);
    var output = orchestrator.processExtraction(data);

    var golden = fs.readFileSync(GOLDEN_PATH, "utf8");
    assert.equal(output, golden, "Output should match golden file");
});

test("integration: Rondalla.mscz data structure integrity", function() {
    if (!fs.existsSync(RONDALLA_PATH)) {
        console.log("Skipping: Rondalla.mscz not found");
        return;
    }

    var xml = msczReader.readScore(RONDALLA_PATH);
    var data = xmlExtractor.extractAll(xml);

    assert.ok(data.syllables.length > 100, "Should have many syllables");
    assert.ok(data.chords.length > 20, "Should have many chords");
    assert.equal(data.repeats.length, 3, "Should have 3 repeats");
    assert.equal(data.voltas.length, 3, "Should have 3 voltas");

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

test("integration: mscz-reader reads ZIP correctly", function() {
    if (!fs.existsSync(RONDALLA_PATH)) {
        console.log("Skipping: Rondalla.mscz not found");
        return;
    }

    var xml = msczReader.readScore(RONDALLA_PATH);
    assert.ok(xml.length > 1000, "XML should be substantial");
    assert.ok(xml.indexOf("<museScore") >= 0, "Should contain museScore root element");
    assert.ok(xml.indexOf("<Score") >= 0, "Should contain Score element");
});
