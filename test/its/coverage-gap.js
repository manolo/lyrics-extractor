#!/usr/bin/env node
// How much of the code only a local suite reaches.
//
// The snapshot suite that travels with the repository reads the synthetic scores in
// test/its/scores/. A developer may also keep frozen copies of real scores in test/local/, which
// git ignores. So a contributor, and CI, exercise a subset of the code. This runs the snapshots
// twice under coverage, once with the repository suite alone and once with the local one added,
// and reports the branch gap per file.
//
// The gap is the target: a synthetic score earns its place by closing part of it. With no local
// suite present both columns are the same, and the report says so.
//
//   node test/its/coverage-gap.js
//
// Reads nothing but the coverage report on stdout, writes nothing.

var child = require("child_process");
var path = require("path");
var fs = require("fs");

var BASE = path.resolve(__dirname, "..", "..");
var LOCAL_SUITE = path.join(BASE, "test", "local", "its.test.js");
var hasLocal = fs.existsSync(LOCAL_SUITE);

// The files each column drives: the repository suite alone, or with the local one added
function suites(withLocal) {
    return "test/integration.test.js" + (withLocal && hasLocal ? " test/local/its.test.js" : "");
}

function coverage(withLocal) {
    var out = child.execSync(
        "node --test --experimental-test-coverage" +
        " --test-coverage-include='lib/**' --test-coverage-include='score/**' " +
        suites(withLocal),
        { cwd: BASE, encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "ignore"] }
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

function ran(withLocal) {
    var out = child.execSync("node --test " + suites(withLocal), {
        cwd: BASE, encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "ignore"]
    });
    var pass = (out.match(/^ℹ pass (\d+)/m) || [])[1];
    var skip = (out.match(/^ℹ skipped (\d+)/m) || [])[1];
    return { pass: +pass || 0, skipped: +skip || 0 };
}

if (!hasLocal) {
    console.log("No local suite in test/local/, so both columns are the repository suite.\n");
}
console.log("Measuring, two runs of the snapshots under coverage...\n");

var all = coverage(true);
var syn = coverage(false);
var allRan = ran(true);
var synRan = ran(false);

var names = Object.keys(all.files).sort();
var pad = Math.max.apply(null, names.map(function(n) { return n.length; }));

console.log("file".padEnd(pad) + "  repository   with local   branch gap");
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
    "\nsnapshot tests run: " + synRan.pass + " from the repository, " +
    allRan.pass + " with the local suite added"
);
