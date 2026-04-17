// Patch lyrics in .mscx XML using lyrics-fixer results.
// Uses extractForFixer for analysis (correct grouping), then patches XML directly.

var xmlExtractor = require("../extractors/xml-extractor");
var lyricsFixer = require("../lib/lyrics-fixer");

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

function escapeXml(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

module.exports = {
    patchLyrics: patchLyrics
};
