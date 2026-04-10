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

function processExtraction(data, mods) {
    var syllables = data.syllables;
    var chords = data.chords;
    var title = data.title || "";


    if (!syllables || syllables.length === 0) {
        return null;
    }

    // Convert chord names: solfeo by default, anglo if explicitly requested
    if (chords.length > 0) {
        if (data.solfeo === false) {
            mods.ChordUtils.convertChordsToAnglo(chords);
        } else {
            mods.ChordUtils.convertChordsToSolfeo(chords);
        }
    }

    // Check for navigation jumps (D.S., D.C., Coda, Fine)
    var hasJumps = data.jumps && data.jumps.length > 0;
    if (hasJumps && mods.Navigation) {
        return processWithNavigation(data, mods);
    }

    // Build repeat structure sections from raw repeats/voltas
    var repStruct = {
        repeats: data.repeats || [],
        voltas: data.voltas || [],
        sections: mods.RepeatStructure.buildSections(data.repeats || [], data.voltas || [])
    };

    var hasVoltas = repStruct.voltas.length > 0 || repStruct.repeats.length > 0;

    // Find unique verses
    var verseSet = {};
    for (var i = 0; i < syllables.length; i++) {
        verseSet[syllables[i].verse] = true;
    }
    var verseNums = Object.keys(verseSet).map(function(k) { return parseInt(k); }).sort();

    // ========================================
    // REPEAT/VOLTA-AWARE EXTRACTION (performance stream)
    // ========================================
    if (hasVoltas) {
        var stream = mods.PerfStream.buildPerformanceStream(syllables, chords, repStruct);

        if (stream.length === 0) return null;

        // Intro chords in performance order
        var introChords = mods.IntroChords.buildIntroChordsPerf(chords, repStruct, syllables, stream[0].tick);

        // Build words and lines from the performance stream
        var streamWords = mods.WordBuilder.buildWords(stream, -1);
        var streamLines = mods.LineBuilder.buildLinesFromWords(streamWords, chords);
        streamLines = mods.LineBuilder.splitLongLines(streamLines);
        streamLines = mods.LineBuilder.mergeShortLines(streamLines);

        // Split lines into stanzas by sectionEnd markers and format each
        var currentStanza = [];
        for (var sl = 0; sl < streamLines.length; sl++) {
            currentStanza.push(streamLines[sl]);
            if (streamLines[sl].sectionEnd || sl === streamLines.length - 1) {
                mods.LineBuilder.applyStanzaFormatting(currentStanza);
                currentStanza = [];
            }
        }

        // Home chord: chord at the start of the first repeat section with lyrics
        var homeChord = null;
        for (var hi = 0; hi < repStruct.sections.length; hi++) {
            var hSec = repStruct.sections[hi];
            var hMainEnd = hSec.volta1 ? hSec.volta1.startTick : hSec.repeat.endTick;
            var hMainSyls = mods.PerfStream.filterSylsByRange(syllables, hSec.repeat.startTick, hMainEnd);
            if (hMainSyls.length > 0) {
                homeChord = mods.ChordUtils.findChordAtTick(chords, hSec.repeat.startTick);
                break;
            }
        }

        var result = mods.Formatter.formatPerfLines(streamLines, introChords, homeChord, title, chords, syllables, data.systemTexts, data.fullRepeat);
        return result.text ? result.text : result;
    }

    // ========================================
    // NO VOLTAS: simple verse handling
    // ========================================

    // Build lines for each verse
    var verseLines = {};
    for (var v = 0; v < verseNums.length; v++) {
        var vn = verseNums[v];
        var words = mods.WordBuilder.buildWords(syllables, vn);
        if (words.length > 0) {
            verseLines[vn] = mods.LineBuilder.mergeShortLines(
                mods.LineBuilder.splitLongLines(
                    mods.LineBuilder.buildLinesFromWords(words, chords)));
        }
    }

    // Single verse: simple output
    if (verseNums.length === 1) {
        var output1v = "";
        output1v += formatTitle(title);

        var lines0 = verseLines[verseNums[0]];
        mods.LineBuilder.applyStanzaFormatting(lines0);

        var firstLineTick = (lines0.length > 0) ? lines0[0].startTick : 0;

        // System texts before intro chords
        if (data.systemTexts) {
            for (var sti = 0; sti < data.systemTexts.length; sti++) {
                if (data.systemTexts[sti].tick < firstLineTick) {
                    output1v += "- " + data.systemTexts[sti].text.toUpperCase() + " -\n";
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

        // Coda instrumental
        var lastEndTick1v = lines0[lines0.length - 1].endTick;
        var codaChords1v = mods.ChordUtils.getChordsInRange(chords, lastEndTick1v, -1, res1v.lastChord || null);
        if (codaChords1v.length > 0) {
            output1v += "\n" + mods.Formatter.wrapChordLine(codaChords1v.join("  "), 70) + "\n";
        }

        return output1v;
    }

    // Multiple verses without voltas: interleave by verse end tick
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
            if (splitTick < 0 || et < splitTick) splitTick = et;
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
    var introChordsMV = mods.ChordUtils.getChordsInRange(chords, 0, firstTickMV, null);
    if (introChordsMV.length > 0) {
        outputMV += mods.Formatter.wrapChordLine(introChordsMV.join("  "), 70) + "\n\n";
        lastChordMV = introChordsMV[introChordsMV.length - 1];
    }

    var repeatEndTickMV = (verse0Coda.length > 0) ? verse0Coda[0].startTick : -1;

    if (verse0Repeated.length > 0) {
        mods.LineBuilder.applyStanzaFormatting(verse0Repeated);
        var res0MV = mods.Formatter.formatLines(verse0Repeated, chords, lastChordMV, repeatEndTickMV, null);
        outputMV += res0MV.output || res0MV;
        lastChordMV = res0MV.lastChord || lastChordMV;
    }

    for (var v5 = 1; v5 < verseNums.length; v5++) {
        var vn5 = verseNums[v5];
        var vLines5 = verseLines[vn5];
        if (!vLines5 || vLines5.length === 0) continue;

        outputMV += "\n";
        mods.LineBuilder.applyStanzaFormatting(vLines5);
        var res5MV = mods.Formatter.formatLines(vLines5, chords, lastChordMV, repeatEndTickMV, null);
        outputMV += res5MV.output || res5MV;
        lastChordMV = res5MV.lastChord || lastChordMV;
    }

    if (verse0Coda.length > 0) {
        outputMV += "\n";
        mods.LineBuilder.applyStanzaFormatting(verse0Coda);
        var resCMV = mods.Formatter.formatLines(verse0Coda, chords, lastChordMV, -1, null);
        outputMV += resCMV.output || resCMV;
        lastChordMV = resCMV.lastChord || lastChordMV;
    }

    // Coda instrumental: chords after all lyrics
    var allLines = verse0Coda.length > 0 ? verse0Coda : verse0Repeated;
    if (allLines.length > 0) {
        var lastEndTickMV = allLines[allLines.length - 1].endTick;
        var codaChordsMV = mods.ChordUtils.getChordsInRange(chords, lastEndTickMV, -1, lastChordMV);
        if (codaChordsMV.length > 0) {
            outputMV += "\n" + mods.Formatter.wrapChordLine(codaChordsMV.join("  "), 70) + "\n";
        }
    }

    return outputMV;
}

// Process extraction when navigation jumps (D.S., D.C., Coda, Fine) are present.
// Builds a playback plan from markers/jumps, then processes each segment in order.
function processWithNavigation(data, mods) {
    var syllables = data.syllables;
    var chords = data.chords;
    var title = data.title || "";

    var markers = data.markers || [];
    var jumps = data.jumps || [];
    var lastTick = data.lastTick || 0;

    var plan = mods.Navigation.buildPlaybackPlan(markers, jumps, lastTick);
    if (!plan || plan.length === 0) {
        // Fallback: no valid plan, treat as linear
        return processExtraction({
            syllables: syllables,
            chords: chords,
            title: title,
            repeats: data.repeats || [],
            voltas: data.voltas || [],
            division: data.division
        }, mods);
    }

    // For each plan segment, extract syllables in that tick range
    // and build the performance stream respecting honorRepeats
    var allStreamSyls = [];
    var fullRepeat = data.fullRepeat || false;
    var consumedSyls = {}; // track tick_verse keys already output

    for (var pi = 0; pi < plan.length; pi++) {
        var seg = plan[pi];

        // Count how many previous segments overlap with this one (for verse selection).
        // D.C. replays from tick 0, D.S. replays from segno: both overlap earlier segments.
        var overlapCount = 0;
        for (var pj = 0; pj < pi; pj++) {
            if (seg.fromTick < plan[pj].toTick && seg.toTick > plan[pj].fromTick) {
                overlapCount++;
            }
        }

        // D.S./D.C. replay: always produce lyrics. If all verses are consumed,
        // the verseOffset will wrap around to verse 0 (song repeats with same lyrics).

        // Filter syllables in this tick range.
        // Include gap syllables before the segment start that lead into
        // the first repeat (e.g. "En esta noche" before Segno).
        // Only extend for segments that replay earlier content (D.S./D.C.),
        // not for coda segments that follow a ToCoda.
        var segFromTick = seg.fromTick;
        if (seg.fromTick > 0 && pi > 0 && seg.fromTick < plan[pi - 1].toTick) {
            // This segment replays earlier content (its fromTick < previous segment's toTick)
            for (var gs = 0; gs < syllables.length; gs++) {
                if (syllables[gs].tick >= seg.fromTick) break;
                if (syllables[gs].tick >= seg.fromTick - 2000 && syllables[gs].verse === 0) {
                    segFromTick = syllables[gs].tick;
                    break;
                }
            }
        }
        // Extend toTick to include the end of the current phrase
        // (syllables just after the segment boundary until punctuation or big gap)
        // Do NOT extend past a coda/continueAt marker (content between ToCoda and Coda is skipped)
        var segToTick = seg.toTick;
        var maxExtendTick = seg.toTick + 5000;
        for (var mk = 0; mk < markers.length; mk++) {
            if (markers[mk].tick > seg.toTick && markers[mk].tick < maxExtendTick) {
                maxExtendTick = markers[mk].tick;
            }
        }
        for (var et = 0; et < syllables.length; et++) {
            if (syllables[et].tick >= seg.toTick && syllables[et].tick < maxExtendTick) {
                segToTick = syllables[et].tick + 1;
                var lastCh = syllables[et].text.charAt(syllables[et].text.length - 1);
                if (lastCh === '.' || lastCh === '!' || lastCh === '?' || lastCh === ',' || lastCh === ';') {
                    break;
                }
                if (syllables[et].restAfter && syllables[et].restDurationQ >= 2) {
                    break;
                }
            } else if (syllables[et].tick >= maxExtendTick) {
                break;
            }
        }
        var segSyls = mods.PerfStream.filterSylsByRange(syllables, segFromTick, segToTick);

        // Build repeat/volta structure within this segment
        var segRepeats = [];
        var segVoltas = [];

        if (seg.honorRepeats) {
            var rawRepeats = data.repeats || [];
            var rawVoltas = data.voltas || [];
            for (var ri = 0; ri < rawRepeats.length; ri++) {
                var rep = rawRepeats[ri];
                if (rep.startTick >= seg.fromTick && rep.endTick <= seg.toTick) {
                    segRepeats.push(rep);
                }
            }
            for (var vi = 0; vi < rawVoltas.length; vi++) {
                var vol = rawVoltas[vi];
                if (vol.startTick >= seg.fromTick && vol.endTick <= seg.toTick) {
                    segVoltas.push(vol);
                }
            }
        }

        var hasRepeatStructure = segRepeats.length > 0 || segVoltas.length > 0;

        // Mark section boundary between plan segments
        if (pi > 0 && allStreamSyls.length > 0) {
            allStreamSyls[allStreamSyls.length - 1].sectionEnd = true;
            allStreamSyls[allStreamSyls.length - 1].segmentBoundary = true;
        }

        // Instrumental segment (chords but no syllables): append as coda chords after output
        if (segSyls.length === 0) {
            continue;
        }

        if (hasRepeatStructure && segSyls.length > 0) {
            // Use performance stream for segments with repeat structure.
            // For D.S./D.C. replay, compute verse offset: count how many passes
            // were already consumed by earlier segments for repeats in this range.
            var verseOffset = 0;
            if (overlapCount > 0) {
                // Count consumed verses in the repeat range
                for (var ri2 = 0; ri2 < segRepeats.length; ri2++) {
                    var rr = segRepeats[ri2];
                    var consumedInRepeat = 0;
                    var versesSeen = {};
                    for (var ck in consumedSyls) {
                        var parts = ck.split("_");
                        var cTick = parseInt(parts[0]);
                        var cVerse = parseInt(parts[1]);
                        if (cTick >= rr.startTick && cTick < rr.endTick && !versesSeen[cVerse]) {
                            versesSeen[cVerse] = true;
                            consumedInRepeat++;
                        }
                    }
                    verseOffset = Math.max(verseOffset, consumedInRepeat);
                }
            }
            var segRepStruct = {
                repeats: segRepeats,
                voltas: segVoltas,
                sections: mods.RepeatStructure.buildSections(segRepeats, segVoltas)
            };
            var stream = mods.PerfStream.buildPerformanceStream(segSyls, chords, segRepStruct, verseOffset);
            for (var ss = 0; ss < stream.length; ss++) {
                allStreamSyls.push(stream[ss]);
                consumedSyls[stream[ss].tick + "_" + stream[ss].verse] = true;
            }
        } else {
            // Linear playback: select verse based on overlap count.
            // First visit uses verse 0, second (D.S./D.C. replay) uses verse 1, etc.
            var targetVerse = overlapCount;

            // For each tick position, pick targetVerse if available, else verse 0.
            // This handles sections where some ticks have multi-verse and others have single verse.
            var sylsByTick = {};
            for (var vs = 0; vs < segSyls.length; vs++) {
                var tk = segSyls[vs].tick;
                if (!sylsByTick[tk]) sylsByTick[tk] = {};
                sylsByTick[tk][segSyls[vs].verse] = segSyls[vs];
            }

            var selectedSyls = [];
            var tickKeys = Object.keys(sylsByTick).map(function(k) { return parseInt(k); }).sort(function(a, b) { return a - b; });
            for (var ti = 0; ti < tickKeys.length; ti++) {
                var tickSyls = sylsByTick[tickKeys[ti]];
                var picked = tickSyls[targetVerse] || tickSyls[0];
                if (!picked) {
                    var firstKey = Object.keys(tickSyls)[0];
                    picked = tickSyls[firstKey];
                }
                if (picked) selectedSyls.push(picked);
            }

            for (var ls = 0; ls < selectedSyls.length; ls++) {
                var syl = selectedSyls[ls];
                allStreamSyls.push({
                    tick: syl.tick,
                    verse: syl.verse,
                    text: syl.text,
                    syllabic: syl.syllabic,
                    durationQ: syl.durationQ,
                    restAfter: syl.restAfter,
                    restDurationQ: syl.restDurationQ,
                    gapDurationQ: syl.gapDurationQ,
                    activeChord: mods.ChordUtils.findChordAtTick(chords, syl.tick),
                    sectionEnd: false,
                    inStream: true
                });
                consumedSyls[syl.tick + "_" + syl.verse] = true;
            }
        }
    }

    if (allStreamSyls.length === 0) return null;

    // Recompute gaps in the assembled stream
    mods.PerfStream.recomputeStreamGaps(allStreamSyls);

    // Detect natural stanza breaks within continuous sections.
    // Skip this heuristic when system texts exist: the labels already define
    // the section structure and the user can add more labels to create paragraphs.
    var sysTexts = data.systemTexts || [];
    if (sysTexts.length === 0) {
        for (var sb = 0; sb < allStreamSyls.length - 1; sb++) {
            if (allStreamSyls[sb].sectionEnd) continue;
            var sbSyl = allStreamSyls[sb];
            var sbNext = allStreamSyls[sb + 1];
            var isWE = (sbSyl.syllabic === "end" || sbSyl.syllabic === "single");
            if (!isWE) continue;
            var lastCh = sbSyl.text.charAt(sbSyl.text.length - 1);
            if (lastCh !== '.' && lastCh !== '!' && lastCh !== '?') continue;
            if (!sbSyl.restAfter || sbSyl.restDurationQ < 2) continue;
            var firstCh = sbNext.text.charAt(0);
            if (firstCh === firstCh.toUpperCase() && firstCh !== firstCh.toLowerCase()) {
                sbSyl.sectionEnd = true;
            }
        }
    }

    // System texts force stanza breaks: mark sectionEnd on the syllable
    // just before each system text tick (if it falls between two syllables)
    if (sysTexts.length > 0) {
        for (var st = 0; st < sysTexts.length; st++) {
            var stTick = sysTexts[st].tick;
            for (var si2 = 0; si2 < allStreamSyls.length - 1; si2++) {
                if (allStreamSyls[si2].sectionEnd) continue;
                var curTick = allStreamSyls[si2].tick;
                var nextTick = allStreamSyls[si2 + 1].tick;
                // System text falls between current and next syllable
                if (stTick > curTick && stTick <= nextTick) {
                    // Only break at word end (single or end syllabic)
                    var syl2 = allStreamSyls[si2].syllabic;
                    if (syl2 === "single" || syl2 === "end") {
                        allStreamSyls[si2].sectionEnd = true;
                    }
                    break;
                }
            }
        }
    }

    // Collect segment boundary ticks
    var segmentBoundaryTicks = {};
    for (var sbt = 0; sbt < allStreamSyls.length; sbt++) {
        if (allStreamSyls[sbt].segmentBoundary) segmentBoundaryTicks[allStreamSyls[sbt].tick] = true;
    }

    // Build words and lines from the combined stream
    var streamWords = mods.WordBuilder.buildWords(allStreamSyls, -1);
    var streamLines = mods.LineBuilder.buildLinesFromWords(streamWords, chords);
    streamLines = mods.LineBuilder.splitLongLines(streamLines);
    streamLines = mods.LineBuilder.mergeShortLines(streamLines);

    // Mark lines that end at a segment boundary (D.S./D.C. transition)
    for (var sbl = 0; sbl < streamLines.length; sbl++) {
        if (segmentBoundaryTicks[streamLines[sbl].endTick]) {
            streamLines[sbl].segmentBoundary = true;
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

    // Intro chords: use performance-aware expansion if repeats exist in intro area
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
            sections: mods.RepeatStructure.buildSections(
                rawRepeats.filter(function(r) { return r.endTick <= firstSylTick; }),
                rawVoltas.filter(function(v) { return v.endTick <= firstSylTick; })
            )
        };
        introChords = mods.IntroChords.buildIntroChordsPerf(chords, introRepStruct, syllables, firstSylTick);
    } else {
        introChords = mods.ChordUtils.getChordsInRange(chords, 0, firstSylTick, null);
    }

    // Home chord: first chord at or before the first lyric
    var homeChord = mods.ChordUtils.findChordAtTick(chords, firstSylTick);

    var result2 = mods.Formatter.formatPerfLines(streamLines, introChords, homeChord, title, chords, syllables, data.systemTexts, data.fullRepeat);
    var output = result2.text ? result2.text : result2;

    // Append instrumental segments from the plan (D.C. replay sections with no lyrics)
    for (var ip = 0; ip < plan.length; ip++) {
        var iSeg = plan[ip];
        var iSegSyls = mods.PerfStream.filterSylsByRange(syllables, iSeg.fromTick, iSeg.toTick);
        if (iSegSyls.length === 0) {
            // Use chords up to the first syllable after this segment's start
            // (not limited by plan toTick, since instrumental chords may extend further)
            var iEndTick = iSeg.toTick;
            for (var isy = 0; isy < syllables.length; isy++) {
                if (syllables[isy].tick >= iSeg.fromTick) {
                    iEndTick = syllables[isy].tick;
                    break;
                }
            }
            var iChords = mods.ChordUtils.getChordsInRange(chords, iSeg.fromTick, iEndTick, null);
            if (iChords.length > 0) {
                // Check if this instrumental section has a system text label
                var iLabel = "";
                if (sysTexts.length > 0) {
                    for (var ist = 0; ist < sysTexts.length; ist++) {
                        if (sysTexts[ist].tick >= iSeg.fromTick && sysTexts[ist].tick < iEndTick) {
                            iLabel = sysTexts[ist].text;
                            break;
                        }
                    }
                }
                // If chords are identical to the intro and there's a label, show only the label
                var isRepeatOfIntro = introChords && introChords.length > 0 &&
                    iChords.length === introChords.length &&
                    iChords.join(",") === introChords.join(",");
                if (isRepeatOfIntro && iLabel) {
                    output += "\n- " + iLabel.toUpperCase() + " -\n";
                } else {
                    if (iLabel) output += "\n- " + iLabel.toUpperCase() + " -\n";
                    output += mods.Formatter.wrapChordLine(iChords.join("  "), 70) + "\n";
                }
            }
        }
    }

    return output;
}

if (typeof exports !== "undefined") {
    // Auto-wire modules for Node.js / CLI usage
    var ChordUtils = require("./chord-utils");
    var WordBuilder = require("./word-builder");
    var LineBuilder = require("./line-builder");
    var RepeatStructure = require("./repeat-structure");
    var PerfStream = require("./performance-stream");
    var IntroChords = require("./intro-chords");
    var Formatter = require("./formatter");
    var Navigation = require("./navigation");

    var defaultMods = {
        ChordUtils: ChordUtils,
        WordBuilder: WordBuilder,
        LineBuilder: LineBuilder,
        RepeatStructure: RepeatStructure,
        PerfStream: PerfStream,
        IntroChords: IntroChords,
        Formatter: Formatter,
        Navigation: Navigation
    };

    exports.processExtraction = function(data) {
        return processExtraction(data, defaultMods);
    };

    // Also export the raw function for custom module injection
    exports.processExtractionWithMods = processExtraction;
}
