// Two of the snapshot scores are synthetic: written by a generator in test/its/ rather
// than copied from a real one. Both the score and its generator are committed, which is
// two sources for one fixture, and they have drifted apart before: MultiVerso on disk was
// once a MuseScore rewrite of itself, so what CI generated was not what the baselines were
// taken from, and the suites passed only because the music happened to come out the same.
//
// So this suite holds them together. The .mscz is the fixture of record, the generator is
// how it is edited, and changing one without the other fails here.
//
// The zip bytes are not compared: a .mscz stores modification times, so two runs are not
// guaranteed to be identical files. The .mscx inside them is what has to match.

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("fs");
var os = require("os");
var path = require("path");
var child = require("child_process");

var reader = require("../score/mscz-reader");

var ITS = path.join(__dirname, "its");
var SCORES = path.join(ITS, "scores");

var synthetic = require("./its/synthetic");

var SYNTHETIC = Object.keys(synthetic.SYNTHETIC).map(function(name) {
    return { score: "test_le_" + name + ".mscz", generator: synthetic.SYNTHETIC[name] };
});

SYNTHETIC.forEach(function(entry) {
    test("synthetic: " + entry.score + " is what " + entry.generator + " writes", function() {
        var committed = path.join(SCORES, entry.score);
        var generator = path.join(ITS, entry.generator);
        assert.ok(fs.existsSync(committed), committed + " should be committed");
        assert.ok(fs.existsSync(generator), generator + " should be committed");

        var tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "le-synth-")), entry.score);
        child.execSync("node " + JSON.stringify(generator) + " " + JSON.stringify(tmp),
            { encoding: "utf8", timeout: 30000 });

        var fromDisk = reader.readScore(committed);
        var fromGenerator = reader.readScore(tmp);
        fs.rmSync(path.dirname(tmp), { recursive: true, force: true });

        if (fromDisk !== fromGenerator) {
            assert.fail(entry.score + " and " + entry.generator + " have drifted apart"
                + "\n\n  The committed score has " + fromDisk.length + " characters of XML"
                + " and the generator writes " + fromGenerator.length + "."
                + "\n  Regenerate it with:"
                + "\n    node test/its/" + entry.generator
                + "\n  then check the snapshot diffs before committing, since the baselines"
                + "\n  were taken from the score as it stood.");
        }
    });
});

// Only meaningful inside a checkout: a source tarball has no index to ask
function trackedScores() {
    try {
        var out = child.execSync("git ls-files test/its/scores", {
            cwd: path.resolve(__dirname, ".."), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"]
        }).trim();
        return out === "" ? [] : out.split("\n").map(function(f) { return path.basename(f); });
    } catch (e) {
        return null;
    }
}

test("synthetic: only the synthetic scores are committed", { skip: trackedScores() === null }, function() {
    // The frozen copies are somebody else's music and weigh megabytes, so the exception in
    // test/its/.gitignore has to stay narrow
    var files = trackedScores();

    var expected = SYNTHETIC.map(function(e) { return e.score; }).sort();
    assert.deepEqual(files.sort(), expected,
        "test/its/scores should hold exactly the synthetic scores in git");
});
