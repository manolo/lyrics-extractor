// Lyrics Extractor for MuseScore
// Copyright (C) 2026 Manolo Carrasco (do2tis)
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Licensed under the GNU General Public License version 3 or later, with an
// additional attribution requirement under section 7(b): see LICENSE and ATTRIBUTION.md.

// score/lyric-applier.js reads the selected notes and writes lyrics into the score. The
// host is injected, so here it is a stub that mutates its state the way the API does: a
// lyric added through the cursor really lands on the chord at the cursor.

var test = require("node:test");
var assert = require("node:assert/strict");

var applier = require("../../score/lyric-applier");

var ELEMENT = { CHORD: 93, REST: 25, LYRICS: 40 };
var SYL = { single: 0, begin: 1, end: 2, middle: 3 };

// --- Stub builders -------------------------------------------------------------

// spec: {tick, staff (default 0), tied: bool | [bool per note], lyrics: [verse...], rest: bool}
// Segments without a chord on a staff return null for its track, as the real API does.
function buildScore(specs, sel) {
    var segs = specs.map(function(s, i) {
        var el;
        if (s.rest) {
            el = { type: ELEMENT.REST, lyrics: [] };
        } else {
            var tied = s.tied === undefined ? [false] : (Array.isArray(s.tied) ? s.tied : [s.tied]);
            el = {
                type: ELEMENT.CHORD,
                notes: tied.map(function(t) { return { tieBack: t ? {} : null }; }),
                lyrics: (s.lyrics || []).map(function(v) { return { text: "x", syllabic: 0, verse: v }; })
            };
        }
        var seg = {
            tick: s.tick,
            elementAt: function(track) { return track === (s.staff || 0) * 4 ? el : null; }
        };
        seg._el = el;
        return seg;
    });
    for (var i = 0; i < segs.length; i++) segs[i].next = segs[i + 1] || null;
    var score = {
        _segments: segs,
        startCmdCount: 0,
        endCmdCount: 0,
        selection: sel === null ? { isRange: false } : Object.assign({
            isRange: true, startStaff: 0, endStaff: 1,
            startSegment: segs[0], endSegment: null
        }, sel),
        parts: [{ startTrack: 0, endTrack: 8, longName: "Voice" }],
        // Measures of 1920 ticks, as firstMeasure/nextMeasure expose them: the number of
        // a measure is its position in the chain, a segment has no measure of its own
        firstMeasure: measureChain(segs),
        startCmd: function() { score.startCmdCount++; },
        endCmd: function() { score.endCmdCount++; },
        newCursor: function() {
            // Like the real cursor: a new one is on track 0, rewindToTick lands on the
            // first segment at or after the tick that has an element on the CURRENT
            // track, and changing staffIdx or voice does not move the segment
            var cur = {
                track: 0, segment: null,
                set staffIdx(v) { cur.track = v * 4 + cur.voice; cur._staff = v; },
                get staffIdx() { return cur._staff || 0; },
                set voice(v) { cur._voice = v; cur.track = cur.staffIdx * 4 + v; },
                get voice() { return cur._voice || 0; },
                get element() { return cur.segment ? cur.segment.elementAt(cur.track) : null; },
                rewindToTick: function(t) {
                    cur.segment = segs.filter(function(s) {
                        return s.tick >= t && s.elementAt(cur.track);
                    })[0] || null;
                },
                add: function(el) {
                    // The real LYRICS branch dereferences the current element
                    assert.ok(cur.element, "cursor has no element on its track: the real add crashes");
                    cur.element.lyrics.push(el);
                }
            };
            return cur;
        }
    };
    return score;
}

function measureChain(segs) {
    var starts = [];
    segs.forEach(function(seg) {
        var m = Math.floor(seg.tick / 1920);
        if (starts.indexOf(m) < 0) starts.push(m);
    });
    var last = Math.max.apply(null, starts);
    var head = null, prev = null;
    for (var m = 0; m <= last; m++) {
        var node = { firstSegment: { tick: m * 1920 }, nextMeasure: null };
        if (prev) prev.nextMeasure = node; else head = node;
        prev = node;
    }
    return head;
}

function chords(n, extra) {
    var out = [];
    for (var i = 0; i < n; i++) out.push(Object.assign({ tick: i * 480 }, extra && extra[i]));
    return out;
}

function stubHost(score) {
    var log = { created: [] };
    applier.setHost({
        score: function() { return score; },
        Element: ELEMENT,
        newElement: function(type) {
            var el = { type: type, text: "", syllabic: 0, verse: 0 };
            log.created.push(el);
            return el;
        },
        fraction: function(n, d) { return { numerator: n, denominator: d }; }
    });
    return log;
}

