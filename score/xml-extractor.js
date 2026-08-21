// Lyrics Extractor for MuseScore
// Copyright (C) 2026 Manolo Carrasco (do2tis)
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Licensed under the GNU General Public License version 3 or later, with an
// additional attribution requirement under section 7(b): see LICENSE and ATTRIBUTION.md.

// XML extractor: extracts lyrics, chords, and repeat structure
// from parsed .mscx XML content (MuseScore 4 format)
// Used by the Node.js CLI

var Constants = require("../lib/constants");
var TextUtils = require("../lib/text-utils");

// Simple XML DOM parser (no external dependencies)
// Returns a tree of { tag, attrs, children, text }
function parseXml(xml) {
    var pos = 0;

    function skipWhitespace() {
        while (pos < xml.length && /\s/.test(xml[pos])) pos++;
    }

    function parseAttrs() {
        var attrs = {};
        while (pos < xml.length && xml[pos] !== '>' && xml[pos] !== '/') {
            skipWhitespace();
            if (xml[pos] === '>' || xml[pos] === '/') break;

            var nameStart = pos;
            while (pos < xml.length && xml[pos] !== '=' && xml[pos] !== '>' && xml[pos] !== '/' && !/\s/.test(xml[pos])) pos++;
            var name = xml.substring(nameStart, pos);
            skipWhitespace();

            if (xml[pos] === '=') {
                pos++;
                skipWhitespace();
                var quote = xml[pos];
                if (quote === '"' || quote === "'") {
                    pos++;
                    var valStart = pos;
                    while (pos < xml.length && xml[pos] !== quote) pos++;
                    attrs[name] = xml.substring(valStart, pos);
                    pos++;
                }
            }
        }
        return attrs;
    }

    function parseNode() {
        skipWhitespace();
        if (pos >= xml.length) return null;

        // Skip XML declaration, processing instructions, comments, DOCTYPE
        while (pos < xml.length && xml[pos] === '<' &&
               (xml[pos + 1] === '?' || xml[pos + 1] === '!')) {
            if (xml[pos + 1] === '?' || (xml[pos + 1] === '!' && xml[pos + 2] === '-')) {
                var endMarker = xml[pos + 1] === '?' ? '?>' : '-->';
                var endIdx = xml.indexOf(endMarker, pos);
                if (endIdx === -1) { pos = xml.length; return null; }
                pos = endIdx + endMarker.length;
            } else if (xml[pos + 1] === '!' && xml.substring(pos + 2, pos + 9) === 'DOCTYPE') {
                var dtEnd = xml.indexOf('>', pos);
                if (dtEnd === -1) { pos = xml.length; return null; }
                pos = dtEnd + 1;
            } else {
                break;
            }
            skipWhitespace();
        }

        if (pos >= xml.length || xml[pos] !== '<') return null;
        if (xml[pos + 1] === '/') return null;

        pos++; // skip '<'
        var tagStart = pos;
        while (pos < xml.length && xml[pos] !== '>' && xml[pos] !== '/' && !/\s/.test(xml[pos])) pos++;
        var tag = xml.substring(tagStart, pos);

        skipWhitespace();
        var attrs = parseAttrs();

        // Self-closing tag
        if (xml[pos] === '/') {
            pos += 2; // skip '/>'
            return { tag: tag, attrs: attrs, children: [], text: "" };
        }

        pos++; // skip '>'

        var children = [];
        var textParts = [];

        while (pos < xml.length) {
            // Check for closing tag
            if (xml[pos] === '<' && xml[pos + 1] === '/') {
                var closeEnd = xml.indexOf('>', pos);
                pos = closeEnd + 1;
                break;
            }

            // Try to parse child element
            if (xml[pos] === '<' && xml[pos + 1] !== '/' && xml[pos + 1] !== '!' && xml[pos + 1] !== '?') {
                var child = parseNode();
                if (child) children.push(child);
                else break;
            } else if (xml[pos] === '<' && (xml[pos + 1] === '!' || xml[pos + 1] === '?')) {
                // Skip comments/PIs inside elements
                var cm = xml[pos + 1] === '?' ? '?>' : '-->';
                var cmEnd = xml.indexOf(cm, pos);
                if (cmEnd === -1) { pos = xml.length; break; }
                pos = cmEnd + cm.length;
            } else {
                // Text content
                var textStart = pos;
                while (pos < xml.length && xml[pos] !== '<') pos++;
                var t = xml.substring(textStart, pos);
                if (t.trim()) textParts.push(decodeEntities(t));
            }
        }

        return { tag: tag, attrs: attrs, children: children, text: textParts.join("") };
    }

    return parseNode();
}

function decodeEntities(text) {
    return text.replace(/&amp;/g, "&").replace(/&lt;/g, "<")
               .replace(/&gt;/g, ">").replace(/&quot;/g, '"')
               .replace(/&apos;/g, "'");
}

// Find first child with given tag
function findChild(node, tag) {
    if (!node || !node.children) return null;
    for (var i = 0; i < node.children.length; i++) {
        if (node.children[i].tag === tag) return node.children[i];
    }
    return null;
}

// Find all children with given tag
function findChildren(node, tag) {
    if (!node || !node.children) return [];
    var result = [];
    for (var i = 0; i < node.children.length; i++) {
        if (node.children[i].tag === tag) result.push(node.children[i]);
    }
    return result;
}

// Get text content of a child element
function childText(node, tag) {
    var child = findChild(node, tag);
    return child ? child.text : "";
}

// Convert a MuseScore fraction string ("-1/4", "3/8", "2") to ticks
function fractionToTicks(text, division) {
    var parts = String(text).split("/");
    var num = parseInt(parts[0]);
    var den = parts.length > 1 ? parseInt(parts[1]) : 1;
    if (isNaN(num) || isNaN(den) || den === 0) return 0;
    return Math.round((num / den) * 4 * division);
}

