// Output formatting: renders chord+text lines
// Shared between MuseScore extension and Node.js CLI

// Find text position for a chord tick using syllable map.
// Mirror of LineBuilder.findPosForTick (duplicated for QML import compatibility).
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

// Expand text line by inserting spaces where chords need more room.
// placements: [{pos, chord}] sorted by pos (pos = position in original text)
// Returns { text, chordLine }
function expandTextForChords(text, placements) {
    if (placements.length === 0) return { text: text, chordLine: "" };

    // Single pass: compute actual chord positions (with min spacing) and text inserts together.
    // Trailing chords (pos >= text.length) get positioned but don't expand text.
    var cumShift = 0;
    var prevChordEnd = 0; // minimum start position for next chord
    var chordActualPos = [];
    var inserts = [];

    for (var j = 0; j < placements.length; j++) {
        var naturalPos = placements[j].pos;
        var isTrailing = naturalPos >= text.length;
        // Trailing chords: start after expanded text, not at inflated natural pos
        var shiftedPos = isTrailing ? Math.max(prevChordEnd, text.length + cumShift + 1) : naturalPos + cumShift;
        var actualPos = Math.max(shiftedPos, prevChordEnd);

        if (!isTrailing) {
            // In-text chord: expand text if needed
            var needed = actualPos - shiftedPos;
            if (needed > 0) {
                // Find word boundary: insert at nearest space.
                // Search forward to the next space after the chord position.
                // This ensures expansion goes between the current word and the next,
                // not before the current word (which would break alignment).
                var insertAt = naturalPos;
                if (insertAt < text.length && text.charAt(insertAt) !== ' ') {
                    var fp = naturalPos + 1;
                    while (fp < text.length && text.charAt(fp) !== ' ') fp++;
                    if (fp < text.length) {
                        insertAt = fp;
                    } else {
                        // No space after: search backward
                        var bp = naturalPos;
                        while (bp > 0 && text.charAt(bp) !== ' ') bp--;
                        if (text.charAt(bp) === ' ') insertAt = bp;
                    }
                }
                inserts.push({ pos: insertAt, extra: needed });
                cumShift += needed;
            }
        }

        chordActualPos.push(actualPos);
        prevChordEnd = actualPos + placements[j].chord.length + 1;
    }

    // Build expanded text
    var expanded = text;
    if (inserts.length > 0) {
        expanded = "";
        var textIdx = 0;
        for (var k = 0; k < inserts.length; k++) {
            while (textIdx < inserts[k].pos && textIdx < text.length) {
                expanded += text[textIdx++];
            }
            for (var sp = 0; sp < inserts[k].extra; sp++) expanded += " ";
        }
        while (textIdx < text.length) expanded += text[textIdx++];
    }

    // Build chord line from computed actual positions
    var chordLine = "";
    for (var m = 0; m < placements.length; m++) {
        while (chordLine.length < chordActualPos[m]) chordLine += " ";
        chordLine += placements[m].chord;
    }

    return { text: expanded, chordLine: chordLine.replace(/\s+$/, "") };
}

