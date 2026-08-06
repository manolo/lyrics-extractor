// Expander: unified repeat + navigation expansion
// Replaces repeat-structure.js, performance-stream.js, navigation.js
// Shared between MuseScore extension and Node.js CLI
//
// Public API:
//   unwind(data)              -> segments[]
//   materialize(segments, data) -> stream[]
//   expand(data)              -> stream[] (unwind + materialize)
//
// Also re-exports utility functions used by other modules:
//   filterSylsByRange, filterSylsByVerse, cloneSyl, recomputeStreamGaps

// ========================================
// Utility functions (moved from performance-stream.js)
// ========================================

// Mirror of chord-utils.findChordAtTick (kept in sync by mirror-sync.test.js):
// a text annotation never displaces a harmony that shares its tick.
function _findChordAtTick(chords, tick) {
    var activeChord = null;
    var activeTick = -1;
    var activeIsText = false;
    for (var i = 0; i < chords.length; i++) {
        if (chords[i].tick > tick) break;
        var isText = !!chords[i].isText;
        if (chords[i].tick === activeTick && isText && !activeIsText) continue;
        activeChord = chords[i].chord;
        activeTick = chords[i].tick;
        activeIsText = isText;
    }
    return activeChord;
}

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

// ========================================
// Section building (from repeat-structure.js, enhanced)
// ========================================

function _buildSections(repeats, voltas) {
    var sections = [];
    var usedVoltas = {};

    for (var r = 0; r < repeats.length; r++) {
        var rep = repeats[r];
        var nextRepStart = (r + 1 < repeats.length)
            ? repeats[r + 1].startTick : Infinity;

        var section = { repeat: rep, volta1: null, volta2: null };

        for (var v = 0; v < voltas.length; v++) {
            if (usedVoltas[v]) continue;
            var vt = voltas[v];
            if (vt.startTick >= rep.startTick && vt.startTick < rep.endTick) {
                section.volta1 = vt;
                usedVoltas[v] = true;
                break;
            }
        }

        for (var v2 = 0; v2 < voltas.length; v2++) {
            if (usedVoltas[v2]) continue;
            var vt2 = voltas[v2];
            if (vt2.startTick >= rep.endTick && vt2.startTick < nextRepStart) {
                section.volta2 = vt2;
                usedVoltas[v2] = true;
                break;
            }
        }

        section.sectionEnd = section.volta2 ? section.volta2.endTick : rep.endTick;

        sections.push(section);
    }

    return sections;
}

// ========================================
// Unwind: measure-based expansion (faithful C++ translation)
// ========================================
//
// Translates MuseScore's RepeatList::collectRepeatListElements (lines 393-682)
// and RepeatList::unwind (lines 830-1116) from repeatlist.cpp.
//
// Produces segments in playback order. Each segment is a tick range:
// { fromTick, toTick, playbackCount, repeatStartTick, isJumpReplay }

// Check if a volta's endings list includes the given pass number
function _voltaHasEnding(endings, pass) {
    if (!endings || endings.length === 0) return pass === 1;
    for (var i = 0; i < endings.length; i++) {
        if (endings[i] === pass) return true;
    }
    return false;
}

// Get the last (highest) ending number from a volta
function _voltaLastEnding(endings) {
    if (!endings || endings.length === 0) return 1;
    var max = 0;
    for (var i = 0; i < endings.length; i++) {
        if (endings[i] > max) max = endings[i];
    }
    return max;
}

// Get the first (lowest) ending number from a volta
function _voltaFirstEnding(endings) {
    if (!endings || endings.length === 0) return 1;
    var min = endings[0];
    for (var i = 1; i < endings.length; i++) {
        if (endings[i] < min) min = endings[i];
    }
    return min || 1;
}

// GCD of two numbers
function _gcd(a, b) {
    a = Math.abs(a); b = Math.abs(b);
    while (b) { var t = b; b = a % b; a = t; }
    return a;
}

// MuseScore RIGHT_MARKERS: FINE, TOCODA, TOCODASYM, DA_CODA, DA_DBLCODA
function _isRightMarker(markerType) {
    return markerType === "fine" || markerType === "tocoda" ||
           markerType === "tocodasym" || markerType === "da_coda" || markerType === "da_dblcoda";
}

// Compute measure size from GCD of all boundary-aligned ticks
function _computeMeasureSize(data) {
    var ticks = [];
    var repeats = data.repeats || [];
    var voltas = data.voltas || [];
    var markers = data.markers || [];
    var jumps = data.jumps || [];
    var syls = data.syllables || [];
    for (var i = 0; i < repeats.length; i++) {
        if (repeats[i].startTick > 0) ticks.push(repeats[i].startTick);
        if (repeats[i].endTick > 0) ticks.push(repeats[i].endTick);
    }
    for (var i = 0; i < voltas.length; i++) {
        if (voltas[i].startTick > 0) ticks.push(voltas[i].startTick);
        if (voltas[i].endTick > 0) ticks.push(voltas[i].endTick);
    }
    // Markers and jumps are NOT measure boundaries. They occur within measures.
    // Including them in the GCD would create artificial micro-measures that split
    // real measures (e.g. a tocoda in the middle of a measure).
    // Jumps at tick+1 are structural but only for segment ordering, not measures.

    for (var i = 0; i < syls.length; i++) {
        if (syls[i].tick > 0) ticks.push(syls[i].tick);
    }
    if (data.lastTick > 0) ticks.push(data.lastTick);
    if (ticks.length === 0) return 480;
    var g = ticks[0];
    for (var i = 1; i < ticks.length; i++) {
        g = _gcd(g, ticks[i]);
        if (g <= 1) return 1;
    }
    return g || 480;
}

