// Lyrics Extractor for MuseScore
// Copyright (C) 2026 Manolo Carrasco (do2tis)
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Licensed under the GNU General Public License version 3 or later, with an
// additional attribution requirement under section 7(b): see LICENSE and ATTRIBUTION.md.

// score/api-patcher.js writes into the score the user has open. Until it was a module
// this code lived inside the QML dialog and no test could reach it, which is the worst
// place for untested code to be: it is the only path that modifies the user's file.
//
// The host objects (curScore, Element, newElement, removeElement) are injected, so here
// they are stubs recording what the patcher did.

var test = require("node:test");
var assert = require("node:assert/strict");

var patcher = require("../../score/api-patcher");

var ELEMENT = { CHORD: 93, REST: 25, HARMONY: 11 };

// --- Stub builders -------------------------------------------------------------

// A lyric as the API exposes it: text and syllabic are writable, and that is what the
// patcher writes to
function lyric(text, syllabic, verse) {
    return { text: text, syllabic: syllabic || 0, verse: verse || 0 };
}

// One segment holding chords with lyrics on track 0, chained through .next
function lyricSegments(perSegment) {
    var segs = perSegment.map(function(lyrics, i) {
        return {
            tick: i * 480,
            annotations: [],
            elementAt: function(track) {
                if (track !== 0) return null;
                return { type: ELEMENT.CHORD, lyrics: lyrics };
            }
        };
    });
    for (var i = 0; i < segs.length; i++) segs[i].next = segs[i + 1] || null;
    return segs;
}

function harmonySegments(entries) {
    // entries: [{tick, staff, text}]
    var byTick = {};
    entries.forEach(function(e) {
        if (!byTick[e.tick]) byTick[e.tick] = [];
        byTick[e.tick].push({ type: ELEMENT.HARMONY, text: e.text, track: e.staff * 4 });
    });
    var ticks = Object.keys(byTick).map(Number).sort(function(a, b) { return a - b; });
    var segs = ticks.map(function(t) {
        return { tick: t, annotations: byTick[t], elementAt: function() { return null; } };
    });
    for (var i = 0; i < segs.length; i++) segs[i].next = segs[i + 1] || null;
    return segs;
}

// The stubs mutate the segment list the way the API does: an element removed really
// leaves it, and one added through the cursor really appears at that tick. Without that,
// a step reading what an earlier step wrote would see stale data.
function stubHost(score, partGroups) {
    var log = { removed: [], added: [] };
    patcher.setHost({
        score: function() { return score; },
        Element: ELEMENT,
        partStaffGroups: function() { return partGroups || []; },
        newElement: function(type) {
            var el = { type: type, text: "", track: 0 };
            log.added.push(el);
            return el;
        },
        removeElement: function(el) {
            log.removed.push(el);
            (score._segments || []).forEach(function(seg) {
                var i = (seg.annotations || []).indexOf(el);
                if (i >= 0) seg.annotations.splice(i, 1);
            });
        }
    });
    return log;
}

function stubScore(fields) {
    var score = {
        nstaves: 1,
        staves: null,
        firstMeasure: null,
        cmdCount: 0,
        startCmd: function() { score.cmdCount++; },
        endCmd: function() {},
        firstSegment: function() { return score._segments[0] || null; },
        newCursor: function() {
            return {
                segment: {},
                staffIdx: -1,
                voice: -1,
                tick: 0,
                rewindToTick: function(t) { this.tick = t; },
                add: function(el) {
                    score._cursorAdds.push({ staffIdx: this.staffIdx, tick: this.tick, el: el });
                    el.track = this.staffIdx * 4;
                    var seg = score._segments.filter(function(s2) { return s2.tick === this.tick; }, this)[0];
                    if (seg) seg.annotations.push(el);
                }
            };
        },
        _segments: [],
        _cursorAdds: [],
        _meta: {},
        metaTag: function(k) { return score._meta[k] || ""; },
        setMetaTag: function(k, v) { score._meta[k] = v; }
    };
    Object.keys(fields || {}).forEach(function(k) { score[k] = fields[k]; });
    return score;
}

// --- patchLyrics --------------------------------------------------------------

test("patchLyrics writes the fixer's patches onto the live lyric objects", function() {
    // "da.es" is a synalepha the Fix button turns into the tie character
    var syls = [lyric("da.es"), lyric("hola")];
    var score = stubScore({ _segments: lyricSegments([[syls[0]], [syls[1]]]) });
    stubHost(score);

    var count = patcher.patchLyrics({});

    assert.equal(count, 1, "one syllable should be fixed");
    assert.ok(syls[0].text.indexOf(".") < 0,
        "the dot should be gone from the score, got " + JSON.stringify(syls[0].text));
    assert.equal(syls[1].text, "hola", "a clean syllable is left alone");
    assert.equal(score.cmdCount, 1, "the whole patch is one undo step");
});

