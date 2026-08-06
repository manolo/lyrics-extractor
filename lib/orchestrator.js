// Main pipeline: receives extracted data and module references, returns output string
// Shared between MuseScore extension and Node.js CLI
//
// Usage from QML:
//   var output = Orchestrator.processExtraction(data, {
//     ChordUtils: ChordUtils, WordBuilder: WordBuilder, ...
//   });
//
// Usage from Node:
//   var output = require("./orchestrator").processExtraction(data);
//   (modules are auto-wired via require)

function formatTitle(title) {
    return title ? "==== " + title.toUpperCase() + " ====\n\n" : "";
}

// wrapChordLine: use mods.Formatter.wrapChordLine (canonical version in formatter.js)

// A lyric line may cover only part of the music, down to a single note, marking that one
// syllable is sung there while the rest stays instrumental. Such a verse is drawn with the
// stanza it falls in as its frame: the whole chord line of that stanza, and the lyric line
// with blanks where the verse says nothing (spec 7.1.3). The frame is the first verse,
// whose lines already map every tick of the music to a column.

// True when every syllable of the verse sits on a tick the frame also sings, and there are
// fewer of them: a verse writing its own words needs its own layout instead.
function isSparseVerse(frameLines, verseSyls) {
    if (verseSyls.length === 0) return false;
    var frameTicks = {};
    var frameCount = 0;
    for (var fl = 0; fl < frameLines.length; fl++) {
        var map = frameLines[fl].sylMap || [];
        for (var mi = 0; mi < map.length; mi++) {
            if (!frameTicks[map[mi].tick]) { frameTicks[map[mi].tick] = true; frameCount++; }
        }
    }
    if (verseSyls.length >= frameCount) return false;
    for (var vs = 0; vs < verseSyls.length; vs++) {
        if (!frameTicks[verseSyls[vs].tick]) return false;
    }
    return true;
}

// Lines for a sparse verse, laid out on the frame of the stanzas where it sings.
// labelTicks separate stanzas as much as a section end does: a label is what the reader
// sees as the start of a new stanza.
function alignVerseOntoFrame(frameLines, verseSyls, verse, mods, labelTicks) {
    var stanzas = [];
    var current = [];
    for (var i = 0; i < frameLines.length; i++) {
        var startsStanza = false;
        if (current.length > 0 && labelTicks) {
            var prevEnd = current[current.length - 1].endTick;
            for (var lt = 0; lt < labelTicks.length; lt++) {
                // A label at the very tick the previous line ends still introduces the
                // next one, which is what the reader sees as a new stanza
                if (labelTicks[lt] >= prevEnd && labelTicks[lt] <= frameLines[i].startTick) {
                    startsStanza = true;
                    break;
                }
            }
        }
        if (startsStanza) {
            stanzas.push(current);
            current = [];
        }
        current.push(frameLines[i]);
        if (frameLines[i].sectionEnd || i === frameLines.length - 1) {
            stanzas.push(current);
            current = [];
        }
    }
    if (current.length > 0) stanzas.push(current);

    var words = mods.WordBuilder.buildWords(verseSyls, verse);
    var out = [];

    for (var st = 0; st < stanzas.length; st++) {
        var stanza = stanzas[st];
        var from = stanza[0].startTick;
        var to = stanza[stanza.length - 1].endTick;
        var sings = false;
        for (var w0 = 0; w0 < words.length; w0++) {
            if (words[w0].tick >= from && words[w0].tick <= to) { sings = true; break; }
        }
        if (!sings) continue; // the verse says nothing in this stanza, so it is not drawn

        for (var li = 0; li < stanza.length; li++) {
            var frame = stanza[li];
            var text = "";
            for (var wi = 0; wi < words.length; wi++) {
                var word = words[wi];
                if (word.tick < frame.startTick || word.tick > frame.endTick) continue;
                var col = mods.LineBuilder.findPosForTick(frame.sylMap, word.tick).pos;
                if (text.length > 0 && col <= text.length) text += " ";
                while (text.length < col) text += " ";
                text += word.text;
            }
            // Padded to the width of the frame so the chords keep their columns instead
            // of being laid out one after another past the end of the text
            while (text.length < frame.text.length) text += " ";
            var lineStart = frame.startTick;
            if (li === 0 && labelTicks) {
                // Reach back to the label that introduces the stanza, so its chords are
                // part of this block instead of being dropped as earlier music
                for (var lb = 0; lb < labelTicks.length; lb++) {
                    if (labelTicks[lb] <= frame.startTick && labelTicks[lb] > lineStart - 1920 &&
                        labelTicks[lb] < lineStart) {
                        lineStart = labelTicks[lb];
                    }
                }
            }
            out.push({
                text: text,
                sylMap: frame.sylMap,
                startTick: lineStart,
                endTick: frame.endTick,
                sectionEnd: frame.sectionEnd,
                sectionBar: frame.sectionBar
            });
        }
    }
    return out;
}