// Build measure list with properties assigned
function _buildMeasures(data) {
    var repeats = data.repeats || [];
    var voltas = data.voltas || [];
    var markers = data.markers || [];
    var jumps = data.jumps || [];

    // Derive lastTick
    var lastTick = data.lastTick || 0;
    if (!lastTick) {
        var syls = data.syllables || [];
        for (var i = 0; i < syls.length; i++) {
            if (syls[i].tick > lastTick) lastTick = syls[i].tick;
        }
        for (var i = 0; i < repeats.length; i++) {
            if (repeats[i].endTick > lastTick) lastTick = repeats[i].endTick;
        }
        for (var i = 0; i < voltas.length; i++) {
            if (voltas[i].endTick > lastTick) lastTick = voltas[i].endTick;
        }
        for (var i = 0; i < jumps.length; i++) {
            if (jumps[i].tick + 1 > lastTick) lastTick = jumps[i].tick + 1;
        }
        if (lastTick === 0) lastTick = 480;
    }

    var mSize = _computeMeasureSize(data);
    var numMeasures = Math.ceil(lastTick / mSize);
    if (numMeasures < 1) numMeasures = 1;

    var measures = [];
    for (var i = 0; i < numMeasures; i++) {
        measures.push({
            idx: i,
            tick: i * mSize,
            endTick: (i + 1) * mSize,
            repeatStart: false,
            repeatEnd: false,
            repeatCount: 2,
            markers: [],
            jumps: []
        });
    }

    // Assign repeat start/end to measures
    for (var r = 0; r < repeats.length; r++) {
        for (var m = 0; m < measures.length; m++) {
            if (measures[m].tick === repeats[r].startTick) {
                measures[m].repeatStart = true;
            }
            if (measures[m].endTick === repeats[r].endTick) {
                measures[m].repeatEnd = true;
                measures[m].repeatCount = repeats[r].repeatCount || 2;
            }
        }
    }

    // Assign markers to measures (by measure startTick)
    for (var mk = 0; mk < markers.length; mk++) {
        for (var m = 0; m < measures.length; m++) {
            if (measures[m].tick === markers[mk].tick) {
                measures[m].markers.push(markers[mk]);
                break;
            }
        }
    }

    // Assign jumps to containing measure (use <= for endTick to handle jumps at final barline)
    for (var jk = 0; jk < jumps.length; jk++) {
        var assigned = false;
        for (var m = measures.length - 1; m >= 0; m--) {
            if (measures[m].tick <= jumps[jk].tick && jumps[jk].tick < measures[m].endTick) {
                measures[m].jumps.push(jumps[jk]);
                assigned = true;
                break;
            }
        }
        if (!assigned && measures.length > 0) {
            // Jump at final barline: assign to last measure
            measures[measures.length - 1].jumps.push(jumps[jk]);
        }
    }

    return { measures: measures, lastTick: lastTick };
}

// Collect repeat list elements (C++ collectRepeatListElements translation)
function _collectElements(measures, data) {
    var voltas = (data.voltas || []).slice().sort(function(a, b) { return a.startTick - b.startTick; });

    var elements = [];
    var startFromRepeatMeasure = null;
    var activeVolta = null;
    var voltaIdx = 0;

    if (measures.length === 0) return elements;

    // First measure always gets a virtual REP_START (section start)
    startFromRepeatMeasure = { type: "REP_START", measure: measures[0], _repeatCount: 1 };
    elements.push(startFromRepeatMeasure);

    for (var mi = 0; mi < measures.length; mi++) {
        var m = measures[mi];

        // --- Volta start? ---
        if (voltaIdx < voltas.length && voltas[voltaIdx].startTick === m.tick) {
            if (activeVolta !== null) {
                // Close previous volta on previous measure
                var prevM = mi > 0 ? measures[mi - 1] : m;
                elements.push({ type: "VOLTA_END", element: activeVolta, measure: prevM, _repeatCount: 0 });
            }
            activeVolta = voltas[voltaIdx];
            elements.push({ type: "VOLTA_START", element: activeVolta, measure: m, _repeatCount: 0 });
            voltaIdx++;
        }

        // --- Repeat start? ---
        if (m.repeatStart) {
            if (activeVolta !== null && activeVolta.startTick !== m.tick) {
                // Volta and repeat start not on same measure: close volta
                var prevM2 = mi > 0 ? measures[mi - 1] : m;
                elements.push({ type: "VOLTA_END", element: activeVolta, measure: prevM2, _repeatCount: 0 });
                activeVolta = null;
            }
            startFromRepeatMeasure = { type: "REP_START", measure: m, _repeatCount: 1 };
            elements.push(startFromRepeatMeasure);
        }

        // --- Markers and jumps from this measure ---
        // C++ order: left markers (segno, coda signs), right markers (fine, tocoda), then jumps
        var leftMs = [], rightMs = [];
        for (var mk = 0; mk < m.markers.length; mk++) {
            var mtype = m.markers[mk].type || "";
            if (_isRightMarker(mtype)) {
                rightMs.push(m.markers[mk]);
            } else {
                leftMs.push(m.markers[mk]);
            }
        }
        for (var lm = 0; lm < leftMs.length; lm++) {
            elements.push({ type: "MARKER", element: leftMs[lm], measure: m, _repeatCount: 0 });
        }
        for (var rm = 0; rm < rightMs.length; rm++) {
            elements.push({ type: "MARKER", element: rightMs[rm], measure: m, _repeatCount: 0 });
        }

        // Jumps (after markers)
        for (var jj = 0; jj < m.jumps.length; jj++) {
            elements.push({ type: "JUMP", element: m.jumps[jj], measure: m, _repeatCount: 0 });
            // Check if jump should close volta (C++ lines 569-588)
            if (activeVolta !== null) {
                var voltaEndTick = activeVolta.endTick;
                if (voltaEndTick <= m.endTick) {
                    if (!m.repeatEnd) {
                        elements.push({ type: "VOLTA_END", element: activeVolta, measure: m, _repeatCount: 0 });
                        activeVolta = null;
                    }
                }
            }
        }

        // --- Repeat end? ---
        if (m.repeatEnd) {
            elements.push({ type: "REP_END", measure: m, _repeatCount: 0, _measureRepeatCount: m.repeatCount });
            if (startFromRepeatMeasure !== null) {
                startFromRepeatMeasure._repeatCount += (m.repeatCount - 1);
            }
            if (activeVolta !== null) {
                elements.push({ type: "VOLTA_END", element: activeVolta, measure: m, _repeatCount: 0 });
                activeVolta = null;
            }
        }

        // --- Closed volta end? (after repeat end check) ---
        if (activeVolta !== null && activeVolta.endTick === m.endTick && !m.repeatEnd) {
            elements.push({ type: "VOLTA_END", element: activeVolta, measure: m, _repeatCount: 0 });
            activeVolta = null;
        }
    }

    // Section break at end
    if (activeVolta !== null) {
        elements.push({ type: "VOLTA_END", element: activeVolta, measure: measures[measures.length - 1], _repeatCount: 0 });
        activeVolta = null;
    }
    elements.push({ type: "SECTION_BREAK", measure: measures[measures.length - 1], _repeatCount: 0 });

    return elements;
}

// Find marker by label. Search backwards from fromIdx, then forwards. (C++ findMarker)
function _findMarkerInElements(elements, label, fromIdx) {
    if (!label) return -1;

    // Special labels
    if (label === "start") return 0;
    if (label === "end") return elements.length - 1;

    // Search backwards
    for (var i = fromIdx - 1; i >= 0; i--) {
        if (elements[i].type === "MARKER" && elements[i].element && elements[i].element.label === label) return i;
    }
    // Search forwards
    for (var i = fromIdx + 1; i < elements.length; i++) {
        if (elements[i].type === "MARKER" && elements[i].element && elements[i].element.label === label) return i;
    }
    return -1;
}

