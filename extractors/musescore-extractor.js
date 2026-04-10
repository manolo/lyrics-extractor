// MuseScore API extractor: extracts lyrics, chords, and repeat structure
// from the current score using the MuseScore plugin API (curScore global)
// Used in the MuseScore extension context (apiversion 1)

// --- Global debug variables ---
var _fretDiagramDebug = null;

// --- Internal helpers ---

function _stripHtml(text) {
    if (!text) return "";
    var result = "";
    var inTag = false;
    for (var i = 0; i < text.length; i++) {
        if (text[i] === '<') {
            inTag = true;
        } else if (text[i] === '>') {
            inTag = false;
        } else if (!inTag) {
            result += text[i];
        }
    }
    return result;
}

function _stripHyphens(text) {
    while (text.length > 0 && text.charAt(0) === '-') text = text.substring(1);
    while (text.length > 0 && text.charAt(text.length - 1) === '-') text = text.substring(0, text.length - 1);
    return text;
}

// Get duration in quarter-note units from a ChordRest element
function getDurationInQuarters(element) {
    var dur = element.duration;
    if (!dur) return 1;
    return (dur.numerator / dur.denominator) * 4;
}

// Convert FractionWrapper or number to integer ticks
function toTicks(value) {
    if (typeof value === 'number') return value;
    if (value && typeof value.ticks === 'number') return value.ticks;
    if (value && value.numerator !== undefined && value.denominator !== undefined) {
        return Math.round((value.numerator / value.denominator) * 1920);
    }
    return 0;
}

// Find the staff with lyrics (voice staff) and the staff with harmony symbols
// Detect linked/tab staves using the MuseScore API.
// Uses curScore.staves[i].isTabStaff and staff.part to identify
// which staves are tablature copies (linked) of a principal staff.
// For each Part with multiple staves, non-first staves are linked.
function findLinkedStaves() {
    var linked = {};
    try {
        var staves = curScore.staves;
        // Build map: for each Part, find its staff indices and mark non-principal
        for (var p = 0; p < curScore.parts.length; p++) {
            var part = curScore.parts[p];
            var partStaffIndices = [];
            for (var s = 0; s < staves.length; s++) {
                if (staves[s].part && staves[s].part.is(part)) {
                    partStaffIndices.push(s);
                }
            }
            // First staff in part is principal, rest are linked
            for (var ls = 1; ls < partStaffIndices.length; ls++) {
                linked[partStaffIndices[ls]] = true;
            }
        }
    } catch (e) {
        // Fallback: mark tab staves as linked
        try {
            var staves2 = curScore.staves;
            for (var s2 = 0; s2 < staves2.length; s2++) {
                if (staves2[s2].isTabStaff) {
                    linked[s2] = true;
                }
            }
        } catch (e2) {
            // API not available, no filtering
        }
    }
    return linked;
}

function findStaves() {
    var voiceStaves = [];
    var harmonyStaves = [];
    var allHarmonyFound = []; // DEBUG: track all harmony elements found
    var linkedStaves = {};
    var hiddenStaves = {};

    // Try to detect linked staves
    try {
        linkedStaves = findLinkedStaves();
    } catch (e) {
        // API not available, skip linked detection
    }

    // Build set of hidden staff indices from parts with show=false
    try {
        for (var pi = 0; pi < curScore.parts.length; pi++) {
            var part = curScore.parts[pi];
            if (part.show === false) {
                var startStaff = Math.floor(part.startTrack / 4);
                var endStaff = Math.floor((part.endTrack - 1) / 4);
                for (var hs = startStaff; hs <= endStaff; hs++) {
                    hiddenStaves[hs] = true;
                }
            }
        }
    } catch (e) {
        // API not available, skip hidden detection
    }

    var segment = curScore.firstSegment();
    while (segment) {
        for (var staff = 0; staff < curScore.nstaves; staff++) {
            // Skip hidden staves
            if (hiddenStaves[staff]) continue;

            var element = segment.elementAt(staff * 4);
            if (element && (element.type === Element.CHORD || element.type === Element.REST)) {
                var lyr = element.lyrics;
                if (lyr && lyr.length > 0) {
                    var found = false;
                    for (var v = 0; v < voiceStaves.length; v++) {
                        if (voiceStaves[v].idx === staff) {
                            voiceStaves[v].count += lyr.length; // count total lyrics (all verses)
                            found = true;
                            break;
                        }
                    }
                    if (!found) voiceStaves.push({ idx: staff, count: lyr.length });
                }
            }
        }

        var annotations = segment.annotations;
        if (annotations) {
            for (var a = 0; a < annotations.length; a++) {
                var ann = annotations[a];
                if (ann && (ann.type === Element.HARMONY)) {
                    var hStaff = Math.floor(ann.track / 4);
                    // DEBUG: record all harmony found
                    allHarmonyFound.push({
                        staff: hStaff,
                        tick: segment.tick,
                        text: ann.text || "",
                        linked: linkedStaves[hStaff] || false,
                        hidden: hiddenStaves[hStaff] || false
                    });
                    // Skip linked and hidden staves for harmony selection
                    if (linkedStaves[hStaff] || hiddenStaves[hStaff]) continue;
                    var hFound = false;
                    for (var h = 0; h < harmonyStaves.length; h++) {
                        if (harmonyStaves[h].idx === hStaff) {
                            harmonyStaves[h].count++;
                            hFound = true;
                            break;
                        }
                    }
                    if (!hFound) harmonyStaves.push({ idx: hStaff, count: 1 });
                }
            }
        }
        segment = segment.next;
    }

    voiceStaves.sort(function(a, b) { return b.count - a.count; });
    harmonyStaves.sort(function(a, b) { return b.count - a.count; });

    return {
        voiceStaff: voiceStaves.length > 0 ? voiceStaves[0].idx : -1,
        harmonyStaff: harmonyStaves.length > 0 ? harmonyStaves[0].idx : -1,
        _allHarmonyFound: allHarmonyFound // DEBUG
    };
}

