import QtQuick 2.9
import QtQuick.Controls 2.2
import QtQuick.Layouts 1.3
import MuseScore 3.0
import FileIO 3.0
// Qt.labs.platform may not be available on all MuseScore builds
// FolderDialog is created dynamically only when needed


// Shared library modules (dual-format: QML import + Node.js require)
import "../lib/text-utils.js" as TextUtils
import "../lib/chord-utils.js" as ChordUtils
import "../lib/word-builder.js" as WordBuilder
import "../lib/line-builder.js" as LineBuilder
import "../lib/expander.js" as Expander
import "../lib/intro-chords.js" as IntroChords
import "../lib/formatter.js" as Formatter
import "../lib/orchestrator.js" as Orchestrator
import "../lib/chord-formatter.js" as ChordFormatter
import "../lib/pdf-writer.js" as PdfWriter
import "../lib/chordpro-writer.js" as ChordProWriter
import "../lib/fretboard-renderer.js" as FretboardRenderer
import "../score/api-extractor.js" as Extractor
import "../score/api-patcher.js" as ApiPatcher
// FretDiagram fallback: remove these 3 imports when MuseScore exposes FretDiagram.harmony
import "../score/fallback-runner.js" as FretFallback
import "../score/xml-chord-reader.js" as XmlChordReader
import "../lib/constants.js" as Constants
import "../lib/lyrics-fixer.js" as LyricsFixer
import "help-text.js" as HelpText