// Perform jump: compute state at target (C++ performJump translation)
function _performJump(elements, targetIdx, withRepeats) {
    var activeVolta = null;
    var startRepeatRef = elements[0]; // section start
    for (var i = 0; i < targetIdx; i++) {
        if (elements[i].type === "VOLTA_START") {
            activeVolta = elements[i];
        } else if (elements[i].type === "VOLTA_END") {
            activeVolta = null;
        } else if (elements[i].type === "REP_START") {
            startRepeatRef = elements[i];
        }
    }
    var playbackCount;
    if (withRepeats) {
        if (activeVolta !== null) {
            playbackCount = _voltaFirstEnding(activeVolta.element.endingList);
            if (playbackCount === 0) playbackCount = 1;
        } else {
            playbackCount = 1;
        }
    } else {
        if (activeVolta !== null) {
            playbackCount = _voltaLastEnding(activeVolta.element.endingList);
            if (playbackCount === 0) playbackCount = startRepeatRef._repeatCount;
        } else {
            playbackCount = startRepeatRef._repeatCount;
        }
    }
    return { playbackCount: playbackCount, activeVolta: activeVolta, startRepeatRef: startRepeatRef };
}

// RepeatSegment helpers (measure-index based)
function _rsCreate(pc, m) {
    return { fromMIdx: m.idx, toMIdx: m.idx, playbackCount: pc, empty: false };
}
function _rsAddMeasures(rs, m) {
    if (rs.empty) { rs.fromMIdx = m.idx; rs.toMIdx = m.idx; rs.empty = false; }
    else if (m.idx > rs.toMIdx) { rs.toMIdx = m.idx; }
}
function _rsPopMeasure(rs) {
    if (rs.toMIdx > rs.fromMIdx) { rs.toMIdx--; }
    else { rs.empty = true; }
}
function _rsIsEmpty(rs) { return rs.empty; }
function _rsToTicks(rs, measures) {
    if (rs.empty) return null;
    return { fromTick: measures[rs.fromMIdx].tick, toTick: measures[rs.toMIdx].endTick };
}

