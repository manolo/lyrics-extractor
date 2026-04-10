#!/usr/bin/env node
// CLI entry point: extract lyrics+chords from .mscz/.mscx files
// Usage: node cli/index.js <score-file> [output-file]

var fs = require("fs");
var path = require("path");
var msczReader = require("./mscz-reader");
var xmlExtractor = require("../extractors/xml-extractor");
var orchestrator = require("../lib/orchestrator");
var pdfWriter = require("../lib/pdf-writer");

function main() {
    var args = process.argv.slice(2);

    // Separate flags from positional arguments (flags start with --)
    // Flags can appear in any position: before, after, or between positional args.
    var flags = [];
    var positional = [];
    for (var ai = 0; ai < args.length; ai++) {
        if (args[ai].charAt(0) === "-") {
            flags.push(args[ai]);
            // --header takes a value argument
            if (args[ai] === "--header" && ai + 1 < args.length) {
                flags.push(args[ai + 1]);
                ai++;
            }
        } else {
            positional.push(args[ai]);
        }
    }

    if (positional.length === 0 || flags.indexOf("--help") >= 0 || flags.indexOf("-h") >= 0) {
        console.log("Usage: cli/index.js [flags] <score-file> [output.txt]");
        console.log("");
        console.log("Extract lyrics with chords from a MuseScore file.");
        console.log("By default, output goes to stdout.");
        console.log("");
        console.log("Flags:");
        console.log("  --save              Save to <score>-letra.txt alongside the score");
        console.log("  --pdf               Generate PDF to <score>-letra.pdf");
        console.log("  --header <name>     Group name for PDF header");
        console.log("  --numbers           Add line numbers in PDF output");
        console.log("  --anglo             Force anglo chord names (C, D, E)");
        console.log("  --solfeo            Force solfeo chord names (Do, Re, Mi)");
        console.log("  --full              Write all D.S./D.C. repeats even without new lyrics");
        console.log("  --single            Shrink PDF font to fit on one page");
        console.log("  --no-diagrams       Omit fretboard diagrams from PDF");
        console.log("  --chords-only       List chords even if the score has no lyrics");
        console.log("  --debug             Export raw extracted data as JSON");
        console.log("");
        console.log("Examples:");
        console.log("  cli/index.js song.mscz                          # stdout");
        console.log("  cli/index.js song.mscz --save                   # writes song-letra.txt");
        console.log("  cli/index.js --pdf song.mscz                    # writes song-letra.pdf");
        console.log("  cli/index.js --pdf --header \"My Band\" song.mscz # PDF with header");
        console.log("  cli/index.js --full song.mscz                   # full repeats");
        process.exit(0);
    }

    var inputPath = path.resolve(positional[0]);
    var debugMode = flags.indexOf("--debug") >= 0;
    var angloMode = flags.indexOf("--anglo") >= 0;
    var solfeoMode = flags.indexOf("--solfeo") >= 0;
    var pdfMode = flags.indexOf("--pdf") >= 0;
    var fullRepeat = flags.indexOf("--full") >= 0;
    var onePage = flags.indexOf("--single") >= 0 || flags.indexOf("--one-page") >= 0;
    var lineNumbers = flags.indexOf("--numbers") >= 0 || flags.indexOf("--line-numbers") >= 0;
    var noDiagrams = flags.indexOf("--no-diagrams") >= 0;
    var chordsOnly = flags.indexOf("--chords-only") >= 0;
    var headerName = "";
    var headerIdx = flags.indexOf("--header");
    if (headerIdx >= 0 && headerIdx + 1 < flags.length) {
        headerName = flags[headerIdx + 1];
    }
    var outputPath = null;
    if (flags.indexOf("--save") >= 0) {
        var ext = path.extname(inputPath);
        outputPath = inputPath.replace(ext, "-letra.txt");
    }
    if (positional.length > 1 && positional[1].match(/\.txt$/i)) {
        outputPath = path.resolve(positional[1]);
    }

    if (!fs.existsSync(inputPath)) {
        console.error("Error: file not found: " + inputPath);
        process.exit(1);
    }

    // Text file input: generate PDF directly from existing text
    if (inputPath.match(/\.txt$/i) && pdfMode) {
        var textContent = fs.readFileSync(inputPath, "utf8");
        var pdfOut = inputPath.replace(/\.txt$/i, ".pdf");
        var pdfBytes = pdfWriter.generatePdf(textContent, { header: headerName, onePage: onePage });
        fs.writeFileSync(pdfOut, pdfBytes, "binary");
        console.error("PDF written to: " + pdfOut);
        return;
    }

    // Read and parse the score
    var xmlString;
    var guitarExcerpts = [];
    try {
        xmlString = msczReader.readScore(inputPath);
        // Read guitar excerpts if available (for fretboard diagrams)
        if (inputPath.match(/\.mscz$/)) {
            var excerpts = msczReader.readGuitarExcerpts(inputPath);
            guitarExcerpts = excerpts.map(function(e) { return e.xml; });
        }
    } catch (e) {
        console.error("Error reading score: " + e.message);
        process.exit(1);
    }

    // Determine chord spelling: flag overrides, then score style, then default
    var spelling = "standard";
    try { spelling = msczReader.readSpelling(inputPath); } catch (e) { /* use default */ }
    if (angloMode) spelling = "standard";
    if (solfeoMode) spelling = "solfeggio";

    // Extract data from XML
    var data;
    try {
        data = xmlExtractor.extractAll(xmlString, guitarExcerpts, spelling);
    } catch (e) {
        console.error("Error extracting data: " + e.message);
        process.exit(1);
    }

    if (!data) {
        console.error("No data found in the score");
        process.exit(1);
    }

    // --chords-only: force chord-only mode regardless of lyrics
    if (chordsOnly) {
        data.syllables = [];
    }

    // No lyrics: auto-fallback to chord-only if chords exist
    if (!data.syllables || data.syllables.length === 0) {
        if (!data.chords || data.chords.length === 0) {
            console.error("No lyrics or chords found in the score");
            process.exit(1);
        }
    }

    // Debug mode: export raw data as JSON
    if (debugMode) {
        var debugExt = path.extname(inputPath);
        var debugPath = inputPath.replace(debugExt, "-debug.json");
        fs.writeFileSync(debugPath, JSON.stringify(data, null, 2), "utf8");
        console.error("Debug JSON written to: " + debugPath);
        console.error(data.syllables.length + " syllables, " + data.chords.length + " chords, " +
            data.repeats.length + " repeats, " + data.voltas.length + " voltas, " +
            (data.jumps || []).length + " jumps, " + (data.markers || []).length + " markers");
        process.exit(0);
    }

    // Process through the orchestrator pipeline
    if (fullRepeat) data.fullRepeat = true;
    var output = orchestrator.processExtraction(data);

    if (!output) {
        console.error("No output generated");
        process.exit(1);
    }

    // PDF output
    if (pdfMode) {
        var pdfExt = path.extname(inputPath);
        var pdfPath = inputPath.replace(pdfExt, "-letra.pdf");
        var pdfOptions = {
            header: headerName,
            onePage: onePage,
            lineNumbers: lineNumbers,
            fretDiagrams: noDiagrams ? [] : (data.fretDiagrams || [])
        };
        var pdfContent = pdfWriter.generatePdf(output, pdfOptions);
        fs.writeFileSync(pdfPath, pdfContent, "binary");
        console.error("PDF written to: " + pdfPath);
        if (!outputPath) return;
    }

    // Text output
    if (outputPath) {
        fs.writeFileSync(outputPath, output, "utf8");
        console.error("Written to: " + outputPath);
        console.error(data.syllables.length + " syllables, " + data.chords.length + " chords extracted");
    } else if (!pdfMode) {
        process.stdout.write(output);
    }
}

main();
