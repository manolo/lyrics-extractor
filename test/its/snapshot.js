// The snapshot runner, shared by the suite that travels with the repository and by whatever
// local suite a developer keeps beside it.
//
// It is driven by what is on disk rather than by a list: a song is snapshotted because a
// baseline file exists for it, and a mode runs because that mode's baseline exists. Nothing
// here names a score, which is what lets a developer keep frozen copies of real scores, with
// their own baselines, in a folder the repository knows nothing about.
//
// Baselines are named test_le_<Song>.<mode>.txt and the scores test_le_<Song>.mscz. Each
// baseline ends with the mtime of the .mscz it was taken from, so a failure can say whether the
// score changed underneath it.

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("fs");
var path = require("path");
var child = require("child_process");

var SCORE_PREFIX = "test_le_";
var MTIME_PREFIX = "// mscz-mtime: ";

// The flags each mode is taken with. A mode with no baseline for a song does not run: orphan
// only means something for a score with a verse no pass sings.
var MODES = {
    compact: "--compact",
    full: "--full",
    orphan: "--full --orphan-lyrics"
};

// { Song: { mode: baselinePath } } for every baseline in a directory
function findBaselines(dir) {
    var found = {};
    var names;
    try { names = fs.readdirSync(dir); } catch (e) { return found; }

    names.forEach(function(name) {
        var m = name.match(/^test_le_(.+)\.([a-z]+)\.txt$/);
        if (!m || !MODES[m[2]]) return;
        if (!found[m[1]]) found[m[1]] = {};
        found[m[1]][m[2]] = path.join(dir, name);
    });
    return found;
}

function msczMtime(scorePath) {
    try { return fs.statSync(scorePath).mtime.toISOString(); } catch (e) { return null; }
}

function baselineMtime(baselinePath) {
    try {
        var lines = fs.readFileSync(baselinePath, "utf8").split("\n");
        var last = lines[lines.length - 1] || lines[lines.length - 2] || "";
        if (last.indexOf(MTIME_PREFIX) === 0) return last.substring(MTIME_PREFIX.length).trim();
    } catch (e) {}
    return null;
}

// opts:
//   baselinesDir  where the .txt files are
//   scoresDir     where the .mscz files are, defaults to <baselinesDir>/scores
//   cli           path to the CLI to drive, defaults to the one in this checkout
//   label         prefix for the test names, defaults to "IT"
//   note          optional function(song) returning extra text for a failure message
function define(opts) {
    var baselinesDir = opts.baselinesDir;
    var scoresDir = opts.scoresDir || path.join(baselinesDir, "scores");
    var cli = opts.cli || path.join(__dirname, "..", "..", "cli", "index.js");
    var label = opts.label || "IT";

    var baselines = findBaselines(baselinesDir);
    var songs = Object.keys(baselines).sort();

    // With no score at all present there is nothing to say: every test skips rather than
    // reporting a directory of failures
    var anyScore = songs.some(function(s) {
        return fs.existsSync(path.join(scoresDir, SCORE_PREFIX + s + ".mscz"));
    });

    songs.forEach(function(song) {
        var scorePath = path.join(scoresDir, SCORE_PREFIX + song + ".mscz");

        Object.keys(baselines[song]).sort().forEach(function(mode) {
            var baselinePath = baselines[song][mode];
            var flag = MODES[mode];
            var name = label + ": " + song + "." + mode;

            test(name, { skip: !anyScore || !fs.existsSync(scorePath) }, function() {
                var expected = fs.readFileSync(baselinePath, "utf8")
                    .replace(/\n\/\/ mscz-mtime: .+\n?$/, "\n");

                var actual = child.execSync(
                    "node " + JSON.stringify(cli) + " " + JSON.stringify(scorePath) + " " + flag,
                    { encoding: "utf8", timeout: 30000 }
                );
                if (actual === expected) return;

                var msg = song + " " + flag + " output changed";
                var extra = opts.note ? opts.note(song) : null;
                var was = baselineMtime(baselinePath);
                var now = msczMtime(scorePath);

                if (extra) {
                    msg += "\n\n  " + extra;
                } else if (was && now && was !== now) {
                    msg += "\n\n  WARNING: the score has changed since this baseline was taken."
                        + "\n  Baseline mtime: " + was
                        + "\n  Current mtime:  " + now
                        + "\n\n  To update, run:"
                        + "\n    node cli/index.js " + JSON.stringify(scorePath) + " " + flag
                        + " > " + JSON.stringify(baselinePath)
                        + "\n  then refresh the marker:"
                        + "\n    node test/its/update-mtime.js --dir " + JSON.stringify(baselinesDir);
                } else if (!was) {
                    msg += "\n\n  NOTE: this baseline has no mtime marker. Run:"
                        + "\n    node test/its/update-mtime.js --dir " + JSON.stringify(baselinesDir);
                }
                assert.equal(actual, expected, msg);
            });
        });
    });

    return songs;
}

module.exports = {
    define: define,
    findBaselines: findBaselines,
    MODES: MODES,
    SCORE_PREFIX: SCORE_PREFIX,
    MTIME_PREFIX: MTIME_PREFIX
};