// Main unwind (C++ RepeatList::unwind translation)
function _walkUnwind(data) {
    var built = _buildMeasures(data);
    var measures = built.measures;
    if (measures.length === 0) return _annotateSegments([], data);

    var elements = _collectElements(measures, data);
    if (elements.length === 0) return _annotateSegments([], data);

    var rawSegments = [];
    var rs = null;
    var playbackCount = 1;
    var activeVolta = null;
    var startRepeatRef = elements[0]; // Should be REP_START
    var playUntilIdx = -1;
    var continueAtIdx = -1;
    var activeJump = null;
    var forceFinalRepeat = false;
    var jumpsTaken = {};
    var isAfterJump = false;

    // Start: consume first element (REP_START at section start)
    rs = _rsCreate(playbackCount, elements[0].measure);
    var it = 1;
    var _pendingJumpLeadIn = null;
    var _jumpLeadIns = []; // lead-in per jump, in order of jumps taken

    while (it < elements.length) {
        var el = elements[it];

        if (rs !== null && !_rsIsEmpty(rs)) {
            _rsAddMeasures(rs, el.measure);
        }

        switch (el.type) {

        case "SECTION_BREAK": {
            if (rs !== null && !_rsIsEmpty(rs)) {
                var ticks = _rsToTicks(rs, measures);
                rawSegments.push({ fromTick: ticks.fromTick, toTick: ticks.toTick,
                                   playbackCount: rs.playbackCount,
                                   repeatStartTick: (startRepeatRef._repeatCount > 1) ? startRepeatRef.measure.tick : -1,
                                   isJumpReplay: isAfterJump });
            }
            it++;
        } break;

        case "VOLTA_START": {
            activeVolta = el;
            var endings = el.element.endingList || [1];
            if (!_voltaHasEnding(endings, playbackCount)) {
                // Skip this volta
                _rsPopMeasure(rs);
                if (rs !== null && !_rsIsEmpty(rs)) {
                    var ticks = _rsToTicks(rs, measures);
                    rawSegments.push({ fromTick: ticks.fromTick, toTick: ticks.toTick,
                                       playbackCount: rs.playbackCount,
                                       repeatStartTick: (startRepeatRef._repeatCount > 1) ? startRepeatRef.measure.tick : -1,
                                       isJumpReplay: isAfterJump });
                }
                // Skip to matching VOLTA_END
                do { it++; } while (it < elements.length && elements[it].type !== "VOLTA_END");
                activeVolta = null;
                // Start next rs on following measure
                if (it < elements.length) {
                    var endMeasure = elements[it].measure;
                    var nextMIdx = endMeasure.idx + 1;
                    if (nextMIdx < measures.length) {
                        rs = _rsCreate(playbackCount, measures[nextMIdx]);
                    } else {
                        rs = null;
                    }
                } else {
                    rs = null;
                }
                it++;
            } else {
                // Take the volta
                it++;
            }
        } break;

        case "VOLTA_END": {
            activeVolta = null;
            it++;
        } break;

        case "REP_START": {
            if (rs === null) {
                // Sent here by an end-repeat rewind
                rs = _rsCreate(playbackCount, el.measure);
            } else {
                var desiredPc = forceFinalRepeat ? el._repeatCount : 1;
                if (rs.playbackCount !== desiredPc) {
                    _rsPopMeasure(rs);
                    if (rs !== null && !_rsIsEmpty(rs)) {
                        var ticks = _rsToTicks(rs, measures);
                        rawSegments.push({ fromTick: ticks.fromTick, toTick: ticks.toTick,
                                           playbackCount: rs.playbackCount,
                                           repeatStartTick: (startRepeatRef._repeatCount > 1) ? startRepeatRef.measure.tick : -1,
                                           isJumpReplay: isAfterJump });
                    }
                    playbackCount = desiredPc;
                    rs = _rsCreate(playbackCount, el.measure);
                }
                startRepeatRef = el;
            }
            it++;
        } break;

        case "REP_END": {
            el._repeatCount++;
            if (playbackCount < startRepeatRef._repeatCount &&
                el._repeatCount < el._measureRepeatCount) {
                // Honor the repeat: push segment and rewind
                if (rs !== null && !_rsIsEmpty(rs)) {
                    var ticks = _rsToTicks(rs, measures);
                    rawSegments.push({ fromTick: ticks.fromTick, toTick: ticks.toTick,
                                       playbackCount: playbackCount,
                                       repeatStartTick: startRepeatRef.measure.tick,
                                       isJumpReplay: isAfterJump });
                }
                rs = null;
                // Rewind: go backwards to startRepeatRef
                do {
                    it--;
                    if (elements[it].type === "VOLTA_START") activeVolta = null;
                    else if (elements[it].type === "VOLTA_END") {
                        activeVolta = elements[it];
                    }
                } while (elements[it] !== startRepeatRef);
                playbackCount++;
                continue; // re-evaluate at startRepeatRef
            } else {
                it++;
            }
        } break;

        case "JUMP": {
            var jumpEl = el.element;
            // Check if we've re-encountered the jump we just took
            if (activeJump !== null && activeJump === el) {
                forceFinalRepeat = false;
            }

            // Jump honored on final playthrough (or last volta ending).
            // During a replay (isAfterJump=true), any NEW jump (different from
            // the one that brought us here) fires on first encounter, matching
            // MuseScore's behavior where nested D.S./D.C. jumps are processed
            // during a replay pass.
            var isFinal = (playbackCount >= startRepeatRef._repeatCount) ||
                          (activeVolta !== null && playbackCount === _voltaLastEnding(activeVolta.element.endingList)) ||
                          (isAfterJump && activeJump !== null && activeJump !== el);

            if (isFinal) {
                var jumpKey = it + "_" + playbackCount;
                if (!jumpsTaken[jumpKey]) {
                    jumpsTaken[jumpKey] = true;

                    // Find jump targets
                    var jumpToLabel = jumpEl.jumpTo || "start";
                    var jumpToIdx = _findMarkerInElements(elements, jumpToLabel, it);
                    var playUntilLabel = jumpEl.playUntil || "end";
                    if (playUntilLabel === "end") {
                        playUntilIdx = -1;
                    } else {
                        playUntilIdx = _findMarkerInElements(elements, playUntilLabel, it);
                    }
                    var continueAtLabel = jumpEl.continueAt || "";
                    continueAtIdx = continueAtLabel ? _findMarkerInElements(elements, continueAtLabel, it) : -1;

                    if (jumpToIdx >= 0) {
                        // Push current segment. Also record the jump measure's
                        // end tick so the D.S. replay can include syllables from
                        // the jump measure as a lead-in (D.S. takes effect at
                        // the END of its measure, like :|).
                        // The lead-in is what the jump measure still sings after the jump
                        // mark. Its end is the next section barline, and also the next
                        // marker: with nothing but a barline to stop it, the range reached
                        // as far as the end of the score and swallowed the coda, whose
                        // syllables were then replayed with the tick of the replay start,
                        // landing before music that comes earlier.
                        var jumpMeasureEndTick = -1;
                        var jumpMeasureTick = el.measure.tick;
                        var barlines = data.barlines || [];
                        for (var jbli = 0; jbli < barlines.length; jbli++) {
                            if (barlines[jbli].tick > jumpMeasureTick) {
                                jumpMeasureEndTick = barlines[jbli].tick;
                                break;
                            }
                        }
                        var jumpMarkers = data.markers || [];
                        for (var jmi = 0; jmi < jumpMarkers.length; jmi++) {
                            var jmTick = jumpMarkers[jmi].tick;
                            if (jmTick > jumpEl.tick &&
                                (jumpMeasureEndTick < 0 || jmTick < jumpMeasureEndTick)) {
                                jumpMeasureEndTick = jmTick;
                            }
                        }
                        if (rs !== null && !_rsIsEmpty(rs)) {
                            var ticks = _rsToTicks(rs, measures);
                            rawSegments.push({ fromTick: ticks.fromTick, toTick: ticks.toTick,
                                               playbackCount: rs.playbackCount,
                                               repeatStartTick: (startRepeatRef._repeatCount > 1) ? startRepeatRef.measure.tick : -1,
                                               isJumpReplay: isAfterJump });
                        }
                        rs = null;

                        // Record jump measure range for lead-in syllables.
                        // The D.S./D.C. takes effect at the END of its measure,
                        // so syllables AFTER the jump tick but in the same measure
                        // should be prepended to the D.S. replay as a lead-in.
                        var thisLeadIn = (jumpMeasureEndTick > 0 && jumpMeasureEndTick > jumpEl.tick)
                            ? { fromTick: jumpEl.tick + 1, toTick: jumpMeasureEndTick } : null;
                        _jumpLeadIns.push(thisLeadIn);
                        _pendingJumpLeadIn = thisLeadIn;

                        activeJump = el;
                        var jumpState = _performJump(elements, jumpToIdx, jumpEl.playRepeats || false);
                        playbackCount = jumpState.playbackCount;
                        activeVolta = jumpState.activeVolta;
                        startRepeatRef = jumpState.startRepeatRef;
                        forceFinalRepeat = !(jumpEl.playRepeats || false);
                        isAfterJump = true;
                        it = jumpToIdx;

                        // Re-evaluate REP_END repeat counts after jump (C++ lines 996-1009).
                        // Always reset so that repeats within the D.S./D.C. replay range
                        // are honored again (their counts were consumed during normal play).
                        {
                            for (var rr = it + 1; rr < elements.length; rr++) {
                                if (elements[rr].type === "REP_END" && elements[rr]._repeatCount !== 0) {
                                    elements[rr]._repeatCount = 0;
                                    if (forceFinalRepeat) {
                                        elements[rr]._repeatCount = elements[rr]._measureRepeatCount;
                                    }
                                }
                            }
                        }

                        // Handle jumping into a volta (C++ lines 1010-1050)
                        if (activeVolta !== null && playbackCount < startRepeatRef._repeatCount) {
                            // Find the startRepeatRef in elements
                            var findRepeatIt = it;
                            while (findRepeatIt > 0 && elements[findRepeatIt] !== startRepeatRef) findRepeatIt--;
                            findRepeatIt++;
                            var voltaRef = null;
                            var processedRepeatCount = 1;
                            while (findRepeatIt < elements.length &&
                                   elements[findRepeatIt].type !== "REP_START" &&
                                   processedRepeatCount < startRepeatRef._repeatCount) {
                                if (elements[findRepeatIt].type === "VOLTA_START") {
                                    voltaRef = elements[findRepeatIt];
                                    if (_voltaLastEnding(voltaRef.element.endingList) < playbackCount) {
                                        voltaRef = null;
                                    }
                                } else if (elements[findRepeatIt].type === "REP_END") {
                                    if (voltaRef !== null) {
                                        var remainingCount = 0;
                                        var vEndings = voltaRef.element.endingList || [1];
                                        for (var ve = 0; ve < vEndings.length; ve++) {
                                            if (vEndings[ve] >= playbackCount) remainingCount++;
                                        }
                                        elements[findRepeatIt]._repeatCount = elements[findRepeatIt]._measureRepeatCount - remainingCount - 1;
                                    }
                                    processedRepeatCount += elements[findRepeatIt]._measureRepeatCount - 1;
                                }
                                findRepeatIt++;
                            }
                        }

                        // Create new segment at jump target
                        rs = _rsCreate(playbackCount, elements[it].measure);
                        it++;
                        continue;
                    }
                }
            }
            it++;
        } break;

        case "MARKER": {
            if (playUntilIdx >= 0 && it === playUntilIdx) {
                var isMarkerFinal = (playbackCount >= startRepeatRef._repeatCount) ||
                    (activeVolta !== null && playbackCount === _voltaLastEnding(activeVolta.element.endingList));
                if (isMarkerFinal) {
                    // Found playUntil target. Extend toTick to the end of the real
                    // measure (next barline), not just the synthetic micro-measure.
                    // This ensures syllables after the marker but in the same real
                    // measure are included (e.g. "la me" after tocoda "rás").
                    if (rs !== null && !_rsIsEmpty(rs)) {
                        var ticks = _rsToTicks(rs, measures);
                        var markerTick = elements[it].measure.tick;
                        var extendedTo = ticks.toTick;
                        var barlines = data.barlines || [];
                        for (var bli = 0; bli < barlines.length; bli++) {
                            if (barlines[bli].tick > markerTick) {
                                extendedTo = barlines[bli].tick;
                                break;
                            }
                        }
                        // Use barline + 1 to include syllables AT the barline tick
                        // (filterSylsByRange uses exclusive upper bound)
                        if (extendedTo > ticks.toTick) ticks.toTick = extendedTo + 1;
                        rawSegments.push({ fromTick: ticks.fromTick, toTick: ticks.toTick,
                                           playbackCount: rs.playbackCount,
                                           repeatStartTick: (startRepeatRef._repeatCount > 1) ? startRepeatRef.measure.tick : -1,
                                           isJumpReplay: isAfterJump });
                    }
                    rs = null;
                    playUntilIdx = -1;
                    forceFinalRepeat = false;

                    if (continueAtIdx >= 0) {
                        // Jump to continueAt (coda)
                        var contState = _performJump(elements, continueAtIdx, true);
                        playbackCount = contState.playbackCount;
                        activeVolta = contState.activeVolta;
                        startRepeatRef = contState.startRepeatRef;
                        if (startRepeatRef.measure !== elements[continueAtIdx].measure) {
                            startRepeatRef = elements[continueAtIdx];
                        }
                        it = continueAtIdx;
                        rs = _rsCreate(playbackCount, elements[it].measure);
                        continueAtIdx = -1;
                        it++;
                        continue;
                    } else {
                        // No continueAt: break out of section
                        it = elements.length;
                        continue;
                    }
                }
            }
            it++;
        } break;

        default:
            it++;
        }
    }

    return _annotateSegments(rawSegments, data, _jumpLeadIns);
}

