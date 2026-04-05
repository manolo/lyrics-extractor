var test = require("node:test");
var assert = require("node:assert/strict");
var rs = require("../lib/repeat-structure");

test("buildSections pairs volta1 inside repeat", function() {
    var repeats = [{ startTick: 0, endTick: 1920 }];
    var voltas = [{ startTick: 960, endTick: 1920 }];

    var sections = rs.buildSections(repeats, voltas);
    assert.equal(sections.length, 1);
    assert.deepEqual(sections[0].volta1, { startTick: 960, endTick: 1920 });
    assert.equal(sections[0].volta2, null);
    assert.equal(sections[0].sectionEnd, 1920);
});

test("buildSections pairs volta2 after repeat", function() {
    var repeats = [{ startTick: 0, endTick: 1920 }];
    var voltas = [
        { startTick: 960, endTick: 1920 },
        { startTick: 1920, endTick: 2880 }
    ];

    var sections = rs.buildSections(repeats, voltas);
    assert.equal(sections.length, 1);
    assert.deepEqual(sections[0].volta1, { startTick: 960, endTick: 1920 });
    assert.deepEqual(sections[0].volta2, { startTick: 1920, endTick: 2880 });
    assert.equal(sections[0].sectionEnd, 2880);
});

test("buildSections handles multiple repeats", function() {
    var repeats = [
        { startTick: 0, endTick: 1920 },
        { startTick: 1920, endTick: 3840 }
    ];
    var voltas = [];

    var sections = rs.buildSections(repeats, voltas);
    assert.equal(sections.length, 2);
    assert.equal(sections[0].sectionEnd, 1920);
    assert.equal(sections[1].sectionEnd, 3840);
});

test("buildSections handles no repeats", function() {
    var sections = rs.buildSections([], []);
    assert.equal(sections.length, 0);
});

test("buildSections does not reuse voltas across sections", function() {
    var repeats = [
        { startTick: 0, endTick: 1920 },
        { startTick: 3840, endTick: 5760 }
    ];
    var voltas = [
        { startTick: 960, endTick: 1920 },
        { startTick: 4800, endTick: 5760 }
    ];

    var sections = rs.buildSections(repeats, voltas);
    assert.equal(sections.length, 2);
    assert.equal(sections[0].volta1.startTick, 960);
    assert.equal(sections[1].volta1.startTick, 4800);
});
