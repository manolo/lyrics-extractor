// Line building from words
// Shared between MuseScore extension and Node.js CLI

// --- Injected dependencies ---
// text-utils is injected via setTextUtils() to avoid duplicating code.
// QML caller passes TextUtils; Node.js auto-wires via require().
var _textUtils = null;
function setTextUtils(tu) { _textUtils = tu; }

// --- Internal helpers (delegating to injected text-utils) ---
function isLetter(ch) { return _textUtils.isLetter(ch); }
function isSynalephaMarker(ch) { return _textUtils.isSynalephaMarker(ch); }
function cleanWordText(text) { return _textUtils.cleanWordText(text); }

// Find text position for a chord tick using syllable map.
// When the chord falls in the second half of a gap between syllables,
// snap to the next syllable position (the chord sounds closer to the next word).
function findPosForTick(sylMap, tick) {
    var bestPos = 0;
    var bestIdx = -1;
    for (var i = 0; i < sylMap.length; i++) {
        if (sylMap[i].tick <= tick) {
            bestPos = sylMap[i].pos;
            bestIdx = i;
        } else {
            break;
        }
    }
    // Snap to next syllable if chord is in the second half of the gap.
    // Position at the space before the next word so the chord doesn't sit on the syllable.
    if (bestIdx >= 0 && bestIdx + 1 < sylMap.length) {
        var prevTick = sylMap[bestIdx].tick;
        var nextTick = sylMap[bestIdx + 1].tick;
        var midpoint = prevTick + (nextTick - prevTick) / 2;
        if (tick > midpoint) {
            return { pos: sylMap[bestIdx + 1].pos, snapped: true };
        }
    }
    return { pos: bestPos, snapped: false };
}

// Build lines from words: text with syllable-level tick->position mapping
function buildLinesFromWords(words, chords) {
    var lines = [];
    var currentLineText = "";
    var currentSylMap = [];
    var currentLineStartTick = -1;

    for (var w = 0; w < words.length; w++) {
        var word = words[w];
        var wordText = cleanWordText(word.text);

        if (currentLineStartTick < 0) currentLineStartTick = word.tick;

        var wordStartPos = currentLineText.length > 0 ? currentLineText.length + 1 : 0;

        if (word.sylTicks) {
            for (var st = 0; st < word.sylTicks.length; st++) {
                currentSylMap.push({
                    tick: word.sylTicks[st].tick,
                    pos: wordStartPos + word.sylTicks[st].offset,
                    chord: word.sylTicks[st].chord || null
                });
            }
        } else {
            currentSylMap.push({ tick: word.tick, pos: wordStartPos, chord: null });
        }

        // Don't insert a space when the next word starts with punctuation:
        // punctuation always sticks to the previous syllable.
        var firstChar = wordText.charAt(0);
        var isPunct = (firstChar === "," || firstChar === "." ||
                       firstChar === ";" || firstChar === ":" ||
                       firstChar === "!" || firstChar === "?" ||
                       firstChar === "\u2026" || firstChar === "\uFE52" ||
                       firstChar === "\uFE50" || firstChar === "\uFF0C");
        if (currentLineText && !isPunct) currentLineText += " ";
        currentLineText += wordText;

        if (word.phraseBreak) {
            // endTick: use last syllable tick of this word (not first)
            var wordEndTick = word.tick;
            if (word.sylTicks && word.sylTicks.length > 0) {
                wordEndTick = word.sylTicks[word.sylTicks.length - 1].tick;
            }
            var ln = {
                text: currentLineText.trim(),
                sylMap: currentSylMap,
                startTick: currentLineStartTick,
                endTick: wordEndTick,
                sectionEnd: word.sectionEnd || false,
                sectionBar: word.sectionBar || false,
                _jumpReplay: word._jumpReplay || false
            };
            if (word.endChordTick) ln.endChordTick = word.endChordTick;
            lines.push(ln);
            currentLineText = "";
            currentSylMap = [];
            currentLineStartTick = -1;
        }
    }

    if (currentLineText.trim()) {
        var lastWord = words[words.length - 1];
        var lastWordEndTick = lastWord.tick;
        if (lastWord.sylTicks && lastWord.sylTicks.length > 0) {
            lastWordEndTick = lastWord.sylTicks[lastWord.sylTicks.length - 1].tick;
        }
        var lastLn = {
            text: currentLineText.trim(),
            sylMap: currentSylMap,
            startTick: currentLineStartTick,
            endTick: lastWordEndTick,
            sectionEnd: lastWord.sectionEnd || false,
            sectionBar: lastWord.sectionBar || false
        };
        if (lastWord.endChordTick) lastLn.endChordTick = lastWord.endChordTick;
        lines.push(lastLn);
    }

    return lines;
}

