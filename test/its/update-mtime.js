#!/usr/bin/env node
// Lyrics Extractor for MuseScore
// Copyright (C) 2026 Manolo Carrasco (do2tis)
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Licensed under the GNU General Public License version 3 or later, with an
// additional attribution requirement under section 7(b): see LICENSE and ATTRIBUTION.md.

// Refresh the mtime marker at the end of each snapshot baseline: the mtime of the .mscz the
// baseline was taken from, which is what lets a failing test say whether the score changed.
//
// It works on whatever baselines are in a directory, so it serves both the suite that travels
// with the repository and a local one.
//
//   node test/its/update-mtime.js                              # test/its/baselines
//   node test/its/update-mtime.js SectionLabels                # just one song
//   node test/its/update-mtime.js --dir test/local/baselines    # a local suite's baselines
//
// The scores are looked for in ../scores of whatever baselines directory it is given.

var fs = require("fs");
var path = require("path");
var snapshot = require("./snapshot");

var args = process.argv.slice(2);
var dir = path.join(__dirname, "baselines");
var filter = null;

for (var a = 0; a < args.length; a++) {
    if (args[a] === "--dir") { dir = path.resolve(args[++a]); continue; }
    filter = args[a];
}

var scoresDir = path.join(dir, "..", "scores");
var baselines = snapshot.findBaselines(dir);
var songs = Object.keys(baselines).sort();

if (songs.length === 0) {
    console.log("No baselines in " + dir);
    process.exit(0);
}
if (filter && songs.indexOf(filter) < 0) {
    console.error("No baseline for " + filter + " in " + dir);
    process.exit(1);
}

var updated = 0;
songs.forEach(function(song) {
    if (filter && song !== filter) return;

    var scorePath = path.join(scoresDir, snapshot.SCORE_PREFIX + song + ".mscz");
    if (!fs.existsSync(scorePath)) {
        console.log("  SKIP " + song + " (score not found)");
        return;
    }
    var mtime = fs.statSync(scorePath).mtime.toISOString();

    Object.keys(baselines[song]).forEach(function(mode) {
        var file = baselines[song][mode];
        var content = fs.readFileSync(file, "utf8")
            .replace(/\n\/\/ mscz-mtime: .+\n?$/, "\n");
        if (!content.endsWith("\n")) content += "\n";
        fs.writeFileSync(file, content + snapshot.MTIME_PREFIX + mtime + "\n");
        updated++;
    });
    console.log("  OK " + song + " -> " + mtime);
});

console.log("\nUpdated " + updated + " baseline(s) in " + dir);
