// Performance stream: builds flat syllable list in singing order
// Handles repeats, volta brackets, and multi-verse content
// Shared between MuseScore extension and Node.js CLI

// --- Internal utility functions (self-contained, no cross-module deps) ---

// Mirror of ChordUtils.findChordAtTick (duplicated for QML import compatibility)
function _findChordAtTick(chords, tick) {
    var activeChord = null;
    for (var i = 0; i < chords.length; i++) {
        if (chords[i].tick <= tick) {
            activeChord = chords[i].chord;
        } else {
            break;
        }
    }
    return activeChord;
}

// Mirror of ChordUtils.hasChordEntryBetween (duplicated for QML import compatibility)
function _hasChordEntryBetween(chords, fromTick, toTick) {
    for (var i = 0; i < chords.length; i++) {
        if (chords[i].tick > fromTick && chords[i].tick <= toTick) return true;
        if (chords[i].tick > toTick) break;
    }
    return false;
}

function filterSylsByRange(syllables, fromTick, toTick) {
    var result = [];
    for (var i = 0; i < syllables.length; i++) {
        if (syllables[i].tick >= fromTick && (toTick < 0 || syllables[i].tick < toTick)) {
            result.push(syllables[i]);
        }
    }
    return result;
}

function filterSylsByVerse(syllables, verse) {
    var result = [];
    for (var i = 0; i < syllables.length; i++) {
        if (syllables[i].verse === verse) result.push(syllables[i]);
    }
    return result;
}

// Clone a syllable with pre-assigned chord for performance stream
function cloneSyl(syl, chords) {
    return {
        tick: syl.tick,
        verse: syl.verse,
        text: syl.text,
        syllabic: syl.syllabic,
        durationQ: syl.durationQ,
        restAfter: syl.restAfter,
        restDurationQ: syl.restDurationQ,
        gapDurationQ: syl.gapDurationQ,
        activeChord: _findChordAtTick(chords, syl.tick),
        sectionEnd: false,
        sectionBar: syl.sectionBar || false,
        inStream: true
    };
}

// Recompute gap/rest values for performance stream syllables using
// verse-specific tick differences
function recomputeStreamGaps(stream) {
    for (var i = 0; i < stream.length - 1; i++) {
        if (stream[i].sectionEnd || stream[i].noBreakAfter) continue;
        var curr = stream[i];
        var next = stream[i + 1];
        var tickGap = next.tick - curr.tick;
        if (tickGap > 0) {
            var gapAfterNote = (tickGap / 480) - curr.durationQ;
            if (gapAfterNote > 0.25) {
                curr.gapDurationQ = gapAfterNote;
                curr.restAfter = true;
                curr.restDurationQ = gapAfterNote;
            }
        }
    }
}

