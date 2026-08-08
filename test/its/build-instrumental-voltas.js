#!/usr/bin/env node
// Build a short MuseScore 4 score whose repeats carry no lyrics, which is the case
// lib/intro-chords.js exists for: an instrumental section inside a repeat with a first and
// second ending, a gap of bars between sections, and only then a sung section.
//
// Those are the branches no other synthetic score reaches: the volta pair of a section with
// no lyrics (intro-chords.js:66-71), the gap before a section (:56-57), and a sung section
// closing the walk (:96-102).
//
//   m1  Musica label, chords, no lyrics          -> chords before the first syllable
//   m2  chords, start repeat
//   m3  volta 1, end repeat (play count 2)       -> instrumental section with a volta pair
//   m4  volta 2, chords
//   m5  chords, no lyrics, no label              -> a gap between two sections
//   m6  Estrofa label, start repeat, lyrics
//   m7  lyrics, volta 1, end repeat              -> sung section, also with a volta pair
//   m8  volta 2, lyrics
//   m9  chords only again, final barline         -> outro after the last syllable
//
//   node test/its/build-instrumental-voltas.js
//
// writes test/its/scores/test_le_VoltasInstrumentales.mscz, the path the suite reads.

var fs = require("fs");
var path = require("path");
var os = require("os");
var child = require("child_process");

var OUT = process.argv[2] ||
    path.join(__dirname, "scores", "test_le_VoltasInstrumentales.mscz");

var NOTES = {
    "E4": [64, 18], "G4": [67, 15], "A4": [69, 17], "B4": [71, 19], "C5": [72, 14]
};

var CHORDS = {
    "Lam": [17, "m"], "Re": [16, ""], "Sol": [15, ""], "Do": [14, ""],
    "Mi7": [18, "7"], "Rem": [16, "m"], "Fa": [13, ""], "Si7": [19, "7"]
};

// The sung bars: four notes each, one syllable per note. The shared bar carries both lyric
// lines, and each ending carries only the line of the pass that plays it, which is how a
// score with a first and second ending is written. No word spans the volta boundary: split
// across it, the first pass leaves half a word hanging on the second.
var SUNG = {
    // shared bar of the repeat: verse 1 and verse 2
    6: [["E4", ["Can", "begin"], ["Vuel", "begin"]],
        ["G4", ["ta", "end"], ["ve", "end"]],
        ["A4", ["la"], ["la"]],
        ["B4", ["ronda,"], ["cancion,"]]],
    // first ending, sung on the first pass only
    7: [["C5", ["que"], null],
        ["B4", ["pa", "begin"], null],
        ["A4", ["sa.", "end"], null],
        ["G4", null, null]],
    // second ending, sung on the second pass only
    8: [["E4", null, ["que"]],
        ["G4", null, ["ya"]],
        ["A4", null, ["se"]],
        ["B4", null, ["fue."]]]
};

var BAR_CHORDS = ["Lam", "Re", "Sol", "Do", "Mi7", "Lam", "Rem", "Sol", "Fa"];
var LABELS = { 1: "Musica", 6: "Estrofa" };

function harmony(name) {
    var c = CHORDS[name];
    return "          <Harmony>\n            <harmonyInfo>\n" +
           "              <root>" + c[0] + "</root>\n" +
           (c[1] ? "              <name>" + c[1] + "</name>\n" : "") +
           "              </harmonyInfo>\n            </Harmony>\n";
}

function systemText(text) {
    return "          <SystemText>\n            <text>" + text + "</text>\n            </SystemText>\n";
}

function lyrics(syl, verse) {
    if (!syl) return "";
    var out = "            <Lyrics>\n";
    if (verse > 0) out += "              <no>" + verse + "</no>\n";
    if (syl[1]) out += "              <syllabic>" + syl[1] + "</syllabic>\n";
    out += "              <text>" + syl[0] + "</text>\n              </Lyrics>\n";
    return out;
}

function chord(noteName, v1, v2) {
    var n = NOTES[noteName];
    return "          <Chord>\n            <durationType>quarter</durationType>\n" +
           lyrics(v1, 0) + lyrics(v2, 1) +
           "            <Note>\n              <pitch>" + n[0] + "</pitch>\n" +
           "              <tpc>" + n[1] + "</tpc>\n              </Note>\n            </Chord>\n";
}

function measureRest() {
    return "          <Rest>\n            <durationType>measure</durationType>\n" +
           "            <duration>4/4</duration>\n            </Rest>\n";
}

function voltaOpen(ending, text) {
    return "          <Spanner type=\"Volta\">\n            <Volta>\n" +
           "              <endHookType>1</endHookType>\n" +
           "              <beginText>" + text + "</beginText>\n" +
           "              <endings>" + ending + "</endings>\n" +
           "              </Volta>\n            <next>\n              <location>\n" +
           "                <measures>1</measures>\n                </location>\n" +
           "              </next>\n            </Spanner>\n";
}

