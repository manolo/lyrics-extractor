#!/usr/bin/env node
// Build a minimal MuseScore 4 score that exercises the multi-verse branch of the
// simple path: two lyric verses on the same music, no repeats and no jumps. No other
// score in test/its covers that branch, and unlike the rest this one is generated, so
// the snapshot suite for it runs anywhere:
//
//   node test/its/build-multiverse.js
//
// writes test/its/scores/test_le_MultiVerso.mscz, the path the suite reads.
//
//   measure 1: system text "Intro #", chord Am        (intro, no lyrics)
//   measure 2: chord D                                (intro, no lyrics)
//   measure 3: system text "Estrofa", chord Am        (lyrics start here)
//   measure 4: chord D
//   measure 5: system text "Estribillo", chord G
//   measure 6: chord C
//   measure 7: chord Am                               (outro, no lyrics)
//   measure 8: chord E7, final barline                (outro, no lyrics)

var fs = require("fs");
var path = require("path");
var child = require("child_process");

var OUT = process.argv[2] ||
    path.join(__dirname, "scores", "test_le_MultiVerso.mscz");

// Pitch and its tonal pitch class, so MuseScore does not have to guess accidentals
var NOTES = {
    "A4": [69, 17], "B4": [71, 19], "C5": [72, 14], "D5": [74, 16],
    "E5": [76, 18], "F5": [77, 13], "G5": [79, 15]
};

// Chord symbols as root TPC plus quality, the form MuseScore 4 writes
var CHORDS = {
    "Am": [17, "m"], "D": [16, ""], "G": [15, ""], "C": [14, ""], "E7": [18, "7"]
};

// Four notes per measure. Each entry: note name, verse 1 syllable, verse 2 syllable.
// A syllable is [text] for a whole word or [text, syllabic] when a word spans notes.
var MELODY = [
    // measure 3
    [["A4", ["Hoy"], ["Es"]],
     ["B4", ["la"], ["la"]],
     ["C5", ["tu", "begin"], ["fies", "begin"]],
     ["B4", ["na", "end"], ["ta", "end"]]],
    // measure 4
    [["A4", ["va"], ["de"]],
     ["B4", ["por"], ["mi"]],
     ["C5", ["la"], ["ciu", "begin"]],
     ["D5", ["ciu", "begin"], ["dad.", "end"]]],
    // measure 5
    [["E5", ["dad.", "end"], ["y"]],
     ["D5", ["can", "begin"], ["can", "begin"]],
     ["C5", ["ta", "end"], ["ta", "middle"]],
     ["B4", ["sin"], ["mos", "end"]]],
    // measure 6
    [["C5", ["pa", "begin"], ["sin"]],
     ["B4", ["rar", "end"], ["ce", "begin"]],
     ["A4", ["al"], ["sar", "end"]],
     ["A4", ["fin."], ["hoy."]]]
];

var MEASURE_CHORDS = ["Am", "D", "Am", "D", "G", "C", "Am", "E7"];
var LABELS = { 1: "Intro #", 3: "Estrofa", 5: "Estribillo" };

function harmony(name) {
    var c = CHORDS[name];
    return "          <Harmony>\n" +
           "            <harmonyInfo>\n" +
           "              <root>" + c[0] + "</root>\n" +
           (c[1] ? "              <name>" + c[1] + "</name>\n" : "") +
           "              </harmonyInfo>\n" +
           "            </Harmony>\n";
}

function systemText(text) {
    return "          <SystemText>\n" +
           "            <text>" + text + "</text>\n" +
           "            </SystemText>\n";
}

function lyrics(syl, verse) {
    if (!syl) return "";
    var out = "            <Lyrics>\n";
    if (verse > 0) out += "              <no>" + verse + "</no>\n";
    if (syl[1]) out += "              <syllabic>" + syl[1] + "</syllabic>\n";
    out += "              <text>" + syl[0] + "</text>\n";
    out += "              </Lyrics>\n";
    return out;
}