test("patchLyrics honours a selection range", function() {
    var inside = lyric("da.es");
    var outside = lyric("va.a");
    var score = stubScore({ _segments: lyricSegments([[inside], [outside]]) });
    stubHost(score);

    // Second segment sits at tick 480, so this range covers the first one only
    patcher.patchLyrics({ useSelection: true, selectionStartTick: 0, selectionEndTick: 480 });

    assert.ok(inside.text.indexOf(".") < 0, "the selected syllable is fixed");
    assert.equal(outside.text, "va.a", "the one outside the selection is untouched");
});

test("patchLyrics on no score returns zero rather than throwing", function() {
    stubHost(null);
    assert.equal(patcher.patchLyrics({}), 0);
});

// --- syncVBoxToMetaTags -------------------------------------------------------
//
// A text in the frame is recognised by the enum value of its style, reported as subStyle, and not
// by subtypeName: that is a method rather than a property, and what it returns when called is
// translated, so this button used to copy nothing at all.
global.Tid = global.Tid || { TITLE: 1, SUBTITLE: 2, COMPOSER: 3, POET: 4 };

test("syncVBoxToMetaTags copies the VBox fields that differ", function() {
    var score = stubScore({
        firstMeasure: {
            prev: null,
            elements: [
                { subStyle: Tid.TITLE, text: "Clavelitos" },
                { subStyle: Tid.COMPOSER, text: "Valverde" }
            ]
        },
        _meta: { workTitle: "Untitled", composer: "Valverde" }
    });
    stubHost(score);

    var count = patcher.syncVBoxToMetaTags();

    assert.equal(count, 1, "only the title differs");
    assert.equal(score._meta.workTitle, "Clavelitos");
    assert.equal(score._meta.composer, "Valverde", "an equal field is not rewritten");
});

test("syncVBoxToMetaTags is not fooled by the translated style name", function() {
    // What broke: matching on the name meant matching a function against a string, and even
    // called it reads "Title" or "Titulo" depending on the language MuseScore runs in
    var score = stubScore({
        firstMeasure: {
            prev: null,
            elements: [{ subtypeName: "title", text: "Not a title" }]
        },
        _meta: { workTitle: "" }
    });
    stubHost(score);

    assert.equal(patcher.syncVBoxToMetaTags(), 0, "nothing is copied without the enum value");
    assert.equal(score._meta.workTitle, "");
});

test("syncVBoxToMetaTags leaves an empty VBox field alone", function() {
    var score = stubScore({
        firstMeasure: { prev: null, elements: [{ subStyle: Tid.SUBTITLE, text: "" }] },
        _meta: { subtitle: "keep me" }
    });
    stubHost(score);

    assert.equal(patcher.syncVBoxToMetaTags(), 0);
    assert.equal(score._meta.subtitle, "keep me");
});

// --- fixChordTypos ------------------------------------------------------------

test("fixChordTypos replaces only the chords whose text normalizes differently", function() {
    // "La m" normalizes to "Lam", a real typo the fixer corrects. "Mi7" is already clean
    var score = stubScore({
        _segments: harmonySegments([
            { tick: 0, staff: 0, text: "La m" },
            { tick: 480, staff: 0, text: "Mi7" }
        ])
    });
    var log = stubHost(score);

    var count = patcher.fixChordTypos();

    assert.equal(count, 1, "one chord carries a typo");
    assert.equal(log.removed.length, 1, "the old harmony is removed");
    assert.equal(log.removed[0].text, "La m");
    assert.equal(log.added.length, 1, "and one is added back");
    assert.equal(log.added[0].text, "Lam", "with the normalized text");
    assert.equal(score._cursorAdds[0].staffIdx, 0, "on the staff it came from");
});

test("fixChordTypos does nothing when every chord is clean", function() {
    var score = stubScore({
        _segments: harmonySegments([{ tick: 0, staff: 0, text: "Lam" }])
    });
    var log = stubHost(score);

    assert.equal(patcher.fixChordTypos(), 0);
    assert.equal(log.removed.length, 0, "nothing is touched, so there is no undo step");
    assert.equal(score.cmdCount, 0);
});

// --- syncChordsToLinkedStaves -------------------------------------------------

// A part with a principal staff and one linked copy, the shape of every plucked string
// part in these scores. isTabStaff is deliberately absent: MuseScore does not always
// expose it, which is the whole reason the patcher goes by Part instead.
var PART_WITH_LINKED = [[0, 1]];
function stavesWithTab() {
    return [{}, {}];
}

