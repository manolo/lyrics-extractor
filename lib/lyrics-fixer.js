// Lyrics analysis and fixing: detect and repair common lyric issues
// Shared between MuseScore extension and Node.js CLI
//
// Usage from QML:
//   LyricsFixer.setTextUtils(TextUtils);
//   var issues = LyricsFixer.checkLyrics(lyricGroups);
//   var result = LyricsFixer.fixAll(lyricGroups);
//
// Usage from Node:
//   var fixer = require("./lyrics-fixer");
//   var issues = fixer.checkLyrics(lyricGroups);
//   var result = fixer.fixAll(lyricGroups);
//   (text-utils auto-wired via require)

// --- Injected dependencies ---
var _textUtils = null;
function setTextUtils(tu) { _textUtils = tu; }

// --- Syllabic conversion ---

var SYLLABIC_MAP = { "single": 0, "begin": 1, "end": 2, "middle": 3 };
var SYLLABIC_NAMES = ["single", "begin", "end", "middle"];

function syllabicFromString(s) {
    return SYLLABIC_MAP[s] !== undefined ? SYLLABIC_MAP[s] : 0;
}

function syllabicToString(n) {
    return SYLLABIC_NAMES[n] || "single";
}

// --- Analysis functions ---

// Analyze lyric groups for issues.
// lyricGroups: { key: [{ text, syllabic (int), verse, staff, voice }, ...] }
// Returns: { synalepha, hyphens, syllabic, syllabicExamples, punctuation }
function checkLyrics(lyricGroups) {
    var synalepha = 0, hyphens = 0, syllabic = 0, punctuation = 0;
    var syllabicExamples = [];

    var keys = Object.keys(lyricGroups);
    for (var k = 0; k < keys.length; k++) {
        var group = lyricGroups[keys[k]];
        var prevSyllabic = -1;
        var prevText = "";

        for (var i = 0; i < group.length; i++) {
            var entry = group[i];
            var text = entry.text;
            if (!text) continue;

            if (_textUtils.replaceSynalepha(text) !== text) synalepha++;
            if (text.charAt(0) === '-' || text.charAt(text.length - 1) === '-') hyphens++;
            if (text.indexOf(';') >= 0 || text.match(/\.{2,}/) || text.match(/,,/)) punctuation++;

            var currSyl = entry.syllabic || 0;
            if ((prevSyllabic === 1 || prevSyllabic === 3) && (currSyl === 0 || currSyl === 1)) {
                syllabic++;
                if (syllabicExamples.length < 4) {
                    syllabicExamples.push((prevText || "?") + "--" + text);
                }
            }
            prevSyllabic = currSyl;
            prevText = text;
        }
    }

    return {
        synalepha: synalepha,
        hyphens: hyphens,
        syllabic: syllabic,
        syllabicExamples: syllabicExamples,
        punctuation: punctuation
    };
}

// Check chord synchronization between principal and tab staves.
// chords: [{ tick, text, staffIndex, isTabStaff }, ...]
// tabStaves: { staffIndex: true } map of known tab staves (optional, used to detect
//            tab staves that have zero chords, which chords alone cannot reveal)
// Returns: { chordSync }
function checkChordSync(chords, tabStaves) {
    var _chordUtils = null;
    try { _chordUtils = require("./chord-utils"); } catch (e) {}

    // Normalize a chord for comparison: fix typos and convert to anglo
    // so "SI b" and "B b" are compared as the same chord.
    // Uses anglo as target because solfeo roots (multi-char) never produce
    // false matches when converting solfeo->anglo, whereas anglo "F" would
    // falsely match solfeo "Fa#" when converting anglo->solfeo.
    function normalizeForCompare(text) {
        if (!text || !_chordUtils) return text;
        var n = _chordUtils.normalizeChord(text);
        return _chordUtils.convertChord(n, false);
    }

    var principalHarmony = {};
    var linkedChords = {};
    var hasTab = false;

    // Detect tab staves from the tabStaves map (covers staves with no chords)
    if (tabStaves) {
        var keys = Object.keys(tabStaves);
        for (var k = 0; k < keys.length; k++) {
            if (tabStaves[keys[k]]) { hasTab = true; break; }
        }
    }

    for (var i = 0; i < chords.length; i++) {
        var c = chords[i];
        if (c.isTabStaff) {
            hasTab = true;
            linkedChords[c.tick] = normalizeForCompare(c.text || "");
        } else {
            principalHarmony[c.tick] = normalizeForCompare(c.text || "");
        }
    }

    var chordSync = 0;
    if (hasTab) {
        var ticks = Object.keys(principalHarmony);
        for (var t = 0; t < ticks.length; t++) {
            var tick = ticks[t];
            if (linkedChords[tick] === undefined || linkedChords[tick] !== principalHarmony[tick]) {
                chordSync++;
            }
        }
    }

    return { chordSync: chordSync };
}

