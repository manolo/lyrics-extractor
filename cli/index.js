#!/usr/bin/env node
// Lyrics Extractor for MuseScore
// Copyright (C) 2026 Manolo Carrasco (do2tis)
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Licensed under the GNU General Public License version 3 or later, with an
// additional attribution requirement under section 7(b): see LICENSE.

// CLI entry point: extract lyrics+chords from .mscz/.mscx files
// Usage: node cli/index.js <score-file> [output-file]

var fs = require("fs");
var path = require("path");
var msczReader = require("../score/mscz-reader");
var xmlExtractor = require("../score/xml-extractor");
var orchestrator = require("../lib/orchestrator");
var pdfWriter = require("../lib/pdf-writer");
var formatter = require("../lib/formatter");
var lyricsFixer = require("../lib/lyrics-fixer");
var chordUtils = require("../lib/chord-utils");
var xmlPatcher = require("../score/xml-patcher");
var chordproWriter = require("../lib/chordpro-writer");

function main() {
    var args = process.argv.slice(2);

    // Separate flags from positional arguments (flags start with --)
    // Flags can appear in any position: before, after, or between positional args.
    var flags = [];
    var positional = [];
    for (var ai = 0; ai < args.length; ai++) {
        if (args[ai].charAt(0) === "-") {
            flags.push(args[ai]);
            // --header, --footer and --staff take a value argument
            if ((args[ai] === "--header" || args[ai] === "--footer" || args[ai] === "--staff") && ai + 1 < args.length) {
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
        console.log("  --save              Save to <score>-lyrics.txt alongside the score");
        console.log("  --pdf               Generate PDF to <score>-lyrics.pdf");
        console.log("  --header <name>     Right-aligned header on every PDF page");
        console.log("  --footer <name>     Centered footer on every PDF page");
        console.log("  --numbers           Add line numbers in PDF output");
        console.log("  --anglo             Force anglo chord names (C, D, E)");
        console.log("  --solfeo            Force solfeo chord names (Do, Re, Mi)");
        console.log("  --compact           Abbreviate repeated stanzas (omit chords on repeats)");
        console.log("  --single            Auto-fit to one page (gaps first, then font)");
        console.log("  --no-diagrams       Omit fretboard diagrams from PDF");
        console.log("  --chords-only       List chords even if the score has no lyrics");
        console.log("  --lyrics-only       Output lyrics without chord lines above");
        console.log("  --chordpro          Export as ChordPro format (.cho)");
        console.log("  --no-annotations    Omit staff text and expressions from the chord line");
        console.log("  --orphan-lyrics     Print lyric verses that no pass of the score sings");
        console.log("  --staff <name|num>  Extract lyrics from a specific staff (by index or name)");
        console.log("  --debug             Export raw extracted data as JSON");
        console.log("  --check             Check lyrics for issues (synalepha, hyphens, syllabic)");
        console.log("  --fix               Fix lyrics issues in the score file");
        console.log("");
        console.log("Line splitting:");
        console.log("  Lines are split automatically at punctuation (.!?;), musical rests,");
        console.log("  section barlines, and commas near the median verse length. Lines");
        console.log("  exceeding 75 chars are split at the best available pause.");
        console.log("  For optimal results, use ; in lyrics to force breaks, add double");
        console.log("  barlines between sections, and add System Text labels.");
        console.log("");
        console.log("Examples:");
        console.log("  cli/index.js song.mscz                          # stdout");
        console.log("  cli/index.js song.mscz --save                   # writes song-lyrics.txt");
        console.log("  cli/index.js --pdf song.mscz                    # writes song-lyrics.pdf");
        console.log("  cli/index.js --pdf --header \"My Band\" song.mscz # PDF with header");
        console.log("  cli/index.js --pdf --footer \"My Band\" song.mscz # PDF with footer");
        console.log("  cli/index.js --compact song.mscz                # abbreviate repeats");
        process.exit(0);
    }

    var inputPath = path.resolve(positional[0]);
    var debugMode = flags.indexOf("--debug") >= 0;
    var angloMode = flags.indexOf("--anglo") >= 0;
    var solfeoMode = flags.indexOf("--solfeo") >= 0;
    var pdfMode = flags.indexOf("--pdf") >= 0;
    var fullRepeat = flags.indexOf("--compact") < 0;
    var onePage = flags.indexOf("--single") >= 0 || flags.indexOf("--one-page") >= 0;
    var lineNumbers = flags.indexOf("--numbers") >= 0 || flags.indexOf("--line-numbers") >= 0;
    var noDiagrams = flags.indexOf("--no-diagrams") >= 0;
    var chordsOnly = flags.indexOf("--chords-only") >= 0;
    var lyricsOnly = flags.indexOf("--lyrics-only") >= 0;
    var chordproMode = flags.indexOf("--chordpro") >= 0;
    var orphanLyrics = flags.indexOf("--orphan-lyrics") >= 0;
    var checkMode = flags.indexOf("--check") >= 0;
    var fixMode = flags.indexOf("--fix") >= 0;
    var headerName = "";
    var headerIdx = flags.indexOf("--header");
    if (headerIdx >= 0 && headerIdx + 1 < flags.length) {
        headerName = flags[headerIdx + 1];
    }
    var footerName = "";
    var footerIdx = flags.indexOf("--footer");
    if (footerIdx >= 0 && footerIdx + 1 < flags.length) {
        footerName = flags[footerIdx + 1];
    }
    var staffArg = "";
    var staffIdx = flags.indexOf("--staff");
    if (staffIdx >= 0 && staffIdx + 1 < flags.length) {
        staffArg = flags[staffIdx + 1];
    }
    var outputPath = null;
    if (flags.indexOf("--save") >= 0) {
        var ext = path.extname(inputPath);
        outputPath = inputPath.replace(ext, "-lyrics.txt");
    }
    if (positional.length > 1 && positional[1].match(/\.txt$/i)) {
        outputPath = path.resolve(positional[1]);
    }

    if (!fs.existsSync(inputPath)) {
        console.error("Error: file not found: " + inputPath);
        process.exit(1);
    }

    // --check: analyze lyrics for issues
    if (checkMode) {
        var checkXml = msczReader.readScore(inputPath);
        var checkData = xmlExtractor.extractForFixer(checkXml);
        var lyricResult = lyricsFixer.checkLyrics(checkData.lyricGroups);
        var syncResult = lyricsFixer.checkChordSync(checkData.chords, checkData.tabStaves);

        // Detect chord typos (skip chords computed from TPC root, already correct)
        var typoSeen = {};
        var typoExamples = [];
        var typoTotal = 0;
        for (var ct = 0; ct < checkData.chords.length; ct++) {
            if (checkData.chords[ct].fromTpc) continue;
            var rawText = checkData.chords[ct].text;
            if (!rawText) continue;
            var normalized = chordUtils.normalizeChord(rawText);
            if (normalized !== rawText) {
                typoTotal++;
                if (!typoSeen[rawText]) {
                    typoSeen[rawText] = true;
                    typoExamples.push(rawText + " -> " + normalized);
                }
            }
        }

        // Lyric lines that no pass of the score sings (spec 7.1.2)
        var orphanCount = 0;
        var orphanList = [];
        try {
            var checkData2 = xmlExtractor.extractAll(checkXml, [], "standard");
            orphanList = orchestrator.orphanVerses(checkData2);
            orphanCount = orphanList.length;
        } catch (e) {}

        var total = lyricResult.synalepha + lyricResult.hyphens + lyricResult.syllabic +
                    lyricResult.punctuation + syncResult.chordSync + typoTotal + orphanCount;

        if (total === 0) {
            console.log("No issues found");
        } else {
            if (orphanCount > 0) {
                console.log("Lyric verses with no pass to sing them: " + orphanCount +
                    " (verse " + orphanList.map(function(v) { return v + 1; }).join(", ") +
                    "; use --orphan-lyrics to print them)");
            }
            if (lyricResult.synalepha > 0) console.log("Synalepha candidates: " + lyricResult.synalepha);
            if (lyricResult.hyphens > 0) console.log("Manual hyphens: " + lyricResult.hyphens);
            if (lyricResult.syllabic > 0) {
                var detail = lyricResult.syllabicExamples.join(", ");
                if (lyricResult.syllabic > 4) detail += ", ...";
                console.log("Broken syllabic chains: " + lyricResult.syllabic + " (" + detail + ")");
            }
            if (lyricResult.punctuation > 0) {
                var punctDetail = lyricResult.punctuationExamples.join(", ");
                if (lyricResult.punctuation > 4) punctDetail += ", ...";
                console.log("Punctuation issues: " + lyricResult.punctuation + " (" + punctDetail + ")");
            }
            if (syncResult.chordSync > 0) console.log("Chord sync mismatches: " + syncResult.chordSync);
            if (typoTotal > 0) console.log("Chord typos: " + typoTotal + " (" + typoExamples.join(", ") + ")");
            console.log("Total: " + total + " issues");
        }
        process.exit(0);
    }

    // --fix: apply lyrics fixes, chord typos, chord sync, and metaTag sync to the score file
    if (fixMode) {
        var fixXml = msczReader.readScore(inputPath);
        var patchResult = xmlPatcher.patchLyrics(fixXml);
        var typoResult = xmlPatcher.patchChordTypos(patchResult.xml);
        var syncResult = xmlPatcher.patchChordSync(typoResult.xml);
        var metaResult = xmlPatcher.patchMetaTags(syncResult.xml);
        var totalFixes = patchResult.fixCount + typoResult.typoCount + syncResult.syncCount + metaResult.metaCount;

        if (totalFixes === 0) {
            console.log("No issues to fix");
            process.exit(0);
        }

        var finalXml = metaResult.xml;
        if (inputPath.match(/\.mscz$/i)) {
            msczReader.writeMscz(inputPath, inputPath, finalXml);
        } else {
            fs.writeFileSync(inputPath, finalXml, "utf8");
        }
        var msg = [];
        if (patchResult.fixCount > 0) msg.push(patchResult.fixCount + " lyric issues");
        if (typoResult.typoCount > 0) msg.push(typoResult.typoCount + " chord typo(s)");
        if (syncResult.syncCount > 0) msg.push(syncResult.syncCount + " chord(s) synced");
        if (metaResult.metaCount > 0) msg.push("properties updated");
        console.log("Fixed " + msg.join(", ") + " in " + path.basename(inputPath));
        process.exit(0);
    }

    // Text file input: generate PDF directly from existing text
    if (inputPath.match(/\.txt$/i) && pdfMode) {
        var textContent = fs.readFileSync(inputPath, "utf8");
        var pdfOut = inputPath.replace(/\.txt$/i, ".pdf");
        var pdfBytes = pdfWriter.generatePdf(textContent, { header: headerName, footer: footerName, onePage: onePage });
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

    // Resolve --staff argument to a staff index
    var extractOptions = {};
    if (flags.indexOf("--no-annotations") >= 0) extractOptions.includeAnnotations = false;
    if (staffArg) {
        // First pass: extract to get voiceStaves list
        var probe = xmlExtractor.extractAll(xmlString, guitarExcerpts, spelling);
        var vs = probe ? (probe.voiceStaves || []) : [];
        var staffNum = parseInt(staffArg);
        if (!isNaN(staffNum) && staffNum >= 0) {
            extractOptions.lyricStaff = staffNum;
        } else {
            // Match by name (case insensitive, partial match)
            var staffLower = staffArg.toLowerCase();
            var matched = false;
            for (var vsi = 0; vsi < vs.length; vsi++) {
                var n = (vs[vsi].name || "").toLowerCase();
                var sn = (vs[vsi].shortName || "").toLowerCase();
                if (n === staffLower || sn === staffLower ||
                    n.indexOf(staffLower) >= 0 || sn.indexOf(staffLower) >= 0) {
                    extractOptions.lyricStaff = vs[vsi].idx;
                    matched = true;
                    break;
                }
            }
            if (!matched) {
                console.error("Staff not found: " + staffArg);
                console.error("Available staves with lyrics:");
                for (var vsk = 0; vsk < vs.length; vsk++) {
                    console.error("  " + vs[vsk].idx + ": " + vs[vsk].name + (vs[vsk].shortName ? " (" + vs[vsk].shortName + ")" : ""));
                }
                process.exit(1);
            }
        }
    }

    // Extract data from XML
    var data;
    try {
        data = xmlExtractor.extractAll(xmlString, guitarExcerpts, spelling, extractOptions);
    } catch (e) {
        console.error("Error extracting data: " + e.message);
        process.exit(1);
    }

    if (!data) {
        console.error("No data found in the score");
        process.exit(1);
    }

    // Append staff name to title when using a non-default staff
    var defaultStaff = (data.voiceStaves && data.voiceStaves.length > 0) ? data.voiceStaves[0].idx : -1;
    if (data.voiceStaves && data.voiceStaves.length > 1 && data.selectedVoiceStaff !== defaultStaff) {
        for (var vsi2 = 0; vsi2 < data.voiceStaves.length; vsi2++) {
            if (data.voiceStaves[vsi2].idx === data.selectedVoiceStaff) {
                data.title = (data.title || "") + " (" + data.voiceStaves[vsi2].name + ")";
                break;
            }
        }
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

    // Prettify chord names for display (b -> ♭, o -> °)
    if (data.chords && data.chords.length > 0) {
        chordUtils.prettifyChords(data.chords);
    }
    if (data.fretDiagrams) {
        for (var fd = 0; fd < data.fretDiagrams.length; fd++) {
            data.fretDiagrams[fd].chordName = chordUtils.prettifyChord(data.fretDiagrams[fd].chordName);
        }
    }

    // Process through the orchestrator pipeline
    if (fullRepeat) data.fullRepeat = true;
    if (orphanLyrics) data.orphanLyrics = true;
    var output = orchestrator.processExtraction(data);

    if (!output) {
        console.error("No output generated");
        process.exit(1);
    }

    // PDF output
    if (pdfMode) {
        var pdfExt = path.extname(inputPath);
        var pdfPath = inputPath.replace(pdfExt, "-lyrics.pdf");
        var pdfOptions = {
            header: headerName,
            footer: footerName,
            onePage: onePage,
            lineNumbers: lineNumbers,
            fretDiagrams: noDiagrams ? [] : (data.fretDiagrams || [])
        };
        var pdfContent = pdfWriter.generatePdf(output, pdfOptions);
        fs.writeFileSync(pdfPath, pdfContent, "binary");
        console.error("PDF written to: " + pdfPath);
        if (!outputPath && !chordproMode) return;
    }

    // ChordPro output (convert before stripping markers, since markers identify chord lines)
    if (chordproMode) {
        var cpExt = path.extname(inputPath);
        var cpPath = inputPath.replace(cpExt, "-lyrics.cho");
        var cpOutput = chordproWriter.convert(output, { key: data.key });
        fs.writeFileSync(cpPath, cpOutput, "utf8");
        console.error("ChordPro written to: " + cpPath);
        if (!outputPath) return;
    }

    // Lyrics-only: strip entire chord lines before stripping markers
    if (lyricsOnly) {
        output = formatter.stripChordLines(output);
    }

    // Text output (strip zero-width space chord markers, only needed for PDF coloring)
    var textOutput = output.replace(/\u200B/g, "");
    if (outputPath) {
        fs.writeFileSync(outputPath, textOutput, "utf8");
        console.error("Written to: " + outputPath);
        console.error(data.syllables.length + " syllables, " + data.chords.length + " chords extracted");
    } else if (!pdfMode && !chordproMode) {
        process.stdout.write(textOutput);
    }
}

main();