// Convert raw walk segments to the format materialize expects.
// Annotates with volta info, break types, etc.
function _annotateSegments(rawSegments, data, jumpLeadIns) {
    var voltas = data.voltas || [];
    var segments = [];
    // jumpLeadIns: array of lead-ins per jump taken, in order.
    // Assign them to each replay group (segmentBoundary=true segments).
    var jumpLeadIns = jumpLeadIns || [];
    var jumpLeadInIdx = 0;

    for (var i = 0; i < rawSegments.length; i++) {
        var raw = rawSegments[i];

        // Check if this segment overlaps with any volta
        var voltaFrom = -1, voltaTo = -1;
        for (var vi = 0; vi < voltas.length; vi++) {
            var v = voltas[vi];
            if (v.startTick >= raw.fromTick && v.endTick <= raw.toTick) {
                voltaFrom = v.startTick;
                voltaTo = v.endTick;
                break;
            }
        }

        // Determine break type
        var breakType = "none";
        if (i > 0) {
            var prev = rawSegments[i - 1];
            if (raw.isJumpReplay && !prev.isJumpReplay) {
                breakType = "section"; // D.S./D.C. transition
            } else if (raw.fromTick < prev.toTick) {
                breakType = "section"; // backwards tick = repeat pass
            } else if (raw.fromTick > prev.toTick) {
                breakType = "section"; // gap = volta skip or coda jump
            }
        }

        // Determine mainFrom/mainTo: if volta is inside, main is before volta.
        // Jump replay segments span the full replay range and should not be
        // trimmed by voltas they contain (those voltas belong to the original
        // structure and are not meaningful for the replay range).
        var mainFrom = raw.fromTick;
        var mainTo = (!raw.isJumpReplay && voltaFrom >= 0 && voltaFrom > raw.fromTick) ? voltaFrom : raw.toTick;

        segments.push({
            mainFrom: mainFrom, mainTo: mainTo,
            voltaFrom: voltaFrom, voltaTo: voltaTo,
            pass: raw.playbackCount,
            repeatStartTick: (raw.repeatStartTick != null && raw.repeatStartTick >= 0) ? raw.repeatStartTick : -1,
            numPasses: 1, // not pre-computed; materialize infers from segment count
            isImplicitV2: false,
            endChordTick: -1,
            isJumpReplay: raw.isJumpReplay || false,
            breakType: breakType,
            // segmentBoundary: start of a new replay group (D.S./D.C. transition).
            // Fires for the first replay segment, AND for any replay segment that
            // goes backwards relative to the previous replay segment (nested jump).
            segmentBoundary: raw.isJumpReplay && i > 0 && (
                !rawSegments[i-1].isJumpReplay ||
                (rawSegments[i-1].isJumpReplay && raw.fromTick < rawSegments[i-1].toTick && raw.playbackCount === 1)
            ),
            jumpLeadIn: (function() {
                // Assign lead-ins to replay group boundaries in order of jumps taken.
                var isBoundary = raw.isJumpReplay && i > 0 && (
                    !rawSegments[i-1].isJumpReplay ||
                    (rawSegments[i-1].isJumpReplay && raw.fromTick < rawSegments[i-1].toTick && raw.playbackCount === 1)
                );
                if (isBoundary) {
                    var li = jumpLeadIns[jumpLeadInIdx] || null;
                    jumpLeadInIdx++;
                    return li;
                }
                return null;
            })(),
            verseOffset: data.verseOffset || 0
        });
    }

    // Compute numPasses and endChordTick for volta-containing segments
    var voltaPassCounts = {};
    var repeatVoltaStart = {}; // repeatStartTick -> volta startTick
    for (var j = 0; j < segments.length; j++) {
        if (segments[j].voltaFrom >= 0 && segments[j].repeatStartTick >= 0) {
            var key = segments[j].repeatStartTick + "_" + segments[j].voltaFrom;
            voltaPassCounts[key] = (voltaPassCounts[key] || 0) + 1;
            repeatVoltaStart[segments[j].repeatStartTick] = segments[j].voltaFrom;
        }
    }
    for (var j = 0; j < segments.length; j++) {
        if (segments[j].voltaFrom >= 0 && segments[j].repeatStartTick >= 0) {
            var key = segments[j].repeatStartTick + "_" + segments[j].voltaFrom;
            segments[j].numPasses = voltaPassCounts[key] || 1;
        }
        // Set endChordTick for segments that skip the volta
        if (segments[j].voltaFrom < 0 && segments[j].repeatStartTick >= 0 &&
            repeatVoltaStart[segments[j].repeatStartTick] != null) {
            segments[j].endChordTick = repeatVoltaStart[segments[j].repeatStartTick];
        }
        // Compute overlapCount for jump replay segments (for verse selection)
        if (segments[j].isJumpReplay && segments[j].repeatStartTick < 0) {
            var overlapCount = 0;
            for (var k = 0; k < j; k++) {
                if (segments[k].mainFrom <= segments[j].mainFrom && segments[k].mainTo >= segments[j].mainFrom) {
                    overlapCount++;
                }
            }
            if (overlapCount > 0) segments[j].overlapCount = overlapCount;
        }
    }

    return segments;
}

