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

// Anglo to solfeo chord name conversion
var ANGLO_TO_SOLFEO = { "C": "Do", "D": "Re", "E": "Mi", "F": "Fa", "G": "Sol", "A": "La", "B": "Si" };
var SOLFEO_ROOTS = ["Do", "Re", "Mi", "Fa", "Sol", "La", "Si"];

function isSolfeoChord(chord) {
    if (!chord) return false;
    for (var i = 0; i < SOLFEO_ROOTS.length; i++) {
        if (chord.indexOf(SOLFEO_ROOTS[i]) === 0) return true;
    }
    return false;
}

function convertChordToSolfeo(chord) {
    if (!chord || isSolfeoChord(chord)) return chord;
    var match = chord.match(/^([A-G])(#|b)?(.*)$/);
    if (!match) return chord;
    var solfeo = ANGLO_TO_SOLFEO[match[1]];
    if (!solfeo) return chord;
    return solfeo + (match[2] || "") + (match[3] || "");
}

// Convert all chord names in a chords array to solfeo notation
function convertChordsToSolfeo(chords) {
    for (var i = 0; i < chords.length; i++) {
        chords[i].chord = convertChordToSolfeo(chords[i].chord);
    }
    return chords;
}

// Solfeo to anglo conversion (reverse)
var SOLFEO_TO_ANGLO = { "Do": "C", "Re": "D", "Mi": "E", "Fa": "F", "Sol": "G", "La": "A", "Si": "B" };

function convertChordToAnglo(chord) {
    if (!chord) return chord;
    for (var i = 0; i < SOLFEO_ROOTS.length; i++) {
        var root = SOLFEO_ROOTS[i];
        if (chord.indexOf(root) === 0) {
            return SOLFEO_TO_ANGLO[root] + chord.substring(root.length);
        }
    }
    return chord;
}

function convertChordsToAnglo(chords) {
    for (var i = 0; i < chords.length; i++) {
        chords[i].chord = convertChordToAnglo(chords[i].chord);
    }
    return chords;
}

if (typeof exports !== "undefined") {
    exports.findChordAtTick = findChordAtTick;
    exports.hasChordEntryBetween = hasChordEntryBetween;
    exports.findChordInRange = findChordInRange;
    exports.getChordsInRange = getChordsInRange;
    exports.convertChordToSolfeo = convertChordToSolfeo;
    exports.convertChordsToSolfeo = convertChordsToSolfeo;
    exports.convertChordToAnglo = convertChordToAnglo;
    exports.convertChordsToAnglo = convertChordsToAnglo;
    exports.isSolfeoChord = isSolfeoChord;
}
