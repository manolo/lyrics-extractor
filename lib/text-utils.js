// Text utility functions for lyrics processing
// Shared between MuseScore extension and Node.js CLI

var vowels = "aeiouáéíóúàèìòùüAEIOUÁÉÍÓÚÀÈÌÒÙÜ";

function isVowel(ch) {
    return vowels.indexOf(ch) >= 0;
}

// Strip HTML/XML tags from rich text returned by lyric.text
// e.g. '<font size="11"/><font face="Arial"/>los' -> 'los'
function stripHtml(text) {
    if (!text) return "";
    var result = "";
    var inTag = false;
    for (var i = 0; i < text.length; i++) {
        if (text[i] === '<') {
            inTag = true;
        } else if (text[i] === '>') {
            inTag = false;
        } else if (!inTag) {
            result += text[i];
        }
    }
    return result;
}

// Strip leading/trailing hyphens from syllable text
function stripHyphens(text) {
    while (text.length > 0 && text.charAt(0) === '-') text = text.substring(1);
    while (text.length > 0 && text.charAt(text.length - 1) === '-') text = text.substring(0, text.length - 1);
    return text;
}

// Replace synalepha dots with undertie character (U+203F)
// A dot without surrounding spaces indicates synalepha (syllables joined across word boundaries)
// e.g. "da.es" -> "da‿es", "y.o" -> "y‿o"
function replaceSynalepha(text) {
    var result = "";
    for (var i = 0; i < text.length; i++) {
        if (text[i] === "." && i > 0 && i < text.length - 1 &&
            text[i - 1] !== " " && text[i + 1] !== " ") {
            result += "\u203F";
            continue;
        }
        result += text[i];
    }
    return result;
}

// Clean a word's text: replace synalepha dots and underties with spaces
function cleanWordText(text) {
    var result = "";
    for (var i = 0; i < text.length; i++) {
        if (text[i] === "." && i > 0 && i < text.length - 1 &&
            text[i - 1] !== " " && text[i + 1] !== " ") {
            result += " ";
        } else if (text[i] === "\u203F") {
            result += " ";
        } else {
            result += text[i];
        }
    }
    return result;
}

if (typeof exports !== "undefined") {
    exports.isVowel = isVowel;
    exports.stripHtml = stripHtml;
    exports.stripHyphens = stripHyphens;
    exports.replaceSynalepha = replaceSynalepha;
    exports.cleanWordText = cleanWordText;
    exports.vowels = vowels;
}
