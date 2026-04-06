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

// Render a system text label, replacing # with incrementing counter.
// labelCounters is an object tracking counts per label base text.
function renderLabel(text, labelCounters) {
    var upper = text.toUpperCase();
    if (upper.indexOf("#") >= 0) {
        var base = upper.replace(/#/g, "").trim();
        labelCounters[base] = (labelCounters[base] || 0) + 1;
        upper = upper.replace(/#/g, "" + labelCounters[base]);
    }
    return upper;
}

// Format a list of lines into chord+text output (simple verse mode)
// chordToTick limits which chords to include
// systemTexts: optional array of {tick, text} for section labels
function formatLines(lines, chords, lastOutputChord, chordToTick, systemTexts) {
    var output = "";
    var lastSysTextIdx = 0;
    var flLabelCounters = {};

    for (var l = 0; l < lines.length; l++) {
        var line = lines[l];
        if (!line.text) continue;

        // Emit system texts that fall before this line
        if (systemTexts) {
            while (lastSysTextIdx < systemTexts.length && systemTexts[lastSysTextIdx].tick <= line.startTick) {
                output += "\n- " + renderLabel(systemTexts[lastSysTextIdx].text, flLabelCounters) + " -\n";
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
                    output += "\n- " + renderLabel(systemTexts[lastSysTextIdx].text, flLabelCounters) + " -\n";
                    lastSysTextIdx++;
                }
            }
            output += wrapChordLine(trailingChords.join("  "), 70) + "\n";
        }
    }

    output = output.replace(/\n{3,}/g, "\n\n");
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

    // Track emitted system texts to avoid duplicates on repeat passes.
    // Store the highest tick reached before each backwards jump.
    // Only reset when high water advances significantly (new D.S. segment).
    var emittedSysTexts = {};
    var inAbbreviatedSection = false;
    var labelCounters = {}; // track emission count per label base for # replacement
    // Track labeled chord sections already emitted (for abbreviation)
    var emittedLabeledChords = {};

    var output = "";
    var lastChord = null;
    var lastChordTick = -1;

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
                introLabel = renderLabel(systemTexts[sti].text, labelCounters);
                output += "- " + introLabel + " -\n";
                // Don't track in emittedSysTexts: intro label is handled separately
            }
        }
    }

    if (introChords && introChords.length > 0) {
        // Collect system texts within the intro chord range to split chords at label boundaries
        var introSplitTicks = [];
        if (systemTexts) {
            for (var sti2 = 0; sti2 < systemTexts.length; sti2++) {
                var st2Tick = systemTexts[sti2].tick;
                if (st2Tick > introFirstChordTick && st2Tick < firstLineTick) {
                    introSplitTicks.push({ tick: st2Tick, text: systemTexts[sti2].text });
                    emittedSysTexts[st2Tick + "_" + systemTexts[sti2].text] = true;
                }
            }
        }

        if (introSplitTicks.length === 0) {
            // No splits: emit all intro chords as one block
            output += wrapChordLine(introChords.join("  "), 70) + "\n\n";
        } else {
            // Split intro chords at each system text boundary
            var splitFrom = introFirstChordTick;
            var splitLastChord = null;
            for (var sp = 0; sp <= introSplitTicks.length; sp++) {
                var splitTo = (sp < introSplitTicks.length) ? introSplitTicks[sp].tick : firstLineTick;
                var segChords = [];
                if (chords) {
                    for (var sc = 0; sc < chords.length; sc++) {
                        if (chords[sc].tick < splitFrom) continue;
                        if (chords[sc].tick >= splitTo) break;
                        if (chords[sc].chord !== splitLastChord) {
                            segChords.push(chords[sc].chord);
                            splitLastChord = chords[sc].chord;
                        }
                    }
                }
                if (segChords.length > 0) {
                    output += wrapChordLine(segChords.join("  "), 70) + "\n";
                }
                output += "\n";
                // Emit the label for the next segment
                if (sp < introSplitTicks.length) {
                    output += "- " + renderLabel(introSplitTicks[sp].text, labelCounters) + " -\n";
                }
            }
        }
        lastChord = introChords[introChords.length - 1];
        if (introLabel) {
            emittedLabeledChords[introLabel] = true;
        }
    } else {
        // No intro chords: still emit pre-lyric system texts
        if (systemTexts) {
            for (var sti2b = 0; sti2b < systemTexts.length; sti2b++) {
                if (systemTexts[sti2b].tick < firstLineTick && (introFirstChordTick < 0 || systemTexts[sti2b].tick > introFirstChordTick)) {
                    output += "\n- " + renderLabel(systemTexts[sti2b].text, labelCounters) + " -\n";
                    emittedSysTexts[systemTexts[sti2b].tick + "_" + systemTexts[sti2b].text] = true;
                }
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
                // Reset emitted tracking at D.S./D.C. segment boundaries
                if (l > 0 && lines[l - 1].segmentBoundary) {
                    emittedSysTexts = {};
                }
            }

            for (var stj = 0; stj < systemTexts.length; stj++) {
                var stTick = systemTexts[stj].tick;
                // Skip intro label on forward pass (already emitted at the top).
                // On backwards tick, allow re-emission if there are multiple distinct labels,
                // UNLESS this is the introLabel (the header before intro chords, never re-emits).
                if (introFirstChordTick >= 0 && stTick <= introFirstChordTick) {
                    // Forward: always skip (emitted in intro section above)
                    if (!isBackwards) continue;
                    // Backwards: re-emit if multiple other labels exist in the repeat
                    // (intro is part of the repeat structure, e.g. Intro+Solista+Estribillo)
                    var distinctForIntro = Object.keys(emittedSysTexts).length;
                    if (distinctForIntro <= 1) continue;
                }
                if (!isBackwards && stTick < firstLineTick) continue;
                // On backwards tick, skip system texts already emitted in current repeat,
                // ONLY if this is the sole label emitted so far. If multiple different
                // labels were emitted (e.g. Estrofa + Estribillo within same repeat),
                // re-emit on each pass. Also allow re-emission for abbreviated stanzas.
                var stKey = stTick + "_" + systemTexts[stj].text;
                var distinctEmitted = Object.keys(emittedSysTexts).length;
                if (isBackwards && emittedSysTexts[stKey] && !line.abbreviated && distinctEmitted <= 1) continue;
                if (stTick > prevStartTick && stTick <= line.startTick) {
                    output += "\n- " + renderLabel(systemTexts[stj].text, labelCounters) + " -\n";
                    hasLabelBefore = true;
                    emittedSysTexts[stKey] = true;
                }
            }
        }

        // Abbreviated stanzas: if preceded by a system text label, show only the label.
        // If inside a labeled section where all stanzas are abbreviated, suppress them all.
        if (line.abbreviated) {
            if (hasLabelBefore) {
                inAbbreviatedSection = true;
                if (line.sectionEnd) output += "\n";
                continue;
            }
            if (inAbbreviatedSection) {
                // Still in the same abbreviated section, suppress
                if (line.sectionEnd) output += "\n";
                continue;
            }
            output += "\n";
        } else {
            inAbbreviatedSection = false;
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
            // Track last emitted chord tick to avoid coda duplication
            if (chords) {
                for (var lct = chords.length - 1; lct >= 0; lct--) {
                    if (chords[lct].chord === lastChord && chords[lct].tick > line.endTick) {
                        lastChordTick = chords[lct].tick; break;
                    }
                }
            }
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
            if (chords) {
                for (var lct2 = chords.length - 1; lct2 >= 0; lct2--) {
                    if (chords[lct2].chord === lastChord && chords[lct2].tick > line.endTick) {
                        lastChordTick = chords[lct2].tick; break;
                    }
                }
            }
        }

        // Stanza break after section boundaries
        if (line.sectionEnd) {
            output += "\n";

            // Interlude chords between stanzas (only if not already handled as trailing)
            if (chords && l + 1 < lines.length && trailingChords.length === 0) {
                var nextLine = lines[l + 1];
                var interlude;
                if (nextLine.startTick < line.endTick) {
                    // Backwards tick (repeat pass or D.S. replay).
                    // Include intro chords if the repeat/D.S. goes back before first lyric.
                    // segmentBoundary on the current line means D.S./D.C. transition.
                    var nextIsBackwards = nextLine.startTick < line.endTick;
                    var goesBeforeFirstLyric = nextLine.startTick < firstLineTick ||
                        (nextIsBackwards && introChords && introChords.length > 0 && nextLine.startTick <= firstLineTick);
                    var interludeFrom = goesBeforeFirstLyric ? -1 : nextLine.startTick;
                    interlude = getInterludeChords(chords, interludeFrom, nextLine.startTick, null);
                } else {
                    interlude = getInterludeChords(chords, line.endTick, nextLine.startTick, lastChord);
                }
                if (interlude.length > 0) {
                    // Check if these interlude chords are the same as the intro
                    var isIntroRepeat = introChords && introChords.length > 0 &&
                        interlude.length === introChords.length &&
                        interlude.join(",") === introChords.join(",");
                    if (isIntroRepeat) {
                        // Intro chords already shown at the top, skip
                        output += "\n";
                    } else {
                        output += wrapChordLine(interlude.join("  "), 70) + "\n\n";
                        lastChord = interlude[interlude.length - 1];
                    }
                }
            }
        }
    }

    // Coda instrumental: chords after the last line with no lyrics.
    // Skip if the last line is abbreviated or already has trailing chords.
    // Use lastChordTick if trailing chords were emitted, else lastLine.endTick.
    if (chords && lines.length > 0) {
        var lastLine = lines[lines.length - 1];
        if (!lastLine.abbreviated) {
            var codaFromTick = Math.max(lastLine.endTick, lastChordTick);
            var codaChords = getInterludeChords(chords, codaFromTick, -1, lastChord);
            if (codaChords.length > 0) {
                output += "\n" + wrapChordLine(codaChords.join("  "), 70) + "\n";
            }
        }
    }

    // Collapse 3+ consecutive newlines to 2 (single blank line)
    output = output.replace(/\n{3,}/g, "\n\n");
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
    var seen = {};
    var toAbbreviate = {};
    for (var s2 = 0; s2 < stanzas.length; s2++) {
        var fp = fingerprints[s2];
        if (!fp) continue;
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