// Extract syllables from a staff
// Returns: array of { tick, verse, text, syllabic, durationQ, restAfter, restDurationQ, gapDurationQ }
function extractSyllables(staffIdx) {
    var syllables = [];
    var elements = [];
    var segment = curScore.firstSegment();
    while (segment) {
        var element = segment.elementAt(staffIdx * 4);
        if (element) {
            if (element.type === Element.CHORD || element.type === Element.REST) {
                elements.push({ segment: segment, element: element });
            }
        }
        segment = segment.next;
    }

    for (var e = 0; e < elements.length; e++) {
        var elem = elements[e].element;
        var seg = elements[e].segment;

        if (elem.type !== Element.CHORD) continue;

        var lyr = elem.lyrics;
        if (!lyr) continue;

        var durationQ = getDurationInQuarters(elem);

        var restAfter = false;
        var restDurationQ = 0;
        if (e + 1 < elements.length && elements[e + 1].element.type === Element.REST) {
            restAfter = true;
            restDurationQ = getDurationInQuarters(elements[e + 1].element);
        }

        var gapDurationQ = 0;
        for (var g = e + 1; g < elements.length; g++) {
            var gElem = elements[g].element;
            if (gElem.type === Element.REST) {
                gapDurationQ += getDurationInQuarters(gElem);
            } else if (gElem.type === Element.CHORD) {
                var gLyr = gElem.lyrics;
                if (!gLyr || gLyr.length === 0) {
                    gapDurationQ += getDurationInQuarters(gElem);
                } else {
                    break;
                }
            }
        }

        for (var l = 0; l < lyr.length; l++) {
            var lyric = lyr[l];
            if (!lyric.text) continue;

            var verse = lyric.verse || 0;
            var syllabicVal = lyric.syllabic || 0;
            var syllabicStr;
            switch (syllabicVal) {
                case 1: syllabicStr = "begin"; break;
                case 2: syllabicStr = "end"; break;
                case 3: syllabicStr = "middle"; break;
                default: syllabicStr = "single"; break;
            }

            syllables.push({
                tick: seg.tick,
                verse: verse,
                text: (syllabicStr === "single") ?
                    _stripHyphens(_stripHtml(lyric.text)) :
                    _stripHyphens(_stripHtml(lyric.text)).trim(),
                syllabic: syllabicStr,
                durationQ: durationQ,
                restAfter: restAfter,
                restDurationQ: restDurationQ,
                gapDurationQ: gapDurationQ
            });
        }
    }

    return syllables;
}

// Extract chord symbols from a staff
// Returns: array of { tick, chord }
function extractChords(harmonyStaffIdx) {
    var chords = [];
    var debugInfo = {
        fretDiagramsFound: [],
        fretDiagramErrors: []
    };

    var segment = curScore.firstSegment();
    while (segment) {
        var annotations = segment.annotations;
        if (annotations) {
            for (var a = 0; a < annotations.length; a++) {
                var ann = annotations[a];
                if (ann && ann.type === Element.HARMONY) {
                    var annStaff = Math.floor(ann.track / 4);
                    if (annStaff === harmonyStaffIdx || harmonyStaffIdx === -1) {
                        var chordText = _stripHtml(ann.text || "");
                        if (chordText) {
                            chords.push({
                                tick: segment.tick,
                                chord: chordText
                            });
                        }
                    }
                }
                // FretDiagram annotations: QML API does not expose nested Harmony.
                // Record their presence so the QProcess fallback can be triggered.
                if (ann && ann.type === 63) { // Type 63 = FRET_DIAGRAM
                    debugInfo.fretDiagramsFound.push({
                        tick: segment.tick,
                        staff: Math.floor(ann.track / 4)
                    });
                }
            }
        }
        segment = segment.next;
    }

    chords.sort(function(a, b) { return a.tick - b.tick; });

    // Store debug info globally so we can return it
    _fretDiagramDebug = debugInfo;

    return chords;
}

