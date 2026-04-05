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

if (typeof exports !== "undefined") {
    exports.vowels = vowels;
    exports.noteNamesSharp = noteNamesSharp;
    exports.noteNamesFlat = noteNamesFlat;
    exports.TPC_NAMES = TPC_NAMES;
    exports.tpcToNoteName = tpcToNoteName;
    exports.tpcToAngloName = tpcToAngloName;
    exports.DURATION_MAP = DURATION_MAP;
}
