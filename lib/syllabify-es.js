// Lyrics Extractor for MuseScore
// Copyright (C) 2026 Manolo Carrasco (do2tis)
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Licensed under the GNU General Public License version 3 or later, with an
// additional attribution requirement under section 7(b): see LICENSE and ATTRIBUTION.md.

// Spanish syllabifier: splits one word into syllables
// Shared between MuseScore extension and Node.js CLI
//
// Usage from QML:
//   SyllabifyEs.setTextUtils(TextUtils);
//   var syllables = SyllabifyEs.syllabifyWord("canciones");
//
// Usage from Node:
//   var es = require("./syllabify-es");
//   var syllables = es.syllabifyWord("canciones");
//   (text-utils auto-wired via require)

// --- Injected dependencies ---
var _textUtils = null;
function setTextUtils(tu) { _textUtils = tu; }

// Consonant pairs that start a syllable together
var INSEPARABLE = ["pl", "pr", "bl", "br", "cl", "cr", "dr", "fl", "fr", "gl", "gr", "tr", "kl", "kr"];

// Two letters written as one consonant
var DIGRAPHS = ["ch", "ll", "rr"];

var STRONG = "aeoáéóàèò";

function isStrong(ch) {
    return STRONG.indexOf(ch.toLowerCase()) >= 0;
}

// Accented weak vowels (i, u) always form a hiatus with the next vowel
function isAccentedWeak(ch) {
    return "íúìù".indexOf(ch.toLowerCase()) >= 0;
}

// Whether two adjacent vowels belong to the same syllable
function formDiphthong(a, b) {
    if (isStrong(a) && isStrong(b)) return false;
    if (isAccentedWeak(a) || isAccentedWeak(b)) return false;
    return true;
}

// Split the letters of a word into vowel and consonant tokens.
// Returns [{ vowel: bool, text }]
function tokenize(letters) {
    var tokens = [];
    var lower = letters.toLowerCase();
    var i = 0;
    while (i < letters.length) {
        var ch = lower[i];
        var next = lower[i + 1];
        var isFinalY = ch === "y" && i === letters.length - 1;
        if (_textUtils.isVowel(letters[i]) || isFinalY) {
            tokens.push({ vowel: true, text: letters[i] });
            i++;
        } else if ((ch === "g" || ch === "q") && next === "u" && "eiéí".indexOf(lower[i + 2] || "#") >= 0) {
            // silent u belongs to the consonant
            tokens.push({ vowel: false, text: letters.substr(i, 2) });
            i += 2;
        } else if (next && DIGRAPHS.indexOf(ch + next) >= 0) {
            tokens.push({ vowel: false, text: letters.substr(i, 2) });
            i += 2;
        } else {
            tokens.push({ vowel: false, text: letters[i] });
            i++;
        }
    }
    return tokens;
}

// How many trailing consonant tokens of a cluster start the next syllable
function onsetSize(cluster) {
    if (cluster.length >= 2) {
        var pair = cluster[cluster.length - 2].text + cluster[cluster.length - 1].text;
        if (INSEPARABLE.indexOf(pair.toLowerCase()) >= 0) return 2;
    }
    return cluster.length > 0 ? 1 : 0;
}

function syllabifyLetters(letters) {
    var tokens = tokenize(letters);

    // Group vowels into nuclei, keeping the consonants between them
    var nuclei = [];      // vowel text of each syllable
    var clusters = [];    // consonant tokens before each nucleus (clusters[0] is the word start)
    var cluster = [];
    var lastVowel = "";
    var inNucleus = false;
    for (var i = 0; i < tokens.length; i++) {
        var tk = tokens[i];
        if (!tk.vowel) {
            inNucleus = false;
            cluster.push(tk);
            continue;
        }
        if (inNucleus && formDiphthong(lastVowel, tk.text)) {
            nuclei[nuclei.length - 1] += tk.text;
        } else {
            clusters.push(cluster);
            cluster = [];
            nuclei.push(tk.text);
            inNucleus = true;
        }
        lastVowel = tk.text;
    }
    if (nuclei.length === 0) return [letters];
    var tail = cluster;

    // Distribute the consonants: the last onset of the cluster goes to the next syllable
    var syllables = [];
    for (var n = 0; n < nuclei.length; n++) {
        var before = clusters[n];
        var text = "";
        if (n === 0) {
            for (var a = 0; a < before.length; a++) text += before[a].text;
        } else {
            var size = onsetSize(before);
            var coda = before.slice(0, before.length - size);
            var onset = before.slice(before.length - size);
            for (var c = 0; c < coda.length; c++) syllables[n - 1] += coda[c].text;
            for (var o = 0; o < onset.length; o++) text += onset[o].text;
        }
        syllables.push(text + nuclei[n]);
    }
    for (var t = 0; t < tail.length; t++) syllables[syllables.length - 1] += tail[t].text;
    return syllables;
}

// Split one word into syllables. Leading punctuation stays on the first
// syllable and trailing punctuation on the last.
// e.g. "¡Tuna" -> ["¡Tu", "na"], "días," -> ["dí", "as,"]
function syllabifyWord(word) {
    if (!word) return [];
    var start = 0;
    var end = word.length;
    while (start < end && !_textUtils.isLetter(word[start])) start++;
    while (end > start && !_textUtils.isLetter(word[end - 1])) end--;
    if (start === end) return [word];

    var syllables = syllabifyLetters(word.substring(start, end));
    syllables[0] = word.substring(0, start) + syllables[0];
    syllables[syllables.length - 1] += word.substring(end);
    return syllables;
}

if (typeof exports !== "undefined") {
    _textUtils = require("./text-utils");

    exports.setTextUtils = setTextUtils;
    exports.syllabifyWord = syllabifyWord;
}