function voltaClose() {
    return "          <Spanner type=\"Volta\">\n            <prev>\n              <location>\n" +
           "                <measures>-1</measures>\n                </location>\n" +
           "              </prev>\n            </Spanner>\n";
}

var measures = "";
for (var m = 1; m <= 9; m++) {
    var body = "";

    if (m === 1) {
        body += "          <KeySig>\n            <concertKey>0</concertKey>\n            </KeySig>\n";
        body += "          <TimeSig>\n            <sigN>4</sigN>\n            <sigD>4</sigD>\n            </TimeSig>\n";
    }
    // A volta opens in its own bar and closes in the next one, so each pair is one bar of
    // first ending followed by one bar of second ending
    if (m === 3 || m === 7) body += voltaOpen(1, "1.");
    if (m === 4 || m === 8) body += voltaClose() + voltaOpen(2, "2.");
    if (m === 5 || m === 9) body += voltaClose();
    if (LABELS[m]) body += systemText(LABELS[m]);

    body += harmony(BAR_CHORDS[m - 1]);

    if (SUNG[m]) {
        SUNG[m].forEach(function(n) { body += chord(n[0], n[1], n[2]); });
    } else {
        body += measureRest();
    }

    if (m === 9) {
        body += "          <BarLine>\n            <subtype>end</subtype>\n            </BarLine>\n";
    }

    // The repeat barlines are children of the measure, as MuseScore writes them: inside the
    // voice they are read as nothing at all
    measures += "      <Measure>\n";
    if (m === 2 || m === 6) measures += "        <startRepeat/>\n";
    if (m === 3 || m === 7) measures += "        <endRepeat>2</endRepeat>\n";
    measures += "        <voice>\n" + body + "          </voice>\n        </Measure>\n";
}

var mscx = '<?xml version="1.0" encoding="UTF-8"?>\n' +
'<museScore version="4.60">\n' +
'  <programVersion>4.6.5</programVersion>\n' +
'  <programRevision></programRevision>\n' +
'  <Score>\n' +
'    <Division>480</Division>\n' +
'    <showInvisible>1</showInvisible>\n' +
'    <showUnprintable>1</showUnprintable>\n' +
'    <showFrames>1</showFrames>\n' +
'    <showMargins>0</showMargins>\n' +
'    <metaTag name="workTitle">Voltas Instrumentales</metaTag>\n' +
'    <Part id="1">\n' +
'      <Staff>\n' +
'        <StaffType group="pitched">\n' +
'          <name>stdNormal</name>\n' +
'          </StaffType>\n' +
'        </Staff>\n' +
'      <trackName>Voice</trackName>\n' +
'      <Instrument id="voice">\n' +
'        <longName>Voice</longName>\n' +
'        <shortName>V</shortName>\n' +
'        <trackName>Voice</trackName>\n' +
'        <instrumentId>voice.vocals</instrumentId>\n' +
'        <Channel>\n' +
'          <program value="52"/>\n' +
'          <synti>Fluid</synti>\n' +
'          <midiPort>0</midiPort>\n' +
'          <midiChannel>0</midiChannel>\n' +
'          </Channel>\n' +
'        </Instrument>\n' +
'      </Part>\n' +
'    <Staff id="1">\n' +
'      <VBox>\n' +
'        <height>10</height>\n' +
'        <Text>\n' +
'          <style>title</style>\n' +
'          <text>Voltas Instrumentales</text>\n' +
'          </Text>\n' +
'        </VBox>\n' +
measures +
'      </Staff>\n' +
'    </Score>\n' +
'  </museScore>\n';

var style = '<?xml version="1.0" encoding="UTF-8"?>\n' +
'<museScore version="4.60">\n  <Style>\n' +
'    <chordSymbolSpelling>solfeggio</chordSymbolSpelling>\n    </Style>\n  </museScore>\n';

var container = '<?xml version="1.0" encoding="UTF-8"?>\n<container>\n  <rootfiles>\n' +
'    <rootfile full-path="score_style.mss"/>\n' +
'    <rootfile full-path="VoltasInstrumentales.mscx"/>\n' +
'    </rootfiles>\n  </container>\n';

var dir = fs.mkdtempSync(path.join(os.tmpdir(), "vi-"));
fs.mkdirSync(path.join(dir, "META-INF"));
fs.writeFileSync(path.join(dir, "META-INF/container.xml"), container);
fs.writeFileSync(path.join(dir, "VoltasInstrumentales.mscx"), mscx);
fs.writeFileSync(path.join(dir, "score_style.mss"), style);

var out = path.resolve(OUT);
fs.rmSync(out, { force: true });
child.execSync("cd " + JSON.stringify(dir) + " && zip -r -q " + JSON.stringify(out) +
    " META-INF VoltasInstrumentales.mscx score_style.mss");
fs.rmSync(dir, { recursive: true, force: true });
console.log("written " + out + " (" + fs.statSync(out).size + " bytes)");
