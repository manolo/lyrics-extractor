#!/usr/bin/env node
// Update mtime markers in snapshot .txt files.
// Usage:
//   node test/its/update-mtime.js              # update all snapshots
//   node test/its/update-mtime.js SongName     # update one song

var fs = require("fs");
var path = require("path");
var os = require("os");

var SNAPSHOTS_DIR = __dirname;
var MUSIC_DIR = path.join(os.homedir(), "Music");
var MTIME_PREFIX = "// mscz-mtime: ";

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

var filter = process.argv[2] || null;
var songNames = filter ? [filter] : Object.keys(SONGS);
var updated = 0;

songNames.forEach(function(song) {
    if (!SONGS[song]) {
        console.error("Unknown song: " + song);
        process.exit(1);
    }
    var scorePath = path.join(MUSIC_DIR, SONGS[song] + ".mscz");
    if (!fs.existsSync(scorePath)) {
        console.log("  SKIP " + song + " (score not found)");
        return;
    }
    var mtime = fs.statSync(scorePath).mtime.toISOString();

    ["compact", "full"].forEach(function(mode) {
        var snapshotPath = path.join(SNAPSHOTS_DIR, song + "." + mode + ".txt");
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