// Split lines that are significantly longer than the typical verse length.
// Looks for comma split points near the median line length.
// Rule 6: comma near median = split after comma.
function splitLongLines(lines) {
    if (lines.length < 3) return lines;

    // Calculate median line length in characters
    var lengths = [];
    for (var i = 0; i < lines.length; i++) {
        if (lines[i].text) lengths.push(lines[i].text.length);
    }
    if (lengths.length < 3) return lines;

    lengths.sort(function(a, b) { return a - b; });
    var median = lengths[Math.floor(lengths.length / 2)];
    var threshold = Math.floor(median * 1.3);

    // Absolute maximum: no line should exceed 70 chars if it has comma split points
    var MAX_LINE = 70;
    if (threshold > MAX_LINE) {
        threshold = MAX_LINE;
        median = Math.floor(MAX_LINE / 2);
    }

    if (median < 10) return lines; // too short to be meaningful

    var changed = true;
    while (changed) {
        changed = false;
        var result = [];
        for (var li = 0; li < lines.length; li++) {
            var line = lines[li];
            if (!line.text || line.text.length <= threshold) {
                result.push(line);
                continue;
            }

            var split = findBestSplit(line.text, median);
            if (!split) {
                result.push(line);
                continue;
            }

            // Split sylMap between the two halves
            var sylMap1 = [];
            var sylMap2 = [];
            for (var sm = 0; sm < line.sylMap.length; sm++) {
                if (line.sylMap[sm].pos < split.pos) {
                    sylMap1.push(line.sylMap[sm]);
                } else {
                    // Adjust position for second line
                    sylMap2.push({
                        tick: line.sylMap[sm].tick,
                        pos: line.sylMap[sm].pos - split.pos,
                        chord: line.sylMap[sm].chord || null
                    });
                }
            }

            var text1 = split.text1;
            var text2 = split.text2;

            // Get startTick for second line from its first sylMap entry
            var startTick2 = sylMap2.length > 0 ? sylMap2[0].tick : line.endTick;

            result.push({
                text: text1,
                sylMap: sylMap1,
                startTick: line.startTick,
                endTick: startTick2,
                sectionEnd: false
            });
            result.push({
                text: text2,
                sylMap: sylMap2,
                startTick: startTick2,
                endTick: line.endTick,
                sectionEnd: line.sectionEnd || false
            });
            changed = true;
        }
        lines = result;
    }

    return lines;
}

// Find the best split point in a text near the target length.
// Returns { pos, text1, text2, type } or null if no good split found.
function findBestSplit(text, targetLen) {
    var bestComma = null;
    var bestCommaDist = text.length;

    // Scan for comma splits: ", " followed by text
    for (var i = 1; i < text.length - 1; i++) {
        if (text[i] === ',' && text[i + 1] === ' ') {
            var dist = Math.abs((i + 1) - targetLen);
            if (dist < bestCommaDist) {
                bestCommaDist = dist;
                bestComma = i + 2; // position after ", "
            }
        }
    }

    // Accept split if both halves are at least 25% of the target length
    var minHalf = Math.floor(targetLen * 0.25);

    if (bestComma !== null && bestComma >= minHalf && (text.length - bestComma) >= minHalf) {
        return {
            pos: bestComma,
            text1: text.substring(0, bestComma - 1), // include comma, trim trailing space
            text2: text.substring(bestComma),
            type: "comma"
        };
    }

    return null;
}

// Apply stanza formatting to a block of lines:
// Capitalize first letter, commas at mid-stanza ends, period at last line
function applyStanzaFormatting(lines) {
    if (lines.length === 0) return;

    for (var i = 0; i < lines.length; i++) {
        var text = lines[i].text;
        if (!text) continue;

        // Convert special punctuation to regular equivalents in output
        text = text.replace(/;/g, ",").replace(/\uFF0C/g, ",");  // semicolons/fullwidth → comma
        text = text.replace(/\uFE50/g, ",");                      // small comma → comma
        text = text.replace(/\uFE52/g, ".");                      // small full stop → period

        // Capitalize first letter of first line
        if (i === 0) {
            text = text.charAt(0).toUpperCase() + text.substring(1);
        }

        // Lowercase first letter if previous line ends with comma
        if (i > 0) {
            var prevText = lines[i - 1].text;
            var prevLast = prevText ? prevText.charAt(prevText.length - 1) : '';
            if (prevLast === ',') {
                text = text.charAt(0).toLowerCase() + text.substring(1);
            }
        }

        var lastChar = text.charAt(text.length - 1);
        var hasPunctuation = (lastChar === '.' || lastChar === ',' ||
            lastChar === '!' || lastChar === '?' || lastChar === ':');

        if (i < lines.length - 1) {
            // Mid-stanza: add comma only if no punctuation exists
            if (!hasPunctuation) {
                text += ',';
            }
        } else {
            // Last line: ensure ends with period
            if (lastChar !== '.' && lastChar !== '!' && lastChar !== '?') {
                if (lastChar === ',') {
                    text = text.substring(0, text.length - 1) + '.';
                } else {
                    text += '.';
                }
            }
        }

        lines[i].text = text;
    }
}

