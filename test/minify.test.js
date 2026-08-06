// The release package ships minified JavaScript (build.js). Two things have to survive
// that step, and neither is covered anywhere else:
//
//   1. the exports of every Node module, which the CLI and the tests require
//   2. the top level declarations the QML dialog resolves its imports against, since
//      "import ../lib/formatter.js as Formatter" then reads Formatter.<name> directly
//
// Identifiers are not mangled precisely so that both hold, so this suite is what says
// the build options stay that way.

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var BASE = path.resolve(__dirname, "..");
var RUNTIME_DIRS = ["lib", "extractors", "cli"];

var terser = null;
try { terser = require("terser"); } catch (e) { /* optional, see build.js */ }

// Same options as build.js. Kept in sync by hand: a copy here is better than importing
// build.js, which packages and zips as a side effect of being loaded.
function minify(code, label) {
    var result = terser.minify_sync(code, {
        compress: true,
        mangle: false,
        format: { comments: false }
    });
    assert.ok(!result.error, label + " should minify: " + result.error);
    return result.code;
}

function runtimeFiles() {
    var out = [];
    RUNTIME_DIRS.forEach(function(dir) {
        fs.readdirSync(path.join(BASE, dir)).forEach(function(f) {
            if (f.endsWith(".js")) out.push(dir + "/" + f);
        });
    });
    return out;
}

// Load a module from source text, with require pointing at the real files so a module
// that pulls in a sibling still works
function loadFrom(code, rel) {
    var sandbox = {
        module: { exports: {} },
        exports: {},
        console: console,
        // Relative ids resolve against the module's own directory, everything else is a
        // built in and goes to the real require
        require: function(id) {
            if (id.charAt(0) !== ".") return require(id);
            return require(path.resolve(BASE, path.dirname(rel), id));
        }
    };
    sandbox.module.exports = sandbox.exports;
    vm.runInNewContext(code, sandbox, { filename: rel });
    return sandbox.exports;
}

test("minified modules keep every export", { skip: !terser }, function() {
    var checked = 0;
    runtimeFiles().forEach(function(rel) {
        var code = fs.readFileSync(path.join(BASE, rel), "utf8");
        // Entry points do their work on load, reading process.argv, so they cannot be
        // loaded twice just to compare exports
        if (code.indexOf("process.argv") >= 0) return;

        var plain = Object.keys(loadFrom(code, rel)).sort();
        var small = Object.keys(loadFrom(minify(code, rel), rel)).sort();
        assert.deepEqual(small, plain, rel + " loses exports when minified");
        checked++;
    });
    assert.ok(checked > 10, "should have checked the runtime modules, saw " + checked);
});

test("minified modules keep the names the QML dialog calls", { skip: !terser }, function() {
    var qml = fs.readFileSync(path.join(BASE, "ui/LyricsForm.qml"), "utf8");
    var aliases = {};
    var importRe = /import "([^"]+\.js)" as (\w+)/g;
    var m;
    while ((m = importRe.exec(qml)) !== null) aliases[m[2]] = m[1];

    var checked = 0;
    Object.keys(aliases).forEach(function(alias) {
        var rel = path.normalize(path.join("ui", aliases[alias]));
        var code = minify(fs.readFileSync(path.join(BASE, rel), "utf8"), rel);

        var names = {};
        [/function (\w+)/g, /var (\w+)/g, /\b(\w+)\s*=/g].forEach(function(re) {
            var n;
            while ((n = re.exec(code)) !== null) names[n[1]] = true;
        });

        var callRe = new RegExp("\\b" + alias + "\\.(\\w+)", "g");
        var call;
        while ((call = callRe.exec(qml)) !== null) {
            assert.ok(names[call[1]],
                alias + "." + call[1] + " is gone from " + rel + " once minified");
            checked++;
        }
    });
    assert.ok(checked > 30, "should have checked the dialog calls, saw " + checked);
});

test("minified output produces the same text as the sources", { skip: !terser }, function() {
    // End to end on the committed fixture: same data through both, byte for byte
    var msczReader = require("../cli/mscz-reader");
    var xmlExtractor = require("../extractors/xml-extractor");
    var fixture = path.join(__dirname, "fixture.mscz");
    var data = xmlExtractor.extractAll(msczReader.readScore(fixture));

    var plain = require("../lib/orchestrator").processExtraction(JSON.parse(JSON.stringify(data)));
    var small = loadFrom(
        minify(fs.readFileSync(path.join(BASE, "lib/orchestrator.js"), "utf8"), "lib/orchestrator.js"),
        "lib/orchestrator.js"
    ).processExtraction(JSON.parse(JSON.stringify(data)));

    assert.equal(small, plain, "the minified orchestrator changed the output");
});
