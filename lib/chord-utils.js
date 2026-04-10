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

// Note: solfeo/anglo conversion is no longer needed.
// Chord names are extracted directly in the correct language using
// the score's chordSymbolSpelling setting (via Constants.tpcToChordName).

if (typeof exports !== "undefined") {
    exports.findChordAtTick = findChordAtTick;
    exports.hasChordEntryBetween = hasChordEntryBetween;
    exports.findChordInRange = findChordInRange;
    exports.getChordsInRange = getChordsInRange;
}