// Tick shift declared by a voice-level <location> element. MuseScore writes one
// when the next element sits at a tick the running duration does not reach, which
// is how annotations end up before or after the notes they belong to.
function locationOffsetTicks(locNode, division, measureTicks) {
    var ticks = 0;
    var fractions = childText(locNode, "fractions");
    if (fractions) ticks += fractionToTicks(fractions, division);
    var measures = childText(locNode, "measures");
    if (measures) {
        var count = parseInt(measures);
        if (!isNaN(count)) ticks += count * (measureTicks || division * 4);
    }
    return ticks;
}

// MuseScore can name rehearsal marks after the measure they sit in. Its own
// sequencer (EditRehearsalMark::nextRehearsalMarkText) works it out the same way:
// when a mark's number equals its measure number, it assumes the score numbers
// marks by measure throughout and names every new mark after its measure. Those
// marks are rehearsal references ("we start at bar 26"), placed every few bars
// regardless of the music, so they are not section titles.
//
// A number that does not match its measure is a deliberate name (a numbered
// section such as 1, 2, 3) and stays a title, as does any non-numeric text.
//
// measureNumber counts measures from 1. A score that excludes measures from the
// count shifts the real numbering, and then a genuine measure-number mark no
// longer matches and is kept as a title: the safe direction to fail in.
function isMeasureNumberMark(tag, text, measureNumber) {
    if (tag !== "RehearsalMark") return false;
    var trimmed = text.trim();
    if (!/^\d+$/.test(trimmed)) return false;
    return parseInt(trimmed, 10) === measureNumber;
}

// A label that is only a repeat count, "3x" or "x3", says how many times to play a
// section rather than naming one. MuseScore already carries that as the play count of the
// repeat barline, and the two can disagree: the score this came from says "3x" on a bar
// whose endRepeat is 2, and the expansion follows the play count. Printing it as a heading
// would both invent a section and state the wrong number.
//
// Anchored to the whole text, so "Verse 3x" is left alone, and not conditioned on the
// bar carrying a repeat: the count is just as often written on the first bar of the
// repeated section as on its last, and either way it is not a section name.
function isRepeatCountLabel(text) {
    return /^(\d+\s*[xX]|[xX]\s*\d+)$/.test(text.trim());
}

// Slash-chord bass note TPC, or -99 when the chord has none.
// MuseScore 4 writes <bass>, MuseScore 3 wrote <base>.
function bassTpc(hInfo) {
    var text = childText(hInfo, "bass") || childText(hInfo, "base");
    if (!text) return -99;
    var tpc = parseInt(text);
    return isNaN(tpc) ? -99 : tpc;
}

// Walk all measures in a staff node, computing tick positions.
// Calls onElement(elem, voiceTick, measureStartTick, measureIdx, actualMeasureTicks) for each voice child.
// Calls onMeasure(measureNode, startTick, endTick, measureIdx) after each measure.
// Handles TimeSig, Tuplet, irregular measure len, and duration computation.
function walkStaffMeasures(staffNode, division, onElement, onMeasure) {
    var currentTick = 0;
    var timeSigN = 4;
    var timeSigD = 4;
    var measureTicks = division * 4;

    var measures = findChildren(staffNode, "Measure");
    for (var mi = 0; mi < measures.length; mi++) {
        var measure = measures[mi];
        var measureStartTick = currentTick;

        var actualMeasureTicks = measureTicks;
        if (measure.attrs.len) {
            var lenParts = measure.attrs.len.split("/");
            if (lenParts.length === 2) {
                actualMeasureTicks = Math.round((parseInt(lenParts[0]) / parseInt(lenParts[1])) * 4 * division);
            }
        }

        // Process measure-level elements (Jump, Marker) before voices
        if (onElement) {
            for (var mci = 0; mci < measure.children.length; mci++) {
                var mChild = measure.children[mci];
                if (mChild.tag === "Jump" || mChild.tag === "Marker" || mChild.tag === "SystemText" || mChild.tag === "StaffText" || mChild.tag === "Expression" || mChild.tag === "PlayTechAnnotation" || mChild.tag === "RehearsalMark") {
                    onElement(mChild, measureStartTick, measureStartTick, mi, actualMeasureTicks);
                }
            }
        }

        var voiceNodes = findChildren(measure, "voice");
        var maxTick = currentTick;

        for (var vi = 0; vi < voiceNodes.length; vi++) {
            var voiceNode = voiceNodes[vi];
            var voiceTick = currentTick;
            var tupletRatio = null;

            for (var ci = 0; ci < voiceNode.children.length; ci++) {
                var elem = voiceNode.children[ci];

                if (elem.tag === "TimeSig") {
                    var newN = parseInt(childText(elem, "sigN"));
                    var newD = parseInt(childText(elem, "sigD"));
                    if (newN > 0 && newD > 0) {
                        timeSigN = newN;
                        timeSigD = newD;
                        measureTicks = Math.round((timeSigN / timeSigD) * 4 * division);
                        // Update current measure too (TimeSig at start affects this measure)
                        if (!measure.attrs.len) {
                            actualMeasureTicks = measureTicks;
                        }
                    }
                    continue;
                }

                if (elem.tag === "Tuplet") {
                    var normalNotes = parseInt(childText(elem, "normalNotes")) || 1;
                    var actualNotes = parseInt(childText(elem, "actualNotes")) || 1;
                    tupletRatio = normalNotes / actualNotes;
                    continue;
                }

                if (elem.tag === "endTuplet") {
                    tupletRatio = null;
                    continue;
                }

                // Voice-level position shift. Nested locations (tie and spanner
                // offsets inside Note/Spanner) never reach this loop, which only
                // sees direct children of <voice>.
                if (elem.tag === "location") {
                    voiceTick += locationOffsetTicks(elem, division, actualMeasureTicks);
                    continue;
                }

                if (onElement) {
                    onElement(elem, voiceTick, measureStartTick, mi, actualMeasureTicks);
                }

                if (elem.tag === "Chord" || elem.tag === "Rest") {
                    // Grace notes (acciaccatura/appoggiatura) have zero musical duration
                    var isGrace = findChild(elem, "acciaccatura") || findChild(elem, "appoggiatura");
                    if (!isGrace) {
                        var durType = childText(elem, "durationType") || "quarter";
                        var dotsNode = findChild(elem, "dots");
                        var dots = dotsNode ? parseInt(dotsNode.text) || 0 : 0;
                        var dur = durationToTicks(durType, dots, division, actualMeasureTicks);
                        if (tupletRatio) dur = Math.round(dur * tupletRatio);
                        voiceTick += dur;
                    }
                    if (voiceTick > maxTick) maxTick = voiceTick;
                }
            }
        }

        currentTick = maxTick;
        if (onMeasure) {
            onMeasure(measure, measureStartTick, currentTick, mi);
        }
    }
    return currentTick;
}

