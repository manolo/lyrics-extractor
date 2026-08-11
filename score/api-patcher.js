// Lyrics Extractor for MuseScore
// Copyright (C) 2026 Manolo Carrasco (do2tis)
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Licensed under the GNU General Public License version 3 or later, with an
// additional attribution requirement under section 7(b): see LICENSE and ATTRIBUTION.md.

// Writes into the score MuseScore has open, through the QML API. The counterpart of
// api-extractor.js, which only reads, and of xml-patcher.js, which writes the same fixes
// into the XML of a .mscz for the CLI.
//
// What to change is decided by lib/lyrics-fixer.js and lib/chord-utils.js, shared with
// that XML path. This module only applies it.
//
// The QML engine owns curScore, Element, newElement and removeElement, so they are
// injected with setHost() at startup, together with partStaffGroups(), which reports how
// staves belong to Parts. In Node they come from a stub, which is what makes
// the score mutating path testable at all.
//
// The score arrives as a function rather than a value: curScore changes when the user
// switches tab or opens another file, and a reference captured at startup would keep
// patching the score that was open then.

var _host = null;

function setHost(host) { _host = host; }

var LyricsFixer, ChordUtils, TextUtils;
if (typeof require !== "undefined") {
    LyricsFixer = require("../lib/lyrics-fixer");
    ChordUtils = require("../lib/chord-utils");
    TextUtils = require("../lib/text-utils");
}
// In QML these are set from the dialog, which imports the modules itself
function setLyricsFixer(mod) { LyricsFixer = mod; }
function setChordUtils(mod) { ChordUtils = mod; }
function setTextUtils(mod) { TextUtils = mod; }

// ========================================
// Lyrics: synalepha, manual hyphens, broken syllabic chains
// ========================================

// opts: { useSelection, selectionStartTick, selectionEndTick }
// Returns the number of syllables changed.
function patchLyrics(opts) {
    opts = opts || {};
    var curScore = _host.score();
    var Element = _host.Element;
    if (!curScore) return 0;

    // Each entry keeps a reference to the live lyric object, so the patch the fixer
    // computes can be written straight back onto it
    var lyricGroups = {};
    var lyricRefs = {};

    var segment = curScore.firstSegment();
    while (segment) {
        if (opts.useSelection) {
            if (segment.tick < opts.selectionStartTick) { segment = segment.next; continue; }
            if (segment.tick >= opts.selectionEndTick) break;
        }

        for (var staff = 0; staff < curScore.nstaves; staff++) {
            for (var voice = 0; voice < 4; voice++) {
                var element = segment.elementAt(staff * 4 + voice);
                if (!element) continue;
                if (element.type !== Element.CHORD && element.type !== Element.REST) continue;

                var lyr = element.lyrics;
                if (!lyr) continue;

                for (var l = 0; l < lyr.length; l++) {
                    var lyric = lyr[l];
                    var text = TextUtils.stripHtml(lyric.text || "");
                    if (!text) continue;

                    var verse = lyric.verse || 0;
                    var key = staff + "_" + voice + "_" + verse;

                    if (!lyricGroups[key]) { lyricGroups[key] = []; lyricRefs[key] = []; }

                    lyricGroups[key].push({
                        text: text,
                        syllabic: lyric.syllabic || 0
                    });
                    lyricRefs[key].push(lyric);
                }
            }
        }
        segment = segment.next;
    }

    var result = LyricsFixer.fixAll(lyricGroups);

    curScore.startCmd();
    var patchKeys = Object.keys(result.patches);
    for (var pk = 0; pk < patchKeys.length; pk++) {
        var pKey = patchKeys[pk];
        var patches = result.patches[pKey];
        var refs = lyricRefs[pKey];
        for (var pi = 0; pi < patches.length; pi++) {
            var patch = patches[pi];
            refs[patch.index].text = patch.newText;
            refs[patch.index].syllabic = patch.newSyllabic;
        }
    }
    curScore.endCmd();

    return result.fixCount;
}

// ========================================
// VBox text fields to project properties
// ========================================

