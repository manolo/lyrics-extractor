// Chord utility functions for lyrics extraction
// Shared between MuseScore extension and Node.js CLI

// Find the active chord at a given tick (last chord at or before tick)
function findChordAtTick(chords, tick) {
    var activeChord = null;
    for (var i = 0; i < chords.length; i++) {
        if (chords[i].tick <= tick) {
            activeChord = chords[i].chord;
        } else {
            break;
        }
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
    for (var i = 0; i < chords.length; i++) {
        if (chords[i].tick < rangeStart) continue;
        if (rangeEnd >= 0 && chords[i].tick >= rangeEnd) break;
        if (chords[i].tick <= tick) {
            activeChord = chords[i].chord;
        } else {
            break;
        }
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

// Convert a chord name between solfeo and anglo.
// toSolfeo=true: anglo->solfeo, toSolfeo=false: solfeo->anglo
function convertChord(chord, toSolfeo) {
    if (!chord) return chord;
    var from = toSolfeo ? _ANGLO_ROOTS : _SOLFEO_ROOTS;
    var to   = toSolfeo ? _SOLFEO_ROOTS : _ANGLO_ROOTS;
    for (var i = 0; i < from.length; i++) {
        if (chord.indexOf(from[i]) === 0) {
            return to[i] + chord.substring(from[i].length);
        }
    }
    return chord; // no root matched, return as-is
}

// Convert all chords in an array [{tick, chord}, ...] in place
function convertChords(chords, toSolfeo) {
    for (var i = 0; i < chords.length; i++) {
        chords[i].chord = convertChord(chords[i].chord, toSolfeo);
    }
}

// Detect if chords are in solfeo by checking if any root matches solfeo names
function detectSolfeo(chords) {
    for (var i = 0; i < chords.length; i++) {
        var c = chords[i].chord;
        if (!c) continue;
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
    exports.convertChord = convertChord;
    exports.convertChords = convertChords;
    exports.detectSolfeo = detectSolfeo;
}
