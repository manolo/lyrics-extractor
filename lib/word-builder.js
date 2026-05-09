// Word building from syllables
// Shared between MuseScore extension and Node.js CLI

// Detect if there should be a line break after this syllable
function detectPhraseBreak(syl, nextSyl) {
    if (!syl) return false;

    // Volta continuation: the next syl continues the phrase from a volta-at-start
    // segment (e.g. "el" + "sol" split across a skipped volta range). Suppress
    // ALL breaks including sectionEnd/sectionBar to keep them on the same line.
    if (nextSyl && nextSyl._voltaContinuation) return false;

    // Semicolon and fullwidth comma (its unicode replacement after fix)
    // always force a break, even across volta transitions and noBreakAfter
    var text = syl.text;
    var lastChar = text.charAt(text.length - 1);
    if (lastChar === ";" || lastChar === "\uFF0C") return true;

    // noBreakAfter: suppress all breaks including sectionEnd. Used for
    // volta transitions and D.S. jumps where lyrics continue mid-phrase.
    if (syl.noBreakAfter) return false;

    // Forced section break (stanza boundary in performance stream)
    if (syl.sectionEnd) return true;

    // Section barline (endRepeat, double, final) after this syllable
    if (syl.sectionBar) return true;

    // No-break markers suppress ALL break rules: the phrase continues
    // .. (two dots), ... (ellipsis), ,, (double comma), and their unicode equivalents
    var isSuspension = (lastChar === "\u2026") ||  // … ellipsis
        (lastChar === "\uFE52") ||                  // ﹒ small full stop (from ..)
        (lastChar === "\uFE50") ||                  // ﹐ small comma (from ,,)
        (lastChar === "," && text.length >= 2 && text.charAt(text.length - 2) === ",") ||
        (lastChar === "." && text.length >= 2 && text.charAt(text.length - 2) === ".");
    if (isSuspension) return false;

    // Strong punctuation always breaks (end of sentence)
    if (lastChar === "." || lastChar === "!" || lastChar === "?") return true;

    // (fullwidth comma and semicolon handled above, before noBreakAfter)

    var isWordEnd = (syl.syllabic === "end" || syl.syllabic === "single");

    // Heuristic breaks: conservative. When in doubt, do NOT break.
    // The user can always force a break with semicolon (;).

    // Long rest after syllable (see constants.js REST_BREAK_BEATS)
    if (syl.restAfter && syl.restDurationQ >= 4) return true;

    // Word ends and very significant vocal gap follows (see constants.js GAP_BREAK_BEATS)
    if (isWordEnd && syl.gapDurationQ >= 8) return true;

    // Very long note at word end (see constants.js DURATION_BREAK_BEATS)
    if (isWordEnd && syl.durationQ >= 8) return true;

    return false;
}

// Repair broken syllabic chains: begin followed by single becomes begin+end.
// Also split mid-word chains where a structural boundary (sectionBar, strong
// punctuation + rest) indicates two distinct words were hyphenated as one.
function repairSyllabicChains(syls) {
    for (var i = 0; i < syls.length - 1; i++) {
        // Only join begin+single into a word if there's no section boundary between them.
        // A sectionEnd on the "begin" syllable means the word chain is deliberately broken
        // (e.g. D.S. replay starts mid-word in the original structure).
        if (syls[i].syllabic === "begin" && syls[i + 1].syllabic === "single" && !syls[i].sectionEnd) {
            syls[i + 1].syllabic = "end";
        }
        // Mid-word split: a "middle" syllable ending with strong punctuation
        // (.!?) followed by a rest indicates two words were incorrectly
        // chained as one. Only split when there's clear evidence of a word
        // boundary (punctuation + rest), not just a sectionBar alone
        // (which can fall in the middle of legitimate words at repeat barlines).
        if (syls[i].syllabic === "middle" || syls[i].syllabic === "begin") {
            var text = syls[i].text;
            var lastCh = text.charAt(text.length - 1);
            var hasStrongPunct = (lastCh === "." || lastCh === "!" || lastCh === "?");
            var hasRest = syls[i].restAfter && syls[i].restDurationQ >= 1;
            if (hasStrongPunct && hasRest) {
                // Force word boundary: current becomes end, next becomes begin
                syls[i].syllabic = (syls[i].syllabic === "begin") ? "single" : "end";
                if (syls[i + 1].syllabic === "middle") {
                    syls[i + 1].syllabic = "begin";
                } else if (syls[i + 1].syllabic === "end") {
                    syls[i + 1].syllabic = "single";
                }
            }
        }
    }
}