function chord(noteName, v1, v2) {
    var n = NOTES[noteName];
    return "          <Chord>\n" +
           "            <durationType>quarter</durationType>\n" +
           lyrics(v1, 0) + lyrics(v2, 1) +
           "            <Note>\n" +
           "              <pitch>" + n[0] + "</pitch>\n" +
           "              <tpc>" + n[1] + "</tpc>\n" +
           "              </Note>\n" +
           "            </Chord>\n";
}

function measureRest() {
    return "          <Rest>\n" +
           "            <durationType>measure</durationType>\n" +
           "            <duration>4/4</duration>\n" +
           "            </Rest>\n";
}

var measures = "";
for (var m = 1; m <= 8; m++) {
    measures += "      <Measure>\n        <voice>\n";
    if (m === 1) {
        measures += "          <KeySig>\n            <concertKey>0</concertKey>\n            </KeySig>\n";
        measures += "          <TimeSig>\n            <sigN>4</sigN>\n            <sigD>4</sigD>\n            </TimeSig>\n";
    }
    if (LABELS[m]) measures += systemText(LABELS[m]);
    measures += harmony(MEASURE_CHORDS[m - 1]);

    if (m >= 3 && m <= 6) {
        var notes = MELODY[m - 3];
        for (var i = 0; i < notes.length; i++) {
            measures += chord(notes[i][0], notes[i][1], notes[i][2]);
        }
    } else {
        measures += measureRest();
    }

    if (m === 8) {
        measures += "          <BarLine>\n            <subtype>end</subtype>\n            </BarLine>\n";
    }
    measures += "          </voice>\n        </Measure>\n";
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
'    <metaTag name="composer">Prueba</metaTag>\n' +
'    <metaTag name="platform">Apple Macintosh</metaTag>\n' +
'    <metaTag name="workTitle">Multi Verso</metaTag>\n' +
'    <Part id="1">\n' +
'      <Staff>\n' +
'        <StaffType group="pitched">\n' +
'          <name>stdNormal</name>\n' +
'          </StaffType>\n' +
'        </Staff>\n' +
'      <trackName>Voice</trackName>\n' +
'      <Instrument id="voice">\n' +
'        <longName>Voz</longName>\n' +
'        <shortName>V</shortName>\n' +
'        <trackName>Voice</trackName>\n' +
'        <minPitchP>38</minPitchP>\n' +
'        <maxPitchP>84</maxPitchP>\n' +
'        <minPitchA>41</minPitchA>\n' +
'        <maxPitchA>79</maxPitchA>\n' +
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
'          <text>Multi Verso</text>\n' +
'          </Text>\n' +
'        </VBox>\n' +
measures +
'      </Staff>\n' +
'    </Score>\n' +
'  </museScore>\n';

var style = '<?xml version="1.0" encoding="UTF-8"?>\n' +
'<museScore version="4.60">\n' +
'  <Style>\n' +
'    <chordSymbolSpelling>standard</chordSymbolSpelling>\n' +
'    </Style>\n' +
'  </museScore>\n';

var container = '<?xml version="1.0" encoding="UTF-8"?>\n' +
'<container>\n' +
'  <rootfiles>\n' +
'    <rootfile full-path="score_style.mss"/>\n' +
'    <rootfile full-path="MultiVerso.mscx"/>\n' +
'    </rootfiles>\n' +
'  </container>\n';

var dir = fs.mkdtempSync(path.join(require("os").tmpdir(), "mv-"));
fs.mkdirSync(path.join(dir, "META-INF"));
fs.writeFileSync(path.join(dir, "META-INF/container.xml"), container);
fs.writeFileSync(path.join(dir, "MultiVerso.mscx"), mscx);
fs.writeFileSync(path.join(dir, "score_style.mss"), style);

var out = path.resolve(OUT);
fs.rmSync(out, { force: true });
child.execSync("cd " + JSON.stringify(dir) + " && zip -r -q " + JSON.stringify(out) + " META-INF MultiVerso.mscx score_style.mss");
fs.rmSync(dir, { recursive: true, force: true });
console.log("written " + out + " (" + fs.statSync(out).size + " bytes)");
