// Repeat structure analysis: pairs volta brackets with repeat bars
// Shared between MuseScore extension and Node.js CLI

// Build repeat sections: pair each repeat with its volta 1 (inside)
// and volta 2 (in the gap after the repeat end)
function buildSections(repeats, voltas) {
    var sections = [];
    var usedVoltas = {};

    for (var r = 0; r < repeats.length; r++) {
        var rep = repeats[r];
        var nextRepStart = (r + 1 < repeats.length)
            ? repeats[r + 1].startTick : Infinity;

        var section = { repeat: rep, volta1: null, volta2: null };

        // Volta 1: inside the repeat (near the end)
        for (var v = 0; v < voltas.length; v++) {
            if (usedVoltas[v]) continue;
            var vt = voltas[v];
            if (vt.startTick >= rep.startTick && vt.startTick < rep.endTick) {
                section.volta1 = vt;
                usedVoltas[v] = true;
                break;
            }
        }

        // Volta 2: after the repeat end, before the next repeat
        for (var v2 = 0; v2 < voltas.length; v2++) {
            if (usedVoltas[v2]) continue;
            var vt2 = voltas[v2];
            if (vt2.startTick >= rep.endTick && vt2.startTick < nextRepStart) {
                section.volta2 = vt2;
                usedVoltas[v2] = true;
                break;
            }
        }

        // Section end: after volta2 if present, else repeat end
        section.sectionEnd = section.volta2 ? section.volta2.endTick : rep.endTick;

        sections.push(section);
    }

    return sections;
}

if (typeof exports !== "undefined") {
    exports.buildSections = buildSections;
}