// Convert durationType + dots to duration in ticks
// measureTicks: duration of a full measure in ticks (for "measure" type rests)
function durationToTicks(durationType, dots, division, measureTicks) {
    if (durationType === "measure") {
        return measureTicks || (division * 4); // fallback to 4/4
    }
    var fraction = Constants.DURATION_MAP[durationType];
    if (fraction === undefined) return division; // default to quarter

    var ticks = fraction * 4 * division;
    var dotValue = ticks;
    for (var d = 0; d < dots; d++) {
        dotValue /= 2;
        ticks += dotValue;
    }
    return Math.round(ticks);
}

// Convert MuseScore TPC (Tonal Pitch Class) to Spanish solfeo note name
function tpcToSpanishRoot(tpc) {
    var map = {
        13: "Fa", 14: "Do", 15: "Sol", 16: "Re", 17: "La", 18: "Mi", 19: "Si",
        20: "Fa#", 21: "Do#", 22: "Sol#", 23: "Re#", 24: "La#",
        6: "Sib", 7: "Fab", 8: "Dob", 9: "Solb", 10: "Reb", 11: "Lab", 12: "Mib"
    };
    return map[tpc] || "";
}

// Extract fretboard diagrams from FBox elements in first staff
// Returns deduplicated array of {chordName, strings, fretOffset, barre}
// excerptXmls: optional array of XML strings from guitar excerpts to search if main score has no diagrams
function extractFretDiagrams(score, excerptXmls) {
    var diagrams = [];
    var seen = {};
    
    var staffElements = findChildren(score, "Staff");
    if (staffElements.length === 0) return diagrams;
    
    // Try to find FBox in the first staff (main staff)
    var fboxes = findChildren(staffElements[0], "FBox");
    
    // If no FBox found in main score, search in guitar excerpts
    if (fboxes.length === 0 && excerptXmls && excerptXmls.length > 0) {
        for (var ex = 0; ex < excerptXmls.length; ex++) {
            var excerptRoot = parseXml(excerptXmls[ex]);
            if (!excerptRoot) continue;
            
            // Find Score node (same logic as extractAll)
            var excerptScore = findChild(excerptRoot, "Score") || excerptRoot;
            if (excerptScore.tag !== "Score") {
                excerptScore = findChild(excerptScore, "Score") || excerptScore;
            }
            
            var excerptStaffs = findChildren(excerptScore, "Staff");
            if (excerptStaffs.length === 0) continue;
            
            // Search in all staves of the excerpt
            for (var es = 0; es < excerptStaffs.length; es++) {
                var excerptFboxes = findChildren(excerptStaffs[es], "FBox");
                if (excerptFboxes.length > 0) {
                    fboxes = excerptFboxes;
                    break;
                }
            }
            
            if (fboxes.length > 0) break;
        }
    }
    
    // Extract diagrams from found FBoxes
    for (var fb = 0; fb < fboxes.length; fb++) {
        var fretDiagrams = findChildren(fboxes[fb], "FretDiagram");
        
        for (var fd = 0; fd < fretDiagrams.length; fd++) {
            var fretDiagram = fretDiagrams[fd];
            
            // Skip hidden diagrams (visible=0)
            if (childText(fretDiagram, "visible") === "0") continue;

            var harmony = findChild(fretDiagram, "Harmony");
            if (!harmony) continue;

            var harmonyInfo = findChild(harmony, "harmonyInfo");
            if (!harmonyInfo) continue;

            var rootTpc = parseInt(childText(harmonyInfo, "root"));
            var modifier = childText(harmonyInfo, "name") || "";

            var chordName;
            if (!isNaN(rootTpc)) {
                var rootName = tpcToSpanishRoot(rootTpc);
                if (!rootName) continue;
                chordName = rootName + modifier;
            } else if (modifier) {
                // No root TPC: use name as literal chord name (e.g. "Rem", "Solm")
                chordName = modifier;
            } else {
                continue;
            }
            
            var fretDiagramNode = findChild(fretDiagram, "fretDiagram");
            if (!fretDiagramNode) continue;
            
            var strings = [];
            var stringElements = findChildren(fretDiagramNode, "string");
            // Extract fretOffset and numFrets from parent FretDiagram node
            var fretOffset = parseInt(childText(fretDiagram, "fretOffset")) || 0;
            var numFrets = parseInt(childText(fretDiagram, "frets")) || 4;
            
            // Extract barre information
            var barreElem = findChild(fretDiagramNode, "barre");
            var barre = null;
            if (barreElem) {
                var barreStart = parseInt(barreElem.attrs.start);
                var barreEnd = parseInt(barreElem.attrs.end);
                var barreFret = parseInt(barreElem.text);
                if (barreStart !== undefined && barreEnd !== undefined && barreFret) {
                    barre = { start: barreStart, end: barreEnd, fret: barreFret };
                }
            }
            
            for (var se = 0; se < stringElements.length; se++) {
                var stringElem = stringElements[se];
                var stringNum = parseInt(stringElem.attrs.no);
                if (stringNum === undefined) continue;
                
                var marker = childText(stringElem, "marker");
                var dotElem = findChild(stringElem, "dot");
                
                var stringData = { number: stringNum };
                
                if (marker === "cross" || marker === "circle") {
                    stringData.marker = marker;
                } else if (dotElem) {
                    var fretNum = parseInt(dotElem.attrs.fret);
                    if (fretNum) {
                        stringData.dot = { fret: fretNum };
                    }
                }
                
                strings.push(stringData);
            }
            
            // Deduplication fingerprint: chordName + string pattern + barre
            var fingerprint = chordName + "|";
            for (var si = 0; si < strings.length; si++) {
                var s = strings[si];
                if (s.marker) fingerprint += s.number + ":" + s.marker + ",";
                else if (s.dot) fingerprint += s.number + ":" + s.dot.fret + ",";
            }
            if (barre) {
                fingerprint += "barre:" + barre.start + "-" + barre.end + ":" + barre.fret;
            }
            
            if (seen[fingerprint]) continue;
            seen[fingerprint] = true;
            
            diagrams.push({
                chordName: chordName,
                strings: strings,
                fretOffset: fretOffset,
                numFrets: numFrets,
                barre: barre
            });
        }
    }
    
    return diagrams;
}