// Extract repeat barlines and volta brackets
function extractRepeats() {
    var repeats = [];
    var measure = curScore.firstMeasure;
    var repeatStartTick = -1;
    while (measure) {
        var seg = measure.firstSegment;
        var tick = seg ? seg.tick : -1;

        if (measure.repeatStart) {
            repeatStartTick = tick;
        }
        if (measure.repeatEnd) {
            var endMeasure = measure.nextMeasure;
            var endTick;
            if (endMeasure && endMeasure.firstSegment) {
                endTick = endMeasure.firstSegment.tick;
            } else {
                // Last measure: compute end from measure start + duration
                var lastSeg = measure.lastSegment;
                endTick = lastSeg ? lastSeg.tick + 480 : tick + 1920;
            }
            repeats.push({
                startTick: repeatStartTick >= 0 ? repeatStartTick : 0,
                endTick: endTick
            });
            repeatStartTick = -1;
        }
        measure = measure.nextMeasure;
    }
    return repeats;
}

function extractVoltas() {
    var voltas = [];
    try {
        var spanners = curScore.spanners;
        if (spanners) {
            for (var i = 0; i < spanners.length; i++) {
                var sp = spanners[i];
                if (sp && sp.type === Element.VOLTA) {
                    var vStart = toTicks(sp.spannerTick);
                    var vDur = toTicks(sp.spannerTicks);
                    voltas.push({
                        startTick: vStart,
                        endTick: vStart + vDur
                    });
                }
            }
        }
    } catch (e) {
        console.log("Cannot access spanners: " + e);
    }

    voltas.sort(function(a, b) { return a.startTick - b.startTick; });
    return voltas;
}

// Extract navigation markers (Segno, Coda, Fine, ToCoda) and jumps (D.S., D.C.)
// Returns: { markers: [{ tick, label, type }], jumps: [{ tick, jumpTo, playUntil, continueAt, playRepeats }] }
function extractNavigation() {
    var markers = [];
    var jumps = [];

    // Method 1: scan segment annotations
    var segment = curScore.firstSegment();
    while (segment) {
        var annotations = segment.annotations;
        if (annotations) {
            for (var a = 0; a < annotations.length; a++) {
                var ann = annotations[a];
                if (!ann) continue;

                if (ann.type === Element.MARKER) {
                    var label = ann.label || "";
                    var mType = "unknown";
                    if (label === "segno" || label === "varsegno") mType = "segno";
                    else if (label === "fine") mType = "fine";
                    else if (label === "coda") mType = "tocoda";
                    else if (label === "codab" || label === "varcoda" || label === "codetta") mType = "coda";

                    markers.push({
                        tick: segment.tick,
                        label: label,
                        type: mType
                    });
                }

                if (ann.type === Element.JUMP) {
                    jumps.push({
                        tick: segment.tick,
                        jumpTo: ann.jumpTo || "start",
                        playUntil: ann.playUntil || "end",
                        continueAt: ann.continueAt || "",
                        playRepeats: ann.playRepeats || false
                    });
                }
            }
        }
        segment = segment.next;
    }

    // Debug: log all annotation types found
    var _annTypes = {};
    var _segDbg = curScore.firstSegment();
    while (_segDbg) {
        var _anns = _segDbg.annotations;
        if (_anns) {
            for (var _a = 0; _a < _anns.length; _a++) {
                if (_anns[_a]) {
                    var _t = _anns[_a].type;
                    var _name = _anns[_a].name || "";
                    _annTypes[_t] = (_annTypes[_t] || 0) + 1;
                }
            }
        }
        _segDbg = _segDbg.next;
    }

    // Method 2: scan measure.elements (Jump/Marker are measure-level in MS4, not annotations)
    if (markers.length === 0 && jumps.length === 0) {
        try {
            var measure = curScore.firstMeasure;
            while (measure) {
                var seg = measure.firstSegment;
                var tick = seg ? seg.tick : 0;
                var elems = measure.elements;
                if (elems) {
                    for (var me = 0; me < elems.length; me++) {
                        var mel = elems[me];
                        if (!mel) continue;
                        if (mel.type === Element.MARKER) {
                            var mlabel = mel.label || "";
                            var mmType = "unknown";
                            if (mlabel === "segno" || mlabel === "varsegno") mmType = "segno";
                            else if (mlabel === "fine") mmType = "fine";
                            else if (mlabel === "coda") mmType = "tocoda";
                            else if (mlabel === "codab" || mlabel === "varcoda" || mlabel === "codetta") mmType = "coda";
                            markers.push({ tick: tick, label: mlabel, type: mmType });
                        }
                        if (mel.type === Element.JUMP) {
                            jumps.push({
                                tick: tick,
                                jumpTo: mel.jumpTo || "start",
                                playUntil: mel.playUntil || "end",
                                continueAt: mel.continueAt || "",
                                playRepeats: mel.playRepeats || false
                            });
                        }
                    }
                }
                measure = measure.nextMeasure;
            }
        } catch (e) {
            // Fallback: measure.elements not available
        }
    }

    markers.sort(function(a, b) { return a.tick - b.tick; });
    jumps.sort(function(a, b) { return a.tick - b.tick; });

    return { markers: markers, jumps: jumps, _annTypes: _annTypes };
}