// Format a list of lines into chord+text output (simple verse mode)
// chordToTick limits which chords to include
// systemTexts: optional array of {tick, text} for section labels
function formatLines(lines, chords, lastOutputChord, chordToTick, systemTexts) {
    var output = "";
    var lastSysTextIdx = 0;

    for (var l = 0; l < lines.length; l++) {
        var line = lines[l];
        if (!line.text) continue;

        // Emit system texts that fall before this line
        if (systemTexts) {
            while (lastSysTextIdx < systemTexts.length && systemTexts[lastSysTextIdx].tick <= line.startTick) {
                output += "\n- " + systemTexts[lastSysTextIdx].text.toUpperCase() + " -\n";
                lastSysTextIdx++;
            }
        }

        var chordFrom = line.startTick;
        var chordTo = (l + 1 < lines.length) ? lines[l + 1].startTick :
                      (chordToTick >= 0 ? chordToTick : -1);

        var placements = [];
        var trailingChords = [];
        for (var ci = 0; ci < chords.length; ci++) {
            if (chords[ci].tick < chordFrom) continue;
            if (chordTo >= 0 && chords[ci].tick >= chordTo) break;
            if (chords[ci].chord === lastOutputChord) continue;

            if (chords[ci].tick <= line.endTick) {
                var posResult = findPosForTick(line.sylMap, chords[ci].tick);
                var targetPos = posResult.pos !== undefined ? posResult.pos : posResult;
                var snapped = posResult.snapped || false;
                // If chord snapped to the next syllable, position it so it ends before that word
                if (snapped && targetPos > 0 && line.text.charAt(targetPos) !== ' ' &&
                    line.text.charAt(targetPos - 1) === ' ') {
                    targetPos = Math.max(0, targetPos - chords[ci].chord.length);
                }
                placements.push({ pos: targetPos, chord: chords[ci].chord });
            } else {
                trailingChords.push(chords[ci].chord);
            }
            lastOutputChord = chords[ci].chord;
        }

        // Fewer than TRAILING_CHORD_THRESHOLD: append to chord line
        // Otherwise: render as separate melodic/interlude line (see constants.js)
        if (trailingChords.length > 0 && trailingChords.length < 4) {
            var trailPos2 = line.text.length + 2;
            for (var tc = 0; tc < trailingChords.length; tc++) {
                placements.push({ pos: trailPos2, chord: trailingChords[tc] });
                trailPos2 += trailingChords[tc].length + 1;
            }
        }

        var result = expandTextForChords(line.text, placements);
        output += (result.chordLine || "") + "\n";
        output += result.text + "\n";

        // 4+ trailing chords: separate melodic/interlude line after text
        if (trailingChords.length >= 4) {
            // Emit system texts that fall in the trailing chord range (before the interlude)
            if (systemTexts) {
                while (lastSysTextIdx < systemTexts.length && systemTexts[lastSysTextIdx].tick <= line.endTick) {
                    lastSysTextIdx++; // skip texts already within the line
                }
                var nextLineTick = (l + 1 < lines.length) ? lines[l + 1].startTick : -1;
                while (lastSysTextIdx < systemTexts.length &&
                       (nextLineTick < 0 || systemTexts[lastSysTextIdx].tick < nextLineTick)) {
                    output += "\n- " + systemTexts[lastSysTextIdx].text.toUpperCase() + " -\n";
                    lastSysTextIdx++;
                }
            }
            output += wrapChordLine(trailingChords.join("  "), 70) + "\n";
        }
    }

    return { output: output, lastChord: lastOutputChord };
}

