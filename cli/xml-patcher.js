// Patch lyrics in .mscx XML using lyrics-fixer results.
// Uses extractForFixer for analysis (correct grouping), then patches XML directly.

var xmlExtractor = require("../extractors/xml-extractor");
var lyricsFixer = require("../lib/lyrics-fixer");
var chordUtils = require("../lib/chord-utils");

// Apply all lyrics fixes to an XML string.
// Returns { xml: modifiedXml, fixCount: N }
function patchLyrics(xmlString) {
    // Step 1: Use extractForFixer for correct grouping and analysis
    var data = xmlExtractor.extractForFixer(xmlString);
    var result = lyricsFixer.fixAll(data.lyricGroups);

    if (result.fixCount === 0) {
        return { xml: xmlString, fixCount: 0 };
    }

    // Step 2: Build a flat ordered list of all lyrics in XML (same order as extractForFixer)
    // extractForFixer walks staves in order, then measures, then voices, then lyrics.
    // We replicate this traversal on the XML string to find positions.
    var lyricsPositions = findAllLyricsPositions(xmlString);

    // Step 3: Build a flat ordered list from lyricGroups (same traversal order)
    // extractForFixer processes: for each staff -> for each measure -> for each voice -> lyrics
    // The key format is "staffId_voiceIdx_verse" and entries are in document order.
    // We need to map each group entry back to its position in the flat list.

    // Build flat list: iterate groups in the order entries appear in the XML
    // Since both extractForFixer and findAllLyricsPositions iterate the XML in document order,
    // entry N in the flat group list corresponds to position N in lyricsPositions.
    var flatEntries = [];
    var keys = Object.keys(data.lyricGroups);

    // We need entries in document order, not group order. Rebuild from the traversal.
    // The simplest approach: collect all entries with their group key and index,
    // in the same order extractForFixer produces them.
    var groupCounters = {};
    for (var k = 0; k < keys.length; k++) groupCounters[keys[k]] = 0;

    // Re-extract to get document-ordered entries with group mapping
    // Actually, extractForFixer appends to groups in document order within each group.
    // But groups interleave (verse 0 and verse 1 alternate per chord).
    // The XML Lyrics blocks appear in the order: per chord, multiple <Lyrics> (one per verse).
    // extractForFixer appends each to its group. So the Nth entry in a group corresponds
    // to the Nth occurrence of that group's key in document order.

    // Build a mapping: for each Lyrics position, determine its group key
    var tree = xmlExtractor.parseXml(xmlString);
    var score = findChildByTag(tree, "Score") || tree;
    var division = 480;
    var divNode = findChildByTag(score, "Division");
    if (divNode) division = parseInt(divNode.text) || 480;

    // Detect tab staves (same as extractForFixer)
    var parts = findChildrenByTag(score, "Part");
    var staffCounter = 0;
    for (var p = 0; p < parts.length; p++) {
        var partStaffs = findChildrenByTag(parts[p], "Staff");
        staffCounter += partStaffs.length;
    }

    // Walk staves in document order to build flat entry list with group keys
    var staffElements = findChildrenByTag(score, "Staff");
    var flatIndex = 0;
    var patchMap = {}; // flatIndex -> patch

    for (var si = 0; si < staffElements.length; si++) {
        var staffNode = staffElements[si];
        var staffId = parseInt(staffNode.attrs.id || (si + 1)) - 1;
        var measures = findChildrenByTag(staffNode, "Measure");

        for (var mi = 0; mi < measures.length; mi++) {
            var voiceNodes = findChildrenByTag(measures[mi], "voice");
            for (var vi = 0; vi < voiceNodes.length; vi++) {
                for (var ci = 0; ci < voiceNodes[vi].children.length; ci++) {
                    var elem = voiceNodes[vi].children[ci];
                    if (elem.tag !== "Chord") continue;
                    var lyrics = findChildrenByTag(elem, "Lyrics");
                    for (var li = 0; li < lyrics.length; li++) {
                        var textNode = findChildByTag(lyrics[li], "text");
                        if (!textNode || !textNode.text) { flatIndex++; continue; }
                        var noNode = findChildByTag(lyrics[li], "no");
                        var verse = noNode ? parseInt(noNode.text) || 0 : 0;
                        var groupKey = staffId + "_" + vi + "_" + verse;

                        if (!groupCounters[groupKey] && groupCounters[groupKey] !== 0) {
                            flatIndex++;
                            continue;
                        }

                        var idx = groupCounters[groupKey];
                        groupCounters[groupKey]++;

                        // Check if this entry has a patch
                        var groupPatches = result.patches[groupKey];
                        if (groupPatches) {
                            for (var gp = 0; gp < groupPatches.length; gp++) {
                                if (groupPatches[gp].index === idx) {
                                    patchMap[flatIndex] = groupPatches[gp];
                                    break;
                                }
                            }
                        }
                        flatIndex++;
                    }
                }
            }
        }
    }

    // Step 4: Apply patches to XML in reverse position order
    var modified = xmlString;
    var posKeys = Object.keys(patchMap).map(Number).sort(function(a, b) { return b - a; });
    for (var pi = 0; pi < posKeys.length; pi++) {
        var posIdx = posKeys[pi];
        var patch = patchMap[posIdx];
        var pos = lyricsPositions[posIdx];
        if (!pos) continue;

        var block = modified.substring(pos.start, pos.end);

        // Replace text content
        block = block.replace(
            /<text>[^<]*<\/text>/,
            "<text>" + escapeXml(patch.newText) + "</text>"
        );

        // Replace or add syllabic
        var newSyllabicStr = lyricsFixer.syllabicToString(patch.newSyllabic);
        if (block.match(/<syllabic>[^<]*<\/syllabic>/)) {
            block = block.replace(
                /<syllabic>[^<]*<\/syllabic>/,
                "<syllabic>" + newSyllabicStr + "</syllabic>"
            );
        } else {
            block = block.replace(
                /<\/text>/,
                "</text>\n              <syllabic>" + newSyllabicStr + "</syllabic>"
            );
        }

        modified = modified.substring(0, pos.start) + block + modified.substring(pos.end);
    }

    return { xml: modified, fixCount: result.fixCount };
}