// Lyric lines that no pass of the score sings (spec 7.1.2). A score whose structure
// gives fewer passes than it has lyric lines leaves the last ones without a pass: the
// typical case is a Da Capo, which plays twice, in a score with three verses.
// Without repeats or jumps there are no passes to assign and the multi-verse path
// prints every verse, so nothing is orphan.
function orphanVerses(data, mods) {
    var syllables = data.syllables || [];
    if (syllables.length === 0) return [];

    var hasJumps = data.jumps && data.jumps.length > 0;
    var hasRepeats = (data.repeats && data.repeats.length > 0) || (data.voltas && data.voltas.length > 0);
    if (!hasJumps && !hasRepeats) return [];

    var Expander = (mods && mods.Expander) ||
        (typeof require !== "undefined" ? require("./expander") : null);
    if (!Expander) return [];

    var sung = {};
    var stream = Expander.expand(data);
    for (var i = 0; i < stream.length; i++) {
        if (stream[i].verse !== undefined) sung[stream[i].verse] = true;
    }

    var orphans = [];
    var seen = {};
    for (var si = 0; si < syllables.length; si++) {
        var v = syllables[si].verse;
        if (v === undefined || seen[v]) continue;
        seen[v] = true;
        if (!sung[v]) orphans.push(v);
    }
    return orphans.sort(function(a, b) { return a - b; });
}

// Stanzas for the verses no pass sings, printed with their chords after the last pass
// (spec 7.1.2). Only reached with the extra lyrics option on.
function extraVerseStanzas(data, mods, verses, chords) {
    var out = "";
    for (var vi = 0; vi < verses.length; vi++) {
        var vSyls = mods.Expander.filterSylsByVerse(data.syllables, verses[vi]);
        if (vSyls.length === 0) continue;
        var words = mods.WordBuilder.buildWords(vSyls, verses[vi]);
        if (words.length === 0) continue;
        var vLines = mods.LineBuilder.mergeShortLines(
            mods.LineBuilder.splitLongLines(
                mods.LineBuilder.buildLinesFromWords(words, chords), vSyls));
        if (vLines.length === 0) continue;
        mods.LineBuilder.applyStanzaFormatting(vLines);
        var res = mods.Formatter.formatLines(vLines, chords, null, -1, null);
        out += "\n" + (res.output || res);
    }
    return out;
}