// Format lines using pre-assigned chord annotations from performance stream
// Renders chord line above each text line based on syllable positions
// chords: optional full chord array for interlude detection between stanzas
function formatPerfLines(lines, introChords, homeChord, title, chords, syllables, systemTexts, fullRepeat) {
    // Abbreviate repeated stanzas (e.g. estribillo appearing multiple times)
    // Skip abbreviation when fullRepeat is on (user wants everything written out)
    if (!fullRepeat) {
        lines = abbreviateRepeatedStanzas(lines, syllables);
    }

    // Track last system text tick emitted to avoid duplicates on same line
    var lastSysTextOutputTick = -1;
    // Track labeled chord sections already emitted (for abbreviation)
    var emittedLabeledChords = {};

    var output = "";
    var lastChord = null;

    if (title) {
        output += "==== " + title.toUpperCase() + " ====\n\n"; // Mirror of orchestrator.formatTitle
    }

    // Split intro system texts: before intro chords vs after intro chords
    var introFirstChordTick = (introChords && introChords.length > 0 && chords && chords.length > 0) ? chords[0].tick : -1;
    var firstLineTick = (lines.length > 0) ? lines[0].startTick : 0;

    // System texts before the first intro chord (e.g. section label for the intro itself)
    var introLabel = "";
    if (systemTexts) {
        for (var sti = 0; sti < systemTexts.length; sti++) {
            if (systemTexts[sti].tick < firstLineTick && introFirstChordTick >= 0 && systemTexts[sti].tick <= introFirstChordTick) {
                introLabel = systemTexts[sti].text.toUpperCase();
                output += "- " + introLabel + " -\n";
            }
        }
    }

    if (introChords && introChords.length > 0) {
        output += wrapChordLine(introChords.join("  "), 70) + "\n\n";
        lastChord = introChords[introChords.length - 1];
        // Record this labeled chord section for abbreviation
        if (introLabel) {
            emittedLabeledChords[introLabel] = true;
        }
    }

    // System texts between intro chords and first lyric line
    if (systemTexts) {
        for (var sti2 = 0; sti2 < systemTexts.length; sti2++) {
            if (systemTexts[sti2].tick < firstLineTick && (introFirstChordTick < 0 || systemTexts[sti2].tick > introFirstChordTick)) {
                output += "\n- " + systemTexts[sti2].text.toUpperCase() + " -\n";
            }
        }
    }

    for (var l = 0; l < lines.length; l++) {
        var line = lines[l];
        if (!line.text) continue;

        // Insert system text labels before this line.
        // Match by: system text tick <= line.startTick AND > previous line's startTick.
        // On section boundaries (tick goes backwards due to repeat), reset prevStartTick.
        var hasLabelBefore = false;
        if (systemTexts) {
            var prevStartTick = (l > 0) ? lines[l - 1].startTick : -1;
            var isBackwards = line.startTick < prevStartTick;
            if (isBackwards) {
                prevStartTick = -1;
            }
            for (var stj = 0; stj < systemTexts.length; stj++) {
                var stTick = systemTexts[stj].tick;
                if (introFirstChordTick >= 0 && stTick <= introFirstChordTick) continue;
                if (!isBackwards && stTick < firstLineTick) continue;
                if (stTick > prevStartTick && stTick <= line.startTick) {
                    output += "\n- " + systemTexts[stj].text.toUpperCase() + " -\n";
                    hasLabelBefore = true;
                }
            }
        }

        // Abbreviated stanzas: if preceded by a system text label, show only the label.
        // If no label, show incipit + "..." with extra blank line for spacing.
        if (line.abbreviated) {
            if (hasLabelBefore) {
                // Label alone is sufficient, skip the abbreviated text
                // Handle sectionEnd for stanza break
                if (line.sectionEnd) output += "\n";
                continue;
            }
            output += "\n";
        }

        var placements = [];
        for (var si = 0; si < line.sylMap.length; si++) {
            var sm = line.sylMap[si];
            if (sm.chord && sm.chord !== lastChord) {
                // Suppress "return to home chord" at the start of a line (pos near 0)
                if (placements.length === 0 && sm.pos <= 2 && homeChord && sm.chord === homeChord && lastChord !== homeChord) {
                    lastChord = sm.chord;
                    continue;
                }
                var chordPos = sm.pos;
                // If chord changed in a significant gap before this syllable (> 1 beat),
                // shift position to the space before the word to force text expansion.
                if (chords && si > 0) {
                    var prevSmTick = line.sylMap[si - 1].tick;
                    var sylGap = sm.tick - prevSmTick;
                    // Expand for gaps between syllables (> 1 beat)
                    if (sylGap > 480) for (var ci = 0; ci < chords.length; ci++) {
                        if (chords[ci].chord === sm.chord && chords[ci].tick > prevSmTick && chords[ci].tick < sm.tick) {
                            var gapPos = sm.pos - 1;
                            while (gapPos > 0 && line.text.charAt(gapPos) !== ' ') gapPos--;
                            if (gapPos > 0) chordPos = gapPos;
                            break;
                        }
                    }
                }
                placements.push({ pos: chordPos, chord: sm.chord });
                lastChord = sm.chord;
            }
        }

        // Find trailing chords: between this line's endTick and next line's startTick
        var trailingChords = [];
        if (chords) {
            var nextStartTick = (l + 1 < lines.length) ? lines[l + 1].startTick : -1;
            var trailingRaw = getInterludeChords(chords, line.endTick, nextStartTick, lastChord);
            trailingChords = trailingRaw;
        }
        if (trailingChords.length > 0 && trailingChords.length < 4) {
            // Append trailing chords to the chord line (rule 3.5)
            var trailPos = line.text.length + 2;
            for (var tc = 0; tc < trailingChords.length; tc++) {
                placements.push({ pos: trailPos, chord: trailingChords[tc] });
                trailPos += trailingChords[tc].length + 1;
            }
            lastChord = trailingChords[trailingChords.length - 1];
        }

        var result = expandTextForChords(line.text, placements);
        if (!line.abbreviated) {
            output += (result.chordLine || "") + "\n";
        }
        output += result.text + "\n";

        // Melodic sequence: 4+ trailing chords as separate instrumental line (rule 3.6)
        if (trailingChords.length >= 4) {
            output += wrapChordLine(trailingChords.join("  "), 70) + "\n";
            lastChord = trailingChords[trailingChords.length - 1];
        }

        // Stanza break after section boundaries
        if (line.sectionEnd) {
            output += "\n";

            // Interlude chords between stanzas (only if not already handled as trailing)
            if (chords && l + 1 < lines.length && trailingChords.length === 0) {
                var nextLine = lines[l + 1];
                var interlude;
                if (nextLine.startTick < line.endTick) {
                    // Backwards tick (repeat pass): only include intro interlude if
                    // the repeat goes back before the first lyric (intro is part of repeat).
                    // If it goes back to the first lyric tick, there is no intro to replay.
                    var interludeFrom = (nextLine.startTick < firstLineTick) ? -1 : nextLine.startTick;
                    interlude = getInterludeChords(chords, interludeFrom, nextLine.startTick, null);
                } else {
                    interlude = getInterludeChords(chords, line.endTick, nextLine.startTick, lastChord);
                }
                if (interlude.length > 0) {
                    // Check for system texts that label this interlude section
                    var interludeLabel = "";
                    if (systemTexts && nextLine.startTick < line.endTick) {
                        for (var sti3 = 0; sti3 < systemTexts.length; sti3++) {
                            var stk = systemTexts[sti3].tick;
                            if (stk < nextLine.startTick || stk > line.endTick) {
                                interludeLabel = systemTexts[sti3].text.toUpperCase();
                                output += "- " + interludeLabel + " -\n";
                                break;
                            }
                        }
                    }
                    // If this labeled interlude was already emitted, skip the chords
                    if (interludeLabel && emittedLabeledChords[interludeLabel]) {
                        output += "\n";
                    } else {
                        output += wrapChordLine(interlude.join("  "), 70) + "\n\n";
                        lastChord = interlude[interlude.length - 1];
                        if (interludeLabel) emittedLabeledChords[interludeLabel] = true;
                    }
                }
            }
        }
    }

    // Coda instrumental: chords after the last line with no lyrics.
    // Skip coda chords if the last line is abbreviated (the song ends cleanly
    // after the abbreviated estribillo, no outro/interlude chords appended).
    if (chords && lines.length > 0) {
        var lastLine = lines[lines.length - 1];
        if (!lastLine.abbreviated) {
            var codaChords = getInterludeChords(chords, lastLine.endTick, -1, lastChord);
            if (codaChords.length > 0) {
                output += "\n" + wrapChordLine(codaChords.join("  "), 70) + "\n";
            }
        }
    }

    return output;
}