// Extract all data from .mscx XML string
// Returns the same intermediate data structure as api-extractor.js
// spelling: "solfeggio", "standard", etc. Controls chord name language.
function extractAll(xmlString, excerptXmls, spelling, options) {
    var root = parseXml(xmlString);
    if (!root) throw new Error("Failed to parse XML");

    var score = findChild(root, "Score") || root;
    if (score.tag !== "Score") {
        // Try nested: museScore > Score
        score = findChild(score, "Score") || score;
    }

    // Division (ticks per quarter note)
    var division = parseInt(childText(score, "Division")) || 480;

    // Title: try workTitle metaTag first, then movementTitle, then title-style Text
    var title = "";
    var metaTags = findChildren(score, "metaTag");
    for (var mt = 0; mt < metaTags.length; mt++) {
        var mtName = metaTags[mt].attrs.name;
        if (mtName === "workTitle" && metaTags[mt].text) {
            title = metaTags[mt].text;
            break;
        }
        if (mtName === "movementTitle" && metaTags[mt].text && !title) {
            title = metaTags[mt].text;
        }
    }
    // Fallback: find <Text> with <style>title</style> in VBox of first staff
    if (!title) {
        var staffElems = findChildren(score, "Staff");
        for (var ts = 0; ts < staffElems.length && !title; ts++) {
            var vboxes = findChildren(staffElems[ts], "VBox");
            for (var vb = 0; vb < vboxes.length && !title; vb++) {
                var vbTexts = findChildren(vboxes[vb], "Text");
                for (var vt = 0; vt < vbTexts.length; vt++) {
                    if (childText(vbTexts[vt], "style") === "title") {
                        title = childText(vbTexts[vt], "text");
                        break;
                    }
                }
            }
        }
    }

    // Find all staves (Parts contain Staff with instrument info)
    // Detect linked staves (tab/linked copies) to exclude from chord selection
    // Build staff-to-part name mapping for UI/CLI staff selection
    var parts = findChildren(score, "Part");
    var nstaves = 0;
    var linkedStaves = {};
    var hiddenStaves = {};
    var staffPartNames = {}; // staffIdx -> { trackName, longName, shortName }
    var staffCounter = 0;
    for (var p = 0; p < parts.length; p++) {
        var partHidden = childText(parts[p], "show") === "0";
        var partTrackName = childText(parts[p], "trackName") || "";
        var partInstrument = findChild(parts[p], "Instrument");
        var partLongName = partInstrument ? childText(partInstrument, "longName") || "" : "";
        var partShortName = partInstrument ? childText(partInstrument, "shortName") || "" : "";
        var partStaffs = findChildren(parts[p], "Staff");
        nstaves += partStaffs.length;
        for (var ps = 0; ps < partStaffs.length; ps++) {
            staffPartNames[staffCounter] = {
                trackName: partTrackName,
                longName: partLongName,
                shortName: partShortName
            };
            staffCounter++;
            var isLinked = findChild(partStaffs[ps], "linkedTo") !== null;
            if (isLinked) {
                linkedStaves[staffCounter - 1] = true; // 0-based
            }
            var staffHidden = childText(partStaffs[ps], "isStaffVisible") === "0";
            if (partHidden || staffHidden) {
                hiddenStaves[staffCounter - 1] = true; // 0-based
            }
        }
    }

    // Staff elements contain the actual music
    var staffElements = findChildren(score, "Staff");

    // Track which staves have lyrics and harmonies
    var lyricCounts = {};
    var harmonyCounts = {};

    // First pass: count lyrics and harmonies per staff
    var allSyllables = [];
    var allChords = [];
    var repeats = [];
    var voltas = [];
    var markers = [];
    var jumps = [];
    var systemTexts = [];
    var scoreKey = ""; // key of the first key signature, for the ChordPro {key:} directive
    // Text annotations share the chord line with the harmonies. Callers that only
    // want chords (--no-annotations) opt out here.
    var includeAnnotations = !(options && options.includeAnnotations === false);

    // Collect tied note durations per staff: { staffId: { tick: extraDurationQ } }
    // A chord with a Tie forward means the next chord(s) at the same pitch
    // extend this note's duration. We collect all chords and their tie status,
    // then compute the total tied duration for each starting tick.
    var tiedDurations = {}; // staffId -> { tick -> totalExtraDurationQ }

    for (var si = 0; si < staffElements.length; si++) {
        var staffNode = staffElements[si];
        var staffId = parseInt(staffNode.attrs.id || (si + 1)) - 1; // 0-based

        // Collect chord info for tie detection
        var chordInfos = [];
        walkStaffMeasures(staffNode, division, function(elem, voiceTick, measureStartTick, mi, actualMeasureTicks) {
            if (elem.tag === "Chord") {
                var durType = childText(elem, "durationType") || "quarter";
                var dotsNode = findChild(elem, "dots");
                var dots = dotsNode ? parseInt(dotsNode.text) || 0 : 0;
                var dQ = durationToTicks(durType, dots, division, actualMeasureTicks) / division;
                var isGrace = findChild(elem, "acciaccatura") || findChild(elem, "appoggiatura");
                if (isGrace) return;
                // Check if any Note has a Tie forward (Spanner type="Tie")
                var hasTieForward = false;
                var hasTieBack = false;
                var notes = findChildren(elem, "Note");
                for (var ni = 0; ni < notes.length; ni++) {
                    var spanners = findChildren(notes[ni], "Spanner");
                    for (var spi = 0; spi < spanners.length; spi++) {
                        if (spanners[spi].attrs && spanners[spi].attrs.type === "Tie") {
                            if (findChild(spanners[spi], "next")) hasTieForward = true;
                            if (findChild(spanners[spi], "prev")) hasTieBack = true;
                        }
                    }
                }
                chordInfos.push({ tick: voiceTick, durationQ: dQ, tieForward: hasTieForward, tieBack: hasTieBack });
            }
        });

        // Build tied duration map: for each chord with tieForward, sum following tied durations
        tiedDurations[staffId] = {};
        for (var ci = 0; ci < chordInfos.length; ci++) {
            if (chordInfos[ci].tieForward) {
                var extraQ = 0;
                for (var cj = ci + 1; cj < chordInfos.length; cj++) {
                    if (chordInfos[cj].tieBack) {
                        extraQ += chordInfos[cj].durationQ;
                        if (!chordInfos[cj].tieForward) break; // end of tie chain
                    } else {
                        break;
                    }
                }
                if (extraQ > 0) tiedDurations[staffId][chordInfos[ci].tick] = extraQ;
            }
        }

        walkStaffMeasures(staffNode, division, function(elem, voiceTick, measureStartTick, mi, actualMeasureTicks) {
            if (elem.tag === "Chord" || elem.tag === "Rest") {
                var durType = childText(elem, "durationType") || "quarter";
                var dotsNode = findChild(elem, "dots");
                var dots = dotsNode ? parseInt(dotsNode.text) || 0 : 0;
                var durationQ = durationToTicks(durType, dots, division, actualMeasureTicks) / division;

                if (elem.tag === "Chord") {
                    var lyrics = findChildren(elem, "Lyrics");
                    for (var li = 0; li < lyrics.length; li++) {
                        var lyricNode = lyrics[li];
                        var lyricText = childText(lyricNode, "text");
                        if (!lyricText) continue;
                        var verse = parseInt(childText(lyricNode, "no")) || 0;
                        var syllabicRaw = childText(lyricNode, "syllabic") || "single";
                        if (!lyricCounts[staffId]) lyricCounts[staffId] = 0;
                        lyricCounts[staffId]++;
                        allSyllables.push({
                            staffId: staffId, tick: voiceTick, verse: verse,
                            text: lyricText.trim(), syllabic: syllabicRaw,
                            durationQ: durationQ, restAfter: false, restDurationQ: 0, gapDurationQ: 0
                        });
                    }
                }
                return;
            }

            // FretDiagram elements in measures (contain nested Harmony)
            if (elem.tag === "FretDiagram") {
                var nestedHarmony = findChild(elem, "Harmony");
                if (nestedHarmony) {
                    var hInfo = findChild(nestedHarmony, "harmonyInfo") || nestedHarmony;
                    var rootNode = findChild(hInfo, "root");
                    var rootTpc = rootNode ? parseInt(rootNode.text) : -99;
                    var quality = childText(hInfo, "name") || "";
                    var harmonyName = Constants.tpcToChordName(rootTpc, quality, spelling, bassTpc(hInfo));
                    if (harmonyName) {
                        if (!harmonyCounts[staffId]) harmonyCounts[staffId] = 0;
                        harmonyCounts[staffId]++;
                        allChords.push({ staffId: staffId, tick: voiceTick, chord: harmonyName });
                    }
                }
                return;
            }

            if (elem.tag === "Harmony") {
                var hInfo = findChild(elem, "harmonyInfo") || elem;
                var rootNode = findChild(hInfo, "root");
                var rootTpc = rootNode ? parseInt(rootNode.text) : -99;
                var quality = childText(hInfo, "name") || "";
                var harmonyName = Constants.tpcToChordName(rootTpc, quality, spelling, bassTpc(hInfo));
                if (harmonyName) {
                    if (!harmonyCounts[staffId]) harmonyCounts[staffId] = 0;
                    harmonyCounts[staffId]++;
                    allChords.push({ staffId: staffId, tick: voiceTick, chord: harmonyName });
                }
                return;
            }

            // Volta brackets (staff 0 only)
            if (elem.tag === "Spanner" && elem.attrs.type === "Volta" && staffId === 0) {
                var voltaNode = findChild(elem, "Volta");
                if (voltaNode) {
                    var endingsStr = childText(voltaNode, "endings") || childText(voltaNode, "endingList") || "";
                    var endingList = endingsStr ? endingsStr.split(",").map(function(s){ return parseInt(s.trim()); }).filter(function(n){ return !isNaN(n); }) : [];
                    voltas.push({ startTick: voiceTick, endTick: -1, _measureIdx: mi, endingList: endingList });
                }
                var prevNode = findChild(elem, "prev");
                if (prevNode) {
                    for (var vr = voltas.length - 1; vr >= 0; vr--) {
                        if (voltas[vr].endTick === -1) { voltas[vr].endTick = voiceTick; break; }
                    }
                }
                return;
            }

            // Jump elements (staff 0 only)
            if (elem.tag === "Jump" && staffId === 0) {
                jumps.push({
                    tick: voiceTick, jumpTo: childText(elem, "jumpTo") || "start",
                    playUntil: childText(elem, "playUntil") || "end",
                    continueAt: childText(elem, "continueAt") || "", playRepeats: childText(elem, "playRepeats") === "1"
                });
                return;
            }

            // Marker elements (staff 0 only)
            if (elem.tag === "Marker" && staffId === 0) {
                var markerLabel = childText(elem, "label") || "";
                var markerType = "unknown";
                if (markerLabel === "segno" || markerLabel === "varsegno") markerType = "segno";
                else if (markerLabel === "fine") markerType = "fine";
                else if (markerLabel === "coda") markerType = "tocoda";
                else if (markerLabel === "codab" || markerLabel === "varcoda" || markerLabel === "codetta") markerType = "coda";
                markers.push({ tick: voiceTick, label: markerLabel, type: markerType });
                return;
            }

            // System text / Rehearsal mark (staff 0 only) -> section labels
            if ((elem.tag === "SystemText" || elem.tag === "RehearsalMark") && staffId === 0) {
                var sysText = childText(elem, "text");
                if (sysText && !isMeasureNumberMark(elem.tag, sysText, mi + 1) &&
                    !isRepeatCountLabel(sysText)) {
                    systemTexts.push({ tick: voiceTick, text: sysText });
                }
            }

            // Key signature (first one on the top staff) for the ChordPro {key:} directive
            if (elem.tag === "KeySig" && staffId === 0 && !scoreKey) {
                scoreKey = Constants.concertKeyName(childText(elem, "concertKey"), spelling);
            }

            // Staff text / Expression / Play technique -> inline text shown in chord line
            if (includeAnnotations &&
                (elem.tag === "StaffText" || elem.tag === "Expression" || elem.tag === "PlayTechAnnotation")) {
                var inlineText = childText(elem, "text");
                if (inlineText) {
                    if (!harmonyCounts[staffId]) harmonyCounts[staffId] = 0;
                    harmonyCounts[staffId]++;
                    allChords.push({
                        staffId: staffId, tick: voiceTick,
                        chord: TextUtils.braceAnnotation(inlineText), isText: true
                    });
                }
            }
        });
    }

    // Build repeats and collect section barline ticks
    var currentTick0 = 0;
    var sectionBarTicks = {}; // ticks where section-ending barlines occur (endRepeat, double, final)
    if (staffElements.length > 0) {
        var repeatStartTick = -1;

        currentTick0 = walkStaffMeasures(staffElements[0], division, null, function(measure, startTick, endTick, mi) {
            if (findChild(measure, "startRepeat")) {
                repeatStartTick = startTick;
            }
            var endRepeatNode = findChild(measure, "endRepeat");
            if (endRepeatNode) {
                var repeatCount = parseInt(endRepeatNode.text) || 2;
                repeats.push({ startTick: repeatStartTick >= 0 ? repeatStartTick : 0, endTick: endTick, repeatCount: repeatCount });
                repeatStartTick = -1;
                sectionBarTicks[endTick] = "endRepeat";
            }
            // Detect section barlines (double, final, heavy, etc.)
            // BarLine can be a direct child of Measure or inside a voice element
            var barline = findChild(measure, "BarLine");
            if (!barline) {
                var voices = findChildren(measure, "voice");
                for (var vi = 0; vi < voices.length && !barline; vi++) {
                    barline = findChild(voices[vi], "BarLine");
                }
            }
            if (barline) {
                var barSubtype = childText(barline, "subtype");
                if (barSubtype === "double" || barSubtype === "final" || barSubtype === "end" ||
                    barSubtype === "end-repeat" || barSubtype === "heavy" ||
                    barSubtype === "double-heavy") {
                    sectionBarTicks[endTick] = barSubtype;
                }
            }
        });
    }

    // Resolve any unresolved volta end ticks
    for (var vf = 0; vf < voltas.length; vf++) {
        if (voltas[vf].endTick === -1) {
            // Volta extends to end of score
            voltas[vf].endTick = currentTick0 || 0;
        }
    }
    voltas.sort(function(a, b) { return a.startTick - b.startTick; });

    // Build list of staves with lyrics, sorted by count (descending)
    var voiceStaves = [];
    for (var ls in lyricCounts) {
        var lsIdx = parseInt(ls);
        if (hiddenStaves[lsIdx]) continue;
        var names = staffPartNames[lsIdx] || {};
        voiceStaves.push({
            idx: lsIdx,
            count: lyricCounts[ls],
            name: names.longName || names.trackName || ("Staff " + (lsIdx + 1)),
            shortName: names.shortName || ""
        });
    }
    voiceStaves.sort(function(a, b) { return b.count - a.count; });

    // Select lyric staff: user override or auto (most lyrics)
    var bestLyricStaff = voiceStaves.length > 0 ? voiceStaves[0].idx : -1;
    if (options && options.lyricStaff !== undefined && options.lyricStaff >= 0) {
        bestLyricStaff = options.lyricStaff;
    }

    var bestHarmonyStaff = -1;
    var bestHarmonyCount = 0;
    for (var hs in harmonyCounts) {
        var hsIdx = parseInt(hs);
        // Skip linked and hidden staves
        if (linkedStaves[hsIdx] || hiddenStaves[hsIdx]) continue;
        if (harmonyCounts[hs] > bestHarmonyCount) {
            bestHarmonyCount = harmonyCounts[hs];
            bestHarmonyStaff = hsIdx;
        }
    }

    // Filter syllables and chords to selected staves
    var syllables = [];
    for (var sf = 0; sf < allSyllables.length; sf++) {
        if (allSyllables[sf].staffId === bestLyricStaff) {
            var s = allSyllables[sf];
            syllables.push({
                tick: s.tick,
                verse: s.verse,
                text: s.text,
                syllabic: s.syllabic,
                durationQ: s.durationQ,
                restAfter: s.restAfter,
                restDurationQ: s.restDurationQ,
                gapDurationQ: s.gapDurationQ
            });
        }
    }

    var chords = [];
    for (var cf = 0; cf < allChords.length; cf++) {
        if (allChords[cf].staffId === bestHarmonyStaff || bestHarmonyStaff === -1) {
            var entry = {
                tick: allChords[cf].tick,
                chord: allChords[cf].chord
            };
            // The flag is what tells a harmony from an annotation when the two share a tick,
            // which is the whole of findChordAtTick's tie-break. Dropping it here let the
            // annotation take the syllable and the chord vanish with it.
            if (allChords[cf].isText) entry.isText = true;
            chords.push(entry);
        }
    }
    chords.sort(function(a, b) { return a.tick - b.tick; });

    // Compute gap durations and section bar flags for syllables
    // Sort syllables by tick for gap computation
    syllables.sort(function(a, b) { return a.tick - b.tick || a.verse - b.verse; });
    for (var gi = 0; gi < syllables.length; gi++) {
        var gSyl = syllables[gi];
        // Check if this syllable's note ends at a section barline
        var sylEndTick = gSyl.tick + Math.round(gSyl.durationQ * division);
        if (sectionBarTicks[sylEndTick]) {
            gSyl.sectionBar = true;
        }
        // Find next syllable in same verse
        for (var gj = gi + 1; gj < syllables.length; gj++) {
            if (syllables[gj].verse === gSyl.verse) {
                // Account for tied notes: the effective duration includes tied continuations
                var effectiveDurationQ = gSyl.durationQ;
                var lyricTies = tiedDurations[bestLyricStaff];
                if (lyricTies && lyricTies[gSyl.tick]) {
                    effectiveDurationQ += lyricTies[gSyl.tick];
                }
                var gap = (syllables[gj].tick - gSyl.tick) / division - effectiveDurationQ;
                if (gap > 0) {
                    gSyl.gapDurationQ = gap;
                    if (gap > 0.25) {
                        gSyl.restAfter = true;
                        gSyl.restDurationQ = gap;
                    }
                }
                // Also check if a section barline falls between this syllable and the next
                for (var bt in sectionBarTicks) {
                    var barTick = parseInt(bt);
                    if (barTick > gSyl.tick && barTick <= syllables[gj].tick) {
                        gSyl.sectionBar = true;
                        break;
                    }
                }
                break;
            }
        }
    }

    // Sort markers, jumps and system texts
    markers.sort(function(a, b) { return a.tick - b.tick; });
    jumps.sort(function(a, b) { return a.tick - b.tick; });
    systemTexts.sort(function(a, b) { return a.tick - b.tick; });

    // Compute lastTick (end of last measure on staff 0)
    var lastTick = currentTick0 || 0;
    // Ensure it covers the last syllable
    if (syllables.length > 0) {
        var maxSylTick = syllables[syllables.length - 1].tick;
        if (maxSylTick > lastTick) lastTick = maxSylTick + division * 4;
    }

    // Extract fretboard diagrams
    var fretDiagrams = extractFretDiagrams(score, excerptXmls);

    // Convert sectionBarTicks to sorted array
    var barlines = [];
    for (var bt in sectionBarTicks) {
        barlines.push({ tick: parseInt(bt), type: sectionBarTicks[bt] });
    }
    barlines.sort(function(a, b) { return a.tick - b.tick; });

    return {
        title: title,
        nstaves: nstaves,
        division: division,
        syllables: syllables,
        chords: chords,
        repeats: repeats,
        voltas: voltas,
        markers: markers,
        jumps: jumps,
        systemTexts: systemTexts,
        key: scoreKey,
        barlines: barlines,
        lastTick: lastTick,
        fretDiagrams: fretDiagrams,
        voiceStaves: voiceStaves,
        selectedVoiceStaff: bestLyricStaff
    };
}