function syncVBoxToMetaTags() {
    var curScore = _host.score();
    if (!curScore) return 0;
    // VBox subtypeName -> metaTag key
    var mapping = [
        { style: "title",    tag: "workTitle" },
        { style: "subtitle", tag: "subtitle" },
        { style: "composer", tag: "composer" },
        { style: "lyricist", tag: "lyricist" }
    ];
    var count = 0;
    try {
        var mb = curScore.firstMeasure;
        if (!mb) return 0;
        while (mb.prev) mb = mb.prev;
        var elems = mb.elements;
        if (!elems) return 0;
        // Collect VBox values
        var vboxValues = {};
        for (var i = 0; i < elems.length; i++) {
            var el = elems[i];
            if (!el || !el.subtypeName) continue;
            for (var m = 0; m < mapping.length; m++) {
                if (el.subtypeName === mapping[m].style && el.text) {
                    vboxValues[mapping[m].tag] = el.text;
                }
            }
        }
        // Update metaTags where the VBox has a value and the metaTag differs
        for (var m2 = 0; m2 < mapping.length; m2++) {
            var tag = mapping[m2].tag;
            var vboxVal = vboxValues[tag];
            if (!vboxVal) continue;
            var current = curScore.metaTag(tag) || "";
            if (current !== vboxVal) {
                curScore.setMetaTag(tag, vboxVal);
                count++;
            }
        }
    } catch (e) { /* VBox access failed */ }
    return count;
}

// ========================================
// Chord typos: normalize the text in place
// ========================================

function fixChordTypos() {
    var curScore = _host.score();
    var Element = _host.Element;
    if (!curScore) return 0;

    // Collect all Harmony annotations with typos
    var toFix = []; // [{ann, segment, staff, text}]
    var segment = curScore.firstSegment();
    while (segment) {
        var annotations = segment.annotations;
        if (annotations) {
            for (var a = 0; a < annotations.length; a++) {
                var ann = annotations[a];
                if (ann && ann.type === Element.HARMONY) {
                    var raw = ann.text || "";
                    var normalized = ChordUtils.normalizeChord(raw);
                    if (normalized !== raw) {
                        toFix.push({ ann: ann, segment: segment, staff: Math.floor(ann.track / 4), text: normalized });
                    }
                }
            }
        }
        segment = segment.next;
    }

    if (toFix.length === 0) return 0;

    // A Harmony cannot be edited in place through the API, so each one is removed and
    // added again with the clean text
    curScore.startCmd();

    for (var i = 0; i < toFix.length; i++) {
        var fix = toFix[i];
        var tick = fix.segment.tick;
        var staffIdx = fix.staff;

        try { _host.removeElement(fix.ann); } catch (e) { continue; }

        var cursor = curScore.newCursor();
        cursor.rewindToTick(tick);
        if (!cursor.segment) continue;
        cursor.staffIdx = staffIdx;
        cursor.voice = 0;
        var harmony = _host.newElement(Element.HARMONY);
        if (harmony) {
            cursor.add(harmony);
            harmony.text = fix.text;
        }
    }

    curScore.endCmd();
    return toFix.length;
}

// ========================================
// Chords from the principal staff to its linked tab staves
// ========================================