// Detect repeated stanzas (e.g. estribillo) and abbreviate subsequent occurrences.
// Groups lines into stanzas by sectionEnd, compares text fingerprints,
// and replaces duplicates with an incipit + "..."
// Only abbreviates stanzas from single-verse sections (not multi-verse like verses).
// syllables: optional raw syllable array to check verse count at source ticks.
function abbreviateRepeatedStanzas(lines, syllables) {
    if (lines.length === 0) return lines;

    // Group line indices into stanzas
    var stanzas = [];
    var current = [];
    for (var i = 0; i < lines.length; i++) {
        current.push(i);
        if (lines[i].sectionEnd || i === lines.length - 1) {
            stanzas.push(current);
            current = [];
        }
    }

    if (stanzas.length < 2) return lines;

    // Check which stanzas come from multi-verse source sections.
    // A stanza is multi-verse if ANY tick in its range has syllables in multiple verses.
    var isMultiVerse = {};
    if (syllables && syllables.length > 0) {
        for (var sv = 0; sv < stanzas.length; sv++) {
            var firstTick = lines[stanzas[sv][0]].startTick;
            var lastTick = lines[stanzas[sv][stanzas[sv].length - 1]].endTick;
            var versesInRange = {};
            for (var si = 0; si < syllables.length; si++) {
                if (syllables[si].tick >= firstTick && syllables[si].tick <= lastTick) {
                    versesInRange[syllables[si].verse] = true;
                }
            }
            if (Object.keys(versesInRange).length > 1) {
                isMultiVerse[sv] = true;
            }
        }
    }

    // Compute text fingerprint per stanza (lowercase, trimmed)
    var fingerprints = [];
    for (var s = 0; s < stanzas.length; s++) {
        var text = "";
        for (var j = 0; j < stanzas[s].length; j++) {
            if (text) text += " ";
            text += lines[stanzas[s][j]].text || "";
        }
        fingerprints.push(text.trim().toLowerCase().replace(/[.,!?;:]+/g, ""));
    }

    // Find duplicates: map fingerprint to first occurrence index.
    // Only consider single-verse stanzas for abbreviation.
    var seen = {};
    var toAbbreviate = {};
    for (var s2 = 0; s2 < stanzas.length; s2++) {
        var fp = fingerprints[s2];
        if (!fp) continue;
        if (isMultiVerse[s2]) continue; // never abbreviate multi-verse stanzas
        if (seen[fp] !== undefined) {
            toAbbreviate[s2] = true;
        } else {
            seen[fp] = s2;
        }
    }

    if (Object.keys(toAbbreviate).length === 0) return lines;

    // Build new lines array, replacing duplicate stanzas with incipit
    var result = [];
    for (var s3 = 0; s3 < stanzas.length; s3++) {
        if (toAbbreviate[s3]) {
            // Build abbreviated text: first line or first 30+ chars
            var firstIdx = stanzas[s3][0];
            var abbrevText = lines[firstIdx].text || "";
            // If first line is long enough, use it; otherwise concatenate more
            if (abbrevText.length < 30 && stanzas[s3].length > 1) {
                for (var a = 1; a < stanzas[s3].length && abbrevText.length < 30; a++) {
                    abbrevText += " " + (lines[stanzas[s3][a]].text || "");
                }
                // Trim to a word boundary near 30+ chars
                if (abbrevText.length > 35) {
                    var cutoff = abbrevText.indexOf(" ", 25);
                    if (cutoff > 0 && cutoff < 45) {
                        abbrevText = abbrevText.substring(0, cutoff);
                    }
                }
            }
            // Remove trailing punctuation before adding ...
            abbrevText = abbrevText.replace(/[,.\s]+$/, "");
            abbrevText += "...";

            var lastIdx = stanzas[s3][stanzas[s3].length - 1];
            result.push({
                text: abbrevText,
                sylMap: [],
                startTick: lines[firstIdx].startTick,
                endTick: lines[lastIdx].endTick,
                sectionEnd: true,
                abbreviated: true
            });
        } else {
            for (var b = 0; b < stanzas[s3].length; b++) {
                result.push(lines[stanzas[s3][b]]);
            }
        }
    }

    return result;
}

