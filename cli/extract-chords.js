#!/usr/bin/env node
// Extract chords from .mscz/.mscx file and output as JSON to stdout.
// Used as fallback by the MuseScore plugin when QML API cannot read
// FretDiagram chord names.
//
// Usage: node extract-chords.js <score-path>
// Output: JSON array of {tick, chord} objects

var msczReader = require("./mscz-reader");
var xmlExtractor = require("../extractors/xml-extractor");

var filePath = process.argv[2];
if (!filePath) {
    process.stderr.write("Usage: node extract-chords.js <score.mscz|score.mscx>\n");
    process.exit(1);
}

try {
    var xmlString = msczReader.readScore(filePath);
    var excerptXmls = [];
    if (filePath.match(/\.mscz$/i)) {
        try {
            var excerpts = msczReader.readGuitarExcerpts(filePath);
            excerptXmls = excerpts.map(function(e) { return e.xml; });
        } catch (e) { /* no excerpts */ }
    }

    var data = xmlExtractor.extractAll(xmlString, excerptXmls);
    // Output chords and fretDiagrams as JSON
    process.stdout.write(JSON.stringify({
        chords: data.chords,
        fretDiagrams: data.fretDiagrams || []
    }));
} catch (e) {
    process.stderr.write("Error: " + e.message + "\n");
    process.exit(1);
}