function syncChordsToLinkedStaves() {
    var curScore = _host.score();
    var Element = _host.Element;
    if (!curScore) return 0;

    var staves = curScore.staves;
    if (!staves) return 0;

    // Find the staves that carry harmonies, and how many each one has
    var harmonyStaves = [];
    var segment = curScore.firstSegment();
    while (segment) {
        var annotations = segment.annotations;
        if (annotations) {
            for (var a = 0; a < annotations.length; a++) {
                var ann = annotations[a];
                if (ann && (ann.type === Element.HARMONY)) {
                    var hStaff = Math.floor(ann.track / 4);
                    var found = false;
                    for (var h = 0; h < harmonyStaves.length; h++) {
                        if (harmonyStaves[h].idx === hStaff) {
                            harmonyStaves[h].count++;
                            found = true;
                            break;
                        }
                    }
                    if (!found) harmonyStaves.push({ idx: hStaff, count: 1 });
                }
            }
        }
        segment = segment.next;
    }

    if (harmonyStaves.length === 0) return 0;

    // Staff roles come from the Part grouping, the same source the check counts with.
    // Asking a staff whether it is a tablature is not equivalent: staff.isTabStaff is
    // missing on builds where the check still counts happily, and the fix then found no
    // destination and silently did nothing while the dialog kept reporting the chords as
    // unsynchronized.
    var groups = _host.partStaffGroups ? _host.partStaffGroups() : [];
    var groupOf = {};      // staff index -> its group
    var isLinked = {};     // true for every staff that is not the first of its part
    for (var g = 0; g < groups.length; g++) {
        for (var gi = 0; gi < groups[g].length; gi++) {
            groupOf[groups[g][gi]] = groups[g];
            if (gi > 0) isLinked[groups[g][gi]] = true;
        }
    }

    harmonyStaves.sort(function(a, b) { return b.count - a.count; });
    var principalStaff = -1;
    var linkedStaves = [];

    // The principal is the harmony staff that leads its own part
    for (var hs = 0; hs < harmonyStaves.length; hs++) {
        var idx = harmonyStaves[hs].idx;
        if (!isLinked[idx]) { principalStaff = idx; break; }
    }

    if (principalStaff < 0) return 0;

    var principalGroup = groupOf[principalStaff] || [];
    for (var pg = 0; pg < principalGroup.length; pg++) {
        if (principalGroup[pg] !== principalStaff) linkedStaves.push(principalGroup[pg]);
    }

    // Also any linked staff of another part that carries harmonies of its own
    for (var hs2 = 0; hs2 < harmonyStaves.length; hs2++) {
        var idx2 = harmonyStaves[hs2].idx;
        if (idx2 !== principalStaff && isLinked[idx2] && linkedStaves.indexOf(idx2) < 0) {
            linkedStaves.push(idx2);
        }
    }

    if (linkedStaves.length === 0) return 0;

    // Chords from every non tab staff, merged by tick, the principal winning a conflict
    var chordByTick = {};
    segment = curScore.firstSegment();
    while (segment) {
        var anns = segment.annotations;
        if (anns) {
            for (var ai = 0; ai < anns.length; ai++) {
                var an = anns[ai];
                if (an && (an.type === Element.HARMONY)) {
                    var hStaff2 = Math.floor(an.track / 4);
                    if (!isLinked[hStaff2]) {
                        var tk = segment.tick;
                        if (!chordByTick[tk] || hStaff2 === principalStaff) {
                            chordByTick[tk] = { tick: tk, text: an.text || "" };
                        }
                    }
                }
            }
        }
        segment = segment.next;
    }
    var principalChords = [];
    var tickKeys = Object.keys(chordByTick);
    for (var tki = 0; tki < tickKeys.length; tki++) {
        principalChords.push(chordByTick[tickKeys[tki]]);
    }
    principalChords.sort(function(a, b) { return a.tick - b.tick; });

    var totalSynced = 0;
    for (var li = 0; li < linkedStaves.length; li++) {
        var linkedIdx = linkedStaves[li];

        var linkedByTick = {};
        var toRemove = [];
        segment = curScore.firstSegment();
        while (segment) {
            var lanns = segment.annotations;
            if (lanns) {
                for (var la = 0; la < lanns.length; la++) {
                    var lan = lanns[la];
                    if (lan && (lan.type === Element.HARMONY) && Math.floor(lan.track / 4) === linkedIdx) {
                        linkedByTick[segment.tick] = lan.text || "";
                        toRemove.push(lan);
                    }
                }
            }
            segment = segment.next;
        }

        // Compared after normalising, so a staff that already says the same thing in a
        // different spelling is left alone
        var needsSync = false;
        if (Object.keys(linkedByTick).length !== principalChords.length) {
            needsSync = true;
        } else {
            for (var cmp = 0; cmp < principalChords.length; cmp++) {
                var pNorm = ChordUtils.convertChord(ChordUtils.normalizeChord(principalChords[cmp].text), false);
                var lText = linkedByTick[principalChords[cmp].tick];
                var lNorm = lText !== undefined ? ChordUtils.convertChord(ChordUtils.normalizeChord(lText), false) : undefined;
                if (pNorm !== lNorm) { needsSync = true; break; }
            }
        }

        if (!needsSync) continue;

        curScore.startCmd();

        for (var r = 0; r < toRemove.length; r++) {
            try { _host.removeElement(toRemove[r]); } catch (e) {}
        }

        var cursor = curScore.newCursor();
        for (var ci = 0; ci < principalChords.length; ci++) {
            cursor.rewindToTick(principalChords[ci].tick);
            if (!cursor.segment) continue;
            cursor.staffIdx = linkedIdx;
            cursor.voice = 0;
            var harmony = _host.newElement(Element.HARMONY);
            if (harmony) {
                cursor.add(harmony);
                harmony.text = principalChords[ci].text;
                totalSynced++;
            }
        }

        curScore.endCmd();
    }

    return totalSynced;
}

// ========================================
// Everything the Fix button does, in the order it has to happen
// ========================================

// Typos are fixed before the sync, so the chords copied to the linked staves carry the
// clean text rather than being copied and then corrected on one staff only.
function applyAll(opts) {
    var counts = {
        lyrics: patchLyrics(opts),
        typos: fixChordTypos(),
        synced: syncChordsToLinkedStaves(),
        meta: syncVBoxToMetaTags()
    };
    counts.total = counts.lyrics + counts.typos + counts.synced + counts.meta;
    return counts;
}

if (typeof exports !== "undefined") {
    exports.setHost = setHost;
    exports.setLyricsFixer = setLyricsFixer;
    exports.setChordUtils = setChordUtils;
    exports.setTextUtils = setTextUtils;

    exports.applyAll = applyAll;
    exports.patchLyrics = patchLyrics;
    exports.fixChordTypos = fixChordTypos;
    exports.syncChordsToLinkedStaves = syncChordsToLinkedStaves;
    exports.syncVBoxToMetaTags = syncVBoxToMetaTags;
}
