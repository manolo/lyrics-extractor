// Lyrics Extractor for MuseScore
// Copyright (C) 2026 Manolo Carrasco (do2tis)
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Licensed under the GNU General Public License version 3 or later, with an
// additional attribution requirement under section 7(b): see LICENSE and ATTRIBUTION.md.

// score/xml-patcher.js is the only code in the project that writes into the user's score, and
// it was the worst covered file of the project at 60.80% of branches: the Fix button is driven
// by hand in MuseScore, and the snapshot suite only ever reads.
//
// These are the branches the existing tests leave out, and they are the ones that decide
// whether a chord is copied, skipped or lost: a bar in a time signature other than four four,
// a note that is dotted, a chord already present in the tablature staff, a chord written the
// way MuseScore 3 wrote it, a chord with no element id at all, and a syllable with no syllabic
// element to replace.

var test = require("node:test");
var assert = require("node:assert/strict");

var patcher = require("../../score/xml-patcher");

// A score of one pitched staff and its tablature copy, which is the shape the chord sync is
// about: bars is one entry per bar, each { principal: xml, tab: xml }
function score(bars, opts) {
    opts = opts || {};
    var out = [
        '<?xml version="1.0"?>',
        '<museScore version="4.60">',
        '<Score>',
        '<Division>480</Division>',
        '<Part>',
        '<Staff><StaffType group="pitched"><name>stdNormal</name></StaffType></Staff>',
        '<Staff><linkedTo>0</linkedTo><StaffType group="tablature"><name>tab6</name></StaffType></Staff>',
        '</Part>'
    ];
    ["principal", "tab"].forEach(function(which, wi) {
        out.push('<Staff id="' + (wi + 1) + '">');
        bars.forEach(function(bar, bi) {
            var len = (opts.len && bi === 0) ? ' len="' + opts.len + '"' : "";
            out.push("<Measure" + len + "><voice>");
            if (bar[which]) out.push(bar[which]);
            out.push("</voice></Measure>");
        });
        out.push("</Staff>");
    });
    out.push("</Score>", "</museScore>");
    return out.join("\n");
}

function harmony(root, eid) {
    return "<Harmony><harmonyInfo><root>" + root + "</root><name></name></harmonyInfo>" +
        (eid === null ? "" : "<eid>" + eid + "</eid>") + "</Harmony>";
}

function quarter() {
    return "<Chord><durationType>quarter</durationType>" +
        "<Note><pitch>60</pitch><tpc>14</tpc></Note></Chord>";
}

// Counts the Harmony elements the tablature staff ends up with
function tabHarmonies(xml) {
    var from = xml.indexOf('<Staff id="2">');
    return xml.substring(from).split("<Harmony>").length - 1;
}

// --- patchChordSync -----------------------------------------------------------

test("a chord the tablature staff already carries is not copied again", function() {
    // Two bars are out of sync but the second one already has the right chord written into the
    // tablature staff, so only the first is copied: writing it twice would show the player two
    // chord symbols on the same beat
    var xml = score([
        { principal: harmony(14, "aaa") + quarter(), tab: quarter() },
        { principal: harmony(15, "bbb") + quarter(), tab: harmony(15, "ccc") + quarter() }
    ]);

    var result = patcher.patchChordSync(xml);
    assert.equal(result.syncCount, 1, "only the bar that was missing one");
    assert.equal(tabHarmonies(result.xml), 2, "the one that was there plus the one copied");
});

test("bars are located by tick, so a time signature change does not shift them", function() {
    // Three four: if the patcher assumed four four it would look for the third bar at tick
    // 3840 and find nothing, so nothing would be copied. MuseScore writes the time signature
    // into every staff, and the patcher reads each staff's own, which is what keeps the two
    // sets of bar ticks in step
    var threeFour = "<TimeSig><sigN>3</sigN><sigD>4</sigD></TimeSig>";
    var xml = score([
        { principal: threeFour + harmony(14, "aaa") + quarter() + quarter() + quarter(),
          tab: threeFour + quarter() + quarter() + quarter() },
        { principal: quarter() + quarter() + quarter(),
          tab: quarter() + quarter() + quarter() },
        { principal: harmony(15, "bbb") + quarter() + quarter() + quarter(),
          tab: quarter() + quarter() + quarter() }
    ]);

    var result = patcher.patchChordSync(xml);
    assert.equal(result.syncCount, 2, "both chords found their bar: " + result.syncCount);
});

