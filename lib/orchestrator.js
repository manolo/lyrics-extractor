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
    var barlines = data.barlines || [];
    if (barlines.length > 0) {
        var barTicks = {};
        for (var bi = 0; bi < barlines.length; bi++) barTicks[barlines[bi].tick] = true;
        var division = data.division || 480;
        for (var si = 0; si < syllables.length; si++) {
            if (syllables[si].sectionBar) continue; // already marked
            var sylEnd = syllables[si].tick + Math.round((syllables[si].durationQ || 1) * division);
            if (barTicks[sylEnd]) {
                syllables[si].sectionBar = true;
                continue;
            }
            // Check if a barline falls between this syllable and the next in the same verse
            for (var sj = si + 1; sj < syllables.length; sj++) {
                if (syllables[sj].verse === syllables[si].verse) {
                    for (var bk = 0; bk < barlines.length; bk++) {
                        if (barlines[bk].tick > syllables[si].tick && barlines[bk].tick <= syllables[sj].tick) {
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

        // Coda instrumental: chords after the last chord already emitted by formatLines
        var lastEndTick1v = lines0[lines0.length - 1].endTick;
        var codaFromTick1v = Math.max(lastEndTick1v, res1v.lastChordTick || -1);
        var codaChords1v = mods.ChordUtils.getChordsInRange(chords, codaFromTick1v + 1, -1, res1v.lastChord || null);
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

    var lastChordTickMV = -1;
    if (verse0Coda.length > 0) {
        outputMV += "\n";
        mods.LineBuilder.applyStanzaFormatting(verse0Coda);
        var resCMV = mods.Formatter.formatLines(verse0Coda, chords, lastChordMV, -1, null);
        outputMV += resCMV.output || resCMV;
        lastChordMV = resCMV.lastChord || lastChordMV;
        if (resCMV.lastChordTick !== undefined && resCMV.lastChordTick > lastChordTickMV) {
            lastChordTickMV = resCMV.lastChordTick;
        }
    }

    // Coda instrumental: chords after all lyrics (skip chords already emitted by formatLines)
    var allLines = verse0Coda.length > 0 ? verse0Coda : verse0Repeated;
    if (allLines.length > 0) {
        var lastEndTickMV = allLines[allLines.length - 1].endTick;
        var codaFromTickMV = Math.max(lastEndTickMV, lastChordTickMV);
        var codaChordsMV = mods.ChordUtils.getChordsInRange(chords, codaFromTickMV + 1, -1, lastChordMV);
        if (codaChordsMV.length > 0) {
            outputMV += "\n" + mods.Formatter.wrapChordLine(codaChordsMV.join("  "), 70) + "\n";
        }
    }

    return outputMV;
}

// Unified expansion path: handles repeats and/or navigation via Expander
function processWithExpander(data, mods) {
    var syllables = data.syllables;
    var chords = data.chords;
    var title = data.title || "";

    var Expander = mods.Expander;
    var allStreamSyls = Expander.expand(data);

    if (allStreamSyls.length === 0) return null;

    // Detect navigation segments for boundary markers
    var segments = Expander.unwind(data);
    var segmentBoundaryTicks = {};
    for (var sbt = 0; sbt < allStreamSyls.length; sbt++) {
        if (allStreamSyls[sbt].segmentBoundary) segmentBoundaryTicks[allStreamSyls[sbt].tick] = true;
    }

    // System texts: disable heuristic stanza breaks when system texts exist
    var sysTexts = data.systemTexts || [];
    if (sysTexts.length > 0) {
        // Remove heuristic stanza breaks (punctuation + rest + uppercase)
        for (var sb = 0; sb < allStreamSyls.length - 1; sb++) {
            // Keep sectionEnd from expand's own logic (section bars, backwards tick),
            // but remove the natural break heuristic ones.
            // Actually, expand already handles this, but the system text force-break
            // logic needs to be applied here.
        }
        // System texts force stanza breaks
        for (var st = 0; st < sysTexts.length; st++) {
            var stTick = sysTexts[st].tick;
            for (var si2 = 0; si2 < allStreamSyls.length - 1; si2++) {
                if (allStreamSyls[si2].sectionEnd) continue;
                var curTick = allStreamSyls[si2].tick;
                var nextTick = allStreamSyls[si2 + 1].tick;
                if (stTick > curTick && stTick <= nextTick) {
                    var syl2 = allStreamSyls[si2].syllabic;
                    if (syl2 === "single" || syl2 === "end") {
                        allStreamSyls[si2].sectionEnd = true;
                    }
                    break;
                }
            }
        }
    }

    // Build words and lines from the combined stream
    var streamWords = mods.WordBuilder.buildWords(allStreamSyls, -1);
    var streamLines = mods.LineBuilder.buildLinesFromWords(streamWords, chords);
    streamLines = mods.LineBuilder.splitLongLines(streamLines);
    streamLines = mods.LineBuilder.mergeShortLines(streamLines);

    // Mark lines that end at a segment boundary
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

    // Append instrumental segments from navigation (D.C. replay sections with no lyrics)
    if (data.jumps && data.jumps.length > 0) {
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
                        if (isRepeatOfIntro && iLabel) {
                            output += "\n- " + iLabel.toUpperCase() + " -\n";
                        } else {
                            if (iLabel) output += "\n- " + iLabel.toUpperCase() + " -\n";
                            output += mods.Formatter.wrapChordLine(iChords.join("  "), 70) + "\n";
                        }
                    }
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
}
