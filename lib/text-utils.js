// Text utility functions for lyrics processing
// Shared between MuseScore extension and Node.js CLI

var vowels = "aeiouáéíóúàèìòùüAEIOUÁÉÍÓÚÀÈÌÒÙÜ";

function isVowel(ch) {
    return vowels.indexOf(ch) >= 0;
}

// Check if a character is a letter (basic Latin + Spanish accents + common diacritics)
function isLetter(ch) {
    if (!ch) return false;
    var code = ch.charCodeAt(0);
    // A-Z, a-z
    if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122)) return true;
    // Latin-1 Supplement: À-ÿ (accented letters)
    if (code >= 192 && code <= 255) return true;
    // Common diacritics: ñ, Ñ, etc.
    return false;
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
// Only single dots BETWEEN LETTERS are treated as synalepha (syllables joined across word boundaries)
// e.g. "da.es" -> "da‿es", "y.o" -> "y‿o"
// e.g. "bre.el..." -> "bre‿el..." (first dot is synalepha, ... stays as is)
// e.g. "palabra..." -> "palabra..." (dots not between letters, stays as is)
function replaceSynalepha(text) {
    var result = "";
    for (var i = 0; i < text.length; i++) {
        if (text[i] === "." && i > 0 && i < text.length - 1 &&
            isLetter(text[i - 1]) && isLetter(text[i + 1])) {
            // Only replace dot if it's between two letters
            result += "\u203F";
            continue;
        }
        result += text[i];
    }
    return result;
}

// Clean a word's text: replace synalepha dots and underties with spaces
// Only single dots BETWEEN LETTERS are treated as synalepha
function cleanWordText(text) {
    var result = "";
    for (var i = 0; i < text.length; i++) {
        if (text[i] === "." && i > 0 && i < text.length - 1 &&
            isLetter(text[i - 1]) && isLetter(text[i + 1])) {
            // Only replace dot if it's between two letters
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
    exports.isLetter = isLetter;
    exports.stripHtml = stripHtml;
    exports.stripHyphens = stripHyphens;
    exports.replaceSynalepha = replaceSynalepha;
    exports.cleanWordText = cleanWordText;
    exports.vowels = vowels;
}
