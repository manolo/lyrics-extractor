// Output formatting: renders chord+text lines
// Shared between MuseScore extension and Node.js CLI

// Invisible marker prefixed to chord lines so the PDF writer can identify them
// without heuristic detection. Use CHORD_LINE_MARKER to mark, stripChordMarker to remove.
var CHORD_LINE_MARKER = "\u200B"; // zero-width space

// --- Injected dependencies ---
// line-builder is injected via setLineBuilder() to avoid duplicating findPosForTick.
// QML caller passes LineBuilder; Node.js auto-wires via require().
var _lineBuilder = null;
function setLineBuilder(lb) { _lineBuilder = lb; }

// --- Internal helper (delegating to injected line-builder) ---
function findPosForTick(sylMap, tick) { return _lineBuilder.findPosForTick(sylMap, tick); }

// Expand text line by inserting spaces where chords need more room.
// placements: [{pos, chord}] sorted by pos (pos = position in original text)
// Returns { text, chordLine }
function expandTextForChords(text, placements) {
    if (placements.length === 0) return { text: text, chordLine: "" }; // no marker for empty chord lines

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

    return { text: expanded, chordLine: CHORD_LINE_MARKER + chordLine.replace(/\s+$/, "") };
}

// Render a system text label with numbering support.
// Supports two modes:
//   "Estrofa #"              -> auto-increment: ESTROFA 1, ESTROFA 2, ...
//   "Estrofa 1:2:1"          -> explicit sequence: ESTROFA 1, ESTROFA 2, ESTROFA 1, then ESTROFA
//   "Solista manolo:juan"    -> explicit sequence: SOLISTA MANOLO, SOLISTA JUAN, then SOLISTA
//   "Estrofa 1-2-1"          -> explicit sequence with dash separator
// The sequence is the last space-separated token containing ":" or
// containing "-" with at least two separators (to avoid matching plain hyphens).
// labelCounters is an object tracking state per label base text.
function renderLabel(text, labelCounters) {
    var upper = text.toUpperCase();

    // Explicit sequence: last token has ":" or has 2+ dashes
    var lastSpace = upper.lastIndexOf(" ");
    if (lastSpace >= 0) {
        var base = upper.substring(0, lastSpace).trim();
        var tail = upper.substring(lastSpace + 1);
        var isColonSeq = tail.indexOf(":") >= 0;
        var dashParts = tail.split("-");
        var isDashSeq = dashParts.length >= 3;
        if (isColonSeq || isDashSeq) {
            var items = isColonSeq ? tail.split(":") : dashParts;
            var seqKey = "_seq_" + base;
            if (!labelCounters[seqKey]) {
                labelCounters[seqKey] = { items: items, idx: 0 };
            }
            var seq = labelCounters[seqKey];
            if (seq.idx < seq.items.length) {
                upper = base + " " + seq.items[seq.idx].trim();
                seq.idx++;
            } else {
                upper = base;
            }
            return upper;
        }
    }

    // Auto-increment: "Label #"
    if (upper.indexOf("#") >= 0) {
        var base2 = upper.replace(/#/g, "").trim();
        labelCounters[base2] = (labelCounters[base2] || 0) + 1;
        upper = upper.replace(/#/g, "" + labelCounters[base2]);
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
    // Track the highest tick at which a chord was emitted (for coda dedup in the orchestrator)
    var lastEmittedChordTick = -1;

    for (var l = 0; l < lines.length; l++) {
        var line = lines[l];
        if (!line.text) continue;

        // Emit system texts that fall before this line, with interlude chords
        if (systemTexts) {
            while (lastSysTextIdx < systemTexts.length && systemTexts[lastSysTextIdx].tick <= line.startTick) {
                output += "\n- " + renderLabel(systemTexts[lastSysTextIdx].text, flLabelCounters) + " -\n";
                // Emit interlude chords between this label and the next label (or line start)
                var ilFrom = systemTexts[lastSysTextIdx].tick;
                var ilTo = (lastSysTextIdx + 1 < systemTexts.length && systemTexts[lastSysTextIdx + 1].tick <= line.startTick)
                    ? systemTexts[lastSysTextIdx + 1].tick : line.startTick;
                var ilChords = getInterludeChords(chords, ilFrom - 1, ilTo, lastOutputChord);
                if (ilChords.length > 0) {
                    output += wrapChordLine(ilChords.join("  "), 70) + "\n";
                    lastOutputChord = ilChords[ilChords.length - 1];
                    for (var ilt = chords.length - 1; ilt >= 0; ilt--) {
                        if (chords[ilt].tick > ilFrom && chords[ilt].tick < ilTo) {
                            if (chords[ilt].tick > lastEmittedChordTick) lastEmittedChordTick = chords[ilt].tick;
                            break;
                        }
                    }
                }
                lastSysTextIdx++;
            }
        }

        var chordFrom = line.startTick;
        var chordTo = (l + 1 < lines.length) ? lines[l + 1].startTick :
                      (chordToTick >= 0 ? chordToTick : -1);

        // Cap trailing chords at system text boundaries with instrumental sections
        if (systemTexts) {
            for (var stc = lastSysTextIdx; stc < systemTexts.length; stc++) {
                var stcTick = systemTexts[stc].tick;
                if (stcTick > line.endTick && (chordTo < 0 || stcTick < chordTo)) {
                    var chordsAfterLabel = 0;
                    for (var cal = 0; cal < chords.length; cal++) {
                        if (chords[cal].tick >= stcTick && (chordTo < 0 || chords[cal].tick < chordTo)) chordsAfterLabel++;
                    }
                    if (chordsAfterLabel >= 2) {
                        chordTo = stcTick;
                    }
                    break;
                }
            }
        }

        var placements = [];
        var trailingChords = [];
        var lastTrailingTick = -1;
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
                if (chords[ci].tick > lastEmittedChordTick) lastEmittedChordTick = chords[ci].tick;
            } else {
                trailingChords.push(chords[ci].chord);
                if (chords[ci].tick > lastTrailingTick) lastTrailingTick = chords[ci].tick;
            }
            lastOutputChord = chords[ci].chord;
        }
        if (trailingChords.length > 0 && lastTrailingTick > lastEmittedChordTick) {
            lastEmittedChordTick = lastTrailingTick;
        }

        // Always append trailing chords to the chord line above the lyric.
        // Even if this overflows the 70-char budget, an inline trailing chord
        // is preferable to an orphan chord line between stanzas.
        if (trailingChords.length > 0) {
            var trailPos2 = line.text.length + 2;
            for (var tc = 0; tc < trailingChords.length; tc++) {
                placements.push({ pos: trailPos2, chord: trailingChords[tc] });
                trailPos2 += trailingChords[tc].length + 1;
            }
        }

        var result = expandTextForChords(line.text, placements);
        output += (result.chordLine || "") + "\n";
        output += result.text + "\n";
    }

    output = output.replace(/\n{3,}/g, "\n\n");
    return { output: output, lastChord: lastOutputChord, lastChordTick: lastEmittedChordTick };
}

// Format lines using pre-assigned chord annotations from performance stream
// Renders chord line above each text line based on syllable positions
// chords: optional full chord array for interlude detection between stanzas
function formatPerfLines(lines, introChords, homeChord, title, chords, syllables, systemTexts, fullRepeat, repeatStartTick, repeats) {
    // Abbreviate repeated stanzas (e.g. estribillo appearing multiple times)
    // Skip abbreviation when fullRepeat is on (user wants everything written out)
    if (!fullRepeat) {
        lines = abbreviateRepeatedStanzas(lines, syllables, systemTexts);
    }

    // Track emitted system texts to avoid duplicates on repeat passes.
    // Store the highest tick reached before each backwards jump.
    // Only reset when high water advances significantly (new D.S. segment).
    var emittedSysTexts = {};
    // Labels emitted preemptively above an interlude chord block; the very
    // next line must skip them to avoid duplicating the label right after.
    var skipNextLineLabels = {};
    // Track whether a structural barline break occurred since the last label
    // was emitted. Used to decide whether to re-emit labels on repeat passes:
    // a section with internal barline breaks is a substantial block that
    // deserves its own label on each pass.
    var hadSectionBarSinceLabel = false;
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

    // Collect system texts within the intro chord range (for splitting and repeat detection)
    var introSplitTicks = [];
    if (introChords && introChords.length > 0) {
        if (systemTexts && chords) {
            for (var sti2 = 0; sti2 < systemTexts.length; sti2++) {
                var st2Tick = systemTexts[sti2].tick;
                if (st2Tick > introFirstChordTick && st2Tick < firstLineTick) {
                    // Only split if there are at least 2 chords after this label
                    // (a real instrumental section, not just one chord before lyrics)
                    var chordsAfterSplit = 0;
                    for (var cac = 0; cac < chords.length; cac++) {
                        if (chords[cac].tick >= st2Tick && chords[cac].tick < firstLineTick) chordsAfterSplit++;
                    }
                    if (chordsAfterSplit >= 2) {
                        introSplitTicks.push({ tick: st2Tick, text: systemTexts[sti2].text });
                        emittedSysTexts[st2Tick + "_" + systemTexts[sti2].text] = true;
                    }
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
        // Emit pre-lyric labels that were NOT used as intro splits
        if (systemTexts) {
            for (var sti2c = 0; sti2c < systemTexts.length; sti2c++) {
                var st2cTick = systemTexts[sti2c].tick;
                if (st2cTick > introFirstChordTick && st2cTick < firstLineTick) {
                    var st2cKey = st2cTick + "_" + systemTexts[sti2c].text;
                    if (!emittedSysTexts[st2cKey]) {
                        output += "\n- " + renderLabel(systemTexts[sti2c].text, labelCounters) + " -\n";
                        emittedSysTexts[st2cKey] = true;
                    }
                }
            }
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
                // Reset sectionBar tracking on backwards tick (new repeat pass)
                hadSectionBarSinceLabel = false;
                if (l > 0 && lines[l - 1].segmentBoundary) {
                    // D.S./D.C. jump: allow all labels from start
                    prevStartTick = -1;
                    emittedSysTexts = {};
                } else {
                    // Regular repeat: emit labels from the repeat start tick
                    // (where |: is), not from tick 0. Find the repeat whose
                    // range contains the target tick to handle multiple repeats.
                    var localRepStart = repeatStartTick >= 0 ? repeatStartTick : 0;
                    if (repeats) {
                        for (var ri = 0; ri < repeats.length; ri++) {
                            if (line.startTick >= repeats[ri].startTick && line.startTick < repeats[ri].endTick) {
                                localRepStart = repeats[ri].startTick;
                                break;
                            }
                        }
                    }
                    prevStartTick = localRepStart - 1;
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
                    // Backwards: re-emit if multiple labels AND no labels between
                    // intro and first lyric (intro IS the repeat start, like HorasDeRonda).
                    // If there ARE labels within the intro CHORD range (not just before first lyric),
                    // the intro has sub-sections and is pre-repeat (should NOT re-emit).
                    // Labels after the last intro chord (e.g. Solista) label the next section.
                    var lastIntroChordTick = introFirstChordTick;
                    if (chords) {
                        for (var lic = 0; lic < chords.length; lic++) {
                            if (chords[lic].tick < firstLineTick) lastIntroChordTick = chords[lic].tick;
                        }
                    }
                    var hasInternalSplit = false;
                    for (var isp = 0; isp < introSplitTicks.length; isp++) {
                        if (introSplitTicks[isp].tick <= lastIntroChordTick) { hasInternalSplit = true; break; }
                    }
                    if (hasInternalSplit) continue;
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
                // On backwards pass with a single label: skip re-emission only
                // when the repeat is a simple verse alternation (no structural
                // barline breaks within the section). When there was a barline
                // break (e.g. end barline mid-section), each pass is a
                // substantial block that gets its own label.
                // Labels with # are numbered templates: always re-emit on each pass
                var isNumbered = systemTexts[stj].text.indexOf("#") >= 0;
                if (isBackwards && emittedSysTexts[stKey] && !line.abbreviated && !isNumbered && distinctEmitted <= 1 && !hadSectionBarSinceLabel) continue;
                // On backwards tick, skip system texts that are before the
                // first lyric when the backwards jump goes to or after the first
                // lyric. These are intro/pre-repeat labels already shown at the
                // top, not part of the repeated section.
                // Skip intro-region labels on repeat only if intro is outside the repeat range
                var _introInRep = fullRepeat && repeatStartTick >= 0 && introFirstChordTick >= 0 &&
                    introFirstChordTick >= repeatStartTick;
                if (isBackwards && !_introInRep && introFirstChordTick >= 0 && stTick <= introFirstChordTick && line.startTick >= firstLineTick) {
                    continue;
                }
                if (stTick > prevStartTick && stTick <= line.startTick) {
                    if (skipNextLineLabels[stKey]) continue;
                    output += "\n- " + renderLabel(systemTexts[stj].text, labelCounters) + " -\n";
                    hasLabelBefore = true;
                    emittedSysTexts[stKey] = true;
                    hadSectionBarSinceLabel = false;
                }
            }
            // Reset: labels in skipNextLineLabels apply only to the immediately
            // next line after the interlude block that pre-emitted them.
            skipNextLineLabels = {};
        }

        // Abbreviated stanzas: if preceded by a system text label, show only the label.
        // If inside a labeled section where all stanzas are abbreviated, suppress them all.
        if (line.abbreviated) {
            if (hasLabelBefore) {
                inAbbreviatedSection = true;
                lastChord = null; // reset so next non-abbreviated section starts fresh
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
                // Suppress "return to home chord" at the start of a line (pos near 0).
                // Only suppress after a chord has already been emitted (lastChord !== null),
                // so the very first chord of the song is never suppressed.
                if (placements.length === 0 && sm.pos <= 2 && homeChord && sm.chord === homeChord && lastChord !== null && lastChord !== homeChord) {
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

        // Find trailing chords: between this line's endTick and next line's startTick.
        // Respect endChordTick: when a volta was skipped, cap the range to prevent
        // volta chords from leaking into a pass that doesn't play the volta.
        var trailingChords = [];
        if (chords) {
            var nextStartTick = (l + 1 < lines.length) ? lines[l + 1].startTick : -1;
            if (line.endChordTick && (nextStartTick < 0 || nextStartTick > line.endChordTick)) {
                nextStartTick = line.endChordTick;
            }
            var trailingRaw = getInterludeChords(chords, line.endTick, nextStartTick, lastChord);
            trailingChords = trailingRaw;
        }
        // Always append trailing chords to the chord line above the lyric
        // (rule 3.5). Even if this overflows the 70-char budget, an inline
        // trailing chord is preferable to an orphan chord line between stanzas.
        if (trailingChords.length > 0) {
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

        // Track structural barline breaks for label re-emission logic
        if (line.sectionBar) hadSectionBarSinceLabel = true;

        // Stanza break after section boundaries
        if (line.sectionEnd) {
            output += "\n";

            // Interlude chords between stanzas (only if not already handled as trailing)
            if (chords && l + 1 < lines.length && trailingChords.length === 0) {
                var nextLine = lines[l + 1];
                var interlude;
                if (nextLine.startTick < line.endTick) {
                    // Backwards tick (repeat pass or D.S. replay).
                    // Include intro chords only if the repeat goes back before first lyric
                    // AND this is NOT a D.S./D.C. segment boundary (D.S. jumps to segno, not intro).
                    var nextIsBackwards = nextLine.startTick < line.endTick;
                    var goesBeforeFirstLyric = !line.segmentBoundary &&
                        (nextLine.startTick < firstLineTick ||
                        (nextIsBackwards && introChords && introChords.length > 0 && nextLine.startTick <= firstLineTick));
                    var interludeFrom = goesBeforeFirstLyric ? -1 : nextLine.startTick;
                    interlude = getInterludeChords(chords, interludeFrom, nextLine.startTick, null);
                } else {
                    interlude = getInterludeChords(chords, line.endTick, nextLine.startTick, lastChord);
                }
                if (interlude.length > 0) {
                    // Check if these interlude chords are the same as the intro.
                    // Skip them only if the intro is OUTSIDE the repeat range.
                    // When the intro is inside the repeat (introFirstChordTick >= repeatStartTick),
                    // the chords should replay on each pass.
                    var isRepeatPass = nextLine.startTick < line.endTick;
                    // Check if intro is inside the repeat that contains the lyrics
                    // (not any repeat). Find the repeat that contains firstLineTick.
                    var lyricRepeatStart = -1;
                    if (repeats) {
                        for (var lri = 0; lri < repeats.length; lri++) {
                            if (firstLineTick >= repeats[lri].startTick && firstLineTick < repeats[lri].endTick) {
                                lyricRepeatStart = repeats[lri].startTick;
                                break;
                            }
                        }
                    }
                    if (lyricRepeatStart < 0 && repeatStartTick >= 0) lyricRepeatStart = repeatStartTick;
                    var introInsideRepeat = lyricRepeatStart >= 0 && introFirstChordTick >= 0 &&
                        introFirstChordTick >= lyricRepeatStart;
                    // With --full, repeat the intro chords when inside the repeat range.
                    // Without --full, skip them (already shown at the top).
                    var showIntroOnRepeat = introInsideRepeat && fullRepeat;
                    // Suppress when interlude chords are a subset of the intro
                    // (already shown at top) and intro is not inside the lyrics repeat.
                    var isIntroSubset = false;
                    if (goesBeforeFirstLyric && !showIntroOnRepeat && introChords && introChords.length > 0) {
                        var introSet = {};
                        for (var ics = 0; ics < introChords.length; ics++) introSet[introChords[ics]] = true;
                        isIntroSubset = true;
                        for (var icl = 0; icl < interlude.length; icl++) {
                            if (!introSet[interlude[icl]]) { isIntroSubset = false; break; }
                        }
                    }
                    var isIntroRepeat = isIntroSubset ||
                        (!showIntroOnRepeat && introChords && introChords.length > 0 &&
                        interlude.length === introChords.length &&
                        interlude.join(",") === introChords.join(","));
                    var introIncludedInRepeat = isRepeatPass && showIntroOnRepeat;
                    if (isIntroRepeat) {
                        // Intro chords already shown at the top, skip chords.
                        // But when the intro is inside the repeat, emit the label
                        if (introInsideRepeat && isRepeatPass && systemTexts) {
                            for (var iil = 0; iil < systemTexts.length; iil++) {
                                if (systemTexts[iil].tick <= introFirstChordTick) {
                                    output += "\n- " + renderLabel(systemTexts[iil].text, labelCounters) + " -\n";
                                    var iilKey = systemTexts[iil].tick + "_" + systemTexts[iil].text;
                                    emittedSysTexts[iilKey] = true;
                                }
                            }
                        }
                        output += "\n";
                    } else {
                        // If a system text label belongs above the interlude (e.g.
                        // "Musica" on the second pass of a repeat), emit it first
                        // so the chords sit under their label. Mark the labels in
                        // skipNextLineLabels so the next-line loop does not emit
                        // the same label again right after.
                        // Only pre-emit labels strictly before nextLine.startTick:
                        // a label AT nextLine.startTick belongs to that line, not
                        // to the interlude.
                        if (systemTexts) {
                            for (var ilst = 0; ilst < systemTexts.length; ilst++) {
                                var ilstTick = systemTexts[ilst].tick;
                                if (ilstTick >= nextLine.startTick) continue;
                                // On repeat passes with intro in repeat, only emit labels
                                // that are within the intro chord range (not post-intro labels).
                                if (introIncludedInRepeat) {
                                    var lastIntroCTick = introChords.length > 0 && chords ? chords[0].tick : 0;
                                    for (var licc = 0; licc < chords.length; licc++) {
                                        if (chords[licc].tick < firstLineTick) lastIntroCTick = chords[licc].tick;
                                    }
                                    if (ilstTick > lastIntroCTick) continue;
                                }
                                // Skip intro-region labels when intro is NOT part of the repeat.
                                if (!introIncludedInRepeat && ilstTick < firstLineTick &&
                                    nextLine.startTick >= firstLineTick) continue;
                                if (introFirstChordTick >= 0 && ilstTick <= introFirstChordTick &&
                                    Object.keys(emittedSysTexts).length <= 1) continue;
                                var ilstKey = ilstTick + "_" + systemTexts[ilst].text;
                                if (skipNextLineLabels[ilstKey]) continue;
                                output += "- " + renderLabel(systemTexts[ilst].text, labelCounters) + " -\n";
                                emittedSysTexts[ilstKey] = true;
                                skipNextLineLabels[ilstKey] = true;
                            }
                        }
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
            var codaToTick = lastLine.endChordTick || -1;
            var codaChords = getInterludeChords(chords, codaFromTick, codaToTick, lastChord);
            if (codaChords.length > 0) {
                output += "\n" + wrapChordLine(codaChords.join("  "), 70) + "\n";
            }
        }
    }

    // Collapse 3+ consecutive newlines to 2 (single blank line)
    output = output.replace(/\n{3,}/g, "\n\n");
    // Remove consecutive duplicate labels with no content between them
    // (e.g. "- ESTROFA -\n\n- ESTROFA -" from D.S. repeat passes)
    output = output.replace(/(- .+ -)\n\n\1/g, "$1");
    return { text: output };
}

// Detect repeated stanzas (e.g. estribillo) and abbreviate subsequent occurrences.
// Groups lines into stanzas by sectionEnd, compares text fingerprints,
// and replaces duplicates with an incipit + "..."
// Only abbreviates stanzas from single-verse sections (not multi-verse like verses).
// syllables: optional raw syllable array to check verse count at source ticks.
function abbreviateRepeatedStanzas(lines, syllables, systemTexts) {
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
    // Only abbreviate a duplicate if a system text label falls at or before
    // the stanza's start tick. This ensures structural repeats within the
    // same section (e.g. closing line of estrofa) are NOT abbreviated,
    // while repeated sections with their own label (e.g. second estribillo) ARE.
    var seen = {};
    var toAbbreviate = {};
    for (var s2 = 0; s2 < stanzas.length; s2++) {
        var fp = fingerprints[s2];
        if (!fp) continue;
        if (seen[fp] !== undefined) {
            // Check if a label precedes this stanza (different section = true repeat)
            var stanzaStart = lines[stanzas[s2][0]].startTick;
            var prevStanzaEnd = (s2 > 0) ? lines[stanzas[s2 - 1][stanzas[s2 - 1].length - 1]].endTick : -1;
            var isBackwardsTick = stanzaStart < prevStanzaEnd;
            var hasLabelBefore = false;
            if (systemTexts) {
                for (var stl = 0; stl < systemTexts.length; stl++) {
                    if (isBackwardsTick) {
                        // D.S. replay: label at or before the stanza start
                        if (systemTexts[stl].tick <= stanzaStart) { hasLabelBefore = true; break; }
                    } else {
                        // Normal: label between previous stanza end and this start
                        if (systemTexts[stl].tick > prevStanzaEnd && systemTexts[stl].tick <= stanzaStart) {
                            hasLabelBefore = true; break;
                        }
                    }
                }
            }
            // Also abbreviate D.S. replay stanzas regardless of labels
            var isReplay = false;
            for (var sr = 0; sr < stanzas[s2].length; sr++) {
                if (lines[stanzas[s2][sr]]._jumpReplay) { isReplay = true; break; }
            }
            if (!systemTexts || !systemTexts.length || hasLabelBefore || isReplay) {
                toAbbreviate[s2] = true;
            }
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
    if (chordsStr.length <= maxWidth) return CHORD_LINE_MARKER + chordsStr;
    var lines = [];
    while (chordsStr.length > maxWidth) {
        var cut = chordsStr.lastIndexOf("  ", maxWidth);
        if (cut <= 0) cut = chordsStr.indexOf("  ", maxWidth);
        if (cut <= 0) break;
        lines.push(CHORD_LINE_MARKER + chordsStr.substring(0, cut));
        chordsStr = chordsStr.substring(cut).replace(/^\s+/, "");
    }
    if (chordsStr) lines.push(CHORD_LINE_MARKER + chordsStr);
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

// Strip chord line markers from output text (for display/copy)
function stripChordMarkers(text) {
    return text.replace(/\u200B/g, "");
}

if (typeof exports !== "undefined") {
    // Auto-wire line-builder in Node.js context
    _lineBuilder = require("./line-builder");

    exports.CHORD_LINE_MARKER = CHORD_LINE_MARKER;
    exports.stripChordMarkers = stripChordMarkers;
    exports.formatLines = formatLines;
    exports.formatPerfLines = formatPerfLines;
    exports.findPosForTick = findPosForTick;
    exports.expandTextForChords = expandTextForChords;
    exports.getInterludeChords = getInterludeChords;
    exports.abbreviateRepeatedStanzas = abbreviateRepeatedStanzas;
    exports.wrapChordLine = wrapChordLine;
    exports.renderLabel = renderLabel;
    exports.setLineBuilder = setLineBuilder;
}
