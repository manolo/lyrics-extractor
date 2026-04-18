// MuseScore API extractor: extracts lyrics, chords, and repeat structure
// from the current score using the MuseScore plugin API (curScore global)
// Used in the MuseScore extension context (apiversion 1)

// --- Score reference ---
// _score points to the score to extract from. Defaults to _getScore().
// When the user is viewing an excerpt, the caller sets this to masterScore.
var _score = null;
function _getScore() { return _score || curScore; }

// Transform a file name into a readable title:
// camelCase split, hyphen/underscore to spaces, capitalize, lowercase minor words.
function _titleFromFileName(name) {
    if (!name) return "";
    // Split camelCase: insert space before each uppercase letter that follows a lowercase
    var spaced = name.replace(/([a-záéíóúàèìòùäëïöüñç])([A-ZÁÉÍÓÚÀÈÌÒÙÄËÏÖÜÑÇ])/g, "$1 $2");
    // Replace hyphens and underscores with spaces
    spaced = spaced.replace(/[-_]+/g, " ");
    // Capitalize first letter of each space-separated word
    spaced = spaced.replace(/(^| )(\S)/g, function(m, sp, c) { return sp + c.toUpperCase(); });
    // Lowercase minor words (not at start), apply repeatedly for adjacent matches
    var minor = / (De|Del|La|El|Las|Los|En|Y|Al|A)(?= )/g;
    var prev = "";
    while (spaced !== prev) { prev = spaced; spaced = spaced.replace(minor, function(m) { return m.toLowerCase(); }); }
    return spaced;
}

// Get score title: metaTags first, then VBox title text, then file name.
function _getTitle() {
    var s = _getScore();
    // 1. Project properties (metaTags)
    var t = s.metaTag("workTitle") || s.metaTag("movementTitle") || s.title;
    if (t) return t;
    // 2. VBox: first frame's text element with "title" style
    t = _getTitleFromVBox(s);
    if (t) return t;
    // 3. Derive from file name
    return _titleFromFileName(s.scoreName || "");
}

// Read a text element from the first VBox frame by its style name.
// styleName: "title", "subtitle", "composer", "lyricist"
function _getVBoxText(score, styleName) {
    try {
        var mb = score.firstMeasure;
        while (mb.prev) mb = mb.prev;
        var elems = mb.elements;
        for (var i = 0; i < elems.length; i++) {
            if (elems[i].text && elems[i].subtypeName === styleName) return elems[i].text;
        }
    } catch (e) {}
    return "";
}

function _getTitleFromVBox(score) {
    return _getVBoxText(score, "title");
}

// --- Global debug variables ---
var _fretDiagramDebug = null;

// --- Injected dependencies ---
// text-utils is injected via setTextUtils() to avoid duplicating code.
// QML caller passes TextUtils; Node.js auto-wires via require().
var _textUtils = null;
function setTextUtils(tu) { _textUtils = tu; }

