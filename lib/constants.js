// Constants for lyrics extraction
// Shared between MuseScore extension and Node.js CLI

var vowels = "aeiouáéíóúàèìòùüAEIOUÁÉÍÓÚÀÈÌÒÙÜ";

var noteNamesSharp = ["Do", "Do#", "Re", "Re#", "Mi", "Fa", "Fa#", "Sol", "Sol#", "La", "La#", "Si"];
var noteNamesFlat = ["Do", "Reb", "Re", "Mib", "Mi", "Fa", "Solb", "Sol", "Lab", "La", "Sib", "Si"];

// TPC (Tonal Pitch Class) to note name mapping for XML parsing
// TPC values: -1=Fbb, 0=Cbb, ..., 13=F, 14=C, 15=G, ..., 33=B##
var TPC_NAMES = [
    "Fabb", "Dobb", "Solbb", "Rebb", "Labb", "Mibb", "Sibb",
    "Fab", "Dob", "Solb", "Reb", "Lab", "Mib", "Sib",
    "Fa", "Do", "Sol", "Re", "La", "Mi", "Si",
    "Fa#", "Do#", "Sol#", "Re#", "La#", "Mi#", "Si#",
    "Fa##", "Do##", "Sol##", "Re##", "La##", "Mi##", "Si##"
];

function tpcToNoteName(tpc) {
    var idx = tpc + 1;
    if (idx < 0 || idx >= TPC_NAMES.length) return "?";
    return TPC_NAMES[idx];
}

// TPC to Anglo note letter (C,D,E,F,G,A,B) with accidentals (#,b,##,bb)
// Used when harmonyInfo has root TPC + name suffix from solfeo display
var TPC_ANGLO = [
    "Fbb", "Cbb", "Gbb", "Dbb", "Abb", "Ebb", "Bbb",
    "Fb", "Cb", "Gb", "Db", "Ab", "Eb", "Bb",
    "F", "C", "G", "D", "A", "E", "B",
    "F#", "C#", "G#", "D#", "A#", "E#", "B#",
    "F##", "C##", "G##", "D##", "A##", "E##", "B##"
];

function tpcToAngloName(tpc) {
    var idx = tpc + 1;
    if (idx < 0 || idx >= TPC_ANGLO.length) return "?";
    return TPC_ANGLO[idx];
}

// Parse a chord name into root TPC + quality suffix.
// Tries solfeo names first, then anglo. Returns { rootTpc, quality } or null.
function chordToTpc(chord) {
    if (!chord) return null;
    // Try solfeo (longest match first: ## > # > bb > b > plain)
    for (var i = 0; i < TPC_NAMES.length; i++) {
        if (chord.indexOf(TPC_NAMES[i]) === 0) {
            var quality = chord.substring(TPC_NAMES[i].length);
            // Prefer longest match: check if a longer name also matches
            var longerFound = false;
            for (var j = 0; j < TPC_NAMES.length; j++) {
                if (j !== i && TPC_NAMES[j].length > TPC_NAMES[i].length && chord.indexOf(TPC_NAMES[j]) === 0) {
                    longerFound = true;
                    break;
                }
            }
            if (!longerFound) return { rootTpc: i - 1, quality: quality };
        }
    }
    // Try anglo
    for (var a = 0; a < TPC_ANGLO.length; a++) {
        if (chord.indexOf(TPC_ANGLO[a]) === 0) {
            var aQuality = chord.substring(TPC_ANGLO[a].length);
            var aLonger = false;
            for (var b = 0; b < TPC_ANGLO.length; b++) {
                if (b !== a && TPC_ANGLO[b].length > TPC_ANGLO[a].length && chord.indexOf(TPC_ANGLO[b]) === 0) {
                    aLonger = true;
                    break;
                }
            }
            if (!aLonger) return { rootTpc: a - 1, quality: aQuality };
        }
    }
    return null;
}

// Chord qualities MuseScore stores with the symbol used by the jazz chord fonts,
// where a triangle means a major seventh. Written out so the text output reads the
// same as any other chord name.
var QUALITY_ALIASES = {
    "t": "maj7",
    "t7": "maj7",
    "t9": "maj9"
};

