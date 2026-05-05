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

// Check if a character between two letters should be treated as a synalepha marker.
// Any non-letter character is a synalepha marker EXCEPT: hyphen (syllable separator),
// underscore (melisma), digits, whitespace, and the undertie itself.
function isSynalephaMarker(ch) {
    if (!ch) return false;
    if (isLetter(ch)) return false;
    if (ch === "-" || ch === "_" || ch === " " || ch === "\u203F") return false;
    if (ch === "'" || ch === "\u2019" || ch === "\u2018") return false; // apostrophes
    var code = ch.charCodeAt(0);
    if (code >= 48 && code <= 57) return false; // digits
    return true;
}

// Replace synalepha markers with undertie character (U+203F)
// Any non-letter character between two letters is treated as synalepha
// (except hyphens, underscores, digits, spaces).
// e.g. "da.es" -> "da‿es", "y¬o" -> "y‿o"
// e.g. "bre.el..." -> "bre‿el..." (first dot is synalepha, ... stays as is)
// e.g. "palabra..." -> "palabra..." (dots not between letters, stays as is)
function replaceSynalepha(text) {
    var result = "";
    for (var i = 0; i < text.length; i++) {
        if (isSynalephaMarker(text[i]) && i > 0 && i < text.length - 1 &&
            isLetter(text[i - 1]) && isLetter(text[i + 1])) {
            result += "\u203F";
            continue;
        }
        result += text[i];
    }
    return result;
}

// Convert punctuation sequences to Unicode equivalents.
// ... (3+) → ellipsis (U+2026), .. (exactly 2) → small full stop (U+FE52),
// ,, → small comma (U+FE50).
// Must be applied BEFORE synalepha processing to prevent "..." being treated as markers.
function convertPunctuation(text) {
    text = text.replace(/\.{3,}/g, "\u2026");
    text = text.replace(/\.\./g, "\uFE52");
    text = text.replace(/,,/g, "\uFE50");
    return text;
}

// Clean a word's text: replace synalepha markers and underties with spaces.
// Convert punctuation sequences, then replace synalepha with spaces.
// Any non-letter symbol between two letters (except hyphen, underscore, digits)
// is treated as synalepha and replaced with a space.
function cleanWordText(text) {
    text = convertPunctuation(text);
    var result = "";
    for (var i = 0; i < text.length; i++) {
        if (isSynalephaMarker(text[i]) && i > 0 && i < text.length - 1 &&
            isLetter(text[i - 1]) && isLetter(text[i + 1])) {
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
    exports.isSynalephaMarker = isSynalephaMarker;
    exports.stripHtml = stripHtml;
    exports.stripHyphens = stripHyphens;
    exports.convertPunctuation = convertPunctuation;
    exports.replaceSynalepha = replaceSynalepha;
    exports.cleanWordText = cleanWordText;
    exports.vowels = vowels;
}