// --- Internal helpers (delegating to injected text-utils) ---
function _stripHtml(text) { return _textUtils.stripHtml(text); }
function _stripHyphens(text) { return _textUtils.stripHyphens(text); }

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
// Uses _getScore().staves[i].isTabStaff and staff.part to identify
// which staves are tablature copies (linked) of a principal staff.
// For each Part with multiple staves, non-first staves are linked.
function findLinkedStaves() {
    var linked = {};
    try {
        var staves = _getScore().staves;
        // Build map: for each Part, find its staff indices and mark non-principal
        for (var p = 0; p < _getScore().parts.length; p++) {
            var part = _getScore().parts[p];
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
            var staves2 = _getScore().staves;
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
        for (var pi = 0; pi < _getScore().parts.length; pi++) {
            var part = _getScore().parts[pi];
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

    var segment = _getScore().firstSegment();
    while (segment) {
        for (var staff = 0; staff < _getScore().nstaves; staff++) {
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
    var segment = _getScore().firstSegment();
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
                restAfter: false,
                restDurationQ: 0,
                gapDurationQ: 0
            });
        }
    }

    // Compute gaps between syllables (same logic as xml-extractor).
    // Uses tick difference between consecutive syllables of the same verse
    // instead of looking for physical REST elements (more reliable).
    syllables.sort(function(a, b) { return a.tick - b.tick || a.verse - b.verse; });
    for (var gi = 0; gi < syllables.length; gi++) {
        var gSyl = syllables[gi];
        for (var gj = gi + 1; gj < syllables.length; gj++) {
            if (syllables[gj].verse === gSyl.verse) {
                var gap = (syllables[gj].tick - gSyl.tick) / 480 - gSyl.durationQ;
                if (gap > 0) {
                    gSyl.gapDurationQ = gap;
                    if (gap > 0.25) {
                        gSyl.restAfter = true;
                        gSyl.restDurationQ = gap;
                    }
                }
                break;
            }
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
        fretDiagramErrors: [],
        annotationsByType: {}  // diagnostic: type -> {count, sampleText, staff}
    };

    var segment = _getScore().firstSegment();
    while (segment) {
        var annotations = segment.annotations;
        if (annotations) {
            for (var a = 0; a < annotations.length; a++) {
                var ann = annotations[a];
                // Diagnostic: track every annotation type seen
                if (ann && ann.type !== undefined) {
                    var key = "" + ann.type;
                    if (!debugInfo.annotationsByType[key]) {
                        debugInfo.annotationsByType[key] = {
                            count: 0,
                            sampleText: "",
                            sampleStaff: -1
                        };
                    }
                    debugInfo.annotationsByType[key].count++;
                    if (!debugInfo.annotationsByType[key].sampleText) {
                        try { debugInfo.annotationsByType[key].sampleText = (ann.text || "").substring(0, 40); } catch (e) {}
                        try { debugInfo.annotationsByType[key].sampleStaff = Math.floor(ann.track / 4); } catch (e) {}
                    }
                }
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
                // Inline text annotations -> chord line.
                // STAFF_TEXT=52, EXPRESSION=42, PLAYTECH_ANNOTATION=55 or 56 (varies by MS4 minor version).
                // We accept both 55 and 56 for PlayTechAnnotation since the enum shifted between releases.
                if (ann && (ann.type === Element.STAFF_TEXT || ann.type === Element.EXPRESSION
                            || ann.type === 52 || ann.type === 42
                            || ann.type === 55 || ann.type === 56
                            || (typeof Element.PLAYTECH_ANNOTATION !== "undefined" && ann.type === Element.PLAYTECH_ANNOTATION))) {
                    var inlineStaff = Math.floor(ann.track / 4);
                    if (inlineStaff === harmonyStaffIdx || harmonyStaffIdx === -1) {
                        var inlineText = _stripHtml(ann.text || "");
                        if (inlineText) {
                            // Collapse internal whitespace to '-' so the chord line reads
                            // as a single token (otherwise "Staff text" looks like two chords).
                            inlineText = inlineText.replace(/\s+/g, "-");
                            chords.push({ tick: segment.tick, chord: inlineText });
                        }
                    }
                }
                // FretDiagram annotations: try native API (4.7+), fallback for older versions
                if (ann && ann.type === 63) { // Type 63 = FRET_DIAGRAM
                    var fdChord = "";
                    try { fdChord = ann.harmonyPlainText || ""; } catch (e) { fdChord = ""; }

                    if (fdChord) {
                        var fdStaff = Math.floor(ann.track / 4);
                        if (fdStaff === harmonyStaffIdx || harmonyStaffIdx === -1) {
                            console.log("[fret-api] chord '" + fdChord + "' at tick " + segment.tick + " staff " + fdStaff);
                            chords.push({ tick: segment.tick, chord: fdChord });
                        }
                        debugInfo.fretDiagramsFound.push({
                            tick: segment.tick, staff: fdStaff, extracted: true
                        });
                    } else {
                        console.log("[fret-api] no API at tick " + segment.tick + ", marking for fallback");
                        debugInfo.fretDiagramsFound.push({
                            tick: segment.tick, staff: Math.floor(ann.track / 4)
                        });
                    }
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
    var measure = _getScore().firstMeasure;
    var repeatStartTick = -1;
    while (measure) {
        var seg = measure.firstSegment;
        var tick = seg ? seg.tick : -1;

        if (measure.repeatStart) {
            repeatStartTick = tick;
        }
        if (measure.repeatEnd) {
            // Compute end tick from the measure's tick + duration.
            // measure.ticks is a FractionWrapper; .ticks gives MIDI ticks.
            var endTick;
            try {
                var measDur = measure.ticks ? measure.ticks.ticks : 0;
                endTick = measDur > 0 ? tick + measDur : tick + 1920;
            } catch (e) {
                var lastSeg = measure.lastSegment;
                endTick = lastSeg ? lastSeg.tick + 480 : tick + 1920;
            }
            var repeatCount = 2;
            try { repeatCount = measure.repeatCount || 2; } catch (e) {}
            repeats.push({
                startTick: repeatStartTick >= 0 ? repeatStartTick : 0,
                endTick: endTick,
                repeatCount: repeatCount
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
        var spanners = _getScore().spanners;
        if (spanners) {
            for (var i = 0; i < spanners.length; i++) {
                var sp = spanners[i];
                if (sp && sp.type === Element.VOLTA) {
                    var vStart = toTicks(sp.spannerTick);
                    var vDur = toTicks(sp.spannerTicks);
                    var endingList = [];
                    try {
                        // QML property: volta_ending (INT_VEC)
                        var endings = sp.volta_ending;
                        if (endings && endings.length) {
                            for (var e = 0; e < endings.length; e++) endingList.push(endings[e]);
                        }
                    } catch (ev) {}
                    // Fallback: parse volta display text ("1-2", "1.", "1.2.", etc.)
                    if (endingList.length === 0) {
                        try {
                            var voltaText = sp.text || sp.beginText || "";
                            var nums = voltaText.match(/\d+/g);
                            if (nums) {
                                // Handle range "1-3" → [1,2,3]
                                if (nums.length === 2 && voltaText.indexOf("-") >= 0) {
                                    var from = parseInt(nums[0]), to = parseInt(nums[1]);
                                    for (var r = from; r <= to; r++) endingList.push(r);
                                } else {
                                    for (var en = 0; en < nums.length; en++) {
                                        var n = parseInt(nums[en]);
                                        if (n > 0 && endingList.indexOf(n) < 0) endingList.push(n);
                                    }
                                }
                            }
                        } catch (et) {}
                    }
                    voltas.push({
                        startTick: vStart,
                        endTick: vStart + vDur,
                        endingList: endingList
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
    var segment = _getScore().firstSegment();
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
    var _segDbg = _getScore().firstSegment();
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
            var measure = _getScore().firstMeasure;
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
    var segment = _getScore().firstSegment();
    while (segment) {
        var annotations = segment.annotations;
        if (annotations) {
            for (var a = 0; a < annotations.length; a++) {
                var ann = annotations[a];
                if (!ann) continue;
                // System-wide labels only: SYSTEM_TEXT and REHEARSAL_MARK (60).
                // STAFF_TEXT belongs to a single staff and is treated as inline chord
                // text in extractChords(), not as a section title.
                if (ann.type === Element.SYSTEM_TEXT || ann.type === 60) {
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

// Extract section barlines (double, final, etc.)
// Returns: array of { tick, type } sorted by tick
function extractBarlines() {
    var barlines = [];
    var measure = _getScore().firstMeasure;
    while (measure) {
        var seg = measure.firstSegment;
        var tick = seg ? seg.tick : 0;

        // Check for endRepeat (already handled in extractRepeats, but mark as barline too)
        if (measure.repeatEnd) {
            var endMeasure = measure.nextMeasure;
            var endTick;
            if (endMeasure && endMeasure.firstSegment) {
                endTick = endMeasure.firstSegment.tick;
            } else {
                var lastSeg = measure.lastSegment;
                endTick = lastSeg ? lastSeg.tick + 480 : tick + 1920;
            }
            barlines.push({ tick: endTick, type: "endRepeat" });
        }

        // Check annotations for BarLine elements with special subtypes
        // BAR_LINE element type = 10 in MuseScore 4
        if (seg) {
            var annotations = seg.annotations;
            if (annotations) {
                for (var a = 0; a < annotations.length; a++) {
                    var ann = annotations[a];
                    if (ann && ann.type === 10) { // BAR_LINE
                        try {
                            var sub = ann.subtype;
                            // BarLineType: DOUBLE=2, END/FINAL=0x20=32, HEAVY=0x200=512, DOUBLE_HEAVY=0x400=1024
                            if (sub === 2) barlines.push({ tick: tick, type: "double" });
                            else if (sub === 32) barlines.push({ tick: tick, type: "final" });
                            else if (sub === 512) barlines.push({ tick: tick, type: "heavy" });
                            else if (sub === 1024) barlines.push({ tick: tick, type: "double-heavy" });
                        } catch (e) { /* subtype not accessible */ }
                    }
                }
            }
        }

        // Check measure's end barline type. Try the property first (4.7+),
        // then fall back to scanning the last segment's elements.
        var foundEndBar = false;
        try {
            var ebl = measure.endBarLineType;
            if (ebl === 32 || ebl === 2 || ebl === 512 || ebl === 1024) {
                var endMNext = measure.nextMeasure;
                var endT = endMNext && endMNext.firstSegment
                    ? endMNext.firstSegment.tick
                    : (measure.lastSegment ? measure.lastSegment.tick + 480 : tick + 1920);
                var eblType = ebl === 32 ? "final" : ebl === 2 ? "double" : ebl === 512 ? "heavy" : "double-heavy";
                barlines.push({ tick: endT, type: eblType });
                foundEndBar = true;
            }
        } catch (e) {}
        // Fallback: walk segments looking for barline elements (type 10)
        if (!foundEndBar) {
            try {
                var bSeg = measure.lastSegment;
                if (bSeg) {
                    for (var bTrack = 0; bTrack < curScore.nstaves * 4; bTrack++) {
                        var bElem = bSeg.elementAt(bTrack);
                        if (bElem && bElem.type === 10) {
                            var bSub = -1;
                            try { bSub = bElem.subtype || bElem.barLineType || -1; } catch (e2) {}
                            if (bSub === 32 || bSub === 2 || bSub === 512 || bSub === 1024) {
                                var endMNext2 = measure.nextMeasure;
                                var endT2 = endMNext2 && endMNext2.firstSegment
                                    ? endMNext2.firstSegment.tick
                                    : (bSeg.tick + 480);
                                var eblType2 = bSub === 32 ? "final" : bSub === 2 ? "double" : bSub === 512 ? "heavy" : "double-heavy";
                                barlines.push({ tick: endT2, type: eblType2 });
                                foundEndBar = true;
                            }
                            break;
                        }
                    }
                }
            } catch (e) {}
        }

        measure = measure.nextMeasure;
    }
    barlines.sort(function(a, b) { return a.tick - b.tick; });
    return barlines;
}

// Detect if the score has an FBox frame with FretDiagram elements.
// Uses MeasureBase.next (MS4.6+) to iterate measures and frames.
// Search a score for FBox frames containing FretDiagram elements
function _scorHasFretBox(score) {
    try {
        var mb = score.firstMeasure;
        if (!mb) return false;
        try { while (mb.prev) mb = mb.prev; } catch (e) { return false; }
        var limit = 300;
        while (mb && limit-- > 0) {
            try {
                var elems = mb.elements;
                if (elems) {
                    for (var i = 0; i < elems.length; i++) {
                        if (elems[i] && elems[i].type === 63) return true; // FRET_DIAGRAM
                    }
                }
            } catch (e) { /* skip */ }
            try { mb = mb.next; } catch (e) { break; }
        }
    } catch (e) { /* skip */ }
    return false;
}

function hasFretDiagramBox() {
    // Check main score first
    if (_scorHasFretBox(curScore)) return true;

    // Check guitar excerpts (partScore)
    try {
        var excerpts = _getScore().excerpts;
        if (excerpts) {
            for (var i = 0; i < excerpts.length; i++) {
                var title = (excerpts[i].title || "").toLowerCase();
                if (title.indexOf("guitar") >= 0 || title.indexOf("guitarra") >= 0) {
                    try {
                        var partScore = excerpts[i].partScore;
                        if (partScore && _scorHasFretBox(partScore)) return true;
                    } catch (e) { /* partScore not accessible */ }
                }
            }
        }
    } catch (e) { /* excerpts not accessible */ }

    return false;
}

// Check if the fallback directory is needed for fret diagram extraction.
// Returns false when: no FretDiagrams exist, or the native API can handle them.
function needsFallbackDirectory() {
    var hasFBox = hasFretDiagramBox();
    if (!hasFBox) {
        console.log("[fret-api] needsFallbackDirectory: NO (no FBox)");
        return false;
    }
    var api = _fretApiAvailable();
    console.log("[fret-api] needsFallbackDirectory: hasFBox=true, api=" + api);
    return !api;
}

// Probe a single FretDiagram element for native API (4.7+)
function _probeFretDiagramAPI(fd) {
    try {
        var hasDots = typeof fd.dots === "function";
        console.log("[fret-api] probed FretDiagram: dots()=" + hasDots);
        return hasDots;
    } catch (e) {
        console.log("[fret-api] probe failed: " + e);
        return false;
    }
}

// Check if the native FretDiagram API is available (MuseScore 4.7+)
// by probing a FretDiagram element in FBox frames of this score
function _fretApiAvailableInScore(score) {
    try {
        var mb = score.firstMeasure;
        if (!mb) return null; // null = no FretDiagram found to probe
        try { while (mb.prev) mb = mb.prev; } catch (e) { return null; }
        var limit = 300;
        while (mb && limit-- > 0) {
            try {
                var elems = mb.elements;
                if (elems) {
                    for (var i = 0; i < elems.length; i++) {
                        if (elems[i] && elems[i].type === 63) {
                            return _probeFretDiagramAPI(elems[i]);
                        }
                    }
                }
            } catch (e) { /* skip */ }
            try { mb = mb.next; } catch (e) { break; }
        }
    } catch (e) { /* skip */ }
    return null; // no FretDiagram found
}

// Check if native FretDiagram API is available, checking main score + guitar excerpts
function _fretApiAvailable() {
    console.log("[fret-api] _fretApiAvailable: probing main score");
    var result = _fretApiAvailableInScore(curScore);
    if (result !== null) return result;

    // Also probe in segment annotations (FretDiagram as chord symbol, not in FBox)
    try {
        var segment = _getScore().firstSegment();
        while (segment) {
            var annotations = segment.annotations;
            if (annotations) {
                for (var a = 0; a < annotations.length; a++) {
                    if (annotations[a] && annotations[a].type === 63) {
                        return _probeFretDiagramAPI(annotations[a]);
                    }
                }
            }
            segment = segment.next;
        }
    } catch (e) { /* skip */ }

    // Probe guitar excerpts
    try {
        var excerpts = _getScore().excerpts;
        if (excerpts) {
            for (var i = 0; i < excerpts.length; i++) {
                var title = (excerpts[i].title || "").toLowerCase();
                if (title.indexOf("guitar") >= 0 || title.indexOf("guitarra") >= 0) {
                    try {
                        var partScore = excerpts[i].partScore;
                        if (partScore) {
                            console.log("[fret-api] _fretApiAvailable: probing excerpt '" + excerpts[i].title + "'");
                            result = _fretApiAvailableInScore(partScore);
                            if (result !== null) return result;
                        }
                    } catch (e) { /* skip */ }
                }
            }
        }
    } catch (e) { /* skip */ }

    console.log("[fret-api] _fretApiAvailable: no FretDiagram found to probe");
    return false;
}

// Extract fret diagram data from a single score's FBox frames via native API
// Returns array of diagram objects compatible with fretboard-renderer
function _extractFretDiagramsFromScore(score) {
    var diagrams = [];
    var seen = {};
    try {
        var mb = score.firstMeasure;
        if (!mb) return diagrams;
        try { while (mb.prev) mb = mb.prev; } catch (e) { return diagrams; }
        var limit = 300;
        while (mb && limit-- > 0) {
            try {
                var elems = mb.elements;
                if (elems) {
                    for (var i = 0; i < elems.length; i++) {
                        var fd = elems[i];
                        if (!fd || fd.type !== 63) continue;

                        var chordName = "";
                        try { chordName = fd.harmonyPlainText || ""; } catch (e) { continue; }
                        if (!chordName) continue;

                        var numStrings = 6;
                        try { numStrings = fd.strings || 6; } catch (e) {}
                        var numFrets = 4;
                        try { numFrets = fd.frets || 4; } catch (e) {}
                        var fretOffset = 0;
                        try { fretOffset = fd.fretOffset || 0; } catch (e) {}

                        // Read dots -> convert to renderer format
                        var strings = [];
                        var dotsByString = {};
                        try {
                            var apiDots = fd.dots();
                            for (var d = 0; d < apiDots.length; d++) {
                                var dot = apiDots[d];
                                dotsByString[dot.string] = { fret: dot.fret };
                            }
                        } catch (e) {
                            console.log("[fret-api] dots() failed: " + e);
                        }

                        // Read markers -> convert to renderer format
                        var markersByString = {};
                        try {
                            var apiMarkers = fd.markers();
                            for (var m = 0; m < apiMarkers.length; m++) {
                                var mk = apiMarkers[m];
                                // FretMarkerType: 1=CIRCLE (open), 2=CROSS (muted)
                                markersByString[mk.string] = mk.markerType === 2 ? "cross" : "circle";
                            }
                        } catch (e) {
                            console.log("[fret-api] markers() failed: " + e);
                        }

                        // Build strings array (all strings, 0 to numStrings-1)
                        for (var s = 0; s < numStrings; s++) {
                            var strObj = { number: s };
                            if (markersByString[s]) {
                                strObj.marker = markersByString[s];
                            } else if (dotsByString[s]) {
                                strObj.dot = dotsByString[s];
                            }
                            strings.push(strObj);
                        }

                        // Read barres -> take first one
                        var barre = null;
                        try {
                            var apiBarres = fd.barres();
                            if (apiBarres.length > 0) {
                                var b = apiBarres[0];
                                barre = { start: b.startString, end: b.endString, fret: b.fret };
                            }
                        } catch (e) {
                            console.log("[fret-api] barres() failed: " + e);
                        }

                        // Deduplicate by fingerprint
                        var fp = chordName + "|";
                        for (var si = 0; si < strings.length; si++) {
                            var ss = strings[si];
                            if (ss.marker) fp += ss.number + ":" + ss.marker + ",";
                            else if (ss.dot) fp += ss.number + ":" + ss.dot.fret + ",";
                        }
                        if (barre) fp += "barre:" + barre.start + "-" + barre.end + ":" + barre.fret;
                        if (seen[fp]) continue;
                        seen[fp] = true;

                        var diagram = {
                            chordName: chordName,
                            strings: strings,
                            fretOffset: fretOffset,
                            numFrets: numFrets,
                            barre: barre
                        };
                        diagrams.push(diagram);
                        console.log("[fret-api] FBox diagram: " + chordName +
                                    " strings=" + numStrings + " frets=" + numFrets +
                                    " offset=" + fretOffset +
                                    " dots=" + Object.keys(dotsByString).length +
                                    " markers=" + Object.keys(markersByString).length +
                                    " barre=" + (barre ? "yes" : "no"));
                    }
                }
            } catch (e) { /* skip frame */ }
            try { mb = mb.next; } catch (e) { break; }
        }
    } catch (e) {
        console.log("[fret-api] _extractFretDiagramsFromScore error: " + e);
    }
    return diagrams;
}

// Extract fret diagrams from all scores (main + guitar excerpts) via native API
function extractFretDiagramsFromAPI() {
    console.log("[fret-api] extractFretDiagramsFromAPI: START");
    var diagrams = _extractFretDiagramsFromScore(curScore);
    console.log("[fret-api] main score: " + diagrams.length + " diagrams");

    // Also check guitar excerpts
    try {
        var excerpts = _getScore().excerpts;
        if (excerpts) {
            for (var i = 0; i < excerpts.length; i++) {
                var title = (excerpts[i].title || "").toLowerCase();
                if (title.indexOf("guitar") >= 0 || title.indexOf("guitarra") >= 0) {
                    try {
                        var partScore = excerpts[i].partScore;
                        if (partScore) {
                            var excerptDiagrams = _extractFretDiagramsFromScore(partScore);
                            console.log("[fret-api] excerpt '" + excerpts[i].title + "': " + excerptDiagrams.length + " diagrams");
                            for (var d = 0; d < excerptDiagrams.length; d++) {
                                diagrams.push(excerptDiagrams[d]);
                            }
                        }
                    } catch (e) {
                        console.log("[fret-api] excerpt error: " + e);
                    }
                }
            }
        }
    } catch (e) {
        console.log("[fret-api] excerpts error: " + e);
    }

    console.log("[fret-api] extractFretDiagramsFromAPI: END total=" + diagrams.length);
    return diagrams;
}

// Extract all data from the current score
// Returns the intermediate data structure consumed by the orchestrator
function extractAll() {
    // If viewing an excerpt, use the master score for extraction
    try {
        var master = curScore.masterScore;
        _score = (master && !master.is(curScore)) ? master : curScore;
    } catch (e) {
        _score = curScore;
    }

    var staves = findStaves();

    var syllables = staves.voiceStaff >= 0 ? extractSyllables(staves.voiceStaff) : [];
    var chords = extractChords(staves.harmonyStaff);
    var repeats = extractRepeats();
    var voltas = extractVoltas();
    var navigation = extractNavigation();
    var systemTexts = extractSystemTexts();
    var barlines = extractBarlines();

    // Compute lastTick from the last measure
    var lastTick = 0;
    var measure = _getScore().firstMeasure;
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
        for (var dp = 0; dp < _getScore().parts.length; dp++) {
            var dpart = _getScore().parts[dp];
            var dinfo = { part: dp, name: dpart.longName || dpart.shortName || "" };
            try { dinfo.startTrack = dpart.startTrack; } catch(e) { dinfo.startTrack = "N/A"; }
            try { dinfo.endTrack = dpart.endTrack; } catch(e) { dinfo.endTrack = "N/A"; }
            try { dinfo.show = dpart.show; } catch(e) { dinfo.show = "N/A"; }
            _staffDebug.push(dinfo);
        }
    } catch(e) { _staffDebug.push({ error: "" + e }); }

    // Extract fret diagrams via native API if available (4.7+)
    var fretDiagrams = [];
    var fretDiagramsExtracted = false;
    var allFDExtracted = _fretDiagramDebug
        && _fretDiagramDebug.fretDiagramsFound.length > 0
        && _fretDiagramDebug.fretDiagramsFound.every(function(fd) { return fd.extracted; });
    var hasFBox = hasFretDiagramBox();
    var apiAvailable = allFDExtracted || _fretApiAvailable();

    if (apiAvailable && hasFBox) {
        console.log("[fret-api] API available, extracting FBox diagrams natively");
        fretDiagrams = extractFretDiagramsFromAPI();
        fretDiagramsExtracted = fretDiagrams.length > 0;
    } else if (apiAvailable) {
        console.log("[fret-api] API available, no FBox to extract");
        fretDiagramsExtracted = true; // no diagrams needed, skip fallback
    } else {
        console.log("[fret-api] API not available, fallback may be needed");
    }

    return {
        title: _getTitle(),
        nstaves: _getScore().nstaves,
        division: 480,
        syllables: syllables,
        chords: chords,
        repeats: repeats,
        voltas: voltas,
        markers: navigation.markers,
        jumps: navigation.jumps,
        systemTexts: systemTexts,
        barlines: barlines,
        lastTick: lastTick,
        fretDiagrams: fretDiagrams.length > 0 ? fretDiagrams : undefined,
        _debug: {
            voiceStaff: staves.voiceStaff,
            harmonyStaff: staves.harmonyStaff,
            linkedStaves: findLinkedStaves(),
            parts: _staffDebug,
            annotationTypes: navigation._annTypes || {},
            elementMarker: typeof Element !== "undefined" ? Element.MARKER : "N/A",
            elementJump: typeof Element !== "undefined" ? Element.JUMP : "N/A",
            allHarmonyFound: staves._allHarmonyFound || [],
            fretDiagramDebug: _fretDiagramDebug,
            hasFretBox: hasFBox,
            fretDiagramsExtracted: fretDiagramsExtracted
        }
    };
}

if (typeof exports !== "undefined") {
    // Auto-wire text-utils in Node.js context
    _textUtils = require("../lib/text-utils");

    exports._titleFromFileName = _titleFromFileName;
    exports._getTitle = _getTitle;
    exports._getTitleFromVBox = _getTitleFromVBox;
    exports._setScore = function(s) { _score = s; };
    exports.extractAll = extractAll;
    exports.findStaves = findStaves;
    exports.extractSyllables = extractSyllables;
    exports.extractChords = extractChords;
    exports.extractRepeats = extractRepeats;
    exports.extractVoltas = extractVoltas;
    exports.extractNavigation = extractNavigation;
    exports.extractSystemTexts = extractSystemTexts;
    exports._extractFretDiagramsFromScore = _extractFretDiagramsFromScore;
    exports._fretApiAvailableInScore = _fretApiAvailableInScore;
    exports.needsFallbackDirectory = needsFallbackDirectory;
    exports.setTextUtils = setTextUtils;
}
