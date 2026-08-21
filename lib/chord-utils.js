// Lyrics Extractor for MuseScore
// Copyright (C) 2026 Manolo Carrasco (do2tis)
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Licensed under the GNU General Public License version 3 or later, with an
// additional attribution requirement under section 7(b): see LICENSE and ATTRIBUTION.md.

// Chord utility functions for lyrics extraction
// Shared between MuseScore extension and Node.js CLI

// Find the active chord at a given tick (last chord at or before tick).
// Text annotations (staff text, expressions) live in the same array as harmonies
// because they are drawn on the chord line, but they are not harmonies: when one
// shares a tick with a real chord, the chord wins and stays the carried chord.
function findChordAtTick(chords, tick) {
    var activeChord = null;
    var activeTick = -1;
    var activeIsText = false;
    for (var i = 0; i < chords.length; i++) {
        if (chords[i].tick > tick) break;
        var isText = !!chords[i].isText;
        if (chords[i].tick === activeTick && isText && !activeIsText) continue;
        activeChord = chords[i].chord;
        activeTick = chords[i].tick;
        activeIsText = isText;
    }
    return activeChord;
}

// Check if there's a chord entry in (fromTick, toTick] range
function hasChordEntryBetween(chords, fromTick, toTick) {
    for (var i = 0; i < chords.length; i++) {
        if (chords[i].tick > fromTick && chords[i].tick <= toTick) return true;
        if (chords[i].tick > toTick) break;
    }
    return false;
}

// Find chord at tick restricted to a range [rangeStart, rangeEnd)
function findChordInRange(chords, tick, rangeStart, rangeEnd) {
    var activeChord = null;
    var activeTick = -1;
    var activeIsText = false;
    for (var i = 0; i < chords.length; i++) {
        if (chords[i].tick < rangeStart) continue;
        if (rangeEnd >= 0 && chords[i].tick >= rangeEnd) break;
        if (chords[i].tick > tick) break;
        var isText = !!chords[i].isText;
        if (chords[i].tick === activeTick && isText && !activeIsText) continue;
        activeChord = chords[i].chord;
        activeTick = chords[i].tick;
        activeIsText = isText;
    }
    return activeChord;
}

// Get chords that fall within a tick range, skipping repeated chords
function getChordsInRange(chords, fromTick, toTick, lastChord) {
    var result = [];
    for (var i = 0; i < chords.length; i++) {
        if (chords[i].tick < fromTick) continue;
        if (toTick >= 0 && chords[i].tick >= toTick) break;
        if (chords[i].chord !== lastChord) {
            result.push(chords[i].chord);
            lastChord = chords[i].chord;
        }
    }
    return result;
}

// Solfeo <-> Anglo chord name conversion
// Roots sorted longest first to match "Sol" before "Si", "Do" before "Re", etc.
var _SOLFEO_ROOTS = ["Sol##", "Sol#", "Solbb", "Solb", "Sol",
                     "Do##", "Do#", "Dobb", "Dob", "Do",
                     "Re##", "Re#", "Rebb", "Reb", "Re",
                     "La##", "La#", "Labb", "Lab", "La",
                     "Mi##", "Mi#", "Mibb", "Mib", "Mi",
                     "Fa##", "Fa#", "Fabb", "Fab", "Fa",
                     "Si##", "Si#", "Sibb", "Sib", "Si"];
var _ANGLO_ROOTS =  ["G##",  "G#",  "Gbb",  "Gb",  "G",
                     "C##",  "C#",  "Cbb",  "Cb",  "C",
                     "D##",  "D#",  "Dbb",  "Db",  "D",
                     "A##",  "A#",  "Abb",  "Ab",  "A",
                     "E##",  "E#",  "Ebb",  "Eb",  "E",
                     "F##",  "F#",  "Fbb",  "Fb",  "F",
                     "B##",  "B#",  "Bbb",  "Bb",  "B"];