test("a pickup bar shortened with len does not shift the bars after it", function() {
    var xml = score([
        { principal: harmony(14, "aaa") + quarter(), tab: quarter() },
        { principal: harmony(15, "bbb") + quarter() + quarter() + quarter() + quarter(),
          tab: quarter() + quarter() + quarter() + quarter() }
    ], { len: "1/4" });

    var result = patcher.patchChordSync(xml);
    assert.equal(result.syncCount, 2, "a quarter long first bar is still one bar");
});

test("a dotted note advances the beat by half again", function() {
    // The second chord sits after a dotted half, at tick 1440. Reading the dot as a plain half
    // would put it at 960 and the chord would be attached to the wrong beat of the bar
    var dottedHalf = "<Chord><durationType>half</durationType><dots>1</dots>" +
        "<Note><pitch>60</pitch><tpc>14</tpc></Note></Chord>";
    var xml = score([
        { principal: harmony(14, "aaa") + dottedHalf + harmony(15, "bbb") + quarter(),
          tab: dottedHalf + quarter() }
    ]);

    var result = patcher.patchChordSync(xml);
    assert.equal(result.syncCount, 2, "both chords of the bar are copied");
});

test("a chord written the way MuseScore 3 wrote it is still read", function() {
    // No harmonyInfo: the chord name is a name element directly under Harmony
    var old = "<Harmony><name>Do</name><eid>aaa</eid></Harmony>";
    var xml = score([
        { principal: old + quarter(), tab: quarter() },
        { principal: "<Harmony><name>Sol</name><eid>bbb</eid></Harmony>" + quarter(),
          tab: "<Harmony><name>Sol</name><eid>ccc</eid></Harmony>" + quarter() }
    ]);

    var result = patcher.patchChordSync(xml);
    assert.equal(result.syncCount, 1, "the first bar is copied, the second already matches");
});

test("a chord with no element id is left alone rather than copied wrongly", function() {
    // The patcher copies the raw XML of a chord and finds it by its eid. A score written by
    // hand, or by MuseScore 3, has none, and there is nothing to copy: it reports no change
    // rather than writing something in the wrong place
    var xml = score([
        { principal: harmony(14, null) + quarter(), tab: quarter() }
    ]);

    var result = patcher.patchChordSync(xml);
    assert.equal(result.syncCount, 0, "nothing is written");
    assert.equal(result.xml, xml, "and the score comes back untouched");
});

test("the copy carries no element id, so the two chords stay separate objects", function() {
    var xml = score([{ principal: harmony(14, "keepme") + quarter(), tab: quarter() }]);

    var result = patcher.patchChordSync(xml);
    var tab = result.xml.substring(result.xml.indexOf('<Staff id="2">'));
    assert.equal(tab.indexOf("keepme"), -1,
        "an id written twice would make MuseScore treat them as the same element: " + tab);
});

test("a bar written without a voice wrapper is read and written all the same", function() {
    // MuseScore 3 put the contents of a bar straight inside Measure, with no voice element
    // around them. The chord is then a child of the bar rather than of a voice, and there is no
    // opening voice tag to write in front of: the copy goes in before the end of the bar
    var noVoice = [
        '<?xml version="1.0"?>',
        '<museScore version="3.02">',
        '<Score>',
        '<Division>480</Division>',
        '<Part>',
        '<Staff><StaffType group="pitched"><name>stdNormal</name></StaffType></Staff>',
        '<Staff><linkedTo>0</linkedTo><StaffType group="tablature"><name>tab6</name></StaffType></Staff>',
        '</Part>',
        '<Staff id="1">',
        "<Measure>" + harmony(14, "aaa") + quarter() + "</Measure>",
        "<Measure>" + harmony(15, "bbb") + quarter() + "</Measure>",
        '</Staff>',
        '<Staff id="2">',
        "<Measure>" + quarter() + "</Measure>",
        "<Measure>" + harmony(15, "ccc") + quarter() + "</Measure>",
        '</Staff>',
        '</Score>',
        '</museScore>'
    ].join("\n");

    var result = patcher.patchChordSync(noVoice);
    assert.equal(result.syncCount, 1,
        "the first bar is copied and the second, which already has the chord, is not");

    var tab = result.xml.substring(result.xml.indexOf('<Staff id="2">'));
    var firstBar = tab.substring(0, tab.indexOf("</Measure>") + 10);
    assert.ok(firstBar.indexOf("<Harmony>") >= 0,
        "the copy landed inside the first bar: " + firstBar);
    assert.ok(firstBar.indexOf("<root>14</root>") >= 0, "and it is the right chord");
});

