var test = require("node:test");
var assert = require("node:assert/strict");
var path = require("path");
var fs = require("fs");
var msczReader = require("../cli/mscz-reader");
var xmlExtractor = require("../extractors/xml-extractor");
var orchestrator = require("../lib/orchestrator");
var chordUtils = require("../lib/chord-utils");

var FIXTURE_PATH = path.join(__dirname, "fixture.mscz");
var ITS_DIR = path.join(__dirname, "its");
var HOME = process.env.HOME || "";

// Score file lookup: fixture name -> mscz path
var SCORE_MAP = {
    "AlmaLlanera": HOME + "/Music/TunaAlcala/AlmaLlanera/AlmaLlanera.mscz",
    "Clavelitos": HOME + "/Music/TunaAlcala/Clavelitos/Clavelitos.mscz",
    "EstudiantinaMadrilena": HOME + "/Music/TunaAlcala/EstudiantinaMadrileña/EstudiantinaMadrileña.mscz",
    "HorasDeRonda": HOME + "/Music/TunaAlcala/HorasDeRonda/HorasDeRonda.mscz",
    "IsaDelCandidito": HOME + "/Music/TunaAlcala/IsaDelCandidito/IsaDelCandidito.mscz",
    "LosAmigos": HOME + "/Music/TunaAlcala/LosAmigos/LosAmigos.mscz",
    "MalaguenaSalerosa": HOME + "/Music/Cantina/MalagueñaSalerosa/MalagueñaSalerosa.mscz",
    "NochePerfumada": HOME + "/Music/TunaAlcala/NochePerfumada/NochePerfumada.mscz",
    "OjosDeEspaña": HOME + "/Music/TunaAlcala/OjosDeEspaña/OjosDeEspaña.mscz",
    "RondaFiruli": HOME + "/Music/TunaAlcala/RondaDelFiruli/RondaDelFiruli.mscz",
    "Rondalla": HOME + "/Music/TunaAlcala/Rondalla/Rondalla.mscz",
    "SanCayetano": HOME + "/Music/TunaAlcala/SanCayetano/SanCayetano.mscz",
    "TrustTenorios": HOME + "/Music/TunaAlcala/TrustTenorios/TrustTenorios.mscz",
    "TunaCompostelana": HOME + "/Music/TunaAlcala/TunaCompostelana/Compostelana.mscz",
    "VuelaUnaLagrima": HOME + "/Music/TunaAlcala/VuelaUnaLagrima/VuelaUnaLagrima.mscz"
};

// Generate CLI output for a score (same pipeline as cli/index.js)
function generateOutput(msczPath, compact) {
    var xml = msczReader.readScore(msczPath);
    var excerpts = [];
    try { excerpts = msczReader.readGuitarExcerpts(msczPath); } catch (e) {}
    var spelling = msczReader.readSpelling(msczPath);
    var data = xmlExtractor.extractAll(xml, excerpts.map(function(e) { return e.xml; }), spelling);
    if (!data) return null;
    chordUtils.prettifyChords(data.chords);
    if (!compact) data.fullRepeat = true;
    var output = orchestrator.processExtraction(data);
    if (!output) return null;
    return output.replace(/\u200B/g, "");
}

// IT loop: compare each fixture against generated output
var fixtureFiles = fs.existsSync(ITS_DIR) ? fs.readdirSync(ITS_DIR).filter(function(f) { return f.endsWith(".txt"); }) : [];
fixtureFiles.forEach(function(file) {
    var match = file.match(/^(.+)\.(full|compact)\.txt$/);
    if (!match) return;
    var songName = match[1];
    var mode = match[2];
    var msczPath = SCORE_MAP[songName];
    if (!msczPath || !fs.existsSync(msczPath)) return; // skip if score not found

    test("IT: " + songName + "." + mode, function() {
        var expected = fs.readFileSync(path.join(ITS_DIR, file), "utf8");
        var actual = generateOutput(msczPath, mode === "compact");
        assert.ok(actual, "should produce output for " + songName);
        if (actual !== expected) {
            var expLines = expected.split("\n");
            var actLines = actual.split("\n");
            var diffs = [];
            var maxLen = Math.max(expLines.length, actLines.length);
            for (var d = 0; d < maxLen; d++) {
                var el = d < expLines.length ? expLines[d] : undefined;
                var al = d < actLines.length ? actLines[d] : undefined;
                if (el !== al) {
                    if (el !== undefined) diffs.push("  " + (d + 1) + " < " + el);
                    if (al !== undefined) diffs.push("  " + (d + 1) + " > " + al);
                }
            }
            if (diffs.length > 20) diffs = diffs.slice(0, 20).concat(["  ... " + (diffs.length - 20) + " more diffs"]);
            var msg = songName + "." + mode + " diffs:\n\n" + diffs.join("\n") + "\n";
            var err = new Error(msg);
            err.stack = msg;
            throw err;
        }
    });
});

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

test("integration: tpcToChordName handles literal text without root", function() {
    var Constants = require("../lib/constants");
    // Chords without root TPC should return the name as-is
    assert.equal(Constants.tpcToChordName(-99, "Bajos", "solfeggio"), "Bajos");
    assert.equal(Constants.tpcToChordName(-99, "Rem", "standard"), "Rem");
    assert.equal(Constants.tpcToChordName(-99, "", "solfeggio"), "");
});

test("integration: readSpelling returns standard when no style sheet", function() {
    // .mscx files don't have score_style.mss, should default to standard
    var spelling = msczReader.readSpelling("/tmp/nonexistent.mscx");
    assert.equal(spelling, "standard");
});

test("integration: trailing chords appended to last line are not duplicated as coda", function() {
    // Reproduces the 'extra Sol Do' bug: when the last lyric line has trailing
    // chords that fit and are appended, they shouldn't be re-emitted below.
    var data = {
        title: "TEST",
        syllables: [
            { tick: 0, verse: 0, text: "ho", syllabic: "begin", durationQ: 1 },
            { tick: 480, verse: 0, text: "la.", syllabic: "end", durationQ: 1 }
        ],
        chords: [
            { tick: 0, chord: "Do" },
            { tick: 600, chord: "Sol" },
            { tick: 800, chord: "Do" },
            { tick: 1000, chord: "Sol" },
            { tick: 1200, chord: "Do" }
        ],
        repeats: [], voltas: [], markers: [], jumps: [],
        systemTexts: [], barlines: [], lastTick: 1500, division: 480
    };
    var output = orchestrator.processExtraction(data);
    // "Sol Do Sol Do" appended after "hola." should appear exactly once
    var solDoMatches = output.match(/Sol\s+Do/g) || [];
    var solCount = (output.match(/\bSol\b/g) || []).length;
    var doCount = (output.match(/\bDo\b/g) || []).length;
    assert.equal(solCount, 2, "Sol should appear exactly twice (in trailing): " + output);
    assert.equal(doCount, 3, "Do should appear exactly three times (1 inline + 2 trailing): " + output);
});