// Extract lyric groups and chord data for lyrics-fixer analysis and fixing.
// Returns { lyricGroups, chords, tabStaves } where:
//   lyricGroups: { "staff_voice_verse": [{ text, syllabic (int) }] }
//   chords: [{ tick, text, staffIndex, isTabStaff }]
//   tabStaves: { staffIndex: true } for tab staves
function extractForFixer(xmlString) {
    var lyricsFixer = require("../lib/lyrics-fixer");
    var tree = parseXml(xmlString);
    var score = findChild(tree, "Score") || tree;

    var division = 480;
    var divNode = findChild(score, "Division");
    if (divNode) division = parseInt(divNode.text) || 480;

    // Detect tab staves from Part definitions
    var parts = findChildren(score, "Part");
    var tabStaves = {};
    var staffCounter = 0;
    for (var p = 0; p < parts.length; p++) {
        var partStaffs = findChildren(parts[p], "Staff");
        for (var ps = 0; ps < partStaffs.length; ps++) {
            var staffType = findChild(partStaffs[ps], "StaffType");
            if (staffType && staffType.attrs.group === "tablature") {
                tabStaves[staffCounter] = true;
            }
            staffCounter++;
        }
    }

    // Read chord name from a Harmony node (handles both old <name> and new <harmonyInfo>)
    // Returns { text, fromTpc } where fromTpc is true when the name was computed from TPC root.
    // sp: spelling parameter ("standard", "solfeggio", etc.) for TPC conversion.
    function readHarmonyText(harmonyNode, sp) {
        var hInfo = findChild(harmonyNode, "harmonyInfo");
        if (hInfo) {
            var rootNode = findChild(hInfo, "root");
            var rootTpc = rootNode ? parseInt(rootNode.text) : -99;
            var quality = childText(hInfo, "name") || "";
            var Constants = require("../lib/constants");
            var text = Constants.tpcToChordName(rootTpc, quality, sp || "standard", bassTpc(hInfo));
            return { text: text, fromTpc: rootTpc !== -99 };
        }
        var text = childText(harmonyNode, "name") || "";
        return { text: text, fromTpc: false };
    }

    // Walk staves to collect lyrics and chords
    var staffElements = findChildren(score, "Staff");
    var lyricGroups = {};
    var chordList = [];

    for (var si = 0; si < staffElements.length; si++) {
        var staffNode = staffElements[si];
        var staffId = parseInt(staffNode.attrs.id || (si + 1)) - 1;

        // Walk measures manually to track voice index
        var currentTick = 0;
        var timeSigN = 4, timeSigD = 4;
        var measureTicks = division * 4;

        var measures = findChildren(staffNode, "Measure");
        for (var mi = 0; mi < measures.length; mi++) {
            var measure = measures[mi];
            var measureStartTick = currentTick;
            var actualMeasureTicks = measureTicks;
            if (measure.attrs.len) {
                var lenParts = measure.attrs.len.split("/");
                if (lenParts.length === 2) {
                    actualMeasureTicks = Math.round((parseInt(lenParts[0]) / parseInt(lenParts[1])) * 4 * division);
                }
            }

            // Measure-level elements (Harmony, FretDiagram) outside voices
            for (var mci = 0; mci < measure.children.length; mci++) {
                var mChild = measure.children[mci];
                if (mChild.tag === "Harmony" || mChild.tag === "FretDiagram") {
                    var hNode = mChild.tag === "FretDiagram" ? findChild(mChild, "Harmony") : mChild;
                    if (hNode) {
                        var nameResult = readHarmonyText(hNode, "standard");
                        if (nameResult.text) {
                            chordList.push({ tick: measureStartTick, text: nameResult.text,
                                fromTpc: nameResult.fromTpc,
                                staffIndex: staffId, isTabStaff: tabStaves[staffId] || false });
                        }
                    }
                }
            }

            var voiceNodes = findChildren(measure, "voice");
            var maxTick = currentTick;

            for (var vi = 0; vi < voiceNodes.length; vi++) {
                var voiceNode = voiceNodes[vi];
                var voiceTick = currentTick;
                var tupletRatio = null;

                for (var ci = 0; ci < voiceNode.children.length; ci++) {
                    var elem = voiceNode.children[ci];

                    if (elem.tag === "TimeSig") {
                        var newN = parseInt(childText(elem, "sigN"));
                        var newD = parseInt(childText(elem, "sigD"));
                        if (newN > 0 && newD > 0) {
                            timeSigN = newN; timeSigD = newD;
                            measureTicks = Math.round((timeSigN / timeSigD) * 4 * division);
                            if (!measure.attrs.len) actualMeasureTicks = measureTicks;
                        }
                        continue;
                    }
                    if (elem.tag === "Tuplet") {
                        var normalNotes = parseInt(childText(elem, "normalNotes")) || 1;
                        var actualNotes = parseInt(childText(elem, "actualNotes")) || 1;
                        tupletRatio = normalNotes / actualNotes;
                        continue;
                    }
                    if (elem.tag === "endTuplet") { tupletRatio = null; continue; }

                    if (elem.tag === "Chord" || elem.tag === "Rest") {
                        var durType = childText(elem, "durationType") || "quarter";
                        var dotsNode = findChild(elem, "dots");
                        var dots = dotsNode ? parseInt(dotsNode.text) || 0 : 0;
                        var durationQ = durationToTicks(durType, dots, division, actualMeasureTicks) / division;
                        if (tupletRatio !== null) durationQ *= tupletRatio;
                        var advanceTicks = Math.round(durationQ * division);

                        if (elem.tag === "Chord") {
                            // Lyrics
                            var lyrics = findChildren(elem, "Lyrics");
                            for (var li = 0; li < lyrics.length; li++) {
                                var lyricNode = lyrics[li];
                                var lyricText = childText(lyricNode, "text");
                                if (!lyricText) continue;
                                var verse = parseInt(childText(lyricNode, "no")) || 0;
                                var syllabicRaw = childText(lyricNode, "syllabic") || "single";
                                var key = staffId + "_" + vi + "_" + verse;
                                if (!lyricGroups[key]) lyricGroups[key] = [];
                                lyricGroups[key].push({
                                    text: lyricText.trim(),
                                    syllabic: lyricsFixer.syllabicFromString(syllabicRaw)
                                });
                            }
                        }
                        voiceTick += advanceTicks;
                        continue;
                    }

                    // Harmony and FretDiagram elements
                    if (elem.tag === "Harmony" || elem.tag === "FretDiagram") {
                        var hNode = elem.tag === "FretDiagram" ? findChild(elem, "Harmony") : elem;
                        if (hNode) {
                            var hNameResult = readHarmonyText(hNode, "standard");
                            if (hNameResult.text) {
                                chordList.push({ tick: voiceTick, text: hNameResult.text,
                                    fromTpc: hNameResult.fromTpc,
                                    staffIndex: staffId, isTabStaff: tabStaves[staffId] || false });
                            }
                        }
                        continue;
                    }
                }
                if (voiceTick > maxTick) maxTick = voiceTick;
            }
            currentTick = Math.max(maxTick, currentTick + actualMeasureTicks);
        }
    }

    return {
        lyricGroups: lyricGroups,
        chords: chordList,
        tabStaves: tabStaves
    };
}

module.exports = {
    extractAll: extractAll,
    extractForFixer: extractForFixer,
    parseXml: parseXml
};
