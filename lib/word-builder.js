// Word building from syllables
// Shared between MuseScore extension and Node.js CLI

// Detect if there should be a line break after this syllable
function detectPhraseBreak(syl, nextSyl) {
    if (!syl) return false;

    // Suppress break: implicit volta 2 flows from main content
    if (syl.noBreakAfter) return false;

    // Forced section break (stanza boundary in performance stream)
    if (syl.sectionEnd) return true;

    var text = syl.text;
    var lastChar = text.charAt(text.length - 1);

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

    // Semicolon or fullwidth comma always breaks (new line, but not new stanza)
    if (lastChar === ";" || lastChar === "\uFF0C") return true;

    var isWordEnd = (syl.syllabic === "end" || syl.syllabic === "single");

    // Heuristic breaks: conservative. When in doubt, do NOT break.
    // The user can always force a break with semicolon (;).

    // Long rest after syllable (whole rest or longer)
    if (syl.restAfter && syl.restDurationQ >= 4) return true;

    // Word ends and very significant vocal gap follows
    if (isWordEnd && syl.gapDurationQ >= 8) return true;

    // Very long note (breve or longer) at word end
    if (isWordEnd && syl.durationQ >= 8) return true;

    return false;
}

// Repair broken syllabic chains: begin followed by single becomes begin+end
function repairSyllabicChains(syls) {
    for (var i = 0; i < syls.length - 1; i++) {
        if (syls[i].syllabic === "begin" && syls[i + 1].syllabic === "single") {
            syls[i + 1].syllabic = "end";
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

        if (isStart && currentWord) {
            var pb = detectPhraseBreak(lastSyl, syl);
            words.push({
                text: currentWord, tick: wordTick, phraseBreak: pb,
                sylTicks: currentSylTicks,
                sectionEnd: lastSyl ? (lastSyl.sectionEnd || false) : false
            });
            currentWord = "";
            currentSylTicks = [];
        }

        if (!currentWord) wordTick = syl.tick;
        currentSylTicks.push({ tick: syl.tick, offset: currentWord.length, chord: syl.activeChord || null });
        currentWord += syl.text;
        lastSyl = syl;

        if (isEnd) {
            var nextSyl = (s + 1 < verseSyls.length) ? verseSyls[s + 1] : null;
            var pb2 = detectPhraseBreak(syl, nextSyl);
            words.push({
                text: currentWord, tick: wordTick, phraseBreak: pb2,
                sylTicks: currentSylTicks,
                sectionEnd: syl.sectionEnd || false
            });
            currentWord = "";
            currentSylTicks = [];
        }
    }

    if (currentWord) {
        words.push({
            text: currentWord, tick: wordTick, phraseBreak: true,
            sylTicks: currentSylTicks,
            sectionEnd: lastSyl ? (lastSyl.sectionEnd || false) : false
        });
    }

    return words;
}

if (typeof exports !== "undefined") {
    exports.buildWords = buildWords;
    exports.detectPhraseBreak = detectPhraseBreak;
    exports.repairSyllabicChains = repairSyllabicChains;
}
