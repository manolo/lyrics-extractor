// Intro chord extraction in performance order
// Shared between MuseScore extension and Node.js CLI

// Mirror of chord-utils.js:getChordsInRange (QML import compatibility)
function _getChordsInRange(chords, fromTick, toTick, lastChord) {
    var result = [];
    for (var i = 0; i < chords.length; i++) {
        if (chords[i].tick < fromTick) continue;
        if (toTick >= 0 && chords[i].tick >= toTick) break;
        if (chords[i].chord !== lastChord) {
            result.push(chords[i].chord);
            lastChord = chords[i].chord;
        }
    }
    return result;
}

// Mirror of performance-stream.js:filterSylsByRange (QML import compatibility)
function _filterSylsByRange(syllables, fromTick, toTick) {
    var result = [];
    for (var i = 0; i < syllables.length; i++) {
        if (syllables[i].tick >= fromTick && (toTick < 0 || syllables[i].tick < toTick)) {
            result.push(syllables[i]);
        }
    }
    return result;
}

// Build intro chords in performance order, respecting repeat bars and volta brackets.
// Walks repeat sections that are purely instrumental (no lyrics) and expands them
// with the correct number of passes, then adds gap chords up to the first lyric.
function buildIntroChordsPerf(chords, repStruct, syllables, firstStreamTick) {
    var result = [];
    var lastChord = null;

    function addChordsInRange(from, to) {
        var rangeChords = _getChordsInRange(chords, from, to, lastChord);
        for (var i = 0; i < rangeChords.length; i++) {
            result.push(rangeChords[i]);
            lastChord = rangeChords[i];
        }
    }

    var lastSectionEnd = 0;

    for (var sIdx = 0; sIdx < repStruct.sections.length; sIdx++) {
        var sec = repStruct.sections[sIdx];
        var rep = sec.repeat;

        var mainEnd = sec.volta1 ? sec.volta1.startTick : rep.endTick;
        var mainSyls = _filterSylsByRange(syllables, rep.startTick, mainEnd);
        var hasLyrics = mainSyls.length > 0;

        // Gap before this section
        if (rep.startTick > lastSectionEnd) {
            addChordsInRange(lastSectionEnd, rep.startTick);
        }

        if (!hasLyrics) {
            // Instrumental section: expand with repeats and voltas
            var hasVoltaPair = sec.volta1 && sec.volta2;
            var numPasses = 2;

            for (var pass = 0; pass < numPasses; pass++) {
                // Don't suppress the first chord of each pass (reset dedup at repeat boundary)
                lastChord = null;
                addChordsInRange(rep.startTick, mainEnd);

                if (hasVoltaPair) {
                    var passVolta = (pass === 0) ? sec.volta1 : sec.volta2;
                    if (passVolta) {
                        addChordsInRange(passVolta.startTick, passVolta.endTick);
                    }
                } else if (sec.volta1) {
                    if (pass === 0) {
                        addChordsInRange(sec.volta1.startTick, sec.volta1.endTick);
                    } else {
                        var v1Dur = sec.volta1.endTick - sec.volta1.startTick;
                        addChordsInRange(rep.endTick, rep.endTick + v1Dur);
                    }
                }
            }

            // Update lastSectionEnd
            if (sec.volta1 && !hasVoltaPair) {
                var nrs = (sIdx + 1 < repStruct.sections.length)
                    ? repStruct.sections[sIdx + 1].repeat.startTick : Infinity;
                if (nrs > rep.endTick) {
                    var vDur = sec.volta1.endTick - sec.volta1.startTick;
                    lastSectionEnd = rep.endTick + vDur;
                } else {
                    lastSectionEnd = sec.sectionEnd;
                }
            } else {
                lastSectionEnd = sec.sectionEnd;
            }
        } else {
            // Section with lyrics: add chords from repeat start to first lyric tick.
            // Advance lastSectionEnd so the post-loop gap-chords pass does not
            // duplicate the same range when the repeat itself starts at tick 0.
            addChordsInRange(rep.startTick, firstStreamTick);
            lastSectionEnd = firstStreamTick;
            break;
        }
    }

    // If no sections at all, just get chords before first lyric
    if (repStruct.sections.length === 0) {
        addChordsInRange(0, firstStreamTick);
    } else {
        // Add gap chords between last section end and first lyric
        addChordsInRange(lastSectionEnd, firstStreamTick);
    }

    return result;
}

if (typeof exports !== "undefined") {
    exports.buildIntroChordsPerf = buildIntroChordsPerf;
}
