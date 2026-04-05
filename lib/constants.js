// Constants for lyrics extraction
// Shared between MuseScore extension and Node.js CLI

var vowels = "aeiouáéíóúàèìòùüAEIOUÁÉÍÓÚÀÈÌÒÙÜ";

var noteNamesSharp = ["Do", "Do#", "Re", "Re#", "Mi", "Fa", "Fa#", "Sol", "Sol#", "La", "La#", "Si"];
var noteNamesFlat = ["Do", "Reb", "Re", "Mib", "Mi", "Fa", "Solb", "Sol", "Lab", "La", "Sib", "Si"];

// TPC (Tonal Pitch Class) to note name mapping for XML parsing
// TPC values: -1=Fbb, 0=Cbb, ..., 13=F, 14=C, 15=G, ..., 33=B##
var TPC_NAMES = [
    "Fbb", "Dobb", "Solbb", "Rebb", "Labb", "Mibb", "Sibb",
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
var TRAILING_CHORD_THRESHOLD = 4;  // >= this many trailing chords become interlude
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
    exports.DURATION_MAP = DURATION_MAP;
    exports.MAX_LINE_WIDTH = MAX_LINE_WIDTH;
    exports.TRAILING_CHORD_THRESHOLD = TRAILING_CHORD_THRESHOLD;
    exports.GAP_CHORD_TICKS = GAP_CHORD_TICKS;
    exports.SPLIT_MEDIAN_FACTOR = SPLIT_MEDIAN_FACTOR;
    exports.SPLIT_MIN_HALF = SPLIT_MIN_HALF;
    exports.REST_BREAK_BEATS = REST_BREAK_BEATS;
    exports.GAP_BREAK_BEATS = GAP_BREAK_BEATS;
    exports.DURATION_BREAK_BEATS = DURATION_BREAK_BEATS;
}
