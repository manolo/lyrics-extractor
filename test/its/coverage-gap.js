#!/usr/bin/env node
// How much of the code only the uncommitted scores reach.
//
// The snapshot suite reads its scores from test/its/scores/, and git tracks only the
// synthetic ones. So a contributor, and CI, exercise a subset of the code. This runs the
// suite twice under coverage, once with every score present and once with only the
// synthetic ones (LE_ONLY_SYNTHETIC), and reports the branch gap per file.
//
// The gap is the target: a synthetic score earns its place by closing part of it.
//
//   node test/its/coverage-gap.js
//
// Reads nothing but the coverage report on stdout, writes nothing.

var child = require("child_process");
var path = require("path");

var BASE = path.resolve(__dirname, "..", "..");

function coverage(onlySynthetic) {
    var env = Object.assign({}, process.env);
    if (onlySynthetic) env.LE_ONLY_SYNTHETIC = "1";
    else delete env.LE_ONLY_SYNTHETIC;

    var out = child.execSync(
        "node --test --experimental-test-coverage" +
        " --test-coverage-include='lib/**' --test-coverage-include='score/**'" +
        " test/integration.test.js",
        { cwd: BASE, env: env, encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "ignore"] }
    );

    // Rows look like: "ℹ  formatter.js | 98.33 | 95.91 | 41.67 | 21 24 ..."
    var files = {};
    var total = null;
    out.split("\n").forEach(function(line) {
        var cells = line.replace(/^ℹ\s*/, "").split("|");
        if (cells.length < 4) return;
        var name = cells[0].trim();
        var lines = parseFloat(cells[1]);
        var branches = parseFloat(cells[2]);
        if (isNaN(lines) || isNaN(branches)) return;
        if (name === "all files") total = { lines: lines, branches: branches };
        else if (/\.js$/.test(name)) files[name] = { lines: lines, branches: branches };
    });
    return { files: files, total: total };
}

function ran(onlySynthetic) {
    var env = Object.assign({}, process.env);
    if (onlySynthetic) env.LE_ONLY_SYNTHETIC = "1";
    var out = child.execSync("node --test test/integration.test.js", {
        cwd: BASE, env: env, encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "ignore"]
    });
    var pass = (out.match(/^ℹ pass (\d+)/m) || [])[1];
    var skip = (out.match(/^ℹ skipped (\d+)/m) || [])[1];
    return { pass: +pass || 0, skipped: +skip || 0 };
}

console.log("Measuring, two runs of the snapshot suite under coverage...\n");

var all = coverage(false);
var syn = coverage(true);
var allRan = ran(false);
var synRan = ran(true);

var names = Object.keys(all.files).sort();
var pad = Math.max.apply(null, names.map(function(n) { return n.length; }));

console.log("file".padEnd(pad) + "   synthetic   all scores   branch gap");
console.log("-".repeat(pad + 36));
names.forEach(function(n) {
    var a = all.files[n];
    var s = syn.files[n] || { branches: 0 };
    var gap = a.branches - s.branches;
    console.log(
        n.padEnd(pad) +
        ("   " + s.branches.toFixed(2)).padStart(12) +
        ("   " + a.branches.toFixed(2)).padStart(13) +
        (gap > 0.005 ? ("   +" + gap.toFixed(2)) : "   -")
    );
});

console.log("-".repeat(pad + 36));
console.log(
    "branches".padEnd(pad) +
    ("   " + syn.total.branches.toFixed(2)).padStart(12) +
    ("   " + all.total.branches.toFixed(2)).padStart(13) +
    "   +" + (all.total.branches - syn.total.branches).toFixed(2)
);
console.log(
    "lines".padEnd(pad) +
    ("   " + syn.total.lines.toFixed(2)).padStart(12) +
    ("   " + all.total.lines.toFixed(2)).padStart(13) +
    "   +" + (all.total.lines - syn.total.lines).toFixed(2)
);
console.log(
    "\nsnapshot tests run: " + synRan.pass + " with the synthetic scores, " +
    allRan.pass + " with every score present"
);