function processExtraction(data, mods) {
    var syllables = data.syllables;
    var chords = data.chords;
    var title = data.title || "";

    // Chord-only mode: no lyrics but has chords
    if ((!syllables || syllables.length === 0) && chords && chords.length > 0) {
        var ChordFormatter;
        if (typeof require !== "undefined") {
            ChordFormatter = require("./chord-formatter");
        } else if (mods && mods.ChordFormatter) {
            ChordFormatter = mods.ChordFormatter;
        }
        if (ChordFormatter) {
            return ChordFormatter.formatChordOnly(data, mods);
        }
        return null;
    }

    if (!syllables || syllables.length === 0) {
        return null;
    }

    // Apply section barline marks to syllables (QML extractor provides barlines
    // separately; XML extractor already sets sectionBar on syllables directly).
    // Suppress barlines in measures that contain a system text or rehearsal mark:
    // the label already defines the section boundary, so the barline is redundant.
    var barlines = data.barlines || [];
    var systemTexts = data.systemTexts || [];
    if (barlines.length > 0) {
        var division = data.division || 480;
        var measureTicks = division * 4; // default 4/4, one measure
        var barTicks = {};
        for (var bi = 0; bi < barlines.length; bi++) {
            var bTick = barlines[bi].tick;
            var suppressedByLabel = false;
            for (var sti = 0; sti < systemTexts.length; sti++) {
                var labelTick = systemTexts[sti].tick;
                if (labelTick >= bTick - measureTicks && labelTick < bTick) {
                    suppressedByLabel = true;
                    break;
                }
            }
            if (!suppressedByLabel) barTicks[bTick] = true;
        }
        // Build set of suppressed barline ticks for un-setting sectionBar
        // on syllables already marked by the XML extractor.
        var suppressedTicks = {};
        for (var sbi = 0; sbi < barlines.length; sbi++) {
            if (!barTicks[barlines[sbi].tick]) suppressedTicks[barlines[sbi].tick] = true;
        }

        for (var si = 0; si < syllables.length; si++) {
            // Un-set sectionBar if the barline was suppressed by a label
            if (syllables[si].sectionBar) {
                var sylEnd2 = syllables[si].tick + Math.round((syllables[si].durationQ || 1) * division);
                if (suppressedTicks[sylEnd2]) {
                    syllables[si].sectionBar = false;
                }
                continue;
            }
            var sylEnd = syllables[si].tick + Math.round((syllables[si].durationQ || 1) * division);
            if (barTicks[sylEnd]) {
                syllables[si].sectionBar = true;
                continue;
            }
            // Check if a non-suppressed barline falls between this syllable and the next
            for (var sj = si + 1; sj < syllables.length; sj++) {
                if (syllables[sj].verse === syllables[si].verse) {
                    for (var bk = 0; bk < barlines.length; bk++) {
                        var bkTick = barlines[bk].tick;
                        if (bkTick > syllables[si].tick && bkTick <= syllables[sj].tick && barTicks[bkTick]) {
                            syllables[si].sectionBar = true;
                            break;
                        }
                    }
                    break;
                }
            }
        }

    }

    // Chord names are already in the correct language from extraction
    // (based on the score's chordSymbolSpelling setting)

    var hasJumps = data.jumps && data.jumps.length > 0;
    var hasRepeats = (data.repeats && data.repeats.length > 0) || (data.voltas && data.voltas.length > 0);

    // ========================================
    // UNIFIED EXPANSION PATH (repeats + navigation)
    // ========================================
    if (hasJumps || hasRepeats) {
        return processWithExpander(data, mods);
    }

    // ========================================
    // NO REPEATS/NAVIGATION: simple verse handling
    // ========================================

    // Find unique verses
    var verseSet = {};
    for (var i = 0; i < syllables.length; i++) {
        verseSet[syllables[i].verse] = true;
    }
    var verseNums = Object.keys(verseSet).map(function(k) { return parseInt(k); }).sort();

    // Build lines for each verse
    var verseLines = {};
    for (var v = 0; v < verseNums.length; v++) {
        var vn = verseNums[v];
        var words = mods.WordBuilder.buildWords(syllables, vn);
        if (words.length > 0) {
            verseLines[vn] = mods.LineBuilder.mergeShortLines(
                mods.LineBuilder.splitLongLines(
                    mods.LineBuilder.buildLinesFromWords(words, chords), syllables));
        }
    }

    // Single verse: simple output
    if (verseNums.length === 1) {
        var output1v = "";
        output1v += formatTitle(title);

        var lines0 = verseLines[verseNums[0]];
        mods.LineBuilder.applyStanzaFormatting(lines0);

        var firstLineTick = (lines0.length > 0) ? lines0[0].startTick : 0;

        // System texts before intro chords. Rendered like every other label so that
        // "Estrofa #" and "Solista a:b" templates expand here too. The counters are
        // local to this block, so a template that also appears further down starts
        // counting again inside formatLines.
        if (data.systemTexts) {
            var introCounters1v = {};
            for (var sti = 0; sti < data.systemTexts.length; sti++) {
                if (data.systemTexts[sti].tick < firstLineTick) {
                    var introLabel1v = mods.Formatter.renderLabel(data.systemTexts[sti].text, introCounters1v);
                    if (introLabel1v !== null) output1v += "- " + introLabel1v + " -\n";
                }
            }
        }

        if (lines0.length > 0) {
            var introC1 = mods.ChordUtils.getChordsInRange(chords, 0, lines0[0].startTick, null);
            if (introC1.length > 0) {
                output1v += mods.Formatter.wrapChordLine(introC1.join("  "), 70) + "\n\n";
            }
        }

        // Pass only systemTexts that are at or after the first lyric line
        var inlineSystemTexts = null;
        if (data.systemTexts) {
            inlineSystemTexts = [];
            for (var sti2 = 0; sti2 < data.systemTexts.length; sti2++) {
                if (data.systemTexts[sti2].tick >= firstLineTick) {
                    inlineSystemTexts.push(data.systemTexts[sti2]);
                }
            }
        }

        var res1v = mods.Formatter.formatLines(lines0, chords, null, -1, inlineSystemTexts);
        output1v += res1v.output || res1v;

        // Coda instrumental: chords after the last chord already emitted by formatLines
        var lastEndTick1v = lines0[lines0.length - 1].endTick;
        var codaFromTick1v = Math.max(lastEndTick1v, res1v.lastChordTick || -1);
        var codaChords1v = mods.ChordUtils.getChordsInRange(chords, codaFromTick1v + 1, -1, res1v.lastChord || null);
        if (codaChords1v.length > 0) {
            output1v += "\n" + mods.Formatter.wrapChordLine(codaChords1v.join("  "), 70) + "\n";
        }

        return output1v;
    }

    // Multiple verses without voltas: interleave by verse end tick.
    // A verse may cover less music than the first one, and then the tail of the first
    // verse is sung once, after every verse. That tail is what NO other verse reaches,
    // so the cut is the furthest end tick among them: taking the nearest one instead
    // moved most of the first verse into the tail as soon as one verse was shorter,
    // which is what a verse being written one syllable at a time looks like.
    var verseEndTick = {};
    for (var v2 = 0; v2 < verseNums.length; v2++) {
        var vn2 = verseNums[v2];
        var vLines = verseLines[vn2];
        if (vLines && vLines.length > 0) {
            verseEndTick[vn2] = vLines[vLines.length - 1].endTick;
        }
    }

    var splitTick = -1;
    for (var v3 = 1; v3 < verseNums.length; v3++) {
        var et = verseEndTick[verseNums[v3]];
        if (et !== undefined) {
            if (splitTick < 0 || et > splitTick) splitTick = et;
        }
    }

    var verse0Lines = verseLines[verseNums[0]] || [];
    var verse0Repeated = [];
    var verse0Coda = [];
    for (var li = 0; li < verse0Lines.length; li++) {
        if (splitTick >= 0 && verse0Lines[li].startTick > splitTick) {
            verse0Coda.push(verse0Lines[li]);
        } else {
            verse0Repeated.push(verse0Lines[li]);
        }
    }

    var outputMV = "";
    outputMV += formatTitle(title);
    var lastChordMV = null;

    var firstTickMV = verse0Repeated.length > 0 ? verse0Repeated[0].startTick : 0;

    // Labels of a tick range, for the block that covers it. Each block formats on its
    // own, so it only gets the labels of its own range: handing it earlier ones would
    // dump them all at the top of the block.
    function labelsInRangeMV(fromTick, toTick) {
        if (!data.systemTexts) return null;
        var picked = [];
        for (var lsi = 0; lsi < data.systemTexts.length; lsi++) {
            var lsTick = data.systemTexts[lsi].tick;
            if (lsTick < fromTick) continue;
            if (toTick >= 0 && lsTick >= toTick) continue;
            picked.push(data.systemTexts[lsi]);
        }
        return picked;
    }

    // Labels before the first lyric, as in the single verse path
    if (data.systemTexts) {
        var introCountersMV = {};
        for (var stiMV = 0; stiMV < data.systemTexts.length; stiMV++) {
            if (data.systemTexts[stiMV].tick < firstTickMV) {
                var introLabelMV = mods.Formatter.renderLabel(data.systemTexts[stiMV].text, introCountersMV);
                if (introLabelMV !== null) outputMV += "- " + introLabelMV + " -\n";
            }
        }
    }

    var introChordsMV = mods.ChordUtils.getChordsInRange(chords, 0, firstTickMV, null);
    if (introChordsMV.length > 0) {
        outputMV += mods.Formatter.wrapChordLine(introChordsMV.join("  "), 70) + "\n\n";
        lastChordMV = introChordsMV[introChordsMV.length - 1];
    }

    var repeatEndTickMV = (verse0Coda.length > 0) ? verse0Coda[0].startTick : -1;

    // Where the chords of a verse block stop. With a coda block it is its start; with
    // none it is the end of the lyrics, so the chords that follow stay for the outro
    // instead of being appended to the last line of every verse.
    var verseChordToMV = repeatEndTickMV;
    if (verseChordToMV < 0 && verse0Repeated.length > 0) {
        verseChordToMV = verse0Repeated[verse0Repeated.length - 1].endTick + 1;
    }

    var lastChordTickMV = -1;

    if (verse0Repeated.length > 0) {
        mods.LineBuilder.applyStanzaFormatting(verse0Repeated);
        var res0MV = mods.Formatter.formatLines(verse0Repeated, chords, lastChordMV, verseChordToMV,
            labelsInRangeMV(firstTickMV, repeatEndTickMV));
        outputMV += res0MV.output || res0MV;
        lastChordMV = res0MV.lastChord || lastChordMV;
        if (res0MV.lastChordTick !== undefined && res0MV.lastChordTick > lastChordTickMV) {
            lastChordTickMV = res0MV.lastChordTick;
        }

        // Instrumental outro: the chords after the last lyric, printed once, right here
        // where the music has them. The verses that follow only repeat their stanzas, so
        // a short or orphan verse stays the last thing in the output.
        var outroFromMV = Math.max(verse0Repeated[verse0Repeated.length - 1].endTick, lastChordTickMV);
        var outroChordsMV = mods.ChordUtils.getChordsInRange(chords, outroFromMV + 1, -1, lastChordMV);
        if (outroChordsMV.length > 0) {
            outputMV += mods.Formatter.wrapChordLine(outroChordsMV.join("  "), 70) + "\n";
            lastChordMV = outroChordsMV[outroChordsMV.length - 1];
        }
    }

    for (var v5 = 1; v5 < verseNums.length; v5++) {
        var vn5 = verseNums[v5];
        var vLines5 = verseLines[vn5];
        if (!vLines5 || vLines5.length === 0) continue;

        // A verse that only marks a few notes borrows the layout of the first verse, so
        // its stanza keeps its label and its whole chord line (spec 7.1.3)
        var vSyls5 = mods.Expander.filterSylsByVerse(syllables, vn5);
        var framed5 = null;
        if (isSparseVerse(verse0Lines, vSyls5)) {
            var labelTicks5 = [];
            if (data.systemTexts) {
                for (var lt5 = 0; lt5 < data.systemTexts.length; lt5++) {
                    labelTicks5.push(data.systemTexts[lt5].tick);
                }
            }
            framed5 = alignVerseOntoFrame(verse0Lines, vSyls5, vn5, mods, labelTicks5);
            if (framed5.length > 0) vLines5 = framed5;
        }

        outputMV += "\n";
        if (!framed5) mods.LineBuilder.applyStanzaFormatting(vLines5);
        var chordTo5 = verseChordToMV;
        if (framed5) {
            // A framed block is one stanza: its chords stop where the stanza does, or the
            // next stanza would leak into its chord line
            chordTo5 = vLines5[vLines5.length - 1].endTick + 1;
        }
        var res5MV = mods.Formatter.formatLines(vLines5, chords, lastChordMV, chordTo5,
            labelsInRangeMV(vLines5[0].startTick, repeatEndTickMV));
        var out5 = res5MV.output || res5MV;
        // A framed block pads its lyric line to the width of the frame so the chords keep
        // their columns; the padding has no business in the output
        if (framed5) out5 = out5.replace(/[ \t]+$/gm, "");
        outputMV += out5;
        lastChordMV = res5MV.lastChord || lastChordMV;
        if (res5MV.lastChordTick !== undefined && res5MV.lastChordTick > lastChordTickMV) {
            lastChordTickMV = res5MV.lastChordTick;
        }
    }
    if (verse0Coda.length > 0) {
        outputMV += "\n";
        mods.LineBuilder.applyStanzaFormatting(verse0Coda);
        var resCMV = mods.Formatter.formatLines(verse0Coda, chords, lastChordMV, -1,
            labelsInRangeMV(verse0Coda[0].startTick, -1));
        outputMV += resCMV.output || resCMV;
        lastChordMV = resCMV.lastChord || lastChordMV;
        if (resCMV.lastChordTick !== undefined && resCMV.lastChordTick > lastChordTickMV) {
            lastChordTickMV = resCMV.lastChordTick;
        }
    }

    return outputMV;
}