// Merge short lines (4 words or less) that were split only by silence/duration rules.
// Does NOT merge if the line ends with punctuation or the next starts with uppercase.
function mergeShortLines(lines) {
    var changed = true;
    while (changed) {
        changed = false;
        var result = [];
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            var text = line.text ? line.text.trim() : "";
            var words = text ? text.split(/\s+/) : [];
            var lastChar = text.charAt(text.length - 1);
            var hasPunctuation = ".!?;,\uFF0C".indexOf(lastChar) >= 0;

            if (words.length <= 4 && !hasPunctuation && !line.sectionEnd && i + 1 < lines.length) {
                var nextLine = lines[i + 1];
                var nextText = nextLine.text ? nextLine.text.trim() : "";
                var nextFirstChar = nextText.charAt(0);
                var nextIsCapital = nextFirstChar === nextFirstChar.toUpperCase() &&
                    nextFirstChar !== nextFirstChar.toLowerCase();

                // For very short lines (2 words or less), ignore capital check
                // but only if the next line is also short (to avoid merging with long phrases)
                var nextWords = nextText.split(/\s+/);
                var skipCapitalCheck = words.length <= 2 && nextWords.length <= 4;

                if ((!nextIsCapital || skipCapitalCheck) && nextText) {
                    // Merge: offset next sylMap positions by current text length + 1
                    var offset = text.length + 1;
                    var mergedSylMap = line.sylMap.slice();
                    for (var sm = 0; sm < nextLine.sylMap.length; sm++) {
                        var entry = {};
                        for (var k in nextLine.sylMap[sm]) entry[k] = nextLine.sylMap[sm][k];
                        entry.pos += offset;
                        mergedSylMap.push(entry);
                    }
                    result.push({
                        text: text + " " + nextText,
                        sylMap: mergedSylMap,
                        startTick: line.startTick,
                        endTick: nextLine.endTick,
                        sectionEnd: nextLine.sectionEnd
                    });
                    i++; // skip next line
                    changed = true;
                    continue;
                }
            }
            result.push(line);
        }
        lines = result;
    }

    // Backward merge: if a line has 1-2 words, merge into the previous line
    changed = true;
    while (changed) {
        changed = false;
        var result2 = [];
        for (var j = 0; j < lines.length; j++) {
            var cur = lines[j];
            var curText = cur.text ? cur.text.trim() : "";
            var curWords = curText ? curText.split(/\s+/) : [];

            if (curWords.length <= 2 && result2.length > 0 && !result2[result2.length - 1].sectionEnd) {
                var prev = result2[result2.length - 1];
                var prevText = prev.text ? prev.text.trim() : "";
                var offset2 = prevText.length + 1;
                var mergedSylMap2 = prev.sylMap.slice();
                for (var sm2 = 0; sm2 < cur.sylMap.length; sm2++) {
                    var entry2 = {};
                    for (var k2 in cur.sylMap[sm2]) entry2[k2] = cur.sylMap[sm2][k2];
                    entry2.pos += offset2;
                    mergedSylMap2.push(entry2);
                }
                result2[result2.length - 1] = {
                    text: prevText + " " + curText,
                    sylMap: mergedSylMap2,
                    startTick: prev.startTick,
                    endTick: cur.endTick,
                    sectionEnd: cur.sectionEnd
                };
                changed = true;
            } else {
                result2.push(cur);
            }
        }
        lines = result2;
    }

    return lines;
}

if (typeof exports !== "undefined") {
    // Auto-wire text-utils in Node.js context
    _textUtils = require("./text-utils");

    exports.buildLinesFromWords = buildLinesFromWords;
    exports.splitLongLines = splitLongLines;
    exports.mergeShortLines = mergeShortLines;
    exports.findPosForTick = findPosForTick;
    exports.applyStanzaFormatting = applyStanzaFormatting;
    exports.setTextUtils = setTextUtils;
    exports.cleanWordText = cleanWordText;
    exports.isLetter = isLetter;
    exports.isSynalephaMarker = isSynalephaMarker;
}
