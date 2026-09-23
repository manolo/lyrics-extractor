// Lyrics Extractor for MuseScore
// Copyright (C) 2026 Manolo Carrasco (do2tis)
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Licensed under the GNU General Public License version 3 or later, with an
// additional attribution requirement under section 7(b): see LICENSE and ATTRIBUTION.md.

// A .mscz written by the Fix path is a zip, and every other tool that opens it checks the
// checksum of each entry. MuseScore does not, which is why a file with none opened fine and
// still came out corrupt for unzip, for Python's zipfile, and for anything else the user pipes
// their scores through.

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("fs");
var os = require("os");
var path = require("path");
var zlib = require("zlib");
var child = require("child_process");

var reader = require("../../score/mscz-reader");

var SOURCE = path.join(__dirname, "..", "its", "scores", "test_le_PickupLabel.mscz");

function tempCopy() {
    var dir = fs.mkdtempSync(path.join(os.tmpdir(), "mscz-"));
    var out = path.join(dir, "score.mscz");
    fs.copyFileSync(SOURCE, out);
    return out;
}

// The checksum each entry of the archive carries, by name
function storedCrcs(file) {
    var buffer = fs.readFileSync(file);
    var crcs = {};
    var offset = 0;
    while (offset < buffer.length - 4 && buffer.readUInt32LE(offset) === 0x04034b50) {
        var compressedSize = buffer.readUInt32LE(offset + 18);
        var nameLen = buffer.readUInt16LE(offset + 26);
        var extraLen = buffer.readUInt16LE(offset + 28);
        crcs[buffer.toString("utf8", offset + 30, offset + 30 + nameLen)] = buffer.readUInt32LE(offset + 14);
        offset = offset + 30 + nameLen + extraLen + compressedSize;
    }
    return crcs;
}

test("writeMscz gives every entry the checksum of what it holds", function() {
    var file = tempCopy();
    var xml = reader.readScore(file).replace("<Division>480</Division>", "<Division>480</Division>\n    <!-- x -->");
    reader.writeMscz(file, file, xml);

    var crcs = storedCrcs(file);
    // Directory entries hold nothing, and nothing hashes to a checksum of its own
    var names = Object.keys(crcs).filter(function(n) { return !/\/$/.test(n); });
    assert.ok(names.length > 1, "the archive still holds every file it had");
    names.forEach(function(name) {
        assert.notEqual(crcs[name], 0, name + " was written with no checksum at all");
    });

    // The one that was rewritten says what the new text hashes to, not what the old one did
    var mscx = names.filter(function(n) { return /\.mscx$/.test(n); })[0];
    assert.equal(crcs[mscx], zlib.crc32(Buffer.from(xml, "utf8")));
    fs.rmSync(path.dirname(file), { recursive: true, force: true });
});

test("a .mscz written by writeMscz passes unzip -t", function() {
    var file = tempCopy();
    reader.writeMscz(file, file, reader.readScore(file));

    var result = child.spawnSync("unzip", ["-t", file], { encoding: "utf8" });
    assert.equal(result.status, 0, "unzip reports the archive as broken:\n" + result.stdout + result.stderr);
    fs.rmSync(path.dirname(file), { recursive: true, force: true });
});

test("the score written out is still the score that goes in", function() {
    var file = tempCopy();
    var before = reader.readScore(file);
    reader.writeMscz(file, file, before);
    assert.equal(reader.readScore(file), before);
    fs.rmSync(path.dirname(file), { recursive: true, force: true });
});

test("an entry that was not rewritten keeps the checksum it arrived with", function() {
    var file = tempCopy();
    var before = storedCrcs(file);
    reader.writeMscz(file, file, reader.readScore(file));
    var after = storedCrcs(file);

    var style = Object.keys(before).filter(function(n) { return /\.mss$/.test(n); })[0];
    assert.ok(style, "the fixture has a style file to check");
    assert.equal(after[style], before[style]);
    fs.rmSync(path.dirname(file), { recursive: true, force: true });
});