// Build a flat syllable list in performance (singing) order.
// verseOffset: skip this many verses (for D.S./D.C. replay with consumed verses)
function buildPerformanceStream(syllables, chords, repStruct, verseOffset) {
    var stream = [];
    var lastSectionEnd = 0;

    // Build chord list excluding chords inside volta brackets
    var chordsNoVolta = [];
    for (var ci = 0; ci < chords.length; ci++) {
        var inVolta = false;
        for (var vi = 0; vi < repStruct.voltas.length; vi++) {
            if (chords[ci].tick >= repStruct.voltas[vi].startTick &&
                chords[ci].tick < repStruct.voltas[vi].endTick) {
                inVolta = true;
                break;
            }
        }
        if (!inVolta) chordsNoVolta.push(chords[ci]);
    }

    for (var sIdx = 0; sIdx < repStruct.sections.length; sIdx++) {
        var sec = repStruct.sections[sIdx];
        var rep = sec.repeat;

        // Main section tick range (before volta)
        var mainEnd = sec.volta1 ? sec.volta1.startTick : rep.endTick;
        var mainSyls = filterSylsByRange(syllables, rep.startTick, mainEnd);

        // Find verses in main section
        var mainVerseSet = {};
        for (var mv = 0; mv < mainSyls.length; mv++) mainVerseSet[mainSyls[mv].verse] = true;
        var mainVerses = Object.keys(mainVerseSet).map(function(k) { return parseInt(k); }).sort();

        // Volta syllables and verse count
        var voltaSyls = sec.volta1 ? filterSylsByRange(syllables, sec.volta1.startTick, sec.volta1.endTick) : [];
        var voltaVerseSet = {};
        for (var vv = 0; vv < voltaSyls.length; vv++) voltaVerseSet[voltaSyls[vv].verse] = true;
        var voltaVerseCount = Object.keys(voltaVerseSet).length;

        var hasVoltaPair = sec.volta1 && sec.volta2;
        // Number of passes: use explicit repeatCount when available (e.g. 3x),
        // otherwise infer from verse count capped at 2 (standard repeat).
        var hasExplicitCount = rep.repeatCount && rep.repeatCount > 2;
        var numPasses;
        if (hasExplicitCount) {
            numPasses = rep.repeatCount;
        } else {
            numPasses = Math.min(mainVerses.length, 2);
        }
        if (hasVoltaPair) numPasses = Math.max(numPasses, 2);
        if (voltaVerseCount > numPasses && !hasExplicitCount) numPasses = Math.min(voltaVerseCount, 2);
        if (numPasses < 1) numPasses = 1;

        // Apply verse offset: shift mainVerses for D.S./D.C. replay
        var vOff = verseOffset || 0;
        if (vOff > 0 && mainVerses.length > vOff) {
            mainVerses = mainVerses.slice(vOff);
            numPasses = Math.min(mainVerses.length, 2);
            if (numPasses < 1) numPasses = 1;
        }

        // Gap before repeat (lyrics between sections)
        var gapSyls = [];
        if (rep.startTick > lastSectionEnd) {
            var rawGap = filterSylsByRange(syllables, lastSectionEnd, rep.startTick);
            var gapV0 = filterSylsByVerse(rawGap, 0);
            gapSyls = gapV0.length > 0 ? gapV0 : rawGap;
        }

        // Section break between different repeat blocks
        if (sIdx > 0 && stream.length > 0) {
            stream[stream.length - 1].sectionEnd = true;
        }

        var prevPassHadVolta = false;

        for (var pass = 0; pass < numPasses; pass++) {
            // Suppress phrase break at pass transition
            if (pass > 0 && stream.length > 0) {
                if (prevPassHadVolta) {
                    var last = stream[stream.length - 1];
                    last.sectionEnd = true;
                    last.restAfter = false;
                    last.restDurationQ = 0;
                    last.gapDurationQ = 0;
                    last.durationQ = Math.min(last.durationQ, 1);
                } else {
                    stream[stream.length - 1].sectionEnd = true;
                }
            }

            // Pass 0 only: prepend gap syllables
            if (pass === 0 && gapSyls.length > 0) {
                for (var g = 0; g < gapSyls.length; g++) {
                    stream.push(cloneSyl(gapSyls[g], chordsNoVolta));
                }
            }

            // Main section: use verse for this pass
            var mainVerse = mainVerses.length > pass ? mainVerses[pass] : mainVerses[0];
            var mainFiltered = filterSylsByVerse(mainSyls, mainVerse);

            // Detect verse 0 "tail" (e.g. estribillo): single-verse syllables
            // that exist beyond where other verses end (spec 7.6).
            var tailStartTick = -1;
            if (mainVerses.length > 1) {
                // Find the last tick of non-zero verses
                var otherLastTick = -1;
                for (var ov = 0; ov < mainVerses.length; ov++) {
                    if (mainVerses[ov] === 0) continue;
                    var otherSyls = filterSylsByVerse(mainSyls, mainVerses[ov]);
                    if (otherSyls.length > 0 && otherSyls[otherSyls.length - 1].tick > otherLastTick) {
                        otherLastTick = otherSyls[otherSyls.length - 1].tick;
                    }
                }
                // Check if verse 0 has syllables beyond where other verses end
                var v0All = filterSylsByVerse(mainSyls, 0);
                for (var tv = 0; tv < v0All.length; tv++) {
                    if (v0All[tv].tick > otherLastTick) {
                        tailStartTick = v0All[tv].tick;
                        break;
                    }
                }
            }

            // For non-zero verses, append verse 0 tail syllables (estribillo)
            if (mainVerse !== 0 && tailStartTick >= 0) {
                var v0Tail = filterSylsByVerse(mainSyls, 0);
                for (var t = 0; t < v0Tail.length; t++) {
                    if (v0Tail[t].tick >= tailStartTick) {
                        mainFiltered.push(v0Tail[t]);
                    }
                }
            }

            for (var m = 0; m < mainFiltered.length; m++) {
                var mClone = cloneSyl(mainFiltered[m], chordsNoVolta);
                if (m > 0 && !_hasChordEntryBetween(chordsNoVolta, mainFiltered[m - 1].tick, mainFiltered[m].tick)) {
                    mClone.activeChord = null;
                }
                stream.push(mClone);
                // Mark section boundary at the transition to verse 0 tail
                if (tailStartTick >= 0 && mainFiltered[m].tick < tailStartTick &&
                    m + 1 < mainFiltered.length && mainFiltered[m + 1].tick >= tailStartTick) {
                    mClone.sectionEnd = true;
                }
            }

            // Volta content for this pass.
            // Check endingList: if the volta specifies which passes it applies to
            // (e.g. [1,2] for passes 1 and 2), skip it on non-matching passes.
            prevPassHadVolta = false;
            if (hasVoltaPair) {
                var passVolta = (pass === 0) ? sec.volta1 : sec.volta2;
                if (passVolta) {
                    var vAll = filterSylsByRange(syllables, passVolta.startTick, passVolta.endTick);
                    var vV0 = filterSylsByVerse(vAll, 0);
                    var vUse = vV0.length > 0 ? vV0 : vAll;
                    for (var vsi = 0; vsi < vUse.length; vsi++) {
                        stream.push(cloneSyl(vUse[vsi], chords));
                    }
                    prevPassHadVolta = vUse.length > 0;
                }
            } else if (sec.volta1) {
                var v1Endings = sec.volta1.endingList || [];
                var voltaApplies = v1Endings.length === 0 || v1Endings.indexOf(pass + 1) >= 0;
                if (voltaApplies) {
                    // Select volta verse: use volta's own verse list when available,
                    // falling back to the main section verse for the pass.
                    var voltaVerses = Object.keys(voltaVerseSet).map(function(k){ return parseInt(k); }).sort();
                    var voltaVerse = voltaVerses.length > pass ? voltaVerses[pass] : mainVerse;
                    var voltaFiltered = filterSylsByVerse(voltaSyls, voltaVerse);
                    if (voltaFiltered.length === 0) {
                        voltaFiltered = filterSylsByVerse(voltaSyls, 0);
                    }
                    for (var vj = 0; vj < voltaFiltered.length; vj++) {
                        stream.push(cloneSyl(voltaFiltered[vj], chords));
                    }
                    prevPassHadVolta = voltaFiltered.length > 0;
                } else if (stream.length > 0) {
                    // Volta skipped on this pass: cap trailing chords at the
                    // volta start so chords from the volta range are not emitted.
                    stream[stream.length - 1].endChordTick = sec.volta1.startTick;
                }
            }

            // Implicit second ending
            if (pass === numPasses - 1 && !prevPassHadVolta && sec.volta1 && !hasVoltaPair && mainFiltered.length > 0) {
                var nextRepStart = (sIdx + 1 < repStruct.sections.length)
                    ? repStruct.sections[sIdx + 1].repeat.startTick : Infinity;
                if (nextRepStart > rep.endTick) {
                    var v1Dur = sec.volta1.endTick - sec.volta1.startTick;
                    var v2End = Math.min(rep.endTick + v1Dur, nextRepStart);
                    var implicitV2 = filterSylsByRange(syllables, rep.endTick, v2End);
                    if (implicitV2.length > 0) {
                        if (stream.length > 0) {
                            var lastBefore = stream[stream.length - 1];
                            lastBefore.noBreakAfter = true;
                            lastBefore.restAfter = false;
                            lastBefore.restDurationQ = 0;
                            lastBefore.gapDurationQ = 0;
                            lastBefore.durationQ = Math.min(lastBefore.durationQ, 1);
                        }
                        var impV0 = filterSylsByVerse(implicitV2, 0);
                        var impUse = impV0.length > 0 ? impV0 : implicitV2;

                        var repBaseChord = _findChordAtTick(chordsNoVolta, rep.startTick);
                        var impV2Chords = [];
                        var skippedBase = false;
                        for (var ic = 0; ic < chordsNoVolta.length; ic++) {
                            if (chordsNoVolta[ic].tick < rep.endTick) continue;
                            if (v2End >= 0 && chordsNoVolta[ic].tick >= v2End) break;
                            if (!skippedBase && chordsNoVolta[ic].chord === repBaseChord) {
                                skippedBase = true;
                                continue;
                            }
                            impV2Chords.push(chordsNoVolta[ic]);
                        }
                        for (var imp = 0; imp < impUse.length; imp++) {
                            var impClone = cloneSyl(impUse[imp], chordsNoVolta);
                            impClone.activeChord = _findChordAtTick(impV2Chords, impUse[imp].tick);
                            stream.push(impClone);
                        }
                    }
                }
            }
        }

        // Update lastSectionEnd
        if (sec.volta1 && !hasVoltaPair && mainSyls.length > 0) {
            var nrs = (sIdx + 1 < repStruct.sections.length)
                ? repStruct.sections[sIdx + 1].repeat.startTick : Infinity;
            if (nrs > rep.endTick) {
                var vDur = sec.volta1.endTick - sec.volta1.startTick;
                var impEnd = Math.min(rep.endTick + vDur, nrs);
                var impCheck = filterSylsByRange(syllables, rep.endTick, impEnd);
                lastSectionEnd = impCheck.length > 0 ? impEnd : sec.sectionEnd;
            } else {
                lastSectionEnd = sec.sectionEnd;
            }
        } else {
            lastSectionEnd = sec.sectionEnd;
        }
    }

    // Coda: content after the last section
    var codaSyls = filterSylsByRange(syllables, lastSectionEnd, -1);
    if (codaSyls.length > 0) {
        // Only force section break if the last syllable ends a phrase
        // (rest, punctuation). Otherwise let the natural break detection handle it.
        if (stream.length > 0) {
            var lastSyl = stream[stream.length - 1];
            var lastText = lastSyl.text || "";
            var lastChar = lastText.charAt(lastText.length - 1);
            if (lastSyl.restAfter || lastChar === '.' || lastChar === '!' || lastChar === '?') {
                lastSyl.sectionEnd = true;
            }
        }
        var codaV0 = filterSylsByVerse(codaSyls, 0);
        var codaUse = codaV0.length > 0 ? codaV0 : codaSyls;
        for (var c = 0; c < codaUse.length; c++) {
            stream.push(cloneSyl(codaUse[c], chordsNoVolta));
        }
    }

    // Recompute gaps using verse-specific tick differences
    recomputeStreamGaps(stream);

    // Detect natural stanza breaks within continuous sections
    for (var sb = 0; sb < stream.length - 1; sb++) {
        if (stream[sb].sectionEnd) continue;
        var sbSyl = stream[sb];
        var sbNext = stream[sb + 1];

        // Section barline (end, double, final) forces a stanza break
        if (sbSyl.sectionBar) {
            sbSyl.sectionEnd = true;
            continue;
        }

        // Backwards tick jump = section boundary (repeat pass transition)
        // But skip if volta transition already suppressed the break (smooth flow)
        if (sbNext.tick < sbSyl.tick && !sbSyl.noBreakAfter) {
            sbSyl.sectionEnd = true;
            continue;
        }

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

    return stream;
}

if (typeof exports !== "undefined") {
    exports.buildPerformanceStream = buildPerformanceStream;
    exports.filterSylsByRange = filterSylsByRange;
    exports.filterSylsByVerse = filterSylsByVerse;
    exports.cloneSyl = cloneSyl;
    exports.recomputeStreamGaps = recomputeStreamGaps;
}
