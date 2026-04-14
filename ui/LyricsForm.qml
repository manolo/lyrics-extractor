import QtQuick 2.9
import QtQuick.Controls 2.2
import QtQuick.Layouts 1.3
import MuseScore 3.0
import FileIO 3.0
import Qt.labs.platform 1.0 as Platform

// Shared library modules (dual-format: QML import + Node.js require)
import "../lib/text-utils.js" as TextUtils
import "../lib/chord-utils.js" as ChordUtils
import "../lib/word-builder.js" as WordBuilder
import "../lib/line-builder.js" as LineBuilder
import "../lib/repeat-structure.js" as RepeatStructure
import "../lib/performance-stream.js" as PerfStream
import "../lib/intro-chords.js" as IntroChords
import "../lib/formatter.js" as Formatter
import "../lib/navigation.js" as Navigation
import "../lib/orchestrator.js" as Orchestrator
import "../lib/chord-formatter.js" as ChordFormatter
import "../lib/pdf-writer.js" as PdfWriter
import "../lib/fretboard-renderer.js" as FretboardRenderer
import "../extractors/musescore-extractor.js" as Extractor
// FretDiagram fallback: remove these 3 imports when MuseScore exposes FretDiagram.harmony
import "../extractors/fretdiagram-fallback.js" as FretFallback
import "../extractors/xml-chord-reader.js" as XmlChordReader
import "../lib/constants.js" as Constants