function written(score) {
    var out = [];
    score._segments.forEach(function(seg) {
        (seg._el.lyrics || []).forEach(function(l) {
            if (l.type === ELEMENT.LYRICS) out.push({ tick: seg.tick, lyric: l });
        });
    });
    return out;
}

// --- readSelection -------------------------------------------------------------

test("readSelection reports a usable single staff range", function() {
    var score = buildScore(chords(5, [null, null, { tied: true }]));
    stubHost(score);
    var s = applier.readSelection();
    assert.equal(s.usable, true);
    assert.equal(s.reason, "");
    assert.equal(s.staffIdx, 0);
    assert.equal(s.staffName, "Voice");
    assert.equal(s.firstMeasure, 1);
    assert.equal(s.lastMeasure, 2);
    assert.equal(s.slots.length, 5);
    assert.equal(s.tiedCount, 1);
    assert.equal(s.slots[2].tieContinuation, true);
    assert.equal(s.slots[1].tieContinuation, false);
    assert.equal(s.targetVerse, 0);
});

test("readSelection numbers the measures the selection spans", function() {
    var score = buildScore([{ tick: 1920 }, { tick: 2400 }, { tick: 3840 }]);
    stubHost(score);
    var s = applier.readSelection();
    assert.equal(s.firstMeasure, 2);
    assert.equal(s.lastMeasure, 3);
});

test("readSelection marks unusable selections", function() {
    var score = buildScore(chords(2), null);
    stubHost(score);
    assert.deepEqual([applier.readSelection().usable, applier.readSelection().reason], [false, "none"]);

    score = buildScore(chords(2), { endStaff: 2 });
    stubHost(score);
    assert.equal(applier.readSelection().reason, "multiStaff");
    assert.equal(applier.readSelection().usable, false);

    score = buildScore(chords(3, [{ rest: true }, { rest: true }, { rest: true }]));
    stubHost(score);
    assert.equal(applier.readSelection().reason, "noNotes");
});

test("readSelection stops at the end segment, which is exclusive", function() {
    var score = buildScore(chords(5));
    score.selection.endSegment = score._segments[3];
    stubHost(score);
    assert.equal(applier.readSelection().slots.length, 3);
});

test("a chord tied back on only some notes is not a continuation", function() {
    var score = buildScore([{ tick: 0, tied: [true, false] }, { tick: 480 }]);
    stubHost(score);
    var s = applier.readSelection();
    assert.equal(s.slots[0].tieContinuation, false);
    assert.equal(s.tiedCount, 0);
});

test("a leading tie continuation counts as a slot", function() {
    var score = buildScore([{ tick: 0, tied: true }, { tick: 480 }]);
    var log = stubHost(score);
    var s = applier.readSelection();
    assert.equal(s.slots[0].tieContinuation, true);
    var r = applier.applyLyrics("a-mor");
    assert.equal(r.ok, true);
    assert.equal(written(score)[0].tick, 0);
    assert.equal(written(score)[0].lyric.text, "a");
    assert.equal(log.created.length, 2);
});

test("targetVerse is the lowest verse free on every chord", function() {
    var score = buildScore(chords(4, [{ lyrics: [0] }, null, { lyrics: [0] }]));
    stubHost(score);
    assert.equal(applier.readSelection().targetVerse, 1);
});

test("targetVerse skips a verse used on only one chord", function() {
    var score = buildScore(chords(3, [null, { lyrics: [0, 1] }, null]));
    stubHost(score);
    assert.equal(applier.readSelection().targetVerse, 2);
});

// --- applyLyrics ---------------------------------------------------------------

test("applyLyrics writes syllables, syllabic and melisma", function() {
    var ticks = [0, 360, 480, 960, 1440, 1920];
    var ties = [false, true, false, false, false, true];
    var score = buildScore(ticks.map(function(t, i) { return { tick: t, tied: ties[i] }; }));
    stubHost(score);
    var r = applier.applyLyrics("so--pis a-mor _");
    assert.deepEqual(r, { ok: true, error: null, expected: 6, actual: 6, written: 4 });
    var w = written(score);
    assert.deepEqual(w.map(function(x) { return x.tick; }), [0, 480, 960, 1440]);
    assert.deepEqual(w.map(function(x) { return x.lyric.text; }), ["so", "pis", "a", "mor"]);
    assert.deepEqual(w.map(function(x) { return x.lyric.syllabic; }), [SYL.begin, SYL.end, SYL.begin, SYL.end]);
    w.forEach(function(x) { assert.equal(x.lyric.verse, 0); });
    assert.equal(w[0].lyric.lyricTicks, undefined);
    assert.deepEqual(w[3].lyric.lyricTicks, { numerator: 480, denominator: 1920 });
    assert.equal(w[1].lyric.lyricTicks, undefined);
});