MuseScore {
    id: plugin
    title: "Lyrics Extraction"
    categoryCode: "lyrics"
    requiresScore: true
    description: "Lyrics tools for vocal scores: synalepha formatting, lyrics+chords export"
    version: "1.0.0"
    pluginType: "dialog"
    width: 800
    height: 840

    property bool isSpanish: Qt.locale().name.indexOf("es") === 0
    property bool hasSelection: false
    property string savedFilePath: ""
    property int selectionStartTick: 0
    property int selectionEndTick: 0
    property var extractedFretDiagrams: []
    property string extractedOutput: "" // output with chord markers for PDF
    property string scoresDirectory: ""
    property string extractedKey: ""   // key of the score, for the ChordPro {key:} directive
    property bool scoresDirectoryExists: false
    property string lastScorePath: ""
    // True when fallback directory is needed (FBox exists but native API unavailable)
    property bool needsFallbackDir: false
    property var availableVoiceStaves: []   // [{idx, name, shortName, count}]
    property int selectedVoiceStaff: -1     // -1 = auto (best)

    SystemPalette { id: systemPalette }

    FileIO { id: fileIO }

    QProcess { id: chordProcess }
    QProcess { id: openProcess }

    Settings {
        id: settings
        category: "LyricsExtractor"
        property bool useSolfeo: true
        property bool fullRepeat: true
        property bool lyricsOnly: false
        property bool orphanLyrics: false
        property bool onePage: false
        property bool lineNumbers: false
        property bool noDiagrams: false
        property string pdfHeader: ""
        property string pdfFooter: ""
        property string scoresDirectory: ""
        property int settingsVersion: 0
    }

    function tr(es, en) {
        return isSpanish ? es : en;
    }

    function setStatus(msg, error) {
        statusText.text = msg;
        statusText.isError = !!error;
    }

    function getDefaultScoresPath() {
        var home = fileIO.homePath();
        var path = home + "/Documents";
        if (Qt.platform.os === "windows") path = path.replace(/\//g, "\\");
        return path;
    }

    function checkScoresDirectory() {
        if (!scoresDirectory || scoresDirectory.length === 0) {
            scoresDirectoryExists = false;
            return;
        }
        var path = scoresDirectory;
        if (Qt.platform.os === "windows") path = path.replace(/\//g, "\\");
        fileIO.source = path;
        scoresDirectoryExists = fileIO.exists();
    }

    // Module bundle for orchestrator
    property var mods: ({
        ChordUtils: ChordUtils,
        WordBuilder: WordBuilder,
        LineBuilder: LineBuilder,
        Expander: Expander,
        IntroChords: IntroChords,
        Formatter: Formatter,
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
    property string issueSyllabicDetail: ""
    property int issuePunctuation: 0
    property string issuePunctuationDetail: ""
    property int issueChordSync: 0
    property int issueChordTypos: 0
    property string issueChordTypoDetail: ""

    function checkScore() {
        if (!curScore) { issueCount = 0; return; }

        // Populate voice staff selector
        var staves = Extractor.findStaves();
        if (staves.voiceStaves && staves.voiceStaves.length > 0) {
            availableVoiceStaves = staves.voiceStaves;
            if (selectedVoiceStaff < 0) {
                selectedVoiceStaff = staves.voiceStaff;
            }
        }

        // Build lyric groups from score
        var lyricGroups = {};
        var segment = curScore.firstSegment();
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
                        var verse = lyric.verse || 0;
                        var key = staff + "_" + voice + "_" + verse;
                        if (!lyricGroups[key]) lyricGroups[key] = [];
                        lyricGroups[key].push({
                            text: text,
                            syllabic: lyric.syllabic || 0
                        });
                    }
                }
            }
            segment = segment.next;
        }

        // Build chord list for sync check.
        // Use findLinkedStaves() (Part-based) which is reliable across MS4 versions,
        // rather than staves[i].isTabStaff which may not be available in the QML API.
        var linkedStaves = Extractor.findLinkedStaves();
        var chordList = [];
        try {
            var seg2 = curScore.firstSegment();
            while (seg2) {
                var anns = seg2.annotations;
                if (anns) {
                    for (var a = 0; a < anns.length; a++) {
                        var ann = anns[a];
                        if (ann && ann.type === Element.HARMONY) {
                            var hStaff = Math.floor(ann.track / 4);
                            chordList.push({
                                tick: seg2.tick,
                                text: ann.text || "",
                                staffIndex: hStaff,
                                isTabStaff: linkedStaves[hStaff] || false
                            });
                        }
                    }
                }
                seg2 = seg2.next;
            }
        } catch (e) { /* chord sync check failed, ignore */ }

        var tabStavesMap = {};
        var lsKeys = Object.keys(linkedStaves);
        for (var lk = 0; lk < lsKeys.length; lk++) {
            if (linkedStaves[lsKeys[lk]]) tabStavesMap[lsKeys[lk]] = true;
        }

        var lyricResult = LyricsFixer.checkLyrics(lyricGroups);

        // Build a normalized copy for chord sync (so solfeo/anglo differences
        // aren't counted as mismatches). Uses anglo as target because
        // solfeo roots never false-match when converting solfeo->anglo.
        var syncList = [];
        for (var sl = 0; sl < chordList.length; sl++) {
            var normText = ChordUtils.convertChord(ChordUtils.normalizeChord(chordList[sl].text), false);
            syncList.push({ tick: chordList[sl].tick, text: normText,
                staffIndex: chordList[sl].staffIndex, isTabStaff: chordList[sl].isTabStaff });
        }
        var syncResult = LyricsFixer.checkChordSync(syncList, tabStavesMap);

        // Check chord typos (compare raw text vs normalized)
        var typoSeen = {};
        var typoExamples = [];
        var typoTotal = 0;
        for (var ct = 0; ct < chordList.length; ct++) {
            var rawText = chordList[ct].text;
            if (!rawText) continue;
            var normalized = ChordUtils.normalizeChord(rawText);
            if (normalized !== rawText) {
                typoTotal++;
                if (!typoSeen[rawText]) {
                    typoSeen[rawText] = true;
                    typoExamples.push(rawText + " \u2192 " + normalized);
                }
            }
        }

        issueSynalepha = lyricResult.synalepha;
        issueHyphens = lyricResult.hyphens;
        issueSyllabic = lyricResult.syllabic;
        var detail = lyricResult.syllabicExamples.join(", ");
        if (lyricResult.syllabic > 4) detail += ", ...";
        issueSyllabicDetail = detail;
        issuePunctuation = lyricResult.punctuation;
        var punctExamples = lyricResult.punctuationExamples || [];
        var punctDetail = punctExamples.join(", ");
        if (lyricResult.punctuation > 4) punctDetail += ", ...";
        issuePunctuationDetail = punctDetail;
        issueChordSync = syncResult.chordSync;
        issueChordTypos = typoTotal;
        var typoDetail = typoExamples.join(", ");
        if (typoExamples.length > 5) typoDetail = typoExamples.slice(0, 5).join(", ") + ", ...";
        issueChordTypoDetail = typoDetail;
        issueCount = lyricResult.synalepha + lyricResult.hyphens + lyricResult.syllabic +
                     lyricResult.punctuation + syncResult.chordSync + typoTotal;
    }

    // ========================================
    // FIX LYRICS: synalepha + consolidate in one pass (modifies score)
    // ========================================

    function fixLyrics() {
        if (!curScore) {
            statusText.text = tr("Error: No hay partitura abierta", "Error: No score open");
            return;
        }

        var counts = ApiPatcher.applyAll({
            useSelection: hasSelection,
            selectionStartTick: selectionStartTick,
            selectionEndTick: selectionEndTick
        });

        if (counts.total === 0) {
            statusText.text = tr(
                "Letras correctas, no se necesitan cambios",
                "Lyrics are correct, no changes needed"
            );
            return;
        }

        var parts = [];
        if (counts.lyrics > 0) parts.push(counts.lyrics + tr(" silaba(s) corregida(s)", " syllable(s) fixed"));
        if (counts.typos > 0) parts.push(counts.typos + tr(" acorde(s) con typo corregido(s)", " chord typo(s) fixed"));
        if (counts.synced > 0) parts.push(counts.synced + tr(" acorde(s) sincronizado(s)", " chord(s) synced"));
        if (counts.meta > 0) parts.push(tr("propiedades actualizadas", "properties updated"));
        statusText.text = parts.join(", ");
    }
    // ========================================
    // EXTRACT (read-only, uses shared modules)
    // ========================================

    // FretDiagram fallback: remove this function when MuseScore exposes FretDiagram.harmony
    function extractChordsWithFallback(data) {
        console.log("[fallback] extractChordsWithFallback: called, scoresDirectory='" + scoresDirectory + "'");
        var fallbackNeeded = FretFallback.needsFallback(data._debug);
        needsFallbackDir = fallbackNeeded;
        if (!fallbackNeeded) {
            console.log("[fallback] extractChordsWithFallback: not needed, returning original chords");
            return data.chords;
        }

        var scorePath = "";
        try { scorePath = curScore.path || ""; } catch (e) {}
        var scoreName = (curScore.masterScore ? curScore.masterScore.scoreName : curScore.scoreName) || "";

        // The fallback reads the score from disk, so pending edits have to be written
        // first. A score that was never saved has no path: saving it would open a
        // Save As dialog, so the fallback runs against whatever is on disk instead.
        if (scorePath) {
            console.log("[fallback] extractChordsWithFallback: running cmd('file-save')");
            cmd("file-save");
        } else {
            console.log("[fallback] extractChordsWithFallback: score has no path, skipping file-save");
        }

        var cliPath = Qt.resolvedUrl("../cli/extract-chords.js").toString().replace(/^file:\/\//, "");
        var chords = FretFallback.extractChords({
            scoreName: scoreName,
            scorePath: scorePath,
            fileIO: fileIO,
            process: chordProcess,
            XmlChordReader: XmlChordReader,
            Constants: Constants,
            cliPath: cliPath,
            data: data,
            spelling: settings.useSolfeo ? "solfeggio" : "standard",
            scoresDirectory: scoresDirectory
        });

        if (data.scorePath) lastScorePath = data.scorePath;
        return chords || data.chords;
    }

    function extractLyricsWithChords() {
        if (!curScore) {
            statusText.text = tr("Error: No hay partitura abierta", "Error: No score open");
            return;
        }

        var extractOpts = selectedVoiceStaff >= 0 ? { lyricStaff: selectedVoiceStaff } : {};
        var data = Extractor.extractAll(extractOpts);
        if (!data) {
            statusText.text = tr("No se encontraron letras en la partitura",
                                "No lyrics found in the score");
            return;
        }

        // Update available voice staves for the ComboBox
        if (data.voiceStaves && data.voiceStaves.length > 0) {
            availableVoiceStaves = data.voiceStaves;
            if (selectedVoiceStaff < 0) {
                selectedVoiceStaff = data.selectedVoiceStaff;
            }
        }

        // Append staff name to title when using a non-default staff
        var defaultStaff = (data.voiceStaves && data.voiceStaves.length > 0) ? data.voiceStaves[0].idx : -1;
        if (data.voiceStaves && data.voiceStaves.length > 1 && data.selectedVoiceStaff !== defaultStaff) {
            for (var vsi = 0; vsi < data.voiceStaves.length; vsi++) {
                if (data.voiceStaves[vsi].idx === data.selectedVoiceStaff) {
                    data.title = (data.title || "") + " (" + data.voiceStaves[vsi].name + ")";
                    break;
                }
            }
        }

        // Fallback: if FretDiagram annotations found but chords not extracted,
        // use CLI to read .mscz file and extract chords from XML
        data.chords = extractChordsWithFallback(data);

        // Normalize chord names: fix common typos from manual entry
        var chordTypos = [];
        if (data.chords && data.chords.length > 0) {
            chordTypos = ChordUtils.normalizeChords(data.chords);
        }

        // Convert chord spelling if user preference differs from score
        if (data.chords && data.chords.length > 0) {
            var isSolfeo = ChordUtils.detectSolfeo(data.chords);
            if (settings.useSolfeo && !isSolfeo) {
                ChordUtils.convertChords(data.chords, true);
            } else if (!settings.useSolfeo && isSolfeo) {
                ChordUtils.convertChords(data.chords, false);
            }
            ChordUtils.prettifyChords(data.chords);
        }

        data.fullRepeat = settings.fullRepeat;
        data.orphanLyrics = settings.orphanLyrics;
        extractedKey = Constants.concertKeyName(data.keysig, settings.useSolfeo ? "solfeggio" : "standard");

        // Lyric lines that no pass of the score sings (spec 7.1.2). Reported rather than
        // dropped in silence, so the user can turn the option on or fix the score.
        var orphanVerseList = [];
        try {
            orphanVerseList = Orchestrator.orphanVerses(data, mods) || [];
        } catch (e) {
            console.log("[extract] orphan verse check unavailable: " + e);
        }

        var output = Orchestrator.processExtraction(data, mods);

        if (!output) {
            statusText.text = tr("No se encontraron letras ni acordes", "No lyrics or chords found");
            return;
        }

        // Store fretDiagrams for PDF generation, converting chord names if needed
        var diagrams = data.fretDiagrams || [];
        if (diagrams.length > 0 && data.chords && data.chords.length > 0) {
            var diagramIsSolfeo = ChordUtils.detectSolfeo([{ chord: diagrams[0].chordName }]);
            var toSolfeo = settings.useSolfeo;
            if (toSolfeo && !diagramIsSolfeo) {
                for (var di = 0; di < diagrams.length; di++)
                    diagrams[di].chordName = ChordUtils.convertChord(diagrams[di].chordName, true);
            } else if (!toSolfeo && diagramIsSolfeo) {
                for (var di = 0; di < diagrams.length; di++)
                    diagrams[di].chordName = ChordUtils.convertChord(diagrams[di].chordName, false);
            }
            for (var dp = 0; dp < diagrams.length; dp++)
                diagrams[dp].chordName = ChordUtils.prettifyChord(diagrams[dp].chordName);
        }
        extractedFretDiagrams = diagrams;

        extractedOutput = output; // keep markers for PDF
        var displayOutput = settings.lyricsOnly ? Formatter.stripChordLines(output) : output;
        lyricsPreview.text = Formatter.stripChordMarkers(displayOutput);
        var sylCount = data.syllables ? data.syllables.length : 0;
        var chordCount = data.chords ? data.chords.length : 0;
        var diagramCount = extractedFretDiagrams.length;
        var hasFBox = data._debug && data._debug.hasFretBox;

        if (hasFBox && diagramCount === 0) {
            // The score carries a diagram box, so name the file the fallback looked
            // for and the directory it searched: that is what the user has to fix.
            var wantedName = (curScore.masterScore ? curScore.masterScore.scoreName : curScore.scoreName) || "";
            var wantedFile = wantedName ? wantedName + ".mscz" : tr("el archivo .mscz", "the .mscz file");
            if (data.scorePath) {
                setStatus(tr(
                    "Diagramas detectados pero no extraidos de " + data.scorePath + ". Exporta debug para diagnostico.",
                    "Diagrams detected but not extracted from " + data.scorePath + ". Run debug export to diagnose."), true);
            } else if (!scoresDirectoryExists) {
                setStatus(tr(
                    "El directorio de partituras " + scoresDirectory + " no existe. Ajustalo a la carpeta que contiene " + wantedFile,
                    "The scores directory " + scoresDirectory + " does not exist. Set it to the folder holding " + wantedFile), true);
            } else {
                setStatus(tr(
                    wantedFile + " no esta en ningun sitio dentro de " + scoresDirectory + ". Ajusta el directorio de partituras",
                    wantedFile + " is nowhere under " + scoresDirectory + ". Set the scores directory"), true);
            }
        } else if (chordTypos.length > 0) {
            var typoList = chordTypos.map(function(t) { return t.original + " -> " + t.normalized; }).join(", ");
            setStatus(tr(
                sylCount + " silabas, " + chordCount + " acordes. Typos corregidos: " + typoList,
                sylCount + " syllables, " + chordCount + " chords. Typos fixed: " + typoList), true);
        } else if (orphanVerseList.length > 0 && !settings.orphanLyrics) {
            var orphanNums = orphanVerseList.map(function(v) { return v + 1; }).join(", ");
            setStatus(tr(
                sylCount + " silabas, " + chordCount + " acordes. La estructura no canta la letra " +
                    orphanNums + ": marca Letras huerfanas para incluirla",
                sylCount + " syllables, " + chordCount + " chords. No pass sings verse " +
                    orphanNums + ": tick Orphan lyrics to include it"), true);
        } else {
            setStatus(tr(
                sylCount + " silabas, " + chordCount + " acordes extraidos",
                sylCount + " syllables, " + chordCount + " chords extracted"), false);
        }
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

        // Run fallback so its log is captured in _debug.fallbackLog
        extractChordsWithFallback(data);

        var json = JSON.stringify(data, null, 2);

        var savedPath = tryWriteFile(json, buildSaveCandidates("-debug.json"));
        if (!savedPath) {
            statusText.isError = true;
            statusText.text = tr("Error guardando debug", "Error saving debug");
            return;
        }
        savedFilePath = savedPath;
        statusText.isError = false;
        statusText.text = tr("Debug exportado: " + savedPath, "Debug exported: " + savedPath);
    }

    // ========================================
    // SAVE
    // ========================================

    function openFile(path) {
        var isWindows = Qt.platform.os === "windows";
        try {
            if (isWindows) {
                var winPath = path.replace(/\//g, "\\");
                console.log("[open] explorer: " + winPath);
                openProcess.startWithArgs("explorer.exe", [winPath]);
            } else {
                openProcess.startWithArgs("open", [path]);
            }
            openProcess.waitForFinished(5000);
        } catch (e) {
            console.log("[open] first attempt failed: " + e);
            try {
                openProcess.startWithArgs("xdg-open", [path]);
                openProcess.waitForFinished(3000);
            } catch (e2) { console.log("[open] xdg-open failed: " + e2); }
        }
    }

    function tryWriteFile(data, candidates) {
        for (var i = 0; i < candidates.length; i++) {
            try {
                fileIO.source = candidates[i];
                if (fileIO.write(data)) return candidates[i];
            } catch (e) { /* try next */ }
        }
        return null;
    }

    function buildSaveCandidates(suffix) {
        // curScore.path is not exposed in the MS4 plugin API, so we go straight to allowed dirs.
        var title = curScore.scoreName || curScore.title || "score";
        var filename = title.replace(/[^a-zA-Z0-9áéíóúüñÁÉÍÓÚÜÑ\s_-]/g, "").replace(/\s+/g, "_");
        var home = fileIO.homePath();
        return [
            home + "/Documents/MuseScore4/Scores/" + filename + suffix,
            home + "/Documents/MuseScore4/" + filename + suffix
        ];
    }

    function saveLyricsToFile(content) {
        if (!content) return;

        var savedPath = tryWriteFile(content, buildSaveCandidates("-lyrics.txt"));
        if (!savedPath) {
            statusText.isError = true;
            statusText.text = tr("Error guardando texto", "Error saving text");
            return;
        }
        savedFilePath = savedPath;
        statusText.isError = false;
        statusText.text = tr("Guardado en: " + savedPath, "Saved to: " + savedPath);
        openFile(savedPath);
    }

    function saveChordProFile(content) {
        if (!content) return;

        var cpOutput = ChordProWriter.convert(content, { key: extractedKey });
        var savedPath = tryWriteFile(cpOutput, buildSaveCandidates("-lyrics.cho"));
        if (!savedPath) {
            statusText.isError = true;
            statusText.text = tr("Error guardando ChordPro", "Error saving ChordPro");
            return;
        }
        savedFilePath = savedPath;
        statusText.isError = false;
        statusText.text = tr("ChordPro guardado en: " + savedPath, "ChordPro saved to: " + savedPath);
        openFile(savedPath);
    }

    function savePdfFile(content) {
        if (!content) return;

        var pdfOptions = {
            header: settings.pdfHeader,
            footer: settings.pdfFooter,
            onePage: settings.onePage,
            lineNumbers: settings.lineNumbers,
            fretDiagrams: settings.noDiagrams ? [] : extractedFretDiagrams
        };
        var pdfContent = PdfWriter.generatePdf(content, pdfOptions);

        var savedPath = tryWriteFile(pdfContent, buildSaveCandidates("-lyrics.pdf"));
        if (!savedPath) {
            statusText.isError = true;
            statusText.text = tr("Error guardando PDF", "Error saving PDF");
            return;
        }
        savedFilePath = savedPath;
        statusText.isError = false;
        statusText.text = tr("PDF guardado en: " + savedPath, "PDF saved to: " + savedPath);
        openFile(savedPath);
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

            RowLayout {
                Layout.fillWidth: true

                Text {
                    text: tr("Extractor de Letras y Acordes", "Lyrics and Chords Extractor")
                    font.bold: true
                    font.pixelSize: 18
                    color: systemPalette.windowText
                }

                Item { Layout.fillWidth: true }

                Rectangle {
                    width: 26
                    height: 26
                    radius: 13
                    color: "#2196F3"

                    Text {
                        anchors.centerIn: parent
                        text: "?"
                        font.bold: true
                        font.pixelSize: 15
                        color: "white"
                    }

                    MouseArea {
                        anchors.fill: parent
                        cursorShape: Qt.PointingHandCursor
                        onClicked: helpDialog.open()
                    }
                }
            }

            GroupBox {
                Layout.fillWidth: true
                title: ""
                background: Rectangle {
                    color: "transparent"
                    border.color: "#777777"
                    border.width: 1
                    radius: 4
                }

                ColumnLayout {
                    anchors.fill: parent
                    spacing: 8

                    Text {
                        text: "Fix Lyrics & Chords"
                        font.bold: true
                        color: systemPalette.windowText
                    }

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
                                tr(issueSynalepha + " sinalefas: s\u00edmbolo entre letras \u2192 \u203F",
                                   issueSynalepha + " synalepha: symbol between letters \u2192 \u203F"));
                            if (issueHyphens > 0) lines.push(
                                tr(issueHyphens + " guiones manuales en silabas",
                                   issueHyphens + " manual hyphens in syllables"));
                            if (issueSyllabic > 0) lines.push(
                                tr(issueSyllabic + " cadenas sil\u00e1bicas rotas: " + issueSyllabicDetail,
                                   issueSyllabic + " broken syllabic chains: " + issueSyllabicDetail));
                            if (issuePunctuation > 0) lines.push(
                                tr(issuePunctuation + " puntuacion pendiente (" + issuePunctuationDetail + ")",
                                   issuePunctuation + " pending punctuation (" + issuePunctuationDetail + ")"));
                            if (issueChordSync > 0) lines.push(
                                tr(issueChordSync + " acordes sin sincronizar (tab)",
                                   issueChordSync + " unsynchronized chords (tab)"));
                            if (issueChordTypos > 0) lines.push(
                                tr(issueChordTypos + " acordes con typos: " + issueChordTypoDetail,
                                   issueChordTypos + " chord typos: " + issueChordTypoDetail));
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
                title: ""
                background: Rectangle {
                    color: "transparent"
                    border.color: "#777777"
                    border.width: 1
                    radius: 4
                }

                ColumnLayout {
                    anchors.fill: parent
                    spacing: 8

                    RowLayout {
                        Layout.fillWidth: true
                        spacing: 10

                        Text {
                            text: "Extract Lyrics & Chords"
                            font.bold: true
                            color: systemPalette.windowText
                        }

                        Item { Layout.fillWidth: true }

                        ComboBox {
                            id: staffCombo
                            Layout.preferredWidth: 150
                            visible: availableVoiceStaves.length > 1
                            model: {
                                var items = [];
                                for (var i = 0; i < availableVoiceStaves.length; i++) {
                                    var vs = availableVoiceStaves[i];
                                    items.push(vs.name);
                                }
                                return items;
                            }
                            onActivated: {
                                if (index >= 0 && index < availableVoiceStaves.length) {
                                    selectedVoiceStaff = availableVoiceStaves[index].idx;
                                }
                            }
                        }

                        Button {
                            id: extractButton
                            text: tr("Extraer", "Extract")
                            onClicked: {
                                extractButton.enabled = false;
                                lyricsPreview.text = "";
                                statusText.text = tr("Extrayendo...", "Extracting...");
                                statusText.isError = false;
                                extractTimer.start();
                            }
                        }

                        Timer {
                            id: extractTimer
                            interval: 50
                            repeat: false
                            onTriggered: {
                                // The button re-enables even if extraction throws, otherwise
                                // the dialog has to be closed and reopened to try again.
                                try {
                                    extractLyricsWithChords();
                                } finally {
                                    extractButton.enabled = true;
                                }
                            }
                        }
                    }

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

                        CheckBox {
                            id: lyricsOnlyCheck
                            text: tr("Solo letra", "Lyrics only")
                            checked: settings.lyricsOnly
                            onCheckedChanged: settings.lyricsOnly = checked
                        }

                        CheckBox {
                            id: orphanLyricsCheck
                            text: tr("Letras huerfanas", "Orphan lyrics")
                            checked: settings.orphanLyrics
                            onCheckedChanged: settings.orphanLyrics = checked
                        }
                    }

                    RowLayout {
                        Layout.fillWidth: true
                        spacing: 6
                        visible: needsFallbackDir

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
                            text: tr("Usando archivo:", "Using file:")
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

                        Text {
                            text: "\uD83D\uDCCB"
                            font.pixelSize: 13
                            opacity: copyScorePathMouse.containsMouse ? 1.0 : 0.5

                            MouseArea {
                                id: copyScorePathMouse
                                anchors.fill: parent
                                hoverEnabled: true
                                cursorShape: Qt.PointingHandCursor
                                onClicked: {
                                    copyHelper.text = lastScorePath;
                                    copyHelper.selectAll();
                                    copyHelper.copy();
                                }
                            }
                        }

                        TextEdit {
                            id: copyHelper
                            visible: false
                            width: 0; height: 0
                        }
                    }

                    RowLayout {
                        Layout.fillWidth: true
                        spacing: 4
                        visible: statusText.text.length > 0

                        Text {
                            id: statusText
                            property bool isError: false
                            text: ""
                            color: isError ? "#f44336" : systemPalette.windowText
                            font.italic: true
                            font.bold: isError
                            font.pixelSize: 11
                            wrapMode: Text.WordWrap
                            Layout.fillWidth: true
                        }

                        Text {
                            text: "\uD83D\uDCCB"
                            visible: savedFilePath !== ""
                            font.pixelSize: 14
                            opacity: copyPathMouse.containsMouse ? 1.0 : 0.5

                            MouseArea {
                                id: copyPathMouse
                                anchors.fill: parent
                                hoverEnabled: true
                                cursorShape: Qt.PointingHandCursor
                                onClicked: {
                                    textHelper.text = savedFilePath;
                                    textHelper.selectAll();
                                    textHelper.copy();
                                    setStatus(tr(
                                        "Ruta copiada: " + savedFilePath,
                                        "Path copied: " + savedFilePath), false);
                                }
                            }
                        }
                    }

                    Item {
                        Layout.fillWidth: true
                        Layout.fillHeight: true

                        ScrollView {
                            anchors.fill: parent
                            clip: true

                            TextArea {
                                id: lyricsPreview
                                readOnly: true
                                wrapMode: TextEdit.NoWrap
                                textFormat: TextEdit.PlainText
                                font.family: Qt.platform.os === "osx" || Qt.platform.os === "macos" ? "Menlo" : "Courier New"
                                font.pixelSize: 11
                                color: systemPalette.text
                                background: Rectangle {
                                    color: Qt.lighter(systemPalette.base, 1.15)
                                }
                                text: ""
                            }
                        }

                        Row {
                            anchors.right: parent.right
                            anchors.top: parent.top
                            anchors.margins: 4
                            spacing: 4
                            visible: lyricsPreview.text.length > 0
                            z: 1

                            Button {
                                text: tr("Copiar", "Copy")
                                opacity: 0.85
                                onClicked: {
                                    lyricsPreview.selectAll();
                                    lyricsPreview.copy();
                                    lyricsPreview.deselect();
                                    statusText.text = tr("Copiado al portapapeles", "Copied to clipboard");
                                }
                            }

                            Button {
                                text: tr("Guardar txt", "Save txt")
                                opacity: 0.85
                                onClicked: saveLyricsToFile(Formatter.stripChordMarkers(lyricsPreview.text))
                            }

                            Button {
                                text: "Save ChordPro"
                                opacity: 0.85
                                onClicked: saveChordProFile(extractedOutput || lyricsPreview.text)
                            }
                        }
                    }
                }
            }

            GroupBox {
                Layout.fillWidth: true
                title: ""
                visible: lyricsPreview.text.length > 0
                background: Rectangle {
                    color: "transparent"
                    border.color: "#777777"
                    border.width: 1
                    radius: 4
                }

                ColumnLayout {
                    anchors.fill: parent
                    spacing: 6

                    Text {
                        text: "Save as PDF"
                        font.bold: true
                        color: systemPalette.windowText
                    }

                    RowLayout {
                        Layout.fillWidth: true
                        spacing: 6

                        Text {
                            text: tr("Cabecera:", "Header:")
                            color: systemPalette.windowText
                            font.pixelSize: 11
                        }

                        TextField {
                            id: headerField
                            Layout.fillWidth: true
                            placeholderText: tr("Nombre del grupo", "Group name")
                            font.pixelSize: 11
                            onTextChanged: settings.pdfHeader = text
                        }

                        Text {
                            text: tr("Pie:", "Footer:")
                            color: systemPalette.windowText
                            font.pixelSize: 11
                        }

                        TextField {
                            id: footerField
                            Layout.fillWidth: true
                            placeholderText: tr("Nombre del grupo", "Group name")
                            font.pixelSize: 11
                            onTextChanged: settings.pdfFooter = text
                        }
                    }

                    RowLayout {
                        Layout.fillWidth: true
                        spacing: 10

                        CheckBox {
                            id: onePageCheck
                            text: tr("Condensar en 1 pagina", "Fit in 1 page")
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
                            text: tr("Sin diagramas de acordes", "No chord diagrams")
                            checked: settings.noDiagrams
                            onCheckedChanged: settings.noDiagrams = checked
                        }

                        Item { Layout.fillWidth: true }

                        Button {
                            id: pdfButton
                            text: tr("Guardar pdf", "Save pdf")
                            onClicked: savePdfFile(extractedOutput || lyricsPreview.text)
                        }
                    }
                }
            }

            TextEdit {
                id: textHelper
                visible: false
            }

            Item {
                Layout.fillWidth: true
                height: 40

                Text {
                    text: "\u00A9 2026 Manolo Carrasco (do2tis) - v" + version
                    font.pixelSize: 11
                    color: systemPalette.windowText
                    anchors.left: parent.left
                    anchors.verticalCenter: parent.verticalCenter
                }

                Row {
                    spacing: 10
                    anchors.right: parent.right
                    anchors.verticalCenter: parent.verticalCenter

                    Button {
                        text: "Debug"
                        onClicked: exportDebugData()
                    }

                    Button {
                        text: tr("Cerrar", "Close")
                        onClicked: quit()
                    }
                }
            }
        }
    }

    Dialog {
        id: helpDialog
        title: ""
        modal: true
        width: 700
        height: 700
        x: (parent.width - width) / 2
        y: (parent.height - height) / 2
        standardButtons: Dialog.NoButton

        background: Rectangle {
            color: systemPalette.window
            border.color: systemPalette.windowText
            border.width: 2
            radius: 6
        }

        header: RowLayout {
            spacing: 0

            Text {
                text: tr("Ayuda", "Help")
                font.bold: true
                font.pixelSize: 14
                color: systemPalette.windowText
                Layout.fillWidth: true
                Layout.leftMargin: 12
                Layout.topMargin: 8
                Layout.bottomMargin: 4
            }

            Button {
                text: "\u2715"
                flat: true
                implicitWidth: 32
                implicitHeight: 28
                Layout.rightMargin: 6
                Layout.topMargin: 4
                onClicked: helpDialog.close()
            }
        }

        Flickable {
            id: helpFlickable
            anchors.fill: parent
            anchors.margins: 10
            anchors.rightMargin: 18
            contentHeight: helpContent.height
            clip: true
            flickableDirection: Flickable.VerticalFlick

            Text {
                id: helpContent
                width: parent.width
                wrapMode: Text.WordWrap
                textFormat: Text.RichText
                color: systemPalette.windowText
                font.pixelSize: 12
                text: (isSpanish ? HelpText.es : HelpText.en).replace(
                    "<!--SCORES_DIR-->",
                    needsFallbackDir ? (isSpanish ? HelpText.scoresDirEs : HelpText.scoresDirEn) : ""
                )
            }
        }

        ScrollBar {
            anchors.right: parent.right
            anchors.top: parent.top
            anchors.bottom: parent.bottom
            anchors.rightMargin: 2
            anchors.topMargin: 4
            anchors.bottomMargin: 4
            orientation: Qt.Vertical
            size: helpFlickable.visibleArea.heightRatio
            position: helpFlickable.visibleArea.yPosition
            policy: ScrollBar.AlwaysOn
            onPositionChanged: {
                if (pressed) helpFlickable.contentY = position * helpFlickable.contentHeight;
            }
        }
    }

    Component.onCompleted: {
        // Migrate settings when defaults change across versions
        if (settings.settingsVersion < 1) {
            settings.fullRepeat = true;
            settings.settingsVersion = 1;
        }
        Extractor.setTextUtils(TextUtils);
        LineBuilder.setTextUtils(TextUtils);
        Formatter.setLineBuilder(LineBuilder);
        ChordProWriter.setConvertChord(ChordUtils.convertChord);
        ChordProWriter.setIsChordName(ChordUtils.isChordName);
        LyricsFixer.setTextUtils(TextUtils);
        if (settings.scoresDirectory && settings.scoresDirectory.length > 0) {
            scoresDirectory = settings.scoresDirectory;
        } else {
            scoresDirectory = getDefaultScoresPath();
        }
        checkScoresDirectory();
        needsFallbackDir = Extractor.needsFallbackDirectory();
        hasSelection = checkSelection();
        ApiPatcher.setHost({
            score: function() { return curScore; },
            Element: Element,
            partStaffGroups: function() { return Extractor.findPartStaffGroups(); },
            // Wrapped rather than passed by reference: these are methods of the plugin
            // object, and handing the bare function to another module loses its binding
            newElement: function(type) { return newElement(type); },
            removeElement: function(el) { return removeElement(el); }
        });
        ApiPatcher.setLyricsFixer(LyricsFixer);
        ApiPatcher.setChordUtils(ChordUtils);
        ApiPatcher.setTextUtils(TextUtils);
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
        lyricsOnlyCheck.checked = settings.lyricsOnly;
        orphanLyricsCheck.checked = settings.orphanLyrics;
        onePageCheck.checked = settings.onePage;
        lineNumbersCheck.checked = settings.lineNumbers;
        noDiagramsCheck.checked = settings.noDiagrams;
        headerField.text = settings.pdfHeader;
        footerField.text = settings.pdfFooter;
    }
}
