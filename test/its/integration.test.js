// Integration snapshot tests: verify CLI output matches baseline snapshots.
// Only runs when score files are available (developer environment).
// Baselines generated at v1.1.1 with: node cli/index.js <score> --compact/--full

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("fs");
var path = require("path");
var child = require("child_process");

var BASE = path.resolve(__dirname, "../..");
var CLI = path.join(BASE, "cli/index.js");
var SCORES_DIR = path.join(__dirname, "scores");
var SNAPSHOTS_DIR = __dirname;

var SONGS = [
    "EstudiantinaMadrilena",
    "EspanaCani",
    "TrustTenorios",
    "SanCayetano",
    "NochePerfumada",
    "Rondalla",
    "HorasDeRonda",
    "TunaCompostelana",
    "AlmaLlanera",
    "MalaguenaSalerosa",
    "IsaDelCandidito",
    "Clavelitos",
    "LosAmigos",
    "RondaFiruli",
    "OjosDeEspaña",
    "VuelaUnaLagrima"
];

// Skip all tests if scores directory doesn't exist (CI / non-dev environment)
var scoresExist = fs.existsSync(SCORES_DIR) &&
    SONGS.some(function(s) { return fs.existsSync(path.join(SCORES_DIR, s + ".mscz")); });

function runCli(scorePath, flags) {
    return child.execSync(
        "node " + JSON.stringify(CLI) + " " + JSON.stringify(scorePath) + " " + flags,
        { encoding: "utf8", timeout: 30000 }
    );
}

for (var i = 0; i < SONGS.length; i++) {
    (function(song) {
        var scorePath = path.join(SCORES_DIR, song + ".mscz");
        var compactSnapshot = path.join(SNAPSHOTS_DIR, song + ".compact.txt");
        var fullSnapshot = path.join(SNAPSHOTS_DIR, song + ".full.txt");

        test("snapshot " + song + " --compact", { skip: !scoresExist }, function() {
            var expected = fs.readFileSync(compactSnapshot, "utf8");
            var actual = runCli(scorePath, "--compact");
            assert.equal(actual, expected, song + " --compact output changed");
        });

        test("snapshot " + song + " --full", { skip: !scoresExist }, function() {
            var expected = fs.readFileSync(fullSnapshot, "utf8");
            var actual = runCli(scorePath, "--full");
            assert.equal(actual, expected, song + " --full output changed");
        });
    })(SONGS[i]);
}
