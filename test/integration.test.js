// Integration tests: snapshot comparison + fixture.mscz tests
// Snapshot tests compare CLI output against baseline .txt files in test/its/.
//
// The scores live in test/its/scores/ as test_le_<Song>.mscz, copies of the real
// scores that are kept out of git (see .gitignore). Working on copies keeps the
// baselines stable while the originals under ~/Music keep being edited: to pick up
// a change, copy the original over its test_le_ copy by hand.
//
// Each snapshot stores the mtime of the .mscz used to generate it as a trailing
// comment. When a test fails and the score mtime differs, the error warns that
// the score has changed and suggests regenerating.

var test = require("node:test");
var assert = require("node:assert/strict");
var path = require("path");
var fs = require("fs");
var child = require("child_process");
var msczReader = require("../cli/mscz-reader");
var xmlExtractor = require("../extractors/xml-extractor");
var orchestrator = require("../lib/orchestrator");
var chordUtils = require("../lib/chord-utils");

var FIXTURE_PATH = path.join(__dirname, "fixture.mscz");
var BASE = path.resolve(__dirname, "..");
var CLI = path.join(BASE, "cli/index.js");
var ITS_DIR = path.join(__dirname, "its");
var SCORES_DIR = path.join(ITS_DIR, "scores");
var SCORE_PREFIX = "test_le_";

var SONGS = [
    "AlmaLlanera",
    "ChotisMadrid",
    "Clavelitos",
    "EspanaCani",
    "EstudiantinaMadrilena",
    "HorasDeRonda",
    "IsaDelCandidito",
    "LosAmigos",
    "MalaguenaSalerosa",
    "MilagroDeTusOjos",
    "MultiVerso",
    "NochePerfumada",
    "OjosDeEspaña",
    "RondaFiruli",
    "Rondalla",
    "SanCayetano",
    "TrustTenorios",
    "TunaCompostelana",
    "VuelaUnaLagrima"
];

var MTIME_PREFIX = "// mscz-mtime: ";

function getScorePath(song) {
    return path.join(SCORES_DIR, SCORE_PREFIX + song + ".mscz");
}

function getSnapshotPath(song, mode) {
    return path.join(ITS_DIR, SCORE_PREFIX + song + "." + mode + ".txt");
}

function getMsczMtime(scorePath) {
    try { return fs.statSync(scorePath).mtime.toISOString(); } catch (e) { return null; }
}

function readSnapshotMtime(snapshotPath) {
    try {
        var content = fs.readFileSync(snapshotPath, "utf8");
        var lines = content.split("\n");
        var lastLine = lines[lines.length - 1] || lines[lines.length - 2] || "";
        if (lastLine.indexOf(MTIME_PREFIX) === 0) {
            return lastLine.substring(MTIME_PREFIX.length).trim();
        }
    } catch (e) {}
    return null;
}

function runCli(scorePath, flags) {
    return child.execSync(
        "node " + JSON.stringify(CLI) + " " + JSON.stringify(scorePath) + " " + flags,
        { encoding: "utf8", timeout: 30000 }
    );
}

// ============================================================
// Snapshot tests: compare CLI output against baseline .txt files
// ============================================================

var songNames = SONGS;
var scoresExist = songNames.some(function(s) { return fs.existsSync(getScorePath(s)); });

for (var i = 0; i < songNames.length; i++) {
    (function(song) {
        var scorePath = getScorePath(song);
        var compactSnapshot = getSnapshotPath(song, "compact");
        var fullSnapshot = getSnapshotPath(song, "full");

        ["--compact", "--full"].forEach(function(flag) {
            var snapshotPath = flag === "--compact" ? compactSnapshot : fullSnapshot;
            var label = "IT: " + song + "." + flag.replace("--", "");

            test(label, { skip: !scoresExist || !fs.existsSync(scorePath) || !fs.existsSync(snapshotPath) }, function() {
                var rawExpected = fs.readFileSync(snapshotPath, "utf8");
                // Strip mtime comment from expected output for comparison
                var expected = rawExpected.replace(/\n\/\/ mscz-mtime: .+\n?$/, "\n");

                var actual = runCli(scorePath, flag);

                if (actual !== expected) {
                    var snapshotMtime = readSnapshotMtime(snapshotPath);
                    var currentMtime = getMsczMtime(scorePath);
                    var scoreChanged = snapshotMtime && currentMtime && snapshotMtime !== currentMtime;

                    var msg = song + " " + flag + " output changed";
                    if (scoreChanged) {
                        msg += "\n\n  WARNING: Score file has changed since snapshot was generated."
                            + "\n  Snapshot mtime: " + snapshotMtime
                            + "\n  Current mtime:  " + currentMtime
                            + "\n\n  To update, run:"
                            + "\n    node cli/index.js " + JSON.stringify(scorePath) + " " + flag
                            + " > " + JSON.stringify(snapshotPath)
                            + "\n  Then re-run: node test/its/update-mtime.js " + song;
                    } else if (!snapshotMtime) {
                        msg += "\n\n  NOTE: Snapshot has no mtime marker. Run:"
                            + "\n    node test/its/update-mtime.js " + song;
                    }
                    assert.equal(actual, expected, msg);
                }
            });
        });
    })(songNames[i]);
}

// ============================================================
// fixture.mscz tests: data extraction and pipeline validation
// ============================================================

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

    for (var i = 0; i < data.syllables.length; i++) {
        var s = data.syllables[i];
        assert.ok(typeof s.tick === "number", "syllable should have tick");
        assert.ok(typeof s.verse === "number", "syllable should have verse");
        assert.ok(typeof s.text === "string" && s.text.length > 0, "syllable should have text");
        assert.ok(["single", "begin", "end", "middle"].indexOf(s.syllabic) >= 0, "syllable should have valid syllabic");
    }

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
    assert.equal(Constants.tpcToChordName(-99, "Bajos", "solfeggio"), "Bajos");
    assert.equal(Constants.tpcToChordName(-99, "Rem", "standard"), "Rem");
    assert.equal(Constants.tpcToChordName(-99, "", "solfeggio"), "");
});

test("integration: readSpelling returns standard when no style sheet", function() {
    var spelling = msczReader.readSpelling("/tmp/nonexistent.mscx");
    assert.equal(spelling, "standard");
});

test("integration: trailing chords appended to last line are not duplicated as coda", function() {
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
    var solCount = (output.match(/\bSol\b/g) || []).length;
    var doCount = (output.match(/\bDo\b/g) || []).length;
    assert.equal(solCount, 2, "Sol should appear exactly twice (in trailing): " + output);
    assert.equal(doCount, 3, "Do should appear exactly three times (1 inline + 2 trailing): " + output);
});
