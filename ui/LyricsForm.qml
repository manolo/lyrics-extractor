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
import "../extractors/musescore-api.js" as Extractor
// FretDiagram fallback: remove these 3 imports when MuseScore exposes FretDiagram.harmony
import "../extractors/fretdiagram-fallback.js" as FretFallback
import "../extractors/xml-chord-reader.js" as XmlChordReader
import "../lib/constants.js" as Constants
import "../lib/lyrics-fixer.js" as LyricsFixer
import "help-text.js" as HelpText

MuseScore {
    id: plugin
    title: "Lyrics Extraction"
    categoryCode: "lyrics"
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

        var useSelection = hasSelection;

        // Build lyric groups from score (each entry keeps a ref to the live lyric object)
        var lyricGroups = {};
        var lyricRefs = {};

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

                        if (!lyricGroups[key]) { lyricGroups[key] = []; lyricRefs[key] = []; }

                        lyricGroups[key].push({
                            text: text,
                            syllabic: lyric.syllabic || 0
                        });
                        lyricRefs[key].push(lyric);
                    }
                }
            }
            segment = segment.next;
        }

        // Run shared fixer logic
        var result = LyricsFixer.fixAll(lyricGroups);
        var fixCount = result.fixCount;

        // Apply patches to score
        curScore.startCmd();

        var patchKeys = Object.keys(result.patches);
        for (var pk = 0; pk < patchKeys.length; pk++) {
            var pKey = patchKeys[pk];
            var patches = result.patches[pKey];
            var refs = lyricRefs[pKey];
            for (var pi = 0; pi < patches.length; pi++) {
                var patch = patches[pi];
                refs[patch.index].text = patch.newText;
                refs[patch.index].syllabic = patch.newSyllabic;
            }
        }

        curScore.endCmd();

        // Fix chord typos (before sync, so synced chords get clean text)
        var typoCount = fixChordTypos();

        // Sync chords from principal staff to linked staves
        var syncCount = syncChordsToLinkedStaves();

        // Sync VBox text fields to project metaTags
        var metaCount = syncVBoxToMetaTags();

        if (fixCount > 0 || typoCount > 0 || syncCount > 0 || metaCount > 0) {
            var msg = "";
            if (fixCount > 0) msg += fixCount + (isSpanish ? " silaba(s) corregida(s)" : " syllable(s) fixed");
            if (typoCount > 0) {
                if (msg) msg += ", ";
                msg += typoCount + (isSpanish ? " acorde(s) con typo corregido(s)" : " chord typo(s) fixed");
            }
            if (syncCount > 0) {
                if (msg) msg += ", ";
                msg += syncCount + (isSpanish ? " acorde(s) sincronizado(s)" : " chord(s) synced");
            }
            if (metaCount > 0) {
                if (msg) msg += ", ";
                msg += (isSpanish ? "propiedades actualizadas" : "properties updated");
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
    // SYNC VBOX TO METATAGS: copy VBox text fields to project properties
    // ========================================

    function syncVBoxToMetaTags() {
        if (!curScore) return 0;
        // VBox subtypeName -> metaTag key
        var mapping = [
            { style: "title",    tag: "workTitle" },
            { style: "subtitle", tag: "subtitle" },
            { style: "composer", tag: "composer" },
            { style: "lyricist", tag: "lyricist" }
        ];
        var count = 0;
        try {
            var mb = curScore.firstMeasure;
            if (!mb) return 0;
            while (mb.prev) mb = mb.prev;
            var elems = mb.elements;
            if (!elems) return 0;
            // Collect VBox values
            var vboxValues = {};
            for (var i = 0; i < elems.length; i++) {
                var el = elems[i];
                if (!el || !el.subtypeName) continue;
                for (var m = 0; m < mapping.length; m++) {
                    if (el.subtypeName === mapping[m].style && el.text) {
                        vboxValues[mapping[m].tag] = el.text;
                    }
                }
            }
            // Update metaTags where VBox has a value and metaTag differs
            for (var m2 = 0; m2 < mapping.length; m2++) {
                var tag = mapping[m2].tag;
                var vboxVal = vboxValues[tag];
                if (!vboxVal) continue;
                var current = curScore.metaTag(tag) || "";
                if (current !== vboxVal) {
                    curScore.setMetaTag(tag, vboxVal);
                    count++;
                }
            }
        } catch (e) { /* VBox access failed */ }
        return count;
    }

    // ========================================
    // FIX CHORD TYPOS: normalize chord text in place
    // ========================================

    function fixChordTypos() {
        if (!curScore) return 0;

        // Collect all Harmony annotations with typos
        var toFix = []; // [{ann, segment, normalizedText}]
        var segment = curScore.firstSegment();
        while (segment) {
            var annotations = segment.annotations;
            if (annotations) {
                for (var a = 0; a < annotations.length; a++) {
                    var ann = annotations[a];
                    if (ann && ann.type === Element.HARMONY) {
                        var raw = ann.text || "";
                        var normalized = ChordUtils.normalizeChord(raw);
                        if (normalized !== raw) {
                            toFix.push({ ann: ann, segment: segment, staff: Math.floor(ann.track / 4), text: normalized });
                        }
                    }
                }
            }
            segment = segment.next;
        }

        if (toFix.length === 0) return 0;

        // Fix each chord: remove old, add new with normalized text
        curScore.startCmd();

        for (var i = 0; i < toFix.length; i++) {
            var fix = toFix[i];
            var tick = fix.segment.tick;
            var staffIdx = fix.staff;

            try { removeElement(fix.ann); } catch (e) { continue; }

            var cursor = curScore.newCursor();
            cursor.rewindToTick(tick);
            if (!cursor.segment) continue;
            cursor.staffIdx = staffIdx;
            cursor.voice = 0;
            var harmony = newElement(Element.HARMONY);
            if (harmony) {
                cursor.add(harmony);
                harmony.text = fix.text;
            }
        }

        curScore.endCmd();
        return toFix.length;
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

        // Collect chords from ALL non-tab staves (merged by tick, principal wins on conflict)
        var chordByTick = {}; // tick -> {tick, text}
        segment = curScore.firstSegment();
        while (segment) {
            var anns = segment.annotations;
            if (anns) {
                for (var ai = 0; ai < anns.length; ai++) {
                    var an = anns[ai];
                    if (an && (an.type === Element.HARMONY)) {
                        var hStaff = Math.floor(an.track / 4);
                        if (staves[hStaff] && !staves[hStaff].isTabStaff) {
                            var tk = segment.tick;
                            // Principal staff chords take priority; otherwise first seen wins
                            if (!chordByTick[tk] || hStaff === principalStaff) {
                                chordByTick[tk] = { tick: tk, text: an.text || "" };
                            }
                        }
                    }
                }
            }
            segment = segment.next;
        }
        var principalChords = [];
        var tickKeys = Object.keys(chordByTick);
        for (var tki = 0; tki < tickKeys.length; tki++) {
            principalChords.push(chordByTick[tickKeys[tki]]);
        }
        principalChords.sort(function(a, b) { return a.tick - b.tick; });

        // For each linked staff: check if actually out of sync, then fix
        var totalSynced = 0;
        for (var li = 0; li < linkedStaves.length; li++) {
            var linkedIdx = linkedStaves[li];

            // Collect existing chords on this linked staff
            var linkedByTick = {};
            var toRemove = [];
            segment = curScore.firstSegment();
            while (segment) {
                var lanns = segment.annotations;
                if (lanns) {
                    for (var la = 0; la < lanns.length; la++) {
                        var lan = lanns[la];
                        if (lan && (lan.type === Element.HARMONY) && Math.floor(lan.track / 4) === linkedIdx) {
                            linkedByTick[segment.tick] = lan.text || "";
                            toRemove.push(lan);
                        }
                    }
                }
                segment = segment.next;
            }

            // Compare normalized: skip sync if already matching
            var needsSync = false;
            if (Object.keys(linkedByTick).length !== principalChords.length) {
                needsSync = true;
            } else {
                for (var cmp = 0; cmp < principalChords.length; cmp++) {
                    var pNorm = ChordUtils.convertChord(ChordUtils.normalizeChord(principalChords[cmp].text), false);
                    var lText = linkedByTick[principalChords[cmp].tick];
                    var lNorm = lText !== undefined ? ChordUtils.convertChord(ChordUtils.normalizeChord(lText), false) : undefined;
                    if (pNorm !== lNorm) { needsSync = true; break; }
                }
            }

            if (!needsSync) continue;

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
        var fallbackNeeded = FretFallback.needsFallback(data._debug);
        needsFallbackDir = fallbackNeeded;
        if (!fallbackNeeded) {
            console.log("[fallback] extractChordsWithFallback: not needed, returning original chords");
            return data.chords;
        }

        var scorePath = "";
        try { scorePath = curScore.path || ""; } catch (e) {}
        var scoreName = (curScore.masterScore ? curScore.masterScore.scoreName : curScore.scoreName) || "";

        console.log("[fallback] extractChordsWithFallback: running cmd('file-save')");
        cmd("file-save");

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
            if (data.scorePath) {
                setStatus(tr(
                    "Diagramas detectados pero no extraidos. Exporta debug para diagnostico.",
                    "Diagrams detected but not extracted. Run debug export to diagnose."), true);
            } else {
                setStatus(tr(
                    "Diagramas de acordes no encontrados. Ajusta el directorio donde esta el archivo .mscz",
                    "Chord diagrams not found. Set the directory where the .mscz file is located"), true);
            }
        } else if (chordTypos.length > 0) {
            var typoList = chordTypos.map(function(t) { return t.original + " -> " + t.normalized; }).join(", ");
            setStatus(tr(
                sylCount + " silabas, " + chordCount + " acordes. Typos corregidos: " + typoList,
                sylCount + " syllables, " + chordCount + " chords. Typos fixed: " + typoList), true);
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

        var savedPath = tryWriteFile(content, buildSaveCandidates("-letra.txt"));
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

        var cpOutput = ChordProWriter.convert(content);
        var savedPath = tryWriteFile(cpOutput, buildSaveCandidates("-letra.cho"));
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

        var savedPath = tryWriteFile(pdfContent, buildSaveCandidates("-letra.pdf"));
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
                                extractLyricsWithChords();
                                extractButton.enabled = true;
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
        LyricsFixer.setTextUtils(TextUtils);
        if (settings.scoresDirectory && settings.scoresDirectory.length > 0) {
            scoresDirectory = settings.scoresDirectory;
        } else {
            scoresDirectory = getDefaultScoresPath();
        }
        checkScoresDirectory();
        needsFallbackDir = Extractor.needsFallbackDirectory();
        hasSelection = checkSelection();
        PdfWriter.setFretboardRenderer(FretboardRenderer);
        PdfWriter.setLayoutTables(Constants);
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
        onePageCheck.checked = settings.onePage;
        lineNumbersCheck.checked = settings.lineNumbers;
        noDiagramsCheck.checked = settings.noDiagrams;
        headerField.text = settings.pdfHeader;
        footerField.text = settings.pdfFooter;
    }
}