test("a word-final hold of several notes reaches the last held chord", function() {
    var score = buildScore(chords(4));
    stubHost(score);
    applier.applyLyrics("la _ _ _");
    assert.deepEqual(written(score)[0].lyric.lyricTicks, { numerator: 1440, denominator: 1920 });
});

test("applyLyrics writes on the next free verse", function() {
    var score = buildScore(chords(2, [{ lyrics: [0] }, { lyrics: [0] }]));
    stubHost(score);
    applier.applyLyrics("a-mor");
    written(score).forEach(function(x) { assert.equal(x.lyric.verse, 1); });
    assert.equal(score._segments[0]._el.lyrics.length, 2);
});

test("applyLyrics writes final forms", function() {
    var score = buildScore(chords(5));
    stubHost(score);
    var r = applier.applyLyrics("de.an-ti-guos ca-pa;;");
    assert.equal(r.ok, true);
    var texts = written(score).map(function(x) { return x.lyric.text; });
    assert.deepEqual(texts, ["de‿an", "ti", "guos", "ca", "pa；"]);
    assert.deepEqual(written(score).map(function(x) { return x.lyric.syllabic; }),
        [SYL.begin, SYL.middle, SYL.end, SYL.begin, SYL.end]);
});

test("a leading hold marker leaves its slot without a lyric", function() {
    var score = buildScore(chords(3));
    stubHost(score);
    var r = applier.applyLyrics("_ a-mor");
    assert.equal(r.ok, true);
    assert.deepEqual(written(score).map(function(x) { return x.tick; }), [480, 960]);
});

test("applyLyrics refuses on count mismatch", function() {
    var score = buildScore(chords(3));
    var log = stubHost(score);
    var r = applier.applyLyrics("a-mor");
    assert.deepEqual(r, { ok: false, error: "count", expected: 3, actual: 2, written: 0 });
    assert.equal(log.created.length, 0);
    assert.equal(score.startCmdCount, 0);
});

test("applyLyrics refuses an unusable selection", function() {
    var score = buildScore(chords(2), null);
    var log = stubHost(score);
    var r = applier.applyLyrics("a-mor");
    assert.equal(r.ok, false);
    assert.equal(r.error, "selection");
    assert.equal(r.written, 0);
    assert.equal(log.created.length, 0);
    assert.equal(score.startCmdCount, 0);
});

test("applyLyrics wraps the write in one command and touches nothing else", function() {
    var score = buildScore(chords(2, [{ lyrics: [0] }, { lyrics: [0] }]));
    stubHost(score);
    applier.applyLyrics("a-mor");
    assert.equal(score.startCmdCount, 1);
    assert.equal(score.endCmdCount, 1);
    score._segments.forEach(function(seg) {
        var old = seg._el.lyrics[0];
        assert.deepEqual(old, { text: "x", syllabic: 0, verse: 0 });
    });
});

test("applyLyrics closes its command even when the write throws", function() {
    // An open command would leave MuseScore's undo stack in a broken state
    var score = buildScore(chords(2));
    stubHost(score);
    applier.setHost({
        score: function() { return score; },
        Element: ELEMENT,
        newElement: function() { throw new Error("no element"); },
        fraction: function(n, d) { return { numerator: n, denominator: d }; }
    });
    assert.throws(function() { applier.applyLyrics("a-mor"); }, /no element/);
    assert.equal(score.startCmdCount, 1);
    assert.equal(score.endCmdCount, 1);
});

test("applyLyrics on a staff other than the first lands on the right chords", function() {
    // Staff 0 has an element at tick 0 only, the vocal staff 1 starts at 480
    var score = buildScore([{ tick: 0, staff: 0 }, { tick: 480, staff: 1 }, { tick: 960, staff: 1 }]);
    score.selection.startStaff = 1;
    score.selection.endStaff = 2;
    score.selection.startSegment = score._segments[0];
    stubHost(score);
    var r = applier.applyLyrics("a-mor");
    assert.equal(r.ok, true);
    assert.deepEqual(written(score).map(function(x) { return x.tick; }), [480, 960]);
    assert.equal(score._segments[0]._el.lyrics.length, 0);
});

test("a placement the cursor cannot make is reported and not counted", function() {
    var score = buildScore(chords(3));
    stubHost(score);
    // The cursor lands one chord late on the second write
    var newCursor = score.newCursor;
    score.newCursor = function() {
        var cur = newCursor();
        var rewind = cur.rewindToTick;
        var calls = 0;
        cur.rewindToTick = function(t) { rewind(calls++ === 1 ? t + 1 : t); };
        return cur;
    };
    var r = applier.applyLyrics("a-mor _");
    assert.equal(r.ok, false);
    assert.equal(r.error, "placement");
    assert.equal(r.written, 1);
    assert.equal(written(score).length, 1);
});