// Build words from syllables for a given verse (verse=-1 means all verses)
// Each word tracks: text, tick, phraseBreak, sylTicks [{tick, offset, chord}]
function buildWords(syllables, verse) {
    var verseSyls = [];
    for (var i = 0; i < syllables.length; i++) {
        if (verse < 0 || syllables[i].verse === verse) verseSyls.push(syllables[i]);
    }

    repairSyllabicChains(verseSyls);

    var words = [];
    var currentWord = "";
    var wordTick = 0;
    var currentSylTicks = [];
    var lastSyl = null;

    for (var s = 0; s < verseSyls.length; s++) {
        var syl = verseSyls[s];
        var isStart = (syl.syllabic === "begin" || syl.syllabic === "single");
        var isEnd = (syl.syllabic === "end" || syl.syllabic === "single");

        // Apostrophe at the start of a short syllable means it continues the
        // previous word (e.g. don+'t, I+'m, you+'re).
        // Only join apostrophes for short suffixes (up to 3 chars including the
        // apostrophe itself) to avoid joining quoted words like 'hello'.
        var firstChar = syl.text.charAt(0);
        var isApostrophe = (firstChar === "'" || firstChar === "\u2019" || firstChar === "\u2018");
        var isJoiner = (isApostrophe && syl.text.length <= 3);
        if (isJoiner && currentWord) {
            isStart = false;
            isEnd = (syl.syllabic === "end" || syl.syllabic === "single");
        }

        if (isStart && currentWord) {
            var pb = detectPhraseBreak(lastSyl, syl);
            var wrd = {
                text: currentWord, tick: wordTick, phraseBreak: pb,
                sylTicks: currentSylTicks,
                sectionEnd: lastSyl ? (lastSyl.sectionEnd || lastSyl.sectionBar || false) : false,
                sectionBar: lastSyl ? (lastSyl.sectionBar || false) : false,
                _jumpReplay: lastSyl ? (lastSyl._jumpReplay || false) : false
            };
            if (lastSyl && lastSyl.endChordTick) wrd.endChordTick = lastSyl.endChordTick;
            words.push(wrd);
            currentWord = "";
            currentSylTicks = [];
        }

        if (!currentWord) wordTick = syl.tick;
        currentSylTicks.push({ tick: syl.tick, offset: currentWord.length, chord: syl.activeChord || null });
        currentWord += syl.text;
        lastSyl = syl;

        // Look ahead: if the next syllable starts with an apostrophe or dash,
        // it will join this word, so don't flush yet.
        var nextSyl = (s + 1 < verseSyls.length) ? verseSyls[s + 1] : null;
        var nextFirstChar = nextSyl ? nextSyl.text.charAt(0) : "";
        var nextIsApostrophe = (nextFirstChar === "'" || nextFirstChar === "\u2019" || nextFirstChar === "\u2018");
        var nextIsJoiner = (nextIsApostrophe && nextSyl && nextSyl.text.length <= 3);

        if (isEnd && !nextIsJoiner) {
            var pb2 = detectPhraseBreak(syl, nextSyl);
            var wrd2 = {
                text: currentWord, tick: wordTick, phraseBreak: pb2,
                sylTicks: currentSylTicks,
                sectionEnd: syl.sectionEnd || syl.sectionBar || false,
                sectionBar: syl.sectionBar || false,
                _jumpReplay: syl._jumpReplay || false
            };
            if (syl.endChordTick) wrd2.endChordTick = syl.endChordTick;
            words.push(wrd2);
            currentWord = "";
            currentSylTicks = [];
        }
    }

    if (currentWord) {
        var wrd3 = {
            text: currentWord, tick: wordTick, phraseBreak: true,
            sylTicks: currentSylTicks,
            sectionEnd: lastSyl ? (lastSyl.sectionEnd || lastSyl.sectionBar || false) : false,
            sectionBar: lastSyl ? (lastSyl.sectionBar || false) : false
        };
        if (lastSyl && lastSyl.endChordTick) wrd3.endChordTick = lastSyl.endChordTick;
        words.push(wrd3);
    }

    return words;
}

if (typeof exports !== "undefined") {
    exports.buildWords = buildWords;
    exports.detectPhraseBreak = detectPhraseBreak;
    exports.repairSyllabicChains = repairSyllabicChains;
}