// Find all <Lyrics>...</Lyrics> positions in the XML string
function findAllLyricsPositions(xmlString) {
    var positions = [];
    var pattern = /<Lyrics>[\s\S]*?<\/Lyrics>/g;
    var match;
    while ((match = pattern.exec(xmlString)) !== null) {
        positions.push({ start: match.index, end: match.index + match[0].length });
    }
    return positions;
}

// Simple tree helpers (avoid dependency on xml-extractor internals)
function findChildByTag(node, tag) {
    if (!node || !node.children) return null;
    for (var i = 0; i < node.children.length; i++) {
        if (node.children[i].tag === tag) return node.children[i];
    }
    return null;
}

function findChildrenByTag(node, tag) {
    var result = [];
    if (!node || !node.children) return result;
    for (var i = 0; i < node.children.length; i++) {
        if (node.children[i].tag === tag) result.push(node.children[i]);
    }
    return result;
}

// Check if a string looks like a valid chord quality suffix.
// Rejects false positives like "Solo", "Mayor", "Cejilla" that result
// from incorrectly parsing annotation text as a chord root + quality.
function _isChordQuality(q) {
    if (!q) return true;
    // m: minor (m, m7, m7b5), but not followed by arbitrary lowercase (mile, Mayor)
    // M: major (M, M7, Maj), but not followed by arbitrary lowercase (Mayor, Menor)
    // o/O: diminished, 7/6/9: extensions, dim/aug/sus/add: spelled out, etc.
    return /^(m($|[^a-z]|aj|in)|M($|[^a-z]|aj)|dim|aug|sus|add|[oO°+]($|[^a-z])|[7690]|1[13]|[b#]\d|\()/.test(q);
}

function escapeXml(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Sync chords from principal (non-tab) staff to linked tab staves.
// For each measure, copies the principal's Harmony elements to tab staves that are missing them.
// Returns { xml: modifiedXml, syncCount: N }
function patchChordSync(xmlString) {
    var data = xmlExtractor.extractForFixer(xmlString);
    var syncResult = lyricsFixer.checkChordSync(data.chords, data.tabStaves);
    if (syncResult.chordSync === 0) {
        return { xml: xmlString, syncCount: 0 };
    }

    // Build principal and linked chord maps by tick
    var principalChords = {};
    var linkedChords = {};
    var principalStaff = -1;
    var linkedStaves = {};

    for (var i = 0; i < data.chords.length; i++) {
        var c = data.chords[i];
        if (c.isTabStaff) {
            linkedChords[c.tick] = c.text;
            linkedStaves[c.staffIndex] = true;
        } else {
            principalChords[c.tick] = c.text;
            if (principalStaff < 0) principalStaff = c.staffIndex;
        }
    }

    // Also mark tab staves that have no chords at all
    if (data.tabStaves) {
        var tabKeys = Object.keys(data.tabStaves);
        for (var tk = 0; tk < tabKeys.length; tk++) {
            if (data.tabStaves[tabKeys[tk]]) linkedStaves[tabKeys[tk]] = true;
        }
    }

    if (principalStaff < 0) return { xml: xmlString, syncCount: 0 };

    // Find mismatched ticks (principal has chord but linked doesn't match)
    var missingTicks = {};
    var ticks = Object.keys(principalChords);
    for (var t = 0; t < ticks.length; t++) {
        var tick = ticks[t];
        if (linkedChords[tick] === undefined || linkedChords[tick] !== principalChords[tick]) {
            missingTicks[tick] = true;
        }
    }

    if (Object.keys(missingTicks).length === 0) return { xml: xmlString, syncCount: 0 };

    // Parse XML tree to find Harmony elements by staff and measure
    var tree = xmlExtractor.parseXml(xmlString);
    var score = findChildByTag(tree, "Score") || tree;
    var divNode = findChildByTag(score, "Division");
    var division = divNode ? parseInt(divNode.text) || 480 : 480;
    var staffElements = findChildrenByTag(score, "Staff");

    // Build measure-to-tick mapping for the principal staff
    var principalStaffIdx = -1;
    for (var si = 0; si < staffElements.length; si++) {
        var sId = parseInt(staffElements[si].attrs.id || (si + 1)) - 1;
        if (sId === principalStaff) { principalStaffIdx = si; break; }
    }
    if (principalStaffIdx < 0) return { xml: xmlString, syncCount: 0 };

    // Compute tick positions for each measure in the principal staff
    var measureTicks = _computeMeasureTicks(staffElements[principalStaffIdx], division);

    // Collect Harmony XML blocks from the principal staff by measure index
    // We need the raw XML of each Harmony element to copy it
    var principalHarmonies = _collectHarmonyPositions(xmlString, staffElements[principalStaffIdx], measureTicks, missingTicks);
    if (principalHarmonies.length === 0) return { xml: xmlString, syncCount: 0 };

    // For each linked tab staff, find where to insert the missing Harmonies
    var syncCount = 0;
    var insertions = []; // [{position, xml}] sorted by position desc for safe insertion

    var linkedStavesList = Object.keys(linkedStaves).map(Number);
    for (var li = 0; li < linkedStavesList.length; li++) {
        var linkedIdx = -1;
        for (var si2 = 0; si2 < staffElements.length; si2++) {
            var sId2 = parseInt(staffElements[si2].attrs.id || (si2 + 1)) - 1;
            if (sId2 === linkedStavesList[li]) { linkedIdx = si2; break; }
        }
        if (linkedIdx < 0) continue;

        var linkedMeasureTicks = _computeMeasureTicks(staffElements[linkedIdx], division);
        var linkedMeasures = findChildrenByTag(staffElements[linkedIdx], "Measure");

        for (var phi = 0; phi < principalHarmonies.length; phi++) {
            var ph = principalHarmonies[phi];
            // Find the corresponding measure in the linked staff (by tick)
            var targetMi = -1;
            for (var tmi = 0; tmi < linkedMeasureTicks.length; tmi++) {
                if (linkedMeasureTicks[tmi].startTick === ph.measureStartTick) {
                    targetMi = tmi;
                    break;
                }
            }
            if (targetMi < 0 || targetMi >= linkedMeasures.length) continue;

            // Check if this linked measure already has a matching Harmony
            var alreadyHas = false;
            var existingH = findChildrenByTag(linkedMeasures[targetMi], "Harmony");
            for (var eh = 0; eh < existingH.length; eh++) {
                var ehText = _readHarmonyName(existingH[eh], division);
                if (ehText === ph.text) { alreadyHas = true; break; }
            }
            if (alreadyHas) continue;

            // Find the insertion point: right before the first <voice> in the linked measure
            var voicePos = _findMeasureVoicePosition(xmlString, staffElements[linkedIdx], targetMi);
            if (voicePos < 0) continue;

            // Build Harmony XML (strip eid to avoid duplicates)
            var harmonyXml = ph.xml.replace(/<eid>[^<]*<\/eid>\n?\s*/g, "");
            insertions.push({ position: voicePos, xml: harmonyXml + "\n        " });
            syncCount++;
        }
    }

    // Apply insertions in reverse order
    insertions.sort(function(a, b) { return b.position - a.position; });
    var modified = xmlString;
    for (var ins = 0; ins < insertions.length; ins++) {
        modified = modified.substring(0, insertions[ins].position) +
                   insertions[ins].xml +
                   modified.substring(insertions[ins].position);
    }

    return { xml: modified, syncCount: syncCount };
}

// Compute measure start ticks for a staff element
function _computeMeasureTicks(staffNode, division) {
    var measures = findChildrenByTag(staffNode, "Measure");
    var result = [];
    var currentTick = 0;
    var measureLen = division * 4; // default 4/4

    for (var mi = 0; mi < measures.length; mi++) {
        var m = measures[mi];
        var actualLen = measureLen;
        if (m.attrs.len) {
            var parts = m.attrs.len.split("/");
            if (parts.length === 2) {
                actualLen = Math.round((parseInt(parts[0]) / parseInt(parts[1])) * 4 * division);
            }
        }
        // Check for TimeSig change
        var voices = findChildrenByTag(m, "voice");
        for (var vi = 0; vi < voices.length; vi++) {
            var tsNode = findChildByTag(voices[vi], "TimeSig");
            if (tsNode) {
                var sigN = findChildByTag(tsNode, "sigN");
                var sigD = findChildByTag(tsNode, "sigD");
                if (sigN && sigD) {
                    measureLen = Math.round((parseInt(sigN.text) / parseInt(sigD.text)) * 4 * division);
                    if (!m.attrs.len) actualLen = measureLen;
                }
            }
        }
        result.push({ startTick: currentTick, length: actualLen });
        currentTick += actualLen;
    }
    return result;
}

// Collect Harmony elements from a staff that match missingTicks
function _collectHarmonyPositions(xmlString, staffNode, measureTicks, missingTicks) {
    var result = [];
    var measures = findChildrenByTag(staffNode, "Measure");

    for (var mi = 0; mi < measures.length; mi++) {
        var mStartTick = measureTicks[mi].startTick;
        var harmonies = findChildrenByTag(measures[mi], "Harmony");
        // Measure-level harmonies are at the measure start tick
        for (var hi = 0; hi < harmonies.length; hi++) {
            if (missingTicks[mStartTick]) {
                var harmRange = _findNodeXmlRange(xmlString, harmonies[hi]);
                if (harmRange) {
                    var Constants = require("../lib/constants");
                    result.push({
                        measureStartTick: mStartTick,
                        tick: mStartTick,
                        text: _readHarmonyName(harmonies[hi], 480),
                        xml: xmlString.substring(harmRange.start, harmRange.end)
                    });
                }
            }
        }
        // Voice-level harmonies
        var voices = findChildrenByTag(measures[mi], "voice");
        for (var vi = 0; vi < voices.length; vi++) {
            var voiceTick = mStartTick;
            for (var ci = 0; ci < voices[vi].children.length; ci++) {
                var elem = voices[vi].children[ci];
                if ((elem.tag === "Harmony" || elem.tag === "FretDiagram") && missingTicks[voiceTick]) {
                    var hNode = elem.tag === "FretDiagram" ? findChildByTag(elem, "Harmony") : elem;
                    if (hNode) {
                        var hRange = _findNodeXmlRange(xmlString, hNode);
                        if (hRange) {
                            result.push({
                                measureStartTick: mStartTick,
                                tick: voiceTick,
                                text: _readHarmonyName(hNode, 480),
                                xml: xmlString.substring(hRange.start, hRange.end)
                            });
                        }
                    }
                }
                if (elem.tag === "Chord" || elem.tag === "Rest") {
                    voiceTick += _elemDuration(elem, 480);
                }
            }
        }
    }
    return result;
}

// Read chord name from a Harmony node (tree)
function _readHarmonyName(harmonyNode, division) {
    var hInfo = findChildByTag(harmonyNode, "harmonyInfo");
    if (hInfo) {
        var rootNode = findChildByTag(hInfo, "root");
        var rootTpc = rootNode ? parseInt(rootNode.text) : -99;
        var quality = findChildByTag(hInfo, "name");
        var qualText = quality ? (quality.text || "") : "";
        var bassNode = findChildByTag(hInfo, "bass") || findChildByTag(hInfo, "base");
        var bassTpc = bassNode ? parseInt(bassNode.text) : -99;
        var Constants = require("../lib/constants");
        return Constants.tpcToChordName(rootTpc, qualText, "standard", bassTpc);
    }
    var nameNode = findChildByTag(harmonyNode, "name");
    return nameNode ? (nameNode.text || "") : "";
}

// Compute duration in ticks for a Chord/Rest element
function _elemDuration(elem, division) {
    var durNode = findChildByTag(elem, "durationType");
    if (!durNode) return 0;
    var durMap = { "whole": 4, "half": 2, "quarter": 1, "eighth": 0.5, "16th": 0.25, "32nd": 0.125 };
    var d = durMap[durNode.text] || 1;
    var dotsNode = findChildByTag(elem, "dots");
    if (dotsNode) {
        var dots = parseInt(dotsNode.text) || 1;
        var dotMult = 0; for (var i = 1; i <= dots; i++) dotMult += Math.pow(0.5, i);
        d *= (1 + dotMult);
    }
    return Math.round(d * division);
}

// Find the XML position of the first <voice> in a specific measure of a staff.
// Uses the staff's eid to locate the staff, then counts measures.
function _findMeasureVoicePosition(xmlString, staffNode, measureIndex) {
    // Locate the staff in the XML by its id attribute
    var staffId = staffNode.attrs ? staffNode.attrs.id : null;
    if (!staffId) return -1;

    var staffTag = '<Staff id="' + staffId + '">';
    var staffPos = xmlString.indexOf(staffTag);
    if (staffPos < 0) return -1;

    var staffEnd = xmlString.indexOf("</Staff>", staffPos);
    if (staffEnd < 0) return -1;

    // Count <Measure> tags within this staff
    var searchPos = staffPos;
    for (var mi = 0; mi <= measureIndex; mi++) {
        searchPos = xmlString.indexOf("<Measure", searchPos + 1);
        if (searchPos < 0 || searchPos > staffEnd) return -1;
    }

    // Now searchPos is at the target <Measure> tag. Find the closing </Measure>
    var measureEnd = xmlString.indexOf("</Measure>", searchPos);
    if (measureEnd < 0) return -1;

    // Find the first <voice> within this measure
    var voicePos = xmlString.indexOf("<voice>", searchPos);
    if (voicePos >= 0 && voicePos < measureEnd) return voicePos;

    // No <voice> found, insert before </Measure>
    return measureEnd;
}

// Find the raw XML range of a parsed node (approximate: search by eid or structure)
function _findNodeXmlRange(xmlString, node) {
    // Use eid for precise matching if available
    var eidNode = findChildByTag(node, "eid");
    if (eidNode && eidNode.text) {
        var eidStr = "<eid>" + eidNode.text + "</eid>";
        var eidPos = xmlString.indexOf(eidStr);
        if (eidPos >= 0) {
            // Walk back to find the opening tag
            var tagName = node.tag;
            var openTag = "<" + tagName;
            var start = xmlString.lastIndexOf(openTag, eidPos);
            if (start >= 0) {
                var closeTag = "</" + tagName + ">";
                var end = xmlString.indexOf(closeTag, eidPos);
                if (end >= 0) {
                    return { start: start, end: end + closeTag.length, innerStart: start };
                }
            }
        }
    }
    return null;
}

// Sync VBox text fields to metaTags in the XML.
// Copies title, subtitle, composer, lyricist from VBox <Text> elements
// to the corresponding <metaTag> elements when they differ.
// Returns { xml: modifiedXml, metaCount: N }
function patchMetaTags(xmlString) {
    var mapping = [
        { style: "title",    tag: "workTitle" },
        { style: "subtitle", tag: "subtitle" },
        { style: "composer", tag: "composer" },
        { style: "lyricist", tag: "lyricist" }
    ];

    // Extract VBox text values
    var vboxValues = {};
    var vboxMatch = xmlString.match(/<VBox>[\s\S]*?<\/VBox>/);
    if (vboxMatch) {
        var vbox = vboxMatch[0];
        // Find each <Text> block with <style> and <text>
        var textBlocks = vbox.match(/<Text>[\s\S]*?<\/Text>/g) || [];
        for (var i = 0; i < textBlocks.length; i++) {
            var styleMatch = textBlocks[i].match(/<style>([^<]*)<\/style>/);
            var textMatch = textBlocks[i].match(/<text>([\s\S]*?)<\/text>/);
            if (styleMatch && textMatch) {
                for (var m = 0; m < mapping.length; m++) {
                    if (styleMatch[1] === mapping[m].style) {
                        vboxValues[mapping[m].tag] = textMatch[1];
                    }
                }
            }
        }
    }

    // Update metaTags
    var modified = xmlString;
    var count = 0;
    for (var m2 = 0; m2 < mapping.length; m2++) {
        var tag = mapping[m2].tag;
        var vboxVal = vboxValues[tag];
        if (!vboxVal) continue;
        var metaPattern = new RegExp('<metaTag name="' + tag + '">[^<]*</metaTag>');
        var metaMatch2 = modified.match(metaPattern);
        if (metaMatch2) {
            var currentVal = metaMatch2[0].replace(/<metaTag[^>]*>/, "").replace(/<\/metaTag>/, "");
            if (currentVal !== vboxVal) {
                modified = modified.replace(metaPattern, '<metaTag name="' + tag + '">' + vboxVal + '</metaTag>');
                count++;
            }
        }
    }

    return { xml: modified, metaCount: count };
}

// Fix chord typos in <Harmony> elements by normalizing <name> text.
// When <root> is absent, parses the chord name into root TPC + quality and adds <root>.
// When <root> is present, cleans up the quality suffix.
// Returns { xml: modifiedXml, typoCount: N }
function patchChordTypos(xmlString) {
    var Constants = require("../lib/constants");
    var pattern = /<harmonyInfo>[\s\S]*?<\/harmonyInfo>/g;
    var count = 0;
    var modified = xmlString.replace(pattern, function(block) {
        var hasRoot = /<root>/.test(block);
        var nameMatch = block.match(/<name>([^<]*)<\/name>/);
        if (!nameMatch) return block;

        var original = nameMatch[1];

        if (hasRoot) {
            // Quality suffix: strip spaces, hyphens before accidentals,
            // and leading chars that duplicate the root's last letter
            var fixed = original.replace(/\s+/g, '').replace(/-([#b])/g, '$1');
            var rootMatch = block.match(/<root>(\d+)<\/root>/);
            if (rootMatch) {
                var rootName = Constants.tpcToNoteName(parseInt(rootMatch[1]));
                var lastChar = rootName.charAt(rootName.length - 1).toLowerCase();
                while (fixed.length > 0 && fixed.charAt(0).toLowerCase() === lastChar
                       && fixed.charAt(0) !== '#' && fixed.charAt(0) !== 'b') {
                    fixed = fixed.substring(1);
                }
            }
            if (fixed === original) return block;
            count++;
            return block.replace("<name>" + original + "</name>", "<name>" + fixed + "</name>");
        }

        // No root: full chord name. Normalize and, if it was a typo, parse into root TPC + quality.
        var normalized = chordUtils.normalizeChord(original);
        if (normalized === original) return block;

        // Text had a typo. Try to parse into root TPC + quality for proper structure.
        var parsed = Constants.chordToTpc(normalized);
        count++;
        if (parsed && parsed.rootTpc !== -99 && _isChordQuality(parsed.quality)) {
            return block.replace(
                "<name>" + original + "</name>",
                "<root>" + parsed.rootTpc + "</root>\n              <name>" + parsed.quality + "</name>"
            );
        }
        // No valid TPC parse (literal annotation or unrecognized quality): just fix the text
        return block.replace("<name>" + original + "</name>", "<name>" + normalized + "</name>");
    });

    return { xml: modified, typoCount: count };
}

module.exports = {
    patchLyrics: patchLyrics,
    patchChordSync: patchChordSync,
    patchChordTypos: patchChordTypos,
    patchMetaTags: patchMetaTags
};