// Navigation plan builder (kept for backward compatibility with orchestrator)
function _buildNavPlan(markers, jumps, lastTick) {
    if (!jumps || jumps.length === 0) return null;

    var markerByLabel = {};
    for (var i = 0; i < markers.length; i++) {
        markerByLabel[markers[i].label] = markers[i];
    }

    var sortedJumps = jumps.slice().sort(function(a, b) { return a.tick - b.tick; });
    var plan = [];
    var currentFrom = 0;

    for (var j = 0; j < sortedJumps.length; j++) {
        var jump = sortedJumps[j];

        plan.push({
            fromTick: currentFrom,
            toTick: jump.tick + 1,
            honorRepeats: true
        });

        var jumpToTick = 0;
        if (jump.jumpTo && jump.jumpTo !== "start") {
            var jumpToMarker = markerByLabel[jump.jumpTo];
            if (jumpToMarker) jumpToTick = jumpToMarker.tick;
        }

        var playUntilTick = lastTick;
        if (jump.playUntil && jump.playUntil !== "end") {
            var playUntilMarker = markerByLabel[jump.playUntil];
            if (playUntilMarker) playUntilTick = playUntilMarker.tick;
        }

        plan.push({
            fromTick: jumpToTick,
            toTick: playUntilTick,
            honorRepeats: jump.playRepeats || false
        });

        if (jump.continueAt) {
            var continueMarker = markerByLabel[jump.continueAt];
            if (continueMarker) {
                plan.push({
                    fromTick: continueMarker.tick,
                    toTick: lastTick,
                    honorRepeats: true
                });
            }
        }

        break;
    }

    return plan;
}

function unwind(data) {
    return _walkUnwind(data);
}

// Per-tick verse selection for navigation replay segments.
// For each tick position, pick targetVerse if available, else verse 0.
function _selectVersePerTick(syls, targetVerse) {
    var sylsByTick = {};
    for (var i = 0; i < syls.length; i++) {
        var tk = syls[i].tick;
        if (!sylsByTick[tk]) sylsByTick[tk] = {};
        sylsByTick[tk][syls[i].verse] = syls[i];
    }
    var result = [];
    var tickKeys = Object.keys(sylsByTick).map(function(k) { return parseInt(k); }).sort(function(a, b) { return a - b; });
    for (var ti = 0; ti < tickKeys.length; ti++) {
        var tickSyls = sylsByTick[tickKeys[ti]];
        var picked = tickSyls[targetVerse] || tickSyls[0];
        if (!picked) {
            var firstKey = Object.keys(tickSyls)[0];
            picked = tickSyls[firstKey];
        }
        if (picked) result.push(picked);
    }
    return result;
}

// ========================================
// Materialize: fill segments with syllable content
// ========================================