// A section replayed with no lyrics keeps its own heading, but a label carrying a
// template ("Estrofa #", "Estrofa 1::2::3::") cannot be rendered here: the sequence
// belongs to the passes that sing it, and advancing it for an instrumental replay would
// take a number out of turn. Such a label prints nothing rather than its template.
function instrumentalLabel(text) {
    if (!text) return null;
    if (/#|:/.test(text)) return null;
    return text.toUpperCase();
}

// Unified expansion path: handles repeats and/or navigation via Expander
function processWithExpander(data, mods) {
    var syllables = data.syllables;
    var chords = data.chords;
    var title = data.title || "";

    var Expander = mods.Expander;
    var expandedStream = Expander.expand(data);

    if (expandedStream.length === 0) return null;

    var allStreamSyls = expandedStream;

    // Detect navigation segments for boundary markers
    var segments = Expander.unwind(data);
    var segmentBoundaryTicks = {};
    for (var sbt = 0; sbt < allStreamSyls.length; sbt++) {
        if (allStreamSyls[sbt].segmentBoundary) segmentBoundaryTicks[allStreamSyls[sbt].tick] = true;
    }

    // Repair broken syllabic chains before system text processing.
    // This fixes cases where two words are incorrectly hyphenated as one
    // (e.g. "canción" + "Aquella" as a single chain in SerenataAndaluza).
    mods.WordBuilder.repairSyllabicChains(allStreamSyls);

    // System texts: adjust stanza breaks when system texts exist
    var sysTexts = data.systemTexts || [];
    if (sysTexts.length > 0) {
        // Note: sectionEnd from sectionBar within repeats (verse transitions)
        // generates a blank line between verses of the same label. This is
        // acceptable: suppressing it would also affect stanza formatting
        // (period/comma, capitalization).
        // System texts force stanza breaks. Find matching positions across
        // all repeat passes (same tick range can appear multiple times).
        for (var st = 0; st < sysTexts.length; st++) {
            var stTick = sysTexts[st].tick;
            var lastMatchTick = -1;
            for (var si2 = 0; si2 < allStreamSyls.length - 1; si2++) {
                if (allStreamSyls[si2].sectionEnd) continue;
                var curTick = allStreamSyls[si2].tick;
                var nextTick = allStreamSyls[si2 + 1].tick;
                if (stTick > curTick && stTick <= nextTick) {
                    var syl2 = allStreamSyls[si2].syllabic;
                    if (syl2 === "single" || syl2 === "end") {
                        allStreamSyls[si2].sectionEnd = true;
                    }
                    lastMatchTick = curTick;
                    // Continue scanning to find repeat passes, but skip
                    // adjacent syllables at the same tick to avoid double-marking
                    while (si2 + 1 < allStreamSyls.length - 1 &&
                           allStreamSyls[si2 + 1].tick === curTick) {
                        si2++;
                    }
                }
            }
        }
    }

    // Build words and lines from the combined stream
    var streamWords = mods.WordBuilder.buildWords(allStreamSyls, -1);
    var streamLines = mods.LineBuilder.buildLinesFromWords(streamWords, chords);
    streamLines = mods.LineBuilder.splitLongLines(streamLines, allStreamSyls);
    streamLines = mods.LineBuilder.mergeShortLines(streamLines);

    // Mark lines that contain or end at a segment boundary.
    // Check both endTick and any tick in sylMap (lead-in syllables may remap
    // their tick away from the original segmentBoundary position).
    for (var sbl = 0; sbl < streamLines.length; sbl++) {
        var line = streamLines[sbl];
        if (segmentBoundaryTicks[line.endTick]) {
            line.segmentBoundary = true;
        } else if (line.sylMap) {
            for (var sm2 = 0; sm2 < line.sylMap.length; sm2++) {
                if (segmentBoundaryTicks[line.sylMap[sm2].tick]) {
                    line.segmentBoundary = true;
                    break;
                }
            }
        }
    }

    // Tell each line that starts a replay where the jump landed, so the labels of the
    // sections before that point are not emitted again: a Da Segno replays from the segno,
    // not from the top of the score.
    var replayStarts = [];
    for (var rsg = 0; rsg < segments.length; rsg++) {
        if (segments[rsg].segmentBoundary) replayStarts.push(segments[rsg].mainFrom);
    }
    var rsIdx = 0;
    for (var rl = 0; rl < streamLines.length - 1; rl++) {
        if (!streamLines[rl].segmentBoundary) continue;
        var nextLine = streamLines[rl + 1];
        if (nextLine.startTick >= streamLines[rl].startTick) continue; // not a backwards jump
        if (rsIdx < replayStarts.length) {
            nextLine.replayFromTick = replayStarts[rsIdx];
            rsIdx++;
        }
    }

    // Split into stanzas and format
    var currentStanza = [];
    for (var sl = 0; sl < streamLines.length; sl++) {
        currentStanza.push(streamLines[sl]);
        if (streamLines[sl].sectionEnd || sl === streamLines.length - 1) {
            mods.LineBuilder.applyStanzaFormatting(currentStanza);
            currentStanza = [];
        }
    }

    // Intro chords
    var firstSylTick = allStreamSyls.length > 0 ? allStreamSyls[0].tick : 0;
    var introChords;
    var rawRepeats = data.repeats || [];
    var rawVoltas = data.voltas || [];
    var introHasRepeats = false;
    for (var ir = 0; ir < rawRepeats.length; ir++) {
        if (rawRepeats[ir].endTick <= firstSylTick) { introHasRepeats = true; break; }
    }
    if (introHasRepeats) {
        var introRepStruct = {
            repeats: rawRepeats.filter(function(r) { return r.endTick <= firstSylTick; }),
            voltas: rawVoltas.filter(function(v) { return v.endTick <= firstSylTick; }),
            sections: Expander.buildSections(
                rawRepeats.filter(function(r) { return r.endTick <= firstSylTick; }),
                rawVoltas.filter(function(v) { return v.endTick <= firstSylTick; })
            )
        };
        introChords = mods.IntroChords.buildIntroChordsPerf(chords, introRepStruct, syllables, firstSylTick);
    } else {
        introChords = mods.ChordUtils.getChordsInRange(chords, 0, firstSylTick, null);
    }

    // Home chord
    var homeChord = null;
    if (rawRepeats.length > 0) {
        var sections = Expander.buildSections(rawRepeats, rawVoltas);
        for (var hi = 0; hi < sections.length; hi++) {
            var hSec = sections[hi];
            var hMainEnd = hSec.volta1 ? hSec.volta1.startTick : hSec.repeat.endTick;
            var hMainSyls = Expander.filterSylsByRange(syllables, hSec.repeat.startTick, hMainEnd);
            if (hMainSyls.length > 0) {
                homeChord = mods.ChordUtils.findChordAtTick(chords, hSec.repeat.startTick);
                break;
            }
        }
    } else {
        homeChord = mods.ChordUtils.findChordAtTick(chords, firstSylTick);
    }

    var repStart = rawRepeats.length > 0 ? rawRepeats[0].startTick : -1;
    var result = mods.Formatter.formatPerfLines(streamLines, introChords, homeChord, title, chords, syllables, data.systemTexts, data.fullRepeat, repStart, rawRepeats);
    var output = result.text ? result.text : result;

    // Detect instrumental gaps in the D.S. replay stream: sections where
    // there are system text labels + chords but no lyrics. These get
    // inserted into the output at the D.S. transition point.
    if (sysTexts.length > 0 && allStreamSyls.length > 0) {
        var dsInsertions = [];
        for (var dsi = 1; dsi < allStreamSyls.length; dsi++) {
            var prev = allStreamSyls[dsi - 1];
            var curr = allStreamSyls[dsi];
            // Detect D.S. transition: normal→replay OR replay→replay (new replay group).
            // A replay→replay transition: prev is a replay syl with segmentBoundary AND
            // curr goes back to a tick before firstSylTick (returning to the intro/segno area).
            var isReplayToReplay = curr._jumpReplay && prev.segmentBoundary &&
                prev._jumpReplay && curr.tick <= firstSylTick;
            if (curr._jumpReplay && (dsi === 1 || !prev._jumpReplay || isReplayToReplay)) {
                // Find system texts in the gap between D.S. jump target and first lyric.
                // For lead-in replays, curr.tick is already remapped to the jump target.
                // For segmentBoundary-based replays (no lead-in), curr.tick is the first
                // lyric tick; resolve the actual jump target from markers.
                var dsTargetTick = curr.tick;
                if (isReplayToReplay && dsTargetTick >= firstSylTick) {
                    // For replay→replay transitions without lead-in, resolve the actual
                    // jump target (segno tick) from named markers only (not "start").
                    var _jmps = data.jumps || [], _mrks = data.markers || [];
                    for (var _ji = 0; _ji < _jmps.length; _ji++) {
                        var _jt = _jmps[_ji];
                        if (!_jt.jumpTo || _jt.jumpTo === "start") continue;
                        for (var _mi = 0; _mi < _mrks.length; _mi++) {
                            if (_mrks[_mi].label === _jt.jumpTo) {
                                dsTargetTick = Math.min(dsTargetTick, _mrks[_mi].tick);
                                break;
                            }
                        }
                    }
                }
                // Find the first D.S. lyric at a DIFFERENT tick (skip lead-in
                // syllables which share the remapped tick with the target)
                var gapEndTick = dsTargetTick;
                for (var dsk = dsi; dsk < allStreamSyls.length; dsk++) {
                    if (allStreamSyls[dsk]._jumpReplay && allStreamSyls[dsk].tick !== dsTargetTick) {
                        gapEndTick = allStreamSyls[dsk].tick;
                        break;
                    }
                }
                // When the lead-in is the last stream entry (DC replay is all
                // instrumental), use firstSylTick as the gap end.
                if (gapEndTick <= dsTargetTick && dsTargetTick < firstSylTick) {
                    gapEndTick = firstSylTick;
                }
                if (gapEndTick <= dsTargetTick) continue;
                // Find all labels in the gap (instrumental sections)
                var gapLabels = [];
                for (var dsl = 0; dsl < sysTexts.length; dsl++) {
                    var lt = sysTexts[dsl].tick;
                    if (lt >= dsTargetTick && lt < gapEndTick) {
                        gapLabels.push(sysTexts[dsl]);
                    }
                }
                // Emit labels + interlude chords for gaps with labels.
                // For DC/DS al Coda, build the chord sequence following the
                // actual navigation path: start to coda mark, then codab to end.
                // For simple DS, use introChords when available.
                var dcCodaTick = -1, dcCodabTick = -1;
                var markers = data.markers || [];
                var jumps = data.jumps || [];
                for (var jdi = 0; jdi < jumps.length; jdi++) {
                    if (jumps[jdi].playUntil && jumps[jdi].continueAt) {
                        for (var mdi = 0; mdi < markers.length; mdi++) {
                            if (markers[mdi].label === jumps[jdi].playUntil) dcCodaTick = markers[mdi].tick;
                            if (markers[mdi].label === jumps[jdi].continueAt) dcCodabTick = markers[mdi].tick;
                        }
                    }
                }
                // For DC/DS al Coda, filter out labels that fall in the
                // skipped range (between coda mark and codab), since the
                // playback jumps over that region.
                if (dcCodaTick >= 0 && dcCodabTick >= 0) {
                    gapLabels = gapLabels.filter(function(gl) {
                        return gl.tick <= dcCodaTick || gl.tick >= dcCodabTick;
                    });
                }

                for (var dgl = 0; dgl < gapLabels.length; dgl++) {
                    var glFrom = gapLabels[dgl].tick;
                    var glTo = (dgl + 1 < gapLabels.length) ? gapLabels[dgl + 1].tick : gapEndTick;
                    var glChords;
                    // Use DC/DS al Coda chord path only when the replay is
                    // fully instrumental (gap covers dsTargetTick to coda).
                    // When the replay includes lyrics (like Malagueña), the gap
                    // is just the instrumental intro portion, handled by introChords.
                    var replayAllInstrumental = dcCodaTick >= 0 && dcCodabTick >= 0 &&
                        gapEndTick >= dcCodaTick;
                    if (replayAllInstrumental && glFrom <= firstSylTick) {
                        // DC/DS al Coda: chords from label to coda mark (inclusive),
                        // then codab to end (no dedup across the jump).
                        glChords = mods.ChordUtils.getChordsInRange(chords, glFrom, dcCodaTick + 1, null);
                        var codabChords = mods.ChordUtils.getChordsInRange(chords, dcCodabTick - 1, -1, null);
                        glChords = glChords.concat(codabChords);
                    } else if (introChords && introChords.length > 0 && glFrom <= firstSylTick) {
                        glChords = introChords;
                    } else {
                        glChords = mods.ChordUtils.getChordsInRange(chords, glFrom, glTo, null);
                    }
                    var gapRendered = instrumentalLabel(gapLabels[dgl].text);
                    var insertion = gapRendered === null ? "" : "\n- " + gapRendered + " -\n";
                    // In compact mode, omit chords if they're the same as intro
                    // (already shown at the top, no new information).
                    // For DC/DS al Coda with fully instrumental replay, always show.
                    var hasCoda = replayAllInstrumental;
                    if (glChords.length > 0 && (data.fullRepeat || hasCoda)) {
                        insertion += mods.Formatter.wrapChordLine(glChords.join("  "), 70) + "\n";
                    }
                    dsInsertions.push(insertion);
                }
            }
        }
        // Insert the D.S. instrumental sections into the output.
        // Find the first D.S. label in the output (the label that follows
        // the gap, e.g. "ESTROFA 3") and insert before it.
        if (dsInsertions.length > 0) {
            // Each dsInsertion corresponds to one replay group.
            // Insert each one before its corresponding replay label occurrence
            // (1st insertion before 2nd label occurrence, 2nd before 3rd, etc.)
            // Process in reverse order to preserve string offsets.
            var insertLabel2 = "";
            for (var dil = 0; dil < sysTexts.length; dil++) {
                if (sysTexts[dil].tick === gapEndTick) {
                    insertLabel2 = sysTexts[dil].text;
                    break;
                }
            }
            if (insertLabel2) {
                var labelUpper = insertLabel2.toUpperCase();
                var labelLastSpace = labelUpper.lastIndexOf(" ");
                var labelBase = labelUpper;
                if (labelLastSpace >= 0) {
                    var labelTail = labelUpper.substring(labelLastSpace + 1);
                    if (labelTail.indexOf(":") >= 0 || labelTail.indexOf("#") >= 0 ||
                        labelTail.split("-").length >= 3) {
                        labelBase = labelUpper.substring(0, labelLastSpace).trim();
                    }
                }
                labelBase = labelBase.replace(/#/g, "").trim();
                var labelMarker = "- " + labelBase;
                // Find all occurrences of this label in the output
                var allPositions = [];
                var searchPos = 0;
                while (true) {
                    var idx = output.indexOf(labelMarker, searchPos);
                    if (idx < 0) break;
                    allPositions.push(idx);
                    searchPos = idx + labelMarker.length;
                }
                // Each dsInsertion maps to the (i+1)th label occurrence (skip the 1st = normal play)
                // Process in reverse to preserve positions
                for (var di2 = dsInsertions.length - 1; di2 >= 0; di2--) {
                    var targetOccurrence = di2 + 1; // 0-indexed: 1st insertion → 2nd occurrence
                    var insertPos = -1;
                    if (targetOccurrence < allPositions.length) {
                        insertPos = allPositions[targetOccurrence];
                    } else if (allPositions.length >= 1) {
                        insertPos = allPositions[allPositions.length - 1];
                    }
                    if (insertPos >= 0) {
                        var lineStart = output.lastIndexOf("\n", insertPos - 1);
                        if (lineStart < 0) lineStart = 0;
                        output = output.substring(0, lineStart) + "\n" + dsInsertions[di2] + output.substring(lineStart);
                    } else {
                        output += dsInsertions[di2];
                    }
                }
            } else {
                output += dsInsertions.join("");
            }
        }
        // Collapse triple-newlines introduced by the insertion
        output = output.replace(/\n{3,}/g, "\n\n");
    }

    // Append instrumental segments from navigation (D.C. replay sections with no lyrics).
    // Skip segments already handled by the D.S./D.C. gap detection above.
    // Fallback: for D.C. replay sections that were not handled by dsInsertions
    // (e.g. when dsInsertions handled only the first replay but not subsequent ones).
    var numDsInsertionsHandled = dsInsertions ? dsInsertions.length : 0;
    if (data.jumps && data.jumps.length > 0 && (numDsInsertionsHandled === 0 || data.jumps.length > numDsInsertionsHandled)) {
        var navPlan = Expander.buildPlaybackPlan(data.markers || [], data.jumps, data.lastTick || 0);
        if (navPlan) {
            for (var ip = 0; ip < navPlan.length; ip++) {
                var iSeg = navPlan[ip];
                var iSegSyls = Expander.filterSylsByRange(syllables, iSeg.fromTick, iSeg.toTick);
                if (iSegSyls.length === 0) {
                    var iEndTick = iSeg.toTick;
                    for (var isy = 0; isy < syllables.length; isy++) {
                        if (syllables[isy].tick >= iSeg.fromTick) {
                            iEndTick = syllables[isy].tick;
                            break;
                        }
                    }
                    var iChords = mods.ChordUtils.getChordsInRange(chords, iSeg.fromTick, iEndTick, null);
                    if (iChords.length > 0) {
                        var iLabel = "";
                        if (sysTexts.length > 0) {
                            for (var ist = 0; ist < sysTexts.length; ist++) {
                                if (sysTexts[ist].tick >= iSeg.fromTick && sysTexts[ist].tick < iEndTick) {
                                    iLabel = sysTexts[ist].text;
                                    break;
                                }
                            }
                        }
                        var isRepeatOfIntro = introChords && introChords.length > 0 &&
                            iChords.length === introChords.length &&
                            iChords.join(",") === introChords.join(",");
                        var iRendered = instrumentalLabel(iLabel);
                        if (isRepeatOfIntro && iLabel) {
                            if (iRendered !== null) output += "\n- " + iRendered + " -\n";
                        } else {
                            if (iRendered !== null) output += "\n- " + iRendered + " -\n";
                            output += mods.Formatter.wrapChordLine(iChords.join("  "), 70) + "\n";
                        }
                    }
                }
            }
        }
    }

    // Verses no pass sings, when the extra lyrics option asks for them (spec 7.1.2)
    if (data.extraLyrics) {
        var orphans = orphanVerses(data, mods);
        if (orphans.length > 0) output += extraVerseStanzas(data, mods, orphans, chords);
    }

    return output;
}

if (typeof exports !== "undefined") {
    // Auto-wire modules for Node.js / CLI usage
    var ChordUtils = require("./chord-utils");
    var WordBuilder = require("./word-builder");
    var LineBuilder = require("./line-builder");
    var Expander = require("./expander");
    var IntroChords = require("./intro-chords");
    var Formatter = require("./formatter");

    var defaultMods = {
        ChordUtils: ChordUtils,
        WordBuilder: WordBuilder,
        LineBuilder: LineBuilder,
        Expander: Expander,
        IntroChords: IntroChords,
        Formatter: Formatter
    };

    exports.processExtraction = function(data) {
        return processExtraction(data, defaultMods);
    };

    // Also export the raw function for custom module injection
    exports.processExtractionWithMods = processExtraction;

    exports.orphanVerses = function(data) {
        return orphanVerses(data, defaultMods);
    };
}
