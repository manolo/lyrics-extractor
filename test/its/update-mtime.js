#!/usr/bin/env node
// Update mtime markers in snapshot .txt files.
// Scores are the test_le_ copies in test/its/scores/ (kept out of git).
// Usage:
//   node test/its/update-mtime.js              # update all snapshots
//   node test/its/update-mtime.js SongName     # update one song

var fs = require("fs");
var path = require("path");

var SNAPSHOTS_DIR = __dirname;
var SCORES_DIR = path.join(__dirname, "scores");
var SCORE_PREFIX = "test_le_";
var MTIME_PREFIX = "// mscz-mtime: ";

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
    "MalaguenaMini",
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

var filter = process.argv[2] || null;
var songNames = filter ? [filter] : SONGS;
var updated = 0;

songNames.forEach(function(song) {
    if (SONGS.indexOf(song) < 0) {
        console.error("Unknown song: " + song);
        process.exit(1);
    }
    var scorePath = path.join(SCORES_DIR, SCORE_PREFIX + song + ".mscz");
    if (!fs.existsSync(scorePath)) {
        console.log("  SKIP " + song + " (score not found)");
        return;
    }
    var mtime = fs.statSync(scorePath).mtime.toISOString();

    ["compact", "full"].forEach(function(mode) {
        var snapshotPath = path.join(SNAPSHOTS_DIR, SCORE_PREFIX + song + "." + mode + ".txt");
        if (!fs.existsSync(snapshotPath)) {
            console.log("  SKIP " + song + "." + mode + ".txt (not found)");
            return;
        }
        var content = fs.readFileSync(snapshotPath, "utf8");
        // Remove existing mtime line if present
        content = content.replace(/\n\/\/ mscz-mtime: .+\n?$/, "\n");
        // Ensure trailing newline then append mtime
        if (!content.endsWith("\n")) content += "\n";
        content += MTIME_PREFIX + mtime + "\n";
        fs.writeFileSync(snapshotPath, content);
        updated++;
    });
    console.log("  OK " + song + " -> " + mtime);
});

console.log("\nUpdated " + updated + " snapshot(s).");
