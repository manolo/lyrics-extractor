#!/usr/bin/env node
// Build a short MuseScore 4 score with no lyrics at all, which is the only way into
// lib/chord-formatter.js: with no syllables the orchestrator switches to chord only mode
// and lays the harmony out by section instead of over words.
//
// Ten bars, two chords each, and every break kind that formatter reads:
//
//   m1  Intro label, chords before any other break
//   m2  chords, double barline at the end        -> a break with no label
//   m3  Tema label, start repeat                 -> label and repeat break at the same tick
//   m4  chords
//   m5  end repeat, play count 2                 -> break at the end of a repeat
//   m6  Solo label immediately followed by
//   m7  Solo bis label                           -> two labels, the second after a first one
//   m8  eight chords in two bars                 -> long enough to wrap the chord line
//   m9  segno marker and a D.S. jump             -> navigation with no lyrics to expand
//   m10 coda marker, final barline
//
//   node test/its/build-chords-only.js
//
// writes test/its/scores/test_le_SoloAcordes.mscz, the path the snapshot suite reads.

var fs = require("fs");
var path = require("path");
var os = require("os");
var child = require("child_process");

var OUT = process.argv[2] ||
    path.join(__dirname, "scores", "test_le_SoloAcordes.mscz");

// Chord symbols as root TPC plus quality, the form MuseScore 4 writes
var CHORDS = {
    "Lam": [17, "m"], "Re": [16, ""], "Sol": [15, ""], "Do": [14, ""],
    "Mi7": [18, "7"], "Rem": [16, "m"], "Sol7": [15, "7"], "Fa": [13, ""],
    "Sim": [19, "m"], "La7": [17, "7"], "Mim": [18, "m"], "Si7": [19, "7"]
};

// Two chords per bar, on the first and third beat
var BARS = [
    ["Lam", "Re"],       // 1
    ["Sol", "Do"],       // 2
    ["Lam", "Mi7"],      // 3
    ["Rem", "Sol7"],     // 4
    ["Do", "Fa"],        // 5
    ["Sim", "La7"],      // 6
    ["Mim", "Si7"],      // 7
    ["Lam", "Re"],       // 8
    ["Sol", "Do"],       // 9
    ["Lam", "Mi7"]       // 10
];

var LABELS = { 1: "Intro", 3: "Tema", 6: "Solo", 7: "Solo bis" };

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

function halfRest() {
    return "          <Rest>\n" +
           "            <durationType>half</durationType>\n" +
           "            </Rest>\n";
}

function marker(label, text) {
    return "          <Marker>\n" +
           "            <text>" + text + "</text>\n" +
           "            <label>" + label + "</label>\n" +
           "            </Marker>\n";
}

var measures = "";
for (var m = 1; m <= BARS.length; m++) {
    measures += "      <Measure>\n        <voice>\n";

    if (m === 1) {
        measures += "          <KeySig>\n            <concertKey>0</concertKey>\n            </KeySig>\n";
        measures += "          <TimeSig>\n            <sigN>4</sigN>\n            <sigD>4</sigD>\n            </TimeSig>\n";
    }
    if (m === 3) measures += "          <startRepeat/>\n";
    if (m === 9) measures += marker("segno", "Segno");
    if (m === 10) measures += marker("codab", "Coda");
    if (LABELS[m]) measures += systemText(LABELS[m]);

    // First half: chord then rest, second half the same, so the two chords of the bar sit a
    // half note apart without needing tick offsets
    measures += harmony(BARS[m - 1][0]) + halfRest();
    measures += harmony(BARS[m - 1][1]) + halfRest();

    if (m === 2) {
        measures += "          <BarLine>\n            <subtype>double</subtype>\n            </BarLine>\n";
    }
    if (m === 5) measures += "          <endRepeat>2</endRepeat>\n";
    if (m === 9) {
        measures += "          <Jump>\n" +
                    "            <text>D.S. al Coda</text>\n" +
                    "            <jumpTo>segno</jumpTo>\n" +
                    "            <playUntil>coda</playUntil>\n" +
                    "            <continueAt>codab</continueAt>\n" +
                    "            </Jump>\n";
    }
    if (m === BARS.length) {
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
'    <metaTag name="workTitle">Solo Acordes</metaTag>\n' +
'    <Part id="1">\n' +
'      <Staff>\n' +
'        <StaffType group="pitched">\n' +
'          <name>stdNormal</name>\n' +
'          </StaffType>\n' +
'        </Staff>\n' +
'      <trackName>Guitar</trackName>\n' +
'      <Instrument id="guitar">\n' +
'        <longName>Guitar</longName>\n' +
'        <shortName>Gt.</shortName>\n' +
'        <trackName>Guitar</trackName>\n' +
'        <instrumentId>pluck.guitar</instrumentId>\n' +
'        <Channel>\n' +
'          <program value="24"/>\n' +
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
'          <text>Solo Acordes</text>\n' +
'          </Text>\n' +
'        </VBox>\n' +
measures +
'      </Staff>\n' +
'    </Score>\n' +
'  </museScore>\n';

var style = '<?xml version="1.0" encoding="UTF-8"?>\n' +
'<museScore version="4.60">\n' +
'  <Style>\n' +
'    <chordSymbolSpelling>solfeggio</chordSymbolSpelling>\n' +
'    </Style>\n' +
'  </museScore>\n';

var container = '<?xml version="1.0" encoding="UTF-8"?>\n' +
'<container>\n' +
'  <rootfiles>\n' +
'    <rootfile full-path="score_style.mss"/>\n' +
'    <rootfile full-path="SoloAcordes.mscx"/>\n' +
'    </rootfiles>\n' +
'  </container>\n';

var dir = fs.mkdtempSync(path.join(os.tmpdir(), "sa-"));
fs.mkdirSync(path.join(dir, "META-INF"));
fs.writeFileSync(path.join(dir, "META-INF/container.xml"), container);
fs.writeFileSync(path.join(dir, "SoloAcordes.mscx"), mscx);
fs.writeFileSync(path.join(dir, "score_style.mss"), style);

var out = path.resolve(OUT);
fs.rmSync(out, { force: true });
child.execSync("cd " + JSON.stringify(dir) + " && zip -r -q " + JSON.stringify(out) +
    " META-INF SoloAcordes.mscx score_style.mss");
fs.rmSync(dir, { recursive: true, force: true });
console.log("written " + out + " (" + fs.statSync(out).size + " bytes)");