function translateQuality(quality) {
    var alias = QUALITY_ALIASES[quality];
    return alias !== undefined ? alias : quality;
}

// Build chord name from TPC + quality using the score's spelling setting.
// spelling: "solfeggio", "french" -> solfeo names; "standard", "german" or default -> anglo names.
// If rootTpc is -99 (no root), returns quality as literal text.
// bassTpc is the slash-chord bass note (<bass> in MuseScore 4, <base> in MuseScore 3),
// appended as "/Bass" when present.
function tpcToChordName(rootTpc, quality, spelling, bassTpc) {
    if (rootTpc === -99 || rootTpc === undefined) return quality || "";
    var isSolfeo = (spelling === "solfeggio" || spelling === "french");
    var root = isSolfeo ? tpcToNoteName(rootTpc) : tpcToAngloName(rootTpc);
    var name = quality ? root + translateQuality(quality) : root;
    if (bassTpc !== undefined && bassTpc !== null && bassTpc !== -99 && !isNaN(bassTpc)) {
        name += "/" + (isSolfeo ? tpcToNoteName(bassTpc) : tpcToAngloName(bassTpc));
    }
    return name;
}

// Major key of a key signature, given as the number of accidentals MuseScore
// stores in <concertKey>: negative for flats, positive for sharps. A signature
// cannot tell major from minor, so the relative major is reported.
function concertKeyName(accidentals, spelling) {
    var n = parseInt(accidentals);
    if (isNaN(n) || n < -7 || n > 7) return "";
    // One step around the circle of fifths is one step in TPC, and C is TPC 14,
    // so Bb (two flats) is 12 and E (four sharps) is 18.
    var tpc = 14 + n;
    var isSolfeo = (spelling === "solfeggio" || spelling === "french");
    return isSolfeo ? tpcToNoteName(tpc) : tpcToAngloName(tpc);
}

// Duration type names to fraction of whole note (for XML parsing)
var DURATION_MAP = {
    "whole": 1,
    "half": 0.5,
    "quarter": 0.25,
    "eighth": 0.125,
    "16th": 0.0625,
    "32nd": 0.03125,
    "64th": 0.015625,
    "128th": 0.0078125,
    "breve": 2,
    "longa": 4
};

// Formatting constants
var MAX_LINE_WIDTH = 70;
var GAP_CHORD_TICKS = 480;         // > 1 beat: chord in gap snaps to next word
var SPLIT_MEDIAN_FACTOR = 1.3;     // line > median * factor is candidate for split
var SPLIT_MIN_HALF = 0.25;         // minimum half ratio when splitting at comma
var REST_BREAK_BEATS = 4;          // rest >= this triggers phrase break
var GAP_BREAK_BEATS = 8;           // vocal gap >= this triggers phrase break
var DURATION_BREAK_BEATS = 8;      // note duration >= this triggers phrase break

if (typeof exports !== "undefined") {
    exports.vowels = vowels;
    exports.noteNamesSharp = noteNamesSharp;
    exports.noteNamesFlat = noteNamesFlat;
    exports.TPC_NAMES = TPC_NAMES;
    exports.tpcToNoteName = tpcToNoteName;
    exports.tpcToAngloName = tpcToAngloName;
    exports.chordToTpc = chordToTpc;
    exports.tpcToChordName = tpcToChordName;
    exports.concertKeyName = concertKeyName;
    exports.DURATION_MAP = DURATION_MAP;
    exports.MAX_LINE_WIDTH = MAX_LINE_WIDTH;
    exports.GAP_CHORD_TICKS = GAP_CHORD_TICKS;
    exports.SPLIT_MEDIAN_FACTOR = SPLIT_MEDIAN_FACTOR;
    exports.SPLIT_MIN_HALF = SPLIT_MIN_HALF;
    exports.REST_BREAK_BEATS = REST_BREAK_BEATS;
    exports.GAP_BREAK_BEATS = GAP_BREAK_BEATS;
    exports.DURATION_BREAK_BEATS = DURATION_BREAK_BEATS;
}