test("syncChordsToLinkedStaves copies the principal chords onto the tab staff", function() {
    var staves = stavesWithTab();
    var score = stubScore({
        staves: staves,
        _segments: harmonySegments([
            { tick: 0, staff: 0, text: "Lam" },
            { tick: 480, staff: 0, text: "Mi7" }
        ])
    });
    var log = stubHost(score, PART_WITH_LINKED);

    var count = patcher.syncChordsToLinkedStaves();

    assert.equal(count, 2, "both chords reach the tab staff");
    assert.deepEqual(log.added.map(function(e) { return e.text; }), ["Lam", "Mi7"]);
    score._cursorAdds.forEach(function(a) {
        assert.equal(a.staffIdx, 1, "written on the linked tab staff");
    });
});

test("syncChordsToLinkedStaves leaves a tab staff that already matches", function() {
    var staves = stavesWithTab();
    var score = stubScore({
        staves: staves,
        _segments: harmonySegments([
            { tick: 0, staff: 0, text: "Lam" },
            { tick: 0, staff: 1, text: "Lam" }
        ])
    });
    var log = stubHost(score, PART_WITH_LINKED);

    assert.equal(patcher.syncChordsToLinkedStaves(), 0, "nothing to do");
    assert.equal(log.removed.length, 0, "and nothing removed");
    assert.equal(score.cmdCount, 0, "so no undo step is opened");
});

test("syncChordsToLinkedStaves does nothing without a tab staff", function() {
    var score = stubScore({
        staves: [{}],
        _segments: harmonySegments([{ tick: 0, staff: 0, text: "Lam" }])
    });
    stubHost(score, [[0]]);   // a single staff part has nothing linked to it
    assert.equal(patcher.syncChordsToLinkedStaves(), 0);
});

// --- applyAll -----------------------------------------------------------------

test("applyAll reports what each step changed", function() {
    var syls = [lyric("da.es")];
    var score = stubScore({ _segments: lyricSegments([[syls[0]]]) });
    stubHost(score);

    var counts = patcher.applyAll({});

    assert.equal(counts.lyrics, 1);
    assert.equal(counts.typos, 0);
    assert.equal(counts.synced, 0);
    assert.equal(counts.meta, 0);
    assert.equal(counts.total, 1, "total adds them up, which is what the dialog reports");
});

test("applyAll fixes chord typos before syncing them to the tab staff", function() {
    // Order matters: a typo copied first and cleaned later would leave the tab staff
    // holding the wrong text
    var staves = stavesWithTab();
    var score = stubScore({
        staves: staves,
        _segments: harmonySegments([{ tick: 0, staff: 0, text: "La m" }])
    });
    var log = stubHost(score, PART_WITH_LINKED);

    var counts = patcher.applyAll({});

    assert.equal(counts.typos, 1, "the typo is fixed");
    assert.ok(counts.synced > 0, "and the chord reaches the tab staff");
    var onTab = score._cursorAdds.filter(function(a) { return a.staffIdx === 1; });
    assert.ok(onTab.length > 0, "something was written on the tab staff");
    assert.equal(log.added[log.added.length - 1].text, "Lam",
        "the tab staff gets the normalized text, not the typo");
});

test("syncChordsToLinkedStaves works on a build that does not expose isTabStaff", function() {
    // RondaFiruli, 4.7.2: the guitar staff carries all 83 chords and its tablature copy
    // none. The dialog counted them as unsynchronized and the Fix button did nothing,
    // because the fix asked each staff whether it was a tablature and got undefined.
    // Nothing here exposes isTabStaff, so the part grouping is the only thing to go on.
    var score = stubScore({
        staves: [{}, {}, {}],
        _segments: harmonySegments([
            { tick: 0, staff: 1, text: "Lam" },
            { tick: 480, staff: 1, text: "Mi7" }
        ])
    });
    // Staff 0 is a voice on its own, staves 1 and 2 are a part with its linked copy
    var log = stubHost(score, [[0], [1, 2]]);

    var count = patcher.syncChordsToLinkedStaves();

    assert.equal(count, 2, "both chords should reach the linked staff");
    score._cursorAdds.forEach(function(a) {
        assert.equal(a.staffIdx, 2, "written on the linked staff, not the voice");
    });
});

test("syncChordsToLinkedStaves reports nothing when the Part grouping is unavailable", function() {
    // Without groups there is no way to tell a principal from a copy, so the patcher
    // leaves the score alone rather than guessing
    var score = stubScore({
        staves: [{}, {}],
        _segments: harmonySegments([{ tick: 0, staff: 0, text: "Lam" }])
    });
    var log = stubHost(score, []);

    assert.equal(patcher.syncChordsToLinkedStaves(), 0);
    assert.equal(log.added.length, 0, "and writes nothing");
});