// What may follow a root for the match to be a chord rather than a word that
// happens to start like one: nothing, an accidental (plain or prettified), a
// bracket, a digit, or a known quality. Without this, "Fadd9" reads as the solfeo
// root "Fa" plus "dd9". A bare "o" needs a digit after it, otherwise "Solo" would
// read as "Sol" plus a diminished mark.
var _CONV_QUALITY_RE = /^[#b♭♯]?($|\d|\(|m($|[^a-z]|aj|in)|M($|[^a-z]|aj)|dim|aug|sus|add|alt|[ø°Δ]|[o+]\d)/;

// Convert a chord name between solfeo and anglo.
// toSolfeo=true: anglo->solfeo, toSolfeo=false: solfeo->anglo
// Slash chords are converted on both sides of the slash.
function convertChord(chord, toSolfeo) {
    if (!chord) return chord;

    var slash = chord.indexOf("/");
    if (slash > 0) {
        return convertChord(chord.substring(0, slash), toSolfeo) + "/" +
               convertChord(chord.substring(slash + 1), toSolfeo);
    }

    var from = toSolfeo ? _ANGLO_ROOTS : _SOLFEO_ROOTS;
    var to   = toSolfeo ? _SOLFEO_ROOTS : _ANGLO_ROOTS;
    for (var i = 0; i < from.length; i++) {
        if (chord.indexOf(from[i]) === 0) {
            var quality = chord.substring(from[i].length);
            if (!_CONV_QUALITY_RE.test(quality)) continue;
            return to[i] + quality;
        }
    }
    return chord; // no root matched, return as-is
}

// True when the text is a chord name in either spelling, false for the annotation
// text that also travels on the chord line (staff text, expressions, play techniques).
function isChordName(name) {
    if (!name) return false;

    var slash = name.indexOf("/");
    if (slash > 0) {
        return isChordName(name.substring(0, slash)) && isChordName(name.substring(slash + 1));
    }

    var roots = _SOLFEO_ROOTS.concat(_ANGLO_ROOTS);
    for (var i = 0; i < roots.length; i++) {
        if (name.indexOf(roots[i]) === 0 && _CONV_QUALITY_RE.test(name.substring(roots[i].length))) {
            return true;
        }
    }
    return false;
}

// Convert all chords in an array [{tick, chord}, ...] in place
function convertChords(chords, toSolfeo) {
    for (var i = 0; i < chords.length; i++) {
        // Words are not re-spelled: a staff text says what the score says, in any language.
        if (chords[i].isText) continue;
        chords[i].chord = convertChord(chords[i].chord, toSolfeo);
    }
}

// Check if a string looks like a chord quality suffix (m, 7, dim, #, b, etc.)
// Used to avoid normalizing annotation text like "SOLO", "La Cejilla".
// Requires digit after o/O to avoid "SOLO" -> "SolO" false positive.
var _QUALITY_RE = /^($|m($|[^a-z]|aj|in)|M($|[^a-z]|aj)|dim|aug|sus|add|[oO°+]\d|[7690]|1[13]|b\d|\()/;

// Normalize a solfeo chord name: fix common typos from manual entry in MuseScore.
// Fixes: internal whitespace, hyphens before accidentals, root capitalization,
// and duplicated root letters (e.g. "Faa #m" -> "Fa#m", "SI b" -> "Sib").
// Returns the original text unchanged if the result doesn't look like a real chord.
function normalizeChord(chord) {
    if (!chord) return chord;

    // Remove all whitespace
    var s = chord.replace(/\s+/g, '');

    // Remove hyphens before accidentals
    s = s.replace(/-([#b])/g, '$1');

    // Normalize solfeo root: case-insensitive match, optional duplicate of last letter,
    // followed by optional accidentals (#, b, ##, bb).
    // Longest root first (Sol = 3 chars), then 2-char roots.
    var roots = [
        [/^(sol)([#b]{1,2})?/i, "Sol"],
        [/^(doo?)([#b]{1,2})?/i, "Do"],
        [/^(ree?)([#b]{1,2})?/i, "Re"],
        [/^(mii?)([#b]{1,2})?/i, "Mi"],
        [/^(faa?)([#b]{1,2})?/i, "Fa"],
        [/^(laa?)([#b]{1,2})?/i, "La"],
        [/^(sii?)([#b]{1,2})?/i, "Si"]
    ];

    for (var i = 0; i < roots.length; i++) {
        var m = s.match(roots[i][0]);
        if (m) {
            var accidental = m[2] || "";
            var suffix = s.substring(m[0].length);
            // Verify the suffix looks like a chord quality, not arbitrary text.
            // If the greedy match (with duplicate letter) gives a bad quality,
            // retry with just the base root (e.g. "LAadd9" -> "La" + "add9" not "Laa" + "dd9").
            if (!_QUALITY_RE.test(suffix)) {
                var baseLen = roots[i][1].length;
                var altSuffix = s.substring(baseLen);
                var altAcc = "";
                var accM = altSuffix.match(/^[#b]{1,2}/);
                if (accM) { altAcc = accM[0]; altSuffix = altSuffix.substring(accM[0].length); }
                if (_QUALITY_RE.test(altSuffix)) {
                    s = roots[i][1] + altAcc + altSuffix;
                    break;
                }
                return chord;
            }
            s = roots[i][1] + accidental + suffix;
            break;
        }
    }

    return s;
}

// Normalize all chords in an array [{tick, chord}, ...] in place.
// Returns array of unique typos found: [{original, normalized}, ...]
function normalizeChords(chords) {
    var seen = {};
    var typos = [];
    for (var i = 0; i < chords.length; i++) {
        // An annotation is words, so there is no typo to report and nothing to tidy: a
        // staff text reading "Cejilla b3" is not a misspelt "Cejilla♭3".
        if (chords[i].isText) continue;
        var original = chords[i].chord;
        var normalized = normalizeChord(original);
        if (normalized !== original && !seen[original]) {
            seen[original] = true;
            typos.push({ original: original, normalized: normalized });
        }
        chords[i].chord = normalized;
    }
    return typos;
}

// What prettifyChord accepts after a root. The same idea as _CONV_QUALITY_RE, with two
// differences: a slash may follow, since the bass is left as it stands here, and a bare "o"
// counts as a diminished mark because "Reo" has always printed as "Re°". That last licence is
// why a word cannot always be told from a chord by its spelling alone: "Sol" plus "o" is
// written exactly like "Re" plus "o", so "Solo" is settled by the isText flag in
// prettifyChords rather than here.
var _PRETTY_QUALITY_RE = /^[#b♭♯]?($|\d|\/|\(|m($|[^a-z]|aj|in)|M($|[^a-z]|aj)|dim|aug|sus|add|alt|[ø°Δ]|[oO]($|\d|\/)|t($|\d|\/)|\+\d)/;

// Prettify a chord name for display: b -> ♭, o (diminished) -> °
// Matches MuseScore behavior: internal representation uses b/o, display uses symbols.
// Must be called AFTER detectSolfeo/convertChords (those depend on raw b/#).
function prettifyChord(chord) {
    if (!chord) return chord;

    // Find the longest matching root (solfeo or anglo)
    var allRoots = _SOLFEO_ROOTS.concat(_ANGLO_ROOTS);
    var matchedLen = 0;
    for (var i = 0; i < allRoots.length; i++) {
        if (chord.indexOf(allRoots[i]) === 0 && allRoots[i].length > matchedLen) {
            matchedLen = allRoots[i].length;
        }
    }

    if (matchedLen === 0) return chord;

    var root = chord.substring(0, matchedLen);
    var suffix = chord.substring(matchedLen);

    // A word may open with a note name: "Continue", "Coro", "Coda", "Ebony", "Golpe". Read a
    // root as a root only when a chord quality follows it, or the word comes back with a ♭ or
    // a ° buried in the middle of it, which is what "C°ntinue" was.
    if (!_PRETTY_QUALITY_RE.test(suffix)) return chord;

    // Replace flats in root: bb -> ♭♭, b -> ♭
    root = root.replace(/bb$/, '\u266D\u266D').replace(/b$/, '\u266D');

    // Replace diminished marker at start of suffix: o/O -> °
    if (suffix.length > 0 && (suffix.charAt(0) === 'o' || suffix.charAt(0) === 'O')) {
        suffix = '\u00B0' + suffix.substring(1);
    }

    // Replace flat before digits in suffix (b5, b9, b13)
    suffix = suffix.replace(/b(\d)/g, '\u266D$1');

    return root + suffix;
}

// Prettify all chords in an array [{tick, chord}, ...] in place
function prettifyChords(chords) {
    for (var i = 0; i < chords.length; i++) {
        // An annotation prints as the score has it. This is what saves the words the guard in
        // prettifyChord cannot judge on spelling, "Solo" being the one that matters.
        if (chords[i].isText) continue;
        chords[i].chord = prettifyChord(chords[i].chord);
    }
}

// Detect if chords are in solfeo by checking if any root matches solfeo names
function detectSolfeo(chords) {
    for (var i = 0; i < chords.length; i++) {
        var c = chords[i].chord;
        // A word that happens to open with a note name says nothing about the spelling the
        // score uses, and the first entry deciding it for the rest is how one staff text
        // reading "Continue rhythm" re-spelled every chord in the song.
        if (!c || chords[i].isText) continue;
        for (var s = 0; s < _SOLFEO_ROOTS.length; s++) {
            if (c.indexOf(_SOLFEO_ROOTS[s]) === 0) return true;
        }
        for (var a = 0; a < _ANGLO_ROOTS.length; a++) {
            if (c.indexOf(_ANGLO_ROOTS[a]) === 0) return false;
        }
    }
    return true; // default
}

if (typeof exports !== "undefined") {
    exports.findChordAtTick = findChordAtTick;
    exports.hasChordEntryBetween = hasChordEntryBetween;
    exports.findChordInRange = findChordInRange;
    exports.getChordsInRange = getChordsInRange;
    exports.normalizeChord = normalizeChord;
    exports.normalizeChords = normalizeChords;
    exports.prettifyChord = prettifyChord;
    exports.prettifyChords = prettifyChords;
    exports.convertChord = convertChord;
    exports.convertChords = convertChords;
    exports.isChordName = isChordName;
    exports.detectSolfeo = detectSolfeo;
}
