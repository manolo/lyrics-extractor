// Integration snapshot tests: verify CLI output matches baseline snapshots.
// Scores are read from ~/Music (local environment). Each snapshot .txt stores
// the mtime of the .mscz used to generate it as a comment on the first line.
// When a test fails and the score mtime differs from the snapshot, the error
// message warns that the score has changed and suggests regenerating.

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("fs");
var path = require("path");
var child = require("child_process");
var os = require("os");

var BASE = path.resolve(__dirname, "../..");
var CLI = path.join(BASE, "cli/index.js");
var SNAPSHOTS_DIR = __dirname;
var MUSIC_DIR = path.join(os.homedir(), "Music");

// Song name -> path relative to ~/Music (without .mscz extension)
var SONGS = {
    "EstudiantinaMadrilena": "TunaAlcala/EstudiantinaMadrileña/EstudiantinaMadrileña",
    "EspanaCani":            "TunaAlcala/EspañaCañi/EspañaCañi",
    "TrustTenorios":         "Zarzuela/TrustTenorios/TrustTenorios",
    "SanCayetano":           "TunaAlcala/SanCayetano/SanCayetano",
    "NochePerfumada":        "TunaAlcala/NochePerfumada/NochePerfumada",
    "Rondalla":              "TunaAlcala/Rondalla/Rondalla",
    "HorasDeRonda":          "TunaAlcala/HorasDeRonda/HorasDeRonda",
    "TunaCompostelana":      "TunaAlcala/TunaCompostelana/Compostelana",
    "AlmaLlanera":           "TunaAlcala/AlmaLlanera/AlmaLlanera",
    "MalaguenaSalerosa":     "Cantina/MalagueñaSalerosa/MalagueñaSalerosa",
    "IsaDelCandidito":       "TunaAlcala/IsaDelCandidito/IsaDelCandidito",
    "Clavelitos":            "TunaAlcala/Clavelitos/Clavelitos",
    "LosAmigos":             "TunaAlcala/LosAmigos/LosAmigos",
    "RondaFiruli":           "TunaAlcala/RondaDelFiruli/RondaFiruli",
    "OjosDeEspaña":          "TunaAlcala/OjosDeEspaña/OjosDeEspaña",
    "VuelaUnaLagrima":       "TunaAlcala/VuelaUnaLagrima/VuelaUnaLagrima"
};

// Mtime marker stored as a comment at the end of each snapshot file.
// Format: "// mscz-mtime: <ISO timestamp>"
var MTIME_PREFIX = "// mscz-mtime: ";

function getScorePath(song) {
    return path.join(MUSIC_DIR, SONGS[song] + ".mscz");
}

function getMsczMtime(scorePath) {
    try {
        return fs.statSync(scorePath).mtime.toISOString();
    } catch (e) {
        return null;
    }
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

// Check if any scores exist
var songNames = Object.keys(SONGS);
var scoresExist = songNames.some(function(s) {
    return fs.existsSync(getScorePath(s));
});

for (var i = 0; i < songNames.length; i++) {
    (function(song) {
        var scorePath = getScorePath(song);
        var compactSnapshot = path.join(SNAPSHOTS_DIR, song + ".compact.txt");
        var fullSnapshot = path.join(SNAPSHOTS_DIR, song + ".full.txt");

        ["--compact", "--full"].forEach(function(flag) {
            var snapshotPath = flag === "--compact" ? compactSnapshot : fullSnapshot;
            var label = "snapshot " + song + " " + flag;

            test(label, { skip: !scoresExist || !fs.existsSync(scorePath) }, function() {
                var rawExpected = fs.readFileSync(snapshotPath, "utf8");
                // Strip mtime comment from expected output for comparison
                var expected = rawExpected.replace(/\n\/\/ mscz-mtime: .+\n?$/, "\n");

                var actual = runCli(scorePath, flag);

                if (actual !== expected) {
                    // Check if the score file changed since the snapshot was generated
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