// --- Fixing functions ---

// Fix a single group of lyrics (same staff/voice/verse).
// group: [{ text, syllabic (int) }, ...]
// Returns: array of patches: [{ index, newText, newSyllabic, changed }, ...]
// Patches only include entries that changed.
function fixGroup(group) {
    var patches = [];

    // Phase 1: text fixes and syllabic from hyphens
    // Mirrors fixLyrics() in LyricsForm.qml lines 299-380
    var fixedTexts = [];
    for (var i = 0; i < group.length; i++) {
        var entry = group[i];
        var originalText = entry.text;
        var syllabicVal = entry.syllabic || 0;
        var changed = false;

        var hasTrailingHyphen = originalText.charAt(originalText.length - 1) === '-';
        var hasLeadingHyphen = originalText.charAt(0) === '-';
        var hasHyphen = hasTrailingHyphen || hasLeadingHyphen;

        // Apply text transformations (punctuation + synalepha)
        var cleanText = _textUtils.convertPunctuation(originalText);
        cleanText = cleanText.replace(/;/g, "\uFF0C");
        cleanText = _textUtils.replaceSynalepha(cleanText);

        if (cleanText !== originalText) {
            changed = true;
        }

        // Syllabic from hyphen connectivity
        var prevHasTrailing = (i > 0) &&
            fixedTexts[i - 1].originalText.charAt(fixedTexts[i - 1].originalText.length - 1) === '-';
        var needsSyllabicFix = hasHyphen || prevHasTrailing;

        if (needsSyllabicFix) {
            var connectsToNext = hasTrailingHyphen;
            var connectsFromPrev = prevHasTrailing || hasLeadingHyphen;

            var newSyllabic;
            if (connectsFromPrev && connectsToNext) {
                newSyllabic = 3; // middle
            } else if (connectsFromPrev && !connectsToNext) {
                newSyllabic = 2; // end
            } else if (!connectsFromPrev && connectsToNext) {
                newSyllabic = 1; // begin
            } else {
                newSyllabic = 0; // single
            }

            // Strip hyphens from the already-transformed text
            var stripped = _textUtils.stripHyphens(cleanText);
            if (stripped !== cleanText) {
                cleanText = stripped;
                changed = true;
            }

            if (syllabicVal !== newSyllabic) {
                syllabicVal = newSyllabic;
                changed = true;
            }
        }

        fixedTexts.push({
            originalText: originalText,
            newText: cleanText,
            newSyllabic: syllabicVal,
            changed: changed
        });
    }

    // Phase 2: repair broken syllabic chains
    for (var j = 0; j < fixedTexts.length; j++) {
        var currSyllabic = fixedTexts[j].newSyllabic;

        if (currSyllabic === 1 || currSyllabic === 3) {
            if (j + 1 < fixedTexts.length) {
                var nextSyllabic = fixedTexts[j + 1].newSyllabic;
                if (nextSyllabic === 0 || nextSyllabic === 1) {
                    var nextNext = (j + 2 < fixedTexts.length) ? fixedTexts[j + 2] : null;
                    var nextNextSyllabic = nextNext ? nextNext.newSyllabic : 0;

                    if (nextNextSyllabic === 3 || nextNextSyllabic === 2) {
                        fixedTexts[j + 1].newSyllabic = 3; // middle
                    } else {
                        fixedTexts[j + 1].newSyllabic = 2; // end
                    }
                    fixedTexts[j + 1].changed = true;
                }
            }
        }
    }

    // Collect patches
    for (var p = 0; p < fixedTexts.length; p++) {
        if (fixedTexts[p].changed) {
            patches.push({
                index: p,
                newText: fixedTexts[p].newText,
                newSyllabic: fixedTexts[p].newSyllabic
            });
        }
    }

    return patches;
}

// Fix all lyric groups.
// lyricGroups: { key: [{ text, syllabic (int) }, ...] }
// Returns: { patches: { key: [{ index, newText, newSyllabic }] }, fixCount }
function fixAll(lyricGroups) {
    var allPatches = {};
    var fixCount = 0;

    var keys = Object.keys(lyricGroups);
    for (var k = 0; k < keys.length; k++) {
        var patches = fixGroup(lyricGroups[keys[k]]);
        if (patches.length > 0) {
            allPatches[keys[k]] = patches;
            fixCount += patches.length;
        }
    }

    return { patches: allPatches, fixCount: fixCount };
}

if (typeof exports !== "undefined") {
    _textUtils = require("./text-utils");

    exports.setTextUtils = setTextUtils;
    exports.syllabicFromString = syllabicFromString;
    exports.syllabicToString = syllabicToString;
    exports.checkLyrics = checkLyrics;
    exports.checkChordSync = checkChordSync;
    exports.fixGroup = fixGroup;
    exports.fixAll = fixAll;
}