// --- patchChordTypos ----------------------------------------------------------

test("a chord name that is not a chord keeps its text and gains no root note", function() {
    // Chord symbols are also used to write things that are not chords. Normalising the text is
    // safe, but giving it a root note would turn a note to the player into a chord MuseScore
    // would try to transpose
    var xml = [
        '<museScore version="4.60"><Score><Division>480</Division><Staff id="1"><Measure><voice>',
        '<Harmony><harmonyInfo><name>a  tempo</name></harmonyInfo></Harmony>',
        '</voice></Measure></Staff></Score></museScore>'
    ].join("\n");

    var result = patcher.patchChordTypos(xml);
    assert.equal(result.xml.indexOf("<root>"), -1,
        "no root note was invented: " + result.xml.match(/<harmonyInfo>[\s\S]*?<\/harmonyInfo>/));
});

// --- patchLyrics --------------------------------------------------------------

// One staff, one bar, one syllable per Chord. syls is [[text, syllabic|null], ...]
function lyricScore(syls, extraStaff) {
    var chords = syls.map(function(s) {
        return "<Chord><durationType>quarter</durationType><Lyrics>" +
            (s[1] ? "<syllabic>" + s[1] + "</syllabic>" : "") +
            "<text>" + s[0] + "</text></Lyrics>" +
            "<Note><pitch>60</pitch><tpc>14</tpc></Note></Chord>";
    }).join("\n");

    var out = [
        '<?xml version="1.0"?>',
        '<museScore version="4.60">',
        '<Score>',
        '<Division>480</Division>',
        '<Part>',
        '<Staff><StaffType group="pitched"><name>stdNormal</name></StaffType></Staff>'
    ];
    if (extraStaff) {
        out.push('<Staff><linkedTo>0</linkedTo><StaffType group="tablature"><name>tab6</name></StaffType></Staff>');
    }
    out.push('</Part>', '<Staff id="1">', "<Measure><voice>", chords, "</voice></Measure>", "</Staff>");
    if (extraStaff) {
        out.push('<Staff id="2">', "<Measure><voice>", chords, "</voice></Measure>", "</Staff>");
    }
    out.push("</Score>", "</museScore>");
    return out.join("\n");
}

test("a syllable with no syllabic element gets one written in", function() {
    // A dot between two letters is a synalepha, and fixing it also settles what the syllable is
    // within its word. The Lyrics block has no syllabic element to replace, so one is added
    var xml = lyricScore([["bre.el", null], ["mar", null]]);

    var result = patcher.patchLyrics(xml);
    assert.ok(result.fixCount > 0, "the synalepha is a fix: " + result.fixCount);
    assert.ok(result.xml.indexOf("<syllabic>") >= 0,
        "a syllabic element is written next to the text: " + result.xml.match(/<Lyrics>[\s\S]*?<\/Lyrics>/));
    assert.ok(result.xml.indexOf("‿") >= 0, "and the dot became a synalepha tie");
});

test("an existing syllabic element is replaced rather than doubled", function() {
    var xml = lyricScore([["bre.el", "begin"], ["mar", null]]);

    var result = patcher.patchLyrics(xml);
    var block = result.xml.match(/<Lyrics>[\s\S]*?<\/Lyrics>/)[0];
    assert.equal(block.split("<syllabic>").length - 1, 1,
        "one syllabic element, not two: " + block);
});

test("the lyrics of a tablature staff are left where they are", function() {
    // The tablature staff carries its own copy of every syllable in the XML. The fixer only
    // reports the pitched staff, so the copy has no fix attached to it and is skipped: what
    // matters is that skipping it does not shift the patches of the staff that does have them
    var xml = lyricScore([["bre.el", null], ["mar", null]], true);

    var result = patcher.patchLyrics(xml);
    assert.ok(result.fixCount > 0, "there is something to fix");

    var split = result.xml.indexOf('<Staff id="2">');
    var principal = result.xml.substring(0, split);
    assert.ok(principal.indexOf("‿") >= 0, "the pitched staff is fixed");
    assert.ok(principal.indexOf("bre.el") < 0, "and its stale text is gone");
});

test("a score with nothing to fix comes back byte for byte", function() {
    var xml = lyricScore([["ma", "begin"], ["no", "end"]]);
    var result = patcher.patchLyrics(xml);
    assert.equal(result.fixCount, 0);
    assert.equal(result.xml, xml);
});