function materialize(segments, data) {
    var syllables = data.syllables || [];
    var chords = data.chords || [];
    var voltas = data.voltas || [];
    var stream = [];

    // Build chord list excluding volta ranges
    var chordsNoVolta = [];
    for (var ci = 0; ci < chords.length; ci++) {
        var inVolta = false;
        for (var vi = 0; vi < voltas.length; vi++) {
            if (chords[ci].tick >= voltas[vi].startTick && chords[ci].tick < voltas[vi].endTick) {
                inVolta = true;
                break;
            }
        }
        if (!inVolta) chordsNoVolta.push(chords[ci]);
    }

    // Track verse consumption per repeat range
    var verseCounter = {}; // "repeatStartTick" -> next verse index

    for (var si = 0; si < segments.length; si++) {
        var seg = segments[si];

        // Skip instrumental segments
        if (seg.instrumental) continue;

        // D.S./D.C. lead-in: syllables from the jump measure that play
        // before the jump executes (D.S. takes effect at END of measure).
        var pendingLeadIn = null;
        if (seg.isJumpReplay && (si === 0 || !segments[si - 1].isJumpReplay)) {
            pendingLeadIn = seg.jumpLeadIn;
        }

        // When a volta starts exactly at mainFrom, it belongs to the preceding
        // repeat pass (e.g. volta 2 "mé." completing "amé."). Emit its content
        // before main content with no section break, as a smooth continuation.
        var voltaAtStart = seg.voltaFrom >= 0 && seg.voltaFrom === seg.mainFrom;
        if (voltaAtStart) {
            var earlyVoltaSyls = filterSylsByRange(syllables, seg.voltaFrom, seg.voltaTo);
            var earlyVoltaVerse = 0;
            var earlyVoltaVerseSet = {};
            for (var evs = 0; evs < earlyVoltaSyls.length; evs++) earlyVoltaVerseSet[earlyVoltaSyls[evs].verse] = true;
            var earlyVoltaVerses = Object.keys(earlyVoltaVerseSet).map(function(k) { return parseInt(k); }).sort();
            if (earlyVoltaVerses.length > 0) earlyVoltaVerse = earlyVoltaVerses[0];
            var earlyVoltaFiltered = filterSylsByVerse(earlyVoltaSyls, earlyVoltaVerse);
            // Mark as volta continuation only if the previous stream entry
            // doesn't end with strong punctuation. Checked per-syl so that
            // e.g. "la" + "lá." gets continuation but "lá." + "con" does not.
            for (var ev = 0; ev < earlyVoltaFiltered.length; ev++) {
                var evClone = cloneSyl(earlyVoltaFiltered[ev], chords);
                var prevEndsPhrase = false;
                if (stream.length > 0) {
                    var prevText = stream[stream.length - 1].text || "";
                    var prevLast = prevText.charAt(prevText.length - 1);
                    prevEndsPhrase = prevLast === "." || prevLast === "!" || prevLast === "?";
                }
                if (!prevEndsPhrase) evClone._voltaContinuation = true;
                stream.push(evClone);
            }
        }

        // Section break (skip if previous syl requested smooth transition,
        // or if volta at start already continued the previous segment)
        if (seg.breakType === "section" && stream.length > 0 && !stream[stream.length - 1].noBreakAfter && !voltaAtStart) {
            // Suppress section break when lyrics continue across a skipped volta
            // without punctuation (e.g. "alma la" -> "reina serás").
            // Check if the last stream syllable sits just before a volta range.
            var lastSylTick = stream[stream.length - 1].tick || 0;
            var lastSylEnd = lastSylTick + Math.round((stream[stream.length - 1].durationQ || 1) * (data.division || 480));
            var crossesVolta = false;
            for (var vci = 0; vci < voltas.length; vci++) {
                if (lastSylEnd <= voltas[vci].startTick && seg.mainFrom >= voltas[vci].endTick) {
                    crossesVolta = true;
                    break;
                }
            }
            var prevSylText = stream[stream.length - 1].text || "";
            var prevLastChar = prevSylText.charAt(prevSylText.length - 1);
            var endsWithPunctuation = prevLastChar === "." || prevLastChar === "!" ||
                prevLastChar === "?" || prevLastChar === "\uFE52";
            if (crossesVolta && !endsWithPunctuation && !stream[stream.length - 1]._jumpReplay) {
                stream[stream.length - 1].noBreakAfter = true;
            } else {
                stream[stream.length - 1].sectionEnd = true;
                if (seg.segmentBoundary) {
                    stream[stream.length - 1].segmentBoundary = true;
                }
            }
        }

        // Emit D.S. jump measure lead-in AFTER the section break (so the
        // label appears before the lead-in text). Lead-in syllables get
        // noBreakAfter so they join seamlessly with the D.S. replay content.
        if (pendingLeadIn) {
            var leadSyls = filterSylsByRange(syllables, pendingLeadIn.fromTick, pendingLeadIn.toTick);
            var leadVerse0 = filterSylsByVerse(leadSyls, 0);
            // Check if the lead-in COMPLETES a word started before the jump.
            // If the previous stream syllable has syllabic=begin/middle, the
            // lead-in finishes that word. After completing it, allow a break
            // (don't set noBreakAfter on the completing syllable).
            var completesWord = false;
            if (stream.length > 0) {
                var prevSyl = stream[stream.length - 1].syllabic;
                completesWord = (prevSyl === "begin" || prevSyl === "middle");
            }
            for (var li = 0; li < leadVerse0.length; li++) {
                var liClone = cloneSyl(leadVerse0[li], chords);
                liClone.tick = seg.mainFrom;
                liClone._jumpReplay = true;
                // When lead-in completes a prior word: set noBreakAfter on
                // mid-word syllables but NOT on the word-ending syllable.
                // When lead-in starts new content: always set noBreakAfter.
                var isWordEnd = liClone.syllabic === "end" || liClone.syllabic === "single";
                if (completesWord && isWordEnd) {
                    // This syllable finishes the word from before the jump.
                    // Don't join with D.S. content (allow section break).
                    completesWord = false; // only the first completing word
                } else {
                    liClone.noBreakAfter = true;
                }
                stream.push(liClone);
            }
            pendingLeadIn = null;
        }

        // Get syllables for main section, excluding volta range to avoid duplicates
        var mainSyls = filterSylsByRange(syllables, seg.mainFrom, seg.mainTo);
        if (seg.voltaFrom >= 0) {
            var mainNoVolta = [];
            for (var mf = 0; mf < mainSyls.length; mf++) {
                if (mainSyls[mf].tick < seg.voltaFrom || mainSyls[mf].tick >= seg.voltaTo) {
                    mainNoVolta.push(mainSyls[mf]);
                }
            }
            mainSyls = mainNoVolta;
        }

        // Select verse
        var targetVerse = 0;
        if (seg.repeatStartTick >= 0) {
            // In a repeat: use pass-based verse selection.
            // Only use the repeat counter if the segment is actually inside
            // the repeat range (mainFrom < repeat endTick). Segments that
            // continue after the repeat (e.g. estribillo) inherit
            // repeatStartTick but should NOT consume verse slots.
            var repKey = String(seg.repeatStartTick);
            var repEndTick = -1;
            var reps = data.repeats || [];
            for (var rfi = 0; rfi < reps.length; rfi++) {
                if (reps[rfi].startTick === seg.repeatStartTick) {
                    repEndTick = reps[rfi].endTick;
                    break;
                }
            }
            var insideRepeat = repEndTick < 0 || seg.mainFrom < repEndTick;
            if (verseCounter[repKey] === undefined) {
                verseCounter[repKey] = seg.verseOffset || 0;
            }
            var vIdx = verseCounter[repKey];

            // Find available verses
            var verseSet = {};
            for (var mv = 0; mv < mainSyls.length; mv++) verseSet[mainSyls[mv].verse] = true;
            var verses = Object.keys(verseSet).map(function(k) { return parseInt(k); }).sort();

            targetVerse = verses.length > 0 ? verses[vIdx % verses.length] : 0;
            if (insideRepeat) verseCounter[repKey]++;
        } else if (seg.overlapCount > 0) {
            // Navigation replay: per-tick verse selection with fallback.
            // Pick targetVerse if available at each tick, else verse 0.
            targetVerse = seg.overlapCount;
        }

        // For navigation replay (non-repeat), do per-tick verse selection
        var mainFiltered;
        if (seg.repeatStartTick < 0 && seg.overlapCount > 0) {
            mainFiltered = _selectVersePerTick(mainSyls, targetVerse);
        } else {
            mainFiltered = filterSylsByVerse(mainSyls, targetVerse);
            // If no syllables for targetVerse, fall back to verse 0
            if (mainFiltered.length === 0 && targetVerse !== 0) {
                mainFiltered = filterSylsByVerse(mainSyls, 0);
            }
        }

        // Verse 0 "tail" detection (estribillo pattern, spec 7.6)
        var allMainVerses = {};
        for (var amv = 0; amv < mainSyls.length; amv++) allMainVerses[mainSyls[amv].verse] = true;
        var mainVerseList = Object.keys(allMainVerses).map(function(k) { return parseInt(k); }).sort();
        var tailStartTick = -1;

        if (mainVerseList.length > 1) {
            var otherLastTick = -1;
            for (var ov = 0; ov < mainVerseList.length; ov++) {
                if (mainVerseList[ov] === 0) continue;
                var otherSyls = filterSylsByVerse(mainSyls, mainVerseList[ov]);
                if (otherSyls.length > 0 && otherSyls[otherSyls.length - 1].tick > otherLastTick) {
                    otherLastTick = otherSyls[otherSyls.length - 1].tick;
                }
            }
            var v0All = filterSylsByVerse(mainSyls, 0);
            for (var tv = 0; tv < v0All.length; tv++) {
                if (v0All[tv].tick > otherLastTick) {
                    tailStartTick = v0All[tv].tick;
                    break;
                }
            }
        }

        // For non-zero verses, append verse 0 tail
        if (targetVerse !== 0 && tailStartTick >= 0) {
            var v0Tail = filterSylsByVerse(mainSyls, 0);
            for (var t = 0; t < v0Tail.length; t++) {
                if (v0Tail[t].tick >= tailStartTick) {
                    mainFiltered.push(v0Tail[t]);
                }
            }
        }

        // Clone main syllables
        for (var m = 0; m < mainFiltered.length; m++) {
            // Skip coda syllables that duplicate the last stream syllable
            // (when playUntil extended to include the pre-coda version)
            if (m === 0 && stream.length > 0 && mainFiltered[m].text === stream[stream.length - 1].text) {
                var prevTick = stream[stream.length - 1].tick;
                if (mainFiltered[m].tick > prevTick && seg.breakType === "section") continue;
            }
            var mClone = cloneSyl(mainFiltered[m], chordsNoVolta);
            if (m > 0 && !_hasChordEntryBetween(chordsNoVolta, mainFiltered[m - 1].tick, mainFiltered[m].tick)) {
                mClone.activeChord = null;
            }
            if (seg.endChordTick >= 0 && m === mainFiltered.length - 1 && seg.voltaFrom < 0) {
                mClone.endChordTick = seg.endChordTick;
            }
            if (seg.isJumpReplay) mClone._jumpReplay = true;
            stream.push(mClone);

            // Mark transition to verse 0 tail
            if (tailStartTick >= 0 && mainFiltered[m].tick < tailStartTick &&
                m + 1 < mainFiltered.length && mainFiltered[m + 1].tick >= tailStartTick) {
                mClone.sectionEnd = true;
            }
        }

        // Volta content (skip if already emitted as early volta above)
        if (seg.voltaFrom >= 0 && !voltaAtStart) {
            var voltaSyls = filterSylsByRange(syllables, seg.voltaFrom, seg.voltaTo);

            if (seg.isImplicitV2) {
                // Implicit volta 2: smooth transition, use verse 0.
                // Preserve break when text ends with punctuation or when
                // the syllable is a D.S. lead-in (break already decided).
                if (stream.length > 0) {
                    var lastBefore = stream[stream.length - 1];
                    var lbText = lastBefore.text || "";
                    var lbLast = lbText.charAt(lbText.length - 1);
                    if (lbLast !== "." && lbLast !== "!" && lbLast !== "?" && !lastBefore._jumpReplay) lastBefore.noBreakAfter = true;
                    lastBefore.restAfter = false;
                    lastBefore.restDurationQ = 0;
                    lastBefore.gapDurationQ = 0;
                    lastBefore.durationQ = Math.min(lastBefore.durationQ, 1);
                }
                var impV0 = filterSylsByVerse(voltaSyls, 0);
                var impUse = impV0.length > 0 ? impV0 : voltaSyls;

                // Build chord list for implicit V2 (skip base chord at repeat start)
                var repBaseChord = _findChordAtTick(chordsNoVolta, seg.repeatStartTick);
                var impV2Chords = [];
                var skippedBase = false;
                for (var ic = 0; ic < chordsNoVolta.length; ic++) {
                    if (chordsNoVolta[ic].tick < seg.voltaFrom) continue;
                    if (seg.voltaTo >= 0 && chordsNoVolta[ic].tick >= seg.voltaTo) break;
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
            } else {
                // Explicit volta: select verse from volta's own inventory
                var voltaVerseSet = {};
                for (var vvs = 0; vvs < voltaSyls.length; vvs++) voltaVerseSet[voltaSyls[vvs].verse] = true;
                var voltaVerses = Object.keys(voltaVerseSet).map(function(k) { return parseInt(k); }).sort();

                var voltaVerse;
                if (seg.numPasses > 1 && voltaVerses.length > 1) {
                    // Use volta's own verse index (pass 1 -> volta verse 0, pass 2 -> volta verse 1)
                    var voltaIdx = seg.pass - 1;
                    voltaVerse = voltaVerses.length > voltaIdx ? voltaVerses[voltaIdx] : targetVerse;
                } else {
                    voltaVerse = voltaVerses.length > 0 ? voltaVerses[0] : 0;
                }

                var voltaFiltered = filterSylsByVerse(voltaSyls, voltaVerse);
                if (voltaFiltered.length === 0) {
                    voltaFiltered = filterSylsByVerse(voltaSyls, 0);
                }

                for (var vj = 0; vj < voltaFiltered.length; vj++) {
                    stream.push(cloneSyl(voltaFiltered[vj], chords));
                }

                // Mark that this pass had a volta (for break handling in next pass)
                if (voltaFiltered.length > 0 && si + 1 < segments.length) {
                    // If next segment is from the same repeat, use "section" break with volta cleanup
                    var nextSeg = segments[si + 1];
                    if (nextSeg.repeatStartTick === seg.repeatStartTick && nextSeg.breakType === "section") {
                        // Volta transition: adjust last syl for smooth transition.
                        // Respect forced breaks: if the last syl ends with ";" or
                        // fullwidth comma (its unicode replacement), don't suppress.
                        // Also skip when the next segment has a long instrumental intro
                        // (gap from repeat start to first lyric > 4 beats): the sections
                        // don't flow together and need a clean break.
                        var _nextFirstLyric = -1;
                        for (var _nfi = 0; _nfi < syllables.length; _nfi++) {
                            if (syllables[_nfi].tick >= nextSeg.mainFrom && syllables[_nfi].tick < nextSeg.mainTo) {
                                _nextFirstLyric = syllables[_nfi].tick;
                                break;
                            }
                        }
                        var _hasLongIntro = _nextFirstLyric >= 0 && (_nextFirstLyric - nextSeg.mainFrom) > 1920;
                        if (!_hasLongIntro) {
                            var last = stream[stream.length - 1];
                            var lastText = last.text || "";
                            var lastCh = lastText.charAt(lastText.length - 1);
                            var hasForcedBreak = lastCh === ";" || lastCh === "\uFF0C" ||
                                lastCh === "." || lastCh === "!" || lastCh === "?";
                            if (!hasForcedBreak && !last._jumpReplay) {
                                last.restAfter = false;
                                last.restDurationQ = 0;
                                last.gapDurationQ = 0;
                                last.durationQ = Math.min(last.durationQ, 1);
                                last.noBreakAfter = true;
                            }
                        }
                    }
                }
            }
        }
    }

    return stream;
}

// ========================================
// Expand: convenience wrapper
// ========================================

function expand(data) {
    var segments = unwind(data);
    var stream = materialize(segments, data);

    if (stream.length === 0) return stream;

    // Recompute gaps
    recomputeStreamGaps(stream);

    // Detect stanza breaks
    _detectStanzaBreaks(stream);

    return stream;
}

function _detectStanzaBreaks(stream) {
    for (var sb = 0; sb < stream.length - 1; sb++) {
        if (stream[sb].sectionEnd) continue;
        var sbSyl = stream[sb];
        var sbNext = stream[sb + 1];

        // Section barline (only at word boundaries, not mid-word)
        if (sbSyl.sectionBar && (sbSyl.syllabic === "end" || sbSyl.syllabic === "single")) {
            sbSyl.sectionEnd = true;
            continue;
        }

        // Backwards tick jump (repeat pass transition)
        if (sbNext.tick < sbSyl.tick && !sbSyl.noBreakAfter) {
            sbSyl.sectionEnd = true;
            continue;
        }

        // Natural break: punctuation + rest + uppercase
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

// ========================================
// Backward compatibility: buildSections, buildPlaybackPlan
// ========================================

function buildSections(repeats, voltas) {
    return _buildSections(repeats, voltas);
}

function buildPlaybackPlan(markers, jumps, lastTick) {
    return _buildNavPlan(markers, jumps, lastTick);
}

// ========================================
// Exports
// ========================================

if (typeof exports !== "undefined") {
    exports.unwind = unwind;
    exports.materialize = materialize;
    exports.expand = expand;

    // Utility functions used by other modules
    exports.filterSylsByRange = filterSylsByRange;
    exports.filterSylsByVerse = filterSylsByVerse;
    exports.cloneSyl = cloneSyl;
    exports.recomputeStreamGaps = recomputeStreamGaps;

    // Backward compatibility
    exports.buildSections = buildSections;
    exports.buildPlaybackPlan = buildPlaybackPlan;

    // Internal helpers exposed for testing
    exports._buildSections = _buildSections;
    exports._buildNavPlan = _buildNavPlan;
    exports._findChordAtTick = _findChordAtTick;
}