MuseScore {
    id: plugin
    title: "Lyrics Extraction"
    categoryCode: "Pulso y Púa"
    description: "Lyrics tools for vocal scores: synalepha formatting, lyrics+chords export"
    version: "1.0"
    pluginType: "dialog"
    width: 800
    height: 840

    property bool isSpanish: Qt.locale().name.indexOf("es") === 0
    property bool hasSelection: false
    property string savedFilePath: ""
    property int selectionStartTick: 0
    property int selectionEndTick: 0
    property var extractedFretDiagrams: []
    property string scoresDirectory: ""
    property bool scoresDirectoryExists: false
    property string lastScorePath: ""

    SystemPalette { id: systemPalette }

    FileIO { id: fileIO }

    QProcess { id: chordProcess }
    QProcess { id: openProcess }

    Settings {
        id: settings
        category: "LyricsExtractor"
        property bool useSolfeo: true
        property bool fullRepeat: false
        property bool onePage: false
        property bool lineNumbers: false
        property bool noDiagrams: false
        property string pdfHeader: ""
        property string scoresDirectory: ""
    }

    function tr(es, en) {
        return isSpanish ? es : en;
    }

    function getDefaultScoresPath() {
        var home = fileIO.homePath();
        var sep = (Qt.platform.os === "windows") ? "\\" : "/";
        return home + sep + "Documents" + sep + "MuseScore4" + sep + "Scores";
    }

    function checkScoresDirectory() {
        if (!scoresDirectory || scoresDirectory.length === 0) {
            scoresDirectoryExists = false;
            return;
        }
        fileIO.source = scoresDirectory;
        scoresDirectoryExists = fileIO.exists();
    }

    // Module bundle for orchestrator
    property var mods: ({
        ChordUtils: ChordUtils,
        WordBuilder: WordBuilder,
        LineBuilder: LineBuilder,
        RepeatStructure: RepeatStructure,
        PerfStream: PerfStream,
        IntroChords: IntroChords,
        Formatter: Formatter,
        Navigation: Navigation,
        ChordFormatter: ChordFormatter
    })

    // ========================================
    // SELECTION
    // ========================================

    function checkSelection() {
        if (!curScore || !curScore.selection) return false;

        var cursor = curScore.newCursor();
        cursor.rewind(Cursor.SELECTION_START);
        if (!cursor.segment) return false;

        selectionStartTick = cursor.tick;

        cursor.rewind(Cursor.SELECTION_END);
        selectionEndTick = cursor.tick;

        if (selectionEndTick === 0 && selectionStartTick > 0) {
            selectionEndTick = curScore.lastSegment.tick + 1;
        }

        return selectionEndTick > selectionStartTick;
    }

    // ========================================
    // CHECK SCORE: count issues without modifying (read-only)
    // ========================================

    property int issueCount: -1 // -1 = not checked yet, 0 = OK, >0 = issues found
    property int issueSynalepha: 0
    property int issueHyphens: 0
    property int issueSyllabic: 0
    property int issuePunctuation: 0
    property int issueChordSync: 0

    function checkScore() {
        if (!curScore) { issueCount = 0; return; }

        var synalepha = 0, hyphens = 0, syllabic = 0, punctuation = 0, chordSync = 0;

        // Check lyrics: synalepha, hyphens, syllabic chains
        var segment = curScore.firstSegment();
        var prevSyllabic = {};
        while (segment) {
            for (var staff = 0; staff < curScore.nstaves; staff++) {
                for (var voice = 0; voice < 4; voice++) {
                    var element = segment.elementAt(staff * 4 + voice);
                    if (!element || (element.type !== Element.CHORD && element.type !== Element.REST)) continue;
                    var lyr = element.lyrics;
                    if (!lyr) continue;
                    for (var l = 0; l < lyr.length; l++) {
                        var lyric = lyr[l];
                        var text = TextUtils.stripHtml(lyric.text || "");
                        if (!text) continue;

                        if (TextUtils.replaceSynalepha(text) !== text) synalepha++;
                        if (text.charAt(0) === '-' || text.charAt(text.length - 1) === '-') hyphens++;
                        if (text.indexOf(';') >= 0 || text.match(/\.{2,}/) || text.match(/,,/)) punctuation++;

                        var verse = lyric.verse || 0;
                        var key = staff + "_" + voice + "_" + verse;
                        var currSyl = lyric.syllabic || 0;
                        var prev = prevSyllabic[key] || 0;
                        if ((prev === 1 || prev === 3) && (currSyl === 0 || currSyl === 1)) syllabic++;
                        prevSyllabic[key] = currSyl;
                    }
                }
            }
            segment = segment.next;
        }

        // Check chord sync: principal staff vs linked tab staves
        try {
            var staves = curScore.staves;
            if (staves) {
                var principalHarmony = {};
                var linkedChords = {};

                var seg2 = curScore.firstSegment();
                while (seg2) {
                    var anns = seg2.annotations;
                    if (anns) {
                        for (var a = 0; a < anns.length; a++) {
                            var ann = anns[a];
                            if (ann && ann.type === Element.HARMONY) {
                                var hStaff = Math.floor(ann.track / 4);
                                if (staves[hStaff] && !staves[hStaff].isTabStaff) {
                                    principalHarmony[seg2.tick] = ann.text || "";
                                } else if (staves[hStaff] && staves[hStaff].isTabStaff) {
                                    if (!linkedChords[seg2.tick]) linkedChords[seg2.tick] = "";
                                    linkedChords[seg2.tick] = ann.text || "";
                                }
                            }
                        }
                    }
                    seg2 = seg2.next;
                }

                var principalTicks = Object.keys(principalHarmony);
                for (var pt = 0; pt < principalTicks.length; pt++) {
                    var tick = principalTicks[pt];
                    if (linkedChords[tick] === undefined || linkedChords[tick] !== principalHarmony[tick]) {
                        chordSync++;
                    }
                }
            }
        } catch (e) { /* chord sync check failed, ignore */ }

        issueSynalepha = synalepha;
        issueHyphens = hyphens;
        issueSyllabic = syllabic;
        issuePunctuation = punctuation;
        issueChordSync = chordSync;
        issueCount = synalepha + hyphens + syllabic + punctuation + chordSync;
    }

    // ========================================
    // FIX LYRICS: synalepha + consolidate in one pass (modifies score)
    // ========================================

    function fixLyrics() {
        if (!curScore) {
            statusText.text = tr("Error: No hay partitura abierta", "Error: No score open");
            return;
        }

        var useSelection = hasSelection;
        var fixCount = 0;

        var lyricGroups = {};

        var segment = curScore.firstSegment();
        while (segment) {
            if (useSelection) {
                if (segment.tick < selectionStartTick) { segment = segment.next; continue; }
                if (segment.tick >= selectionEndTick) break;
            }

            for (var staff = 0; staff < curScore.nstaves; staff++) {
                for (var voice = 0; voice < 4; voice++) {
                    var element = segment.elementAt(staff * 4 + voice);
                    if (!element) continue;
                    if (element.type !== Element.CHORD && element.type !== Element.REST) continue;

                    var lyr = element.lyrics;
                    if (!lyr) continue;

                    for (var l = 0; l < lyr.length; l++) {
                        var lyric = lyr[l];
                        var text = TextUtils.stripHtml(lyric.text || "");
                        if (!text) continue;

                        var verse = lyric.verse || 0;
                        var key = staff + "_" + voice + "_" + verse;

                        if (!lyricGroups[key]) lyricGroups[key] = [];

                        lyricGroups[key].push({
                            lyric: lyric,
                            text: text,
                            hasTrailingHyphen: text.charAt(text.length - 1) === '-',
                            hasLeadingHyphen: text.charAt(0) === '-'
                        });
                    }
                }
            }
            segment = segment.next;
        }

        curScore.startCmd();

        var keys = Object.keys(lyricGroups);
        for (var k = 0; k < keys.length; k++) {
            var group = lyricGroups[keys[k]];

            for (var i = 0; i < group.length; i++) {
                var entry = group[i];
                var hasHyphen = entry.hasTrailingHyphen || entry.hasLeadingHyphen;

                var changed = false;
                var cleanText = entry.text;

                // FIRST: Convert consecutive dots/commas BEFORE replaceSynalepha
                // This prevents "..." from being treated as multiple synalepha marks
                // Convert consecutive dots: 3+ → ellipsis, 2 → small full stop (no-break period)
                cleanText = cleanText.replace(/\.{3,}/g, "\u2026");
                cleanText = cleanText.replace(/\.\./g, "\uFE52");
                // Convert double commas to small comma (no-break comma)
                cleanText = cleanText.replace(/,,/g, "\uFE50");
                // Convert semicolons to fullwidth comma (phrase separator, stanza break)
                cleanText = cleanText.replace(/;/g, "\uFF0C");
                
                // SECOND: Apply synalepha replacement (only to single dots between letters)
                cleanText = TextUtils.replaceSynalepha(cleanText);
                
                if (cleanText !== entry.text) {
                    entry.lyric.text = cleanText;
                    changed = true;
                }

                var prevHasTrailing = (i > 0) && group[i - 1].hasTrailingHyphen;
                var needsSyllabicFix = hasHyphen || prevHasTrailing;

                if (needsSyllabicFix) {
                    var connectsToNext = entry.hasTrailingHyphen;
                    var connectsFromPrev = prevHasTrailing || entry.hasLeadingHyphen;

                    var newSyllabic;
                    if (connectsFromPrev && connectsToNext) {
                        newSyllabic = 3;
                    } else if (connectsFromPrev && !connectsToNext) {
                        newSyllabic = 2;
                    } else if (!connectsFromPrev && connectsToNext) {
                        newSyllabic = 1;
                    } else {
                        newSyllabic = 0;
                    }

                    cleanText = TextUtils.stripHyphens(cleanText);
                    if (cleanText !== entry.lyric.text) {
                        entry.lyric.text = cleanText;
                        changed = true;
                    }

                    var currentSyllabic = entry.lyric.syllabic || 0;
                    if (currentSyllabic !== newSyllabic) {
                        entry.lyric.syllabic = newSyllabic;
                        changed = true;
                    }
                }

                if (changed) fixCount++;
            }

            // Repair broken syllabic chains
            for (var j = 0; j < group.length; j++) {
                var curr = group[j];
                var currSyllabic = curr.lyric.syllabic || 0;

                if (currSyllabic === 1 || currSyllabic === 3) {
                    if (j + 1 < group.length) {
                        var next = group[j + 1];
                        var nextSyllabic = next.lyric.syllabic || 0;
                        if (nextSyllabic === 0 || nextSyllabic === 1) {
                            var nextNext = (j + 2 < group.length) ? group[j + 2] : null;
                            var nextNextSyllabic = nextNext ? (nextNext.lyric.syllabic || 0) : 0;

                            if (nextNextSyllabic === 3 || nextNextSyllabic === 2) {
                                next.lyric.syllabic = 3;
                            } else {
                                next.lyric.syllabic = 2;
                            }
                            fixCount++;
                        }
                    }
                }
            }
        }

        curScore.endCmd();

        // Sync chords from principal staff to linked staves
        var syncCount = syncChordsToLinkedStaves();

        if (fixCount > 0 || syncCount > 0) {
            var msg = "";
            if (fixCount > 0) msg += fixCount + (isSpanish ? " silaba(s) corregida(s)" : " syllable(s) fixed");
            if (syncCount > 0) {
                if (msg) msg += ", ";
                msg += syncCount + (isSpanish ? " acorde(s) sincronizado(s)" : " chord(s) synced");
            }
            statusText.text = msg;
        } else {
            statusText.text = tr(
                "Letras correctas, no se necesitan cambios",
                "Lyrics are correct, no changes needed"
            );
        }
    }

    // ========================================
    // SYNC CHORDS: copy chords from principal staff to linked staves
    // ========================================

    function syncChordsToLinkedStaves() {
        if (!curScore) return 0;

        var staves = curScore.staves;
        if (!staves) return 0;

        // Find harmony staff (principal) and its linked staves
        var harmonyStaves = [];
        var segment = curScore.firstSegment();
        while (segment) {
            var annotations = segment.annotations;
            if (annotations) {
                for (var a = 0; a < annotations.length; a++) {
                    var ann = annotations[a];
                    if (ann && (ann.type === Element.HARMONY)) {
                        var hStaff = Math.floor(ann.track / 4);
                        var found = false;
                        for (var h = 0; h < harmonyStaves.length; h++) {
                            if (harmonyStaves[h].idx === hStaff) {
                                harmonyStaves[h].count++;
                                found = true;
                                break;
                            }
                        }
                        if (!found) harmonyStaves.push({ idx: hStaff, count: 1 });
                    }
                }
            }
            segment = segment.next;
        }

        if (harmonyStaves.length === 0) return 0;

        // Find principal harmony staff (non-tab) and its linked tab staves
        // A principal staff has harmonies and is NOT a tab staff.
        // Its linked tab staff is in the same part and IS a tab staff.
        harmonyStaves.sort(function(a, b) { return b.count - a.count; });
        var principalStaff = -1;
        var linkedStaves = [];

        for (var hs = 0; hs < harmonyStaves.length; hs++) {
            var idx = harmonyStaves[hs].idx;
            if (staves[idx] && !staves[idx].isTabStaff) {
                principalStaff = idx;
                break;
            }
        }

        if (principalStaff < 0) return 0;

        // Find linked staves: tab staves in the same part as principalStaff
        var principalPart = staves[principalStaff].part;
        if (principalPart) {
            for (var ls = 0; ls < staves.length; ls++) {
                if (ls !== principalStaff && staves[ls].part && staves[ls].part.is(principalPart) && staves[ls].isTabStaff) {
                    linkedStaves.push(ls);
                }
            }
        }

        // Also check: any OTHER staves (different parts) that have harmonies and are tab staves
        for (var hs2 = 0; hs2 < harmonyStaves.length; hs2++) {
            var idx2 = harmonyStaves[hs2].idx;
            if (idx2 !== principalStaff && staves[idx2] && staves[idx2].isTabStaff) {
                var alreadyFound = false;
                for (var lf = 0; lf < linkedStaves.length; lf++) {
                    if (linkedStaves[lf] === idx2) { alreadyFound = true; break; }
                }
                if (!alreadyFound) linkedStaves.push(idx2);
            }
        }

        if (linkedStaves.length === 0) return 0;

        // Collect chords from principal staff
        var principalChords = []; // [{tick, text}]
        segment = curScore.firstSegment();
        while (segment) {
            var anns = segment.annotations;
            if (anns) {
                for (var ai = 0; ai < anns.length; ai++) {
                    var an = anns[ai];
                    if (an && (an.type === Element.HARMONY) && Math.floor(an.track / 4) === principalStaff) {
                        principalChords.push({ tick: segment.tick, text: an.text || "" });
                    }
                }
            }
            segment = segment.next;
        }

        // For each linked staff: remove existing chords, add principal's chords
        var totalSynced = 0;
        for (var li = 0; li < linkedStaves.length; li++) {
            var linkedIdx = linkedStaves[li];

            // Collect existing chords to remove
            var toRemove = [];
            segment = curScore.firstSegment();
            while (segment) {
                var lanns = segment.annotations;
                if (lanns) {
                    for (var la = 0; la < lanns.length; la++) {
                        var lan = lanns[la];
                        if (lan && (lan.type === Element.HARMONY) && Math.floor(lan.track / 4) === linkedIdx) {
                            toRemove.push(lan);
                        }
                    }
                }
                segment = segment.next;
            }

            curScore.startCmd();

            // Remove existing
            for (var r = 0; r < toRemove.length; r++) {
                try { removeElement(toRemove[r]); } catch (e) {}
            }

            // Add principal's chords
            var cursor = curScore.newCursor();
            for (var ci = 0; ci < principalChords.length; ci++) {
                cursor.rewindToTick(principalChords[ci].tick);
                if (!cursor.segment) continue;
                cursor.staffIdx = linkedIdx;
                cursor.voice = 0;
                var harmony = newElement(Element.HARMONY);
                if (harmony) {
                    cursor.add(harmony);
                    harmony.text = principalChords[ci].text;
                    totalSynced++;
                }
            }

            curScore.endCmd();
        }

        return totalSynced;
    }

    // ========================================
    // EXTRACT (read-only, uses shared modules)
    // ========================================

    // FretDiagram fallback: remove this function when MuseScore exposes FretDiagram.harmony
    function extractChordsWithFallback(data) {
        console.log("[fallback] extractChordsWithFallback: called, scoresDirectory='" + scoresDirectory + "'");
        if (!FretFallback.needsFallback(data._debug)) {
            console.log("[fallback] extractChordsWithFallback: not needed, returning original chords");
            return data.chords;
        }

        console.log("[fallback] extractChordsWithFallback: running cmd('file-save')");
        cmd("file-save");

        var cliPath = Qt.resolvedUrl("../cli/extract-chords.js").toString().replace(/^file:\/\//, "");
        var chords = FretFallback.extractChords({
            scoreName: (curScore.masterScore ? curScore.masterScore.scoreName : curScore.scoreName) || "",
            fileIO: fileIO,
            process: chordProcess,
            XmlChordReader: XmlChordReader,
            Constants: Constants,
            cliPath: cliPath,
            data: data,
            spelling: settings.useSolfeo ? "solfeggio" : "standard",
            scoresDirectory: scoresDirectory,
            noDiagrams: settings.noDiagrams
        });

        if (data.scorePath) lastScorePath = data.scorePath;
        return chords || data.chords;
    }

    function extractLyricsWithChords() {
        if (!curScore) {
            statusText.text = tr("Error: No hay partitura abierta", "Error: No score open");
            return;
        }

        var data = Extractor.extractAll();
        if (!data) {
            statusText.text = tr("No se encontraron letras en la partitura",
                                "No lyrics found in the score");
            return;
        }

        // Fallback: if FretDiagram annotations found but chords not extracted,
        // use CLI to read .mscz file and extract chords from XML
        data.chords = extractChordsWithFallback(data);

        data.fullRepeat = settings.fullRepeat;
        var output = Orchestrator.processExtraction(data, mods);

        if (!output) {
            statusText.text = tr("No se encontraron letras ni acordes", "No lyrics or chords found");
            return;
        }

        // Store fretDiagrams for PDF generation
        extractedFretDiagrams = data.fretDiagrams || [];

        lyricsPreview.text = output;
        var sylCount = data.syllables ? data.syllables.length : 0;
        var chordCount = data.chords ? data.chords.length : 0;
        statusText.text = tr(
            sylCount + " silabas, " + chordCount + " acordes extraidos",
            sylCount + " syllables, " + chordCount + " chords extracted");
    }

    // Export raw extracted data as JSON for debugging (compare plugin vs CLI)
    function exportDebugData() {
        if (!curScore) {
            statusText.text = tr("Error: No hay partitura abierta", "Error: No score open");
            return;
        }

        var data = Extractor.extractAll();
        if (!data) {
            statusText.text = tr("No se encontraron datos", "No data found");
            return;
        }

        var json = JSON.stringify(data, null, 2);

        var scorePath = curScore.path || "";
        var filePath;
        if (scorePath) {
            filePath = scorePath.replace(/\.(mscz|mscx)$/i, "") + "-debug.json";
        } else {
            filePath = fileIO.homePath() + "/Documents/lyrics-debug.json";
        }

        try {
            fileIO.source = filePath;
            fileIO.write(json);
            savedFilePath = filePath;
            statusText.text = tr("Debug exportado: " + filePath, "Debug exported: " + filePath);
        } catch (e) {
            statusText.text = tr("Error: " + e, "Error: " + e);
        }
    }

    // ========================================
    // SAVE
    // ========================================

    function saveLyricsToFile(content) {
        if (!content) return;

        // Save alongside the .mscz file with -letra.txt suffix
        var scorePath = curScore.path || "";
        var filePath;
        if (scorePath) {
            // Remove .mscz/.mscx extension and append -letra.txt
            filePath = scorePath.replace(/\.(mscz|mscx)$/i, "") + "-letra.txt";
        } else {
            // Fallback: save to Documents
            var title = curScore.scoreName || curScore.title || "score";
            var filename = title.replace(/[^a-zA-Z0-9áéíóúüñÁÉÍÓÚÜÑ\s_-]/g, "").replace(/\s+/g, "_");
            filePath = fileIO.homePath() + "/Documents/" + filename + "-letra.txt";
        }

        try {
            fileIO.source = filePath;
            fileIO.write(content);
            savedFilePath = filePath;
            statusText.text = tr(
                "Guardado en: " + filePath,
                "Saved to: " + filePath
            );
        } catch (e) {
            statusText.text = tr(
                "Error guardando: " + e,
                "Error saving: " + e
            );
        }
    }

    function savePdfFile(content) {
        if (!content) return;

        var pdfOptions = {
            header: settings.pdfHeader,
            onePage: settings.onePage,
            lineNumbers: settings.lineNumbers,
            fretDiagrams: settings.noDiagrams ? [] : extractedFretDiagrams
        };
        var pdfContent = PdfWriter.generatePdf(content, pdfOptions);

        var scorePath = curScore.path || "";
        var filePath;
        if (scorePath) {
            filePath = scorePath.replace(/\.(mscz|mscx)$/i, "") + "-letra.pdf";
        } else {
            var title = curScore.scoreName || curScore.title || "score";
            var filename = title.replace(/[^a-zA-Z0-9áéíóúüñÁÉÍÓÚÜÑ\s_-]/g, "").replace(/\s+/g, "_");
            filePath = fileIO.homePath() + "/Documents/" + filename + "-letra.pdf";
        }

        try {
            fileIO.source = filePath;
            fileIO.write(pdfContent);
            savedFilePath = filePath;
            statusText.text = tr(
                "PDF guardado en: " + filePath,
                "PDF saved to: " + filePath
            );
        } catch (e) {
            statusText.text = tr(
                "Error guardando PDF: " + e,
                "Error saving PDF: " + e
            );
        }
    }

    // ========================================
    // UI
    // ========================================

    Rectangle {
        anchors.fill: parent
        color: systemPalette.window

        ColumnLayout {
            anchors.fill: parent
            anchors.margins: 20
            spacing: 10

            Text {
                text: tr("Extractor de Letras y Acordes", "Lyrics and Chords Extractor")
                font.bold: true
                font.pixelSize: 18
                color: systemPalette.windowText
            }

            Text {
                text: "\u00A9 2025 - Manolo Carrasco (do2tis)"
                font.pixelSize: 11
                color: systemPalette.windowText
            }

            Rectangle {
                Layout.fillWidth: true
                height: 1
                color: systemPalette.mid
            }

            // Fix lyrics and chords section
            GroupBox {
                Layout.fillWidth: true
                title: tr("Corregir letras y acordes", "Fix lyrics and chords")

                ColumnLayout {
                    anchors.fill: parent
                    spacing: 8

                    // Status indicator
                    RowLayout {
                        Layout.fillWidth: true
                        spacing: 8

                        Rectangle {
                            width: 14; height: 14; radius: 7
                            color: issueCount < 0 ? "gray" : (issueCount === 0 ? "#4CAF50" : "#FF9800")
                        }

                        Text {
                            Layout.fillWidth: true
                            text: issueCount < 0
                                ? tr("Analizando...", "Checking...")
                                : (issueCount === 0
                                    ? tr("Partitura correcta", "Score is correct")
                                    : tr(issueCount + " problemas detectados", issueCount + " issues detected"))
                            color: systemPalette.windowText
                            font.pixelSize: 12
                            font.bold: issueCount > 0
                        }
                    }

                    Text {
                        Layout.fillWidth: true
                        wrapMode: Text.WordWrap
                        text: {
                            var lines = [];
                            if (issueSynalepha > 0) lines.push(
                                tr(issueSynalepha + " sinalefas: punto entre vocales \u2192 \u203F",
                                   issueSynalepha + " synalepha: dot between vowels \u2192 \u203F"));
                            if (issueHyphens > 0) lines.push(
                                tr(issueHyphens + " guiones manuales en silabas",
                                   issueHyphens + " manual hyphens in syllables"));
                            if (issueSyllabic > 0) lines.push(
                                tr(issueSyllabic + " cadenas silabicas rotas",
                                   issueSyllabic + " broken syllabic chains"));
                            if (issuePunctuation > 0) lines.push(
                                tr(issuePunctuation + " puntuacion pendiente (; .. ,,)",
                                   issuePunctuation + " pending punctuation (; .. ,,)"));
                            if (issueChordSync > 0) lines.push(
                                tr(issueChordSync + " acordes sin sincronizar (tab)",
                                   issueChordSync + " unsynchronized chords (tab)"));
                            return lines.map(function(l) { return "\u2022 " + l; }).join("\n");
                        }
                        color: "#E65100"
                        font.pixelSize: 11
                        visible: issueCount > 0
                    }

                    RowLayout {
                        Layout.fillWidth: true
                        spacing: 10
                        visible: issueCount !== 0

                        Text {
                            text: hasSelection ?
                                tr("Seleccion", "Selection") :
                                tr("Partitura completa", "Entire score")
                            color: systemPalette.windowText
                            font.italic: true
                            font.pixelSize: 11
                        }

                        Item { Layout.fillWidth: true }

                        Button {
                            text: tr("Corregir", "Fix")
                            onClicked: {
                                fixLyrics();
                                checkScore(); // Re-check after fix
                            }
                        }
                    }
                }
            }

            // Lyrics + Chords section
            GroupBox {
                Layout.fillWidth: true
                Layout.fillHeight: true
                title: tr("Extraccion de letras", "Lyrics extraction")

                ColumnLayout {
                    anchors.fill: parent
                    spacing: 8

                    Platform.FolderDialog {
                        id: scoresFolderDialog
                        title: tr("Seleccionar directorio de partituras",
                                  "Select scores directory")
                        onAccepted: {
                            scoresDirectory = folder.toString().replace(/^file:\/\//, "");
                            settings.scoresDirectory = scoresDirectory;
                            checkScoresDirectory();
                        }
                    }

                    RowLayout {
                        Layout.fillWidth: true
                        spacing: 6

                        Text {
                            text: tr("Directorio:", "Directory:")
                            color: systemPalette.windowText
                            font.pixelSize: 11
                        }

                        TextField {
                            id: scoresDirField
                            Layout.fillWidth: true
                            text: scoresDirectory
                            font.family: "monospace"
                            font.pixelSize: 11
                            selectByMouse: true
                            onTextChanged: {
                                if (text !== scoresDirectory) {
                                    scoresDirectory = text;
                                    settings.scoresDirectory = text;
                                    checkScoresDirectory();
                                }
                            }
                        }

                        Button {
                            text: "..."
                            implicitWidth: 32
                            onClicked: {
                                if (scoresDirectory && scoresDirectory.length > 0) {
                                    scoresFolderDialog.currentFolder = "file://" + scoresDirectory;
                                }
                                scoresFolderDialog.open();
                            }
                        }

                        Text {
                            text: scoresDirectoryExists ? "OK" : "X"
                            color: scoresDirectoryExists ? "#4CAF50" : "#f44336"
                            font.bold: true
                            font.pixelSize: 12
                        }
                    }

                    RowLayout {
                        Layout.fillWidth: true
                        spacing: 6
                        visible: lastScorePath.length > 0

                        Text {
                            text: tr("Archivo:", "File:")
                            color: systemPalette.windowText
                            font.pixelSize: 11
                        }

                        Text {
                            Layout.fillWidth: true
                            text: lastScorePath
                            color: systemPalette.windowText
                            font.family: "monospace"
                            font.pixelSize: 11
                            elide: Text.ElideMiddle
                        }

                        Button {
                            text: tr("Copiar", "Copy")
                            implicitHeight: 24
                            onClicked: {
                                copyHelper.text = lastScorePath;
                                copyHelper.selectAll();
                                copyHelper.copy();
                            }
                        }

                        TextEdit {
                            id: copyHelper
                            visible: false
                            width: 0; height: 0
                        }
                    }

                    ScrollView {
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        clip: true

                        TextArea {
                            id: lyricsPreview
                            readOnly: true
                            wrapMode: TextEdit.NoWrap
                            textFormat: TextEdit.PlainText
                            font.family: Qt.platform.os === "osx" || Qt.platform.os === "macos" ? "Menlo" : "Courier New"
                            font.pixelSize: 11
                            color: "black"
                            background: Rectangle {
                                color: "white"
                                border.color: systemPalette.mid
                                border.width: 1
                            }
                            text: tr("(Pulsa 'Extraer' para ver la letra)",
                                    "(Click 'Extract' to see lyrics)")
                        }
                    }

                    // Extraction options
                    RowLayout {
                        Layout.fillWidth: true
                        spacing: 10

                        CheckBox {
                            id: solfeoCheck
                            text: tr("Solfeo (Do, Re, Mi)", "Solfeo (Do, Re, Mi)")
                            checked: settings.useSolfeo
                            onCheckedChanged: settings.useSolfeo = checked
                        }

                        CheckBox {
                            id: fullRepeatCheck
                            text: tr("Repetir todo", "Full repeat")
                            checked: settings.fullRepeat
                            onCheckedChanged: settings.fullRepeat = checked
                        }

                        Item { Layout.fillWidth: true }
                    }

                    // Action buttons
                    RowLayout {
                        Layout.fillWidth: true
                        spacing: 10

                        Button {
                            text: tr("Extraer", "Extract")
                            onClicked: extractLyricsWithChords()
                        }

                        Button {
                            text: tr("Copiar", "Copy")
                            enabled: lyricsPreview.text.indexOf("(") !== 0
                            onClicked: {
                                lyricsPreview.selectAll();
                                lyricsPreview.copy();
                                lyricsPreview.deselect();
                                statusText.text = tr("Copiado al portapapeles", "Copied to clipboard");
                            }
                        }

                        Button {
                            text: tr("Guardar TXT", "Save TXT")
                            enabled: lyricsPreview.text.indexOf("(") !== 0
                            onClicked: saveLyricsToFile(Formatter.stripChordMarkers(lyricsPreview.text))
                        }

                        Button {
                            id: pdfButton
                            text: tr("Guardar PDF", "Save PDF")
                            enabled: lyricsPreview.text.indexOf("(") !== 0
                            onClicked: savePdfFile(lyricsPreview.text)
                        }

                        Button {
                            text: "Debug"
                            onClicked: exportDebugData()
                        }
                    }

                    // PDF options (visible when PDF button is available)
                    RowLayout {
                        Layout.fillWidth: true
                        spacing: 10
                        visible: pdfButton.enabled

                        Text {
                            text: "PDF:"
                            color: systemPalette.windowText
                            font.pixelSize: 11
                            font.bold: true
                        }

                        CheckBox {
                            id: onePageCheck
                            text: tr("1 pagina", "1 page")
                            checked: settings.onePage
                            onCheckedChanged: settings.onePage = checked
                        }

                        CheckBox {
                            id: lineNumbersCheck
                            text: tr("Num. linea", "Line num.")
                            checked: settings.lineNumbers
                            onCheckedChanged: settings.lineNumbers = checked
                        }

                        CheckBox {
                            id: noDiagramsCheck
                            text: tr("Sin diagramas", "No diagrams")
                            checked: settings.noDiagrams
                            onCheckedChanged: settings.noDiagrams = checked
                        }

                        Item { Layout.fillWidth: true }

                        Text {
                            text: tr("Cabecera:", "Header:")
                            color: systemPalette.windowText
                            font.pixelSize: 11
                        }

                        TextField {
                            id: headerField
                            Layout.preferredWidth: 180
                            placeholderText: tr("Nombre del grupo", "Group name")
                            font.pixelSize: 11
                            onTextChanged: settings.pdfHeader = text
                        }
                    }
                }
            }

            // Status text with copy path link
            RowLayout {
                Layout.fillWidth: true
                spacing: 4

                Text {
                    id: statusText
                    text: ""
                    color: systemPalette.windowText
                    font.italic: true
                    wrapMode: Text.WordWrap
                    Layout.fillWidth: true
                }

                Text {
                    id: openFileLink
                    text: "\uD83D\uDD17"
                    visible: savedFilePath !== ""
                    font.pixelSize: 14
                    opacity: openFileMouse.containsMouse ? 1.0 : 0.6

                    MouseArea {
                        id: openFileMouse
                        anchors.fill: parent
                        hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: {
                            // Try platform openers: open (macOS), xdg-open (Linux), start (Windows)
                            var openers = [
                                ["open", [savedFilePath]],
                                ["xdg-open", [savedFilePath]],
                                ["cmd", ["/c", "start", "", savedFilePath]]
                            ];
                            for (var oi = 0; oi < openers.length; oi++) {
                                try {
                                    openProcess.startWithArgs(openers[oi][0], openers[oi][1]);
                                    openProcess.waitForFinished(3000);
                                    break;
                                } catch (e) { /* try next */ }
                            }
                        }
                    }
                }

                Text {
                    id: copyPathLink
                    text: "\uD83D\uDCCB"
                    visible: savedFilePath !== ""
                    font.pixelSize: 14
                    opacity: copyPathMouse.containsMouse ? 1.0 : 0.6

                    MouseArea {
                        id: copyPathMouse
                        anchors.fill: parent
                        hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: {
                            textHelper.text = savedFilePath;
                            textHelper.selectAll();
                            textHelper.copy();
                            statusText.text = tr(
                                "Ruta copiada: " + savedFilePath,
                                "Path copied: " + savedFilePath
                            );
                        }
                    }
                }

                TextEdit {
                    id: textHelper
                    visible: false
                }
            }

            // Close button
            RowLayout {
                Layout.fillWidth: true
                spacing: 10

                Item { Layout.fillWidth: true }

                Button {
                    text: tr("Cerrar", "Close")
                    onClicked: quit()
                }
            }
        }
    }

    Component.onCompleted: {
        if (settings.scoresDirectory && settings.scoresDirectory.length > 0) {
            scoresDirectory = settings.scoresDirectory;
        } else {
            scoresDirectory = getDefaultScoresPath();
        }
        checkScoresDirectory();
        hasSelection = checkSelection();
        PdfWriter.setFretboardRenderer(FretboardRenderer);
        checkScore();
    }

    onRun: {
        if (!curScore) {
            console.log("No score open");
            quit();
            return;
        }
        solfeoCheck.checked = settings.useSolfeo;
        fullRepeatCheck.checked = settings.fullRepeat;
        onePageCheck.checked = settings.onePage;
        lineNumbersCheck.checked = settings.lineNumbers;
        noDiagramsCheck.checked = settings.noDiagrams;
        headerField.text = settings.pdfHeader;
    }
}