// Wrap a chord line to max width, splitting at chord boundaries
function wrapChordLine(chordsStr, maxWidth) {
    if (chordsStr.length <= maxWidth) return chordsStr;
    var lines = [];
    while (chordsStr.length > maxWidth) {
        var cut = chordsStr.lastIndexOf("  ", maxWidth);
        if (cut <= 0) cut = chordsStr.indexOf("  ", maxWidth);
        if (cut <= 0) break;
        lines.push(chordsStr.substring(0, cut));
        chordsStr = chordsStr.substring(cut).replace(/^\s+/, "");
    }
    if (chordsStr) lines.push(chordsStr);
    return lines.join("\n");
}

// Get unique chord names in a tick range, skipping the lastChord
function getInterludeChords(chords, fromTick, toTick, lastChord) {
    var result = [];
    for (var i = 0; i < chords.length; i++) {
        if (chords[i].tick <= fromTick) continue;
        if (toTick >= 0 && chords[i].tick >= toTick) break;
        if (chords[i].chord !== lastChord) {
            result.push(chords[i].chord);
            lastChord = chords[i].chord;
        }
    }
    return result;
}

if (typeof exports !== "undefined") {
    exports.formatLines = formatLines;
    exports.formatPerfLines = formatPerfLines;
    exports.findPosForTick = findPosForTick;
    exports.expandTextForChords = expandTextForChords;
    exports.getInterludeChords = getInterludeChords;
    exports.abbreviateRepeatedStanzas = abbreviateRepeatedStanzas;
    exports.wrapChordLine = wrapChordLine;
}
