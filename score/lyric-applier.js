// Lyrics Extractor for MuseScore
// Copyright (C) 2026 Manolo Carrasco (do2tis)
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Licensed under the GNU General Public License version 3 or later, with an
// additional attribution requirement under section 7(b): see LICENSE and ATTRIBUTION.md.

// Reads the notes the user selected and writes generated lyrics onto them, as the next
// free verse. Like api-patcher.js this modifies the open score, so the rule is strict:
// nothing is written unless the number of syllable slots in the text equals the number of
// selected notes.
//
// The text is parsed by lib/lyric-generator.js and its typed markers are turned into the
// final characters by lib/lyrics-fixer.js. The host (curScore, Element, newElement,
// fraction) is injected with setHost(), as in api-patcher.js, so Node tests can stub it.

var _host = null;

function setHost(host) { _host = host; }

var LyricGenerator, LyricsFixer;
if (typeof require !== "undefined") {
    LyricGenerator = require("../lib/lyric-generator");
    LyricsFixer = require("../lib/lyrics-fixer");
}
// In QML these are set from the dialog, which imports the modules itself
function setLyricGenerator(mod) { LyricGenerator = mod; }
function setLyricsFixer(mod) { LyricsFixer = mod; }

var SYLLABIC = { single: 0, begin: 1, end: 2, middle: 3 };

// Ticks of a whole note, the unit the API measures a melisma in
var WHOLE_NOTE_TICKS = 1920;

function unusable(reason) {
    return {
        usable: false, reason: reason, staffIdx: 0, staffName: "",
        firstMeasure: 0, lastMeasure: 0, slots: [], tiedCount: 0, targetVerse: 0
    };
}

// A chord continues a tie only when every one of its notes does
function isTieContinuation(chord) {
    var notes = chord.notes;
    if (!notes || notes.length === 0) return false;
    for (var i = 0; i < notes.length; i++) {
        if (!notes[i].tieBack) return false;
    }
    return true;
}

function staffNameOf(curScore, staffIdx) {
    try {
        var parts = curScore.parts;
        for (var p = 0; p < parts.length; p++) {
            var first = Math.floor(parts[p].startTrack / 4);
            var last = Math.floor((parts[p].endTrack - 1) / 4);
            if (staffIdx >= first && staffIdx <= last) {
                var name = parts[p].longName || parts[p].shortName || "";
                name = String(name).replace(/<[^>]*>/g, "");
                if (name) return name;
            }
        }
    } catch (e) { /* no part information */ }
    return "Staff " + (staffIdx + 1);
}

function measureNumberOf(segment) {
    try { return segment.measure.no || 0; } catch (e) { return 0; }
}

// What the user has selected, as the slots the lyrics have to fill. Only voice 1 of a
// single staff counts, chords only, grace notes skipped.
function readSelection() {
    var curScore = _host.score();
    var Element = _host.Element;
    var sel = curScore ? curScore.selection : null;
    if (!sel || !sel.isRange) return unusable("none");
    if (sel.endStaff - sel.startStaff !== 1) return unusable("multiStaff");

    var staffIdx = sel.startStaff;
    var track = staffIdx * 4;
    var endSegment = sel.endSegment;
    var slots = [];
    var usedVerses = {};
    var firstMeasure = 0;
    var lastMeasure = 0;
    var tiedCount = 0;

    var segment = sel.startSegment;
    while (segment && segment !== endSegment) {
        if (endSegment && segment.tick >= endSegment.tick) break;
        var el = segment.elementAt(track);
        if (el && el.type === Element.CHORD && !el.noteType) {
            var tied = isTieContinuation(el);
            if (tied) tiedCount++;
            slots.push({ tick: segment.tick, tieContinuation: tied });
            var m = measureNumberOf(segment);
            if (slots.length === 1) firstMeasure = m;
            lastMeasure = m;
            var lyr = el.lyrics || [];
            for (var l = 0; l < lyr.length; l++) usedVerses[lyr[l].verse || 0] = true;
        }
        segment = segment.next;
    }

    if (slots.length === 0) return unusable("noNotes");

    var targetVerse = 0;
    while (usedVerses[targetVerse]) targetVerse++;

    return {
        usable: true, reason: "", staffIdx: staffIdx, staffName: staffNameOf(curScore, staffIdx),
        firstMeasure: firstMeasure, lastMeasure: lastMeasure, slots: slots,
        tiedCount: tiedCount, targetVerse: targetVerse
    };
}

// Writes the text onto the selection. Returns {ok, error, expected, actual, written}.
function applyLyrics(text) {
    var selection = readSelection();
    if (!selection.usable) {
        return { ok: false, error: "selection", expected: 0, actual: 0, written: 0 };
    }

    var parsed = LyricGenerator.parse(text);
    var expected = selection.slots.length;
    if (parsed.slotCount !== expected) {
        return { ok: false, error: "count", expected: expected, actual: parsed.slotCount, written: 0 };
    }

    var tokens = parsed.tokens;
    var group = [];
    for (var g = 0; g < tokens.length; g++) {
        group.push({ text: tokens[g].text, syllabic: SYLLABIC[tokens[g].syllabic] });
    }
    // Only the text comes from the fixer: the syllabic of the parser is the source of truth
    var finalTexts = [];
    for (var t = 0; t < tokens.length; t++) finalTexts.push(tokens[t].text);
    var patches = LyricsFixer.fixGroup(group);
    for (var p = 0; p < patches.length; p++) finalTexts[patches[p].index] = patches[p].newText;

    // Holds typed before the first syllable use up slots without carrying a lyric
    var pos = parsed.slotCount;
    for (var c = 0; c < tokens.length; c++) pos -= 1 + tokens[c].holds;

    var curScore = _host.score();
    var Element = _host.Element;
    var slots = selection.slots;
    var cursor = curScore.newCursor();
    var count = 0;

    curScore.startCmd();
    for (var i = 0; i < tokens.length; i++) {
        var token = tokens[i];
        var start = slots[pos].tick;

        var lyric = _host.newElement(Element.LYRICS);
        lyric.text = finalTexts[i];
        lyric.syllabic = SYLLABIC[token.syllabic];
        lyric.verse = selection.targetVerse;
        // A "-" hold draws no line of its own: the syllabic chain already does. Only a
        // "_" hold needs the extender, which runs to the start of the last held chord.
        if (token.holdKind === "_") {
            var heldEnd = slots[pos + token.holds].tick;
            lyric.lyricTicks = _host.fraction(heldEnd - start, WHOLE_NOTE_TICKS);
        }

        cursor.rewindToTick(start);
        cursor.staffIdx = selection.staffIdx;
        cursor.voice = 0;
        cursor.add(lyric);
        count++;

        pos += 1 + token.holds;
    }
    curScore.endCmd();

    return { ok: true, error: null, expected: expected, actual: parsed.slotCount, written: count };
}

if (typeof exports !== "undefined") {
    exports.setHost = setHost;
    exports.setLyricGenerator = setLyricGenerator;
    exports.setLyricsFixer = setLyricsFixer;

    exports.readSelection = readSelection;
    exports.applyLyrics = applyLyrics;
}