// Extract system texts (section labels like "Solista", "Estribillo", etc.)
function extractSystemTexts() {
    var texts = [];
    var segment = curScore.firstSegment();
    while (segment) {
        var annotations = segment.annotations;
        if (annotations) {
            for (var a = 0; a < annotations.length; a++) {
                var ann = annotations[a];
                if (!ann) continue;
                if (ann.type === Element.STAFF_TEXT || ann.type === Element.SYSTEM_TEXT) {
                    var txt = ann.text || "";
                    if (txt) {
                        texts.push({ tick: segment.tick, text: txt });
                    }
                }
            }
        }
        segment = segment.next;
    }
    texts.sort(function(a, b) { return a.tick - b.tick; });
    return texts;
}

// Extract all data from the current score
// Returns the intermediate data structure consumed by the orchestrator
function extractAll() {
    var staves = findStaves();
    if (staves.voiceStaff === -1) return null;

    var syllables = extractSyllables(staves.voiceStaff);
    var chords = extractChords(staves.harmonyStaff);
    var repeats = extractRepeats();
    var voltas = extractVoltas();
    var navigation = extractNavigation();
    var systemTexts = extractSystemTexts();

    // Compute lastTick from the last measure
    var lastTick = 0;
    var measure = curScore.firstMeasure;
    while (measure) {
        var seg = measure.firstSegment;
        if (seg) lastTick = seg.tick;
        measure = measure.nextMeasure;
    }
    // Approximate: lastTick is start of last measure, add a measure worth
    if (syllables.length > 0) {
        var maxSylTick = syllables[syllables.length - 1].tick;
        if (maxSylTick > lastTick) lastTick = maxSylTick;
    }
    lastTick += 1920; // add ~1 measure buffer

    // Debug: collect staff info for diagnostics
    var _staffDebug = [];
    try {
        for (var dp = 0; dp < curScore.parts.length; dp++) {
            var dpart = curScore.parts[dp];
            var dinfo = { part: dp, name: dpart.longName || dpart.shortName || "" };
            try { dinfo.startTrack = dpart.startTrack; } catch(e) { dinfo.startTrack = "N/A"; }
            try { dinfo.endTrack = dpart.endTrack; } catch(e) { dinfo.endTrack = "N/A"; }
            try { dinfo.show = dpart.show; } catch(e) { dinfo.show = "N/A"; }
            _staffDebug.push(dinfo);
        }
    } catch(e) { _staffDebug.push({ error: "" + e }); }

    return {
        title: curScore.metaTag("workTitle") || curScore.metaTag("movementTitle") || curScore.title || curScore.scoreName || "",
        nstaves: curScore.nstaves,
        division: 480,
        syllables: syllables,
        chords: chords,
        repeats: repeats,
        voltas: voltas,
        markers: navigation.markers,
        jumps: navigation.jumps,
        systemTexts: systemTexts,
        lastTick: lastTick,
        _debug: {
            voiceStaff: staves.voiceStaff,
            harmonyStaff: staves.harmonyStaff,
            linkedStaves: findLinkedStaves(),
            parts: _staffDebug,
            annotationTypes: navigation._annTypes || {},
            elementMarker: typeof Element !== "undefined" ? Element.MARKER : "N/A",
            elementJump: typeof Element !== "undefined" ? Element.JUMP : "N/A",
            allHarmonyFound: staves._allHarmonyFound || [],
            fretDiagramDebug: _fretDiagramDebug
        }
    };
}

if (typeof exports !== "undefined") {
    exports.extractAll = extractAll;
    exports.findStaves = findStaves;
    exports.extractSyllables = extractSyllables;
    exports.extractChords = extractChords;
    exports.extractRepeats = extractRepeats;
    exports.extractVoltas = extractVoltas;
    exports.extractNavigation = extractNavigation;
}
