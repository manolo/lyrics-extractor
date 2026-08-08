#!/usr/bin/env node
// Build a score about how chord symbols are read and written, which is what lib/constants.js
// and lib/chord-utils.js do. Every committed score was in solfeo, with plain triads on the
// beat, so none of this was exercised.
//
//   anglo spelling in the style sheet   -> the anglo half of tpcToChordName
//   a key signature of two flats        -> concertKeyName away from C
//   Bb/F and F/A                        -> the bass note branch
//   Bbt and Ebt9                        -> the jazz font qualities, written out as maj7
//   a chord at a <location> offset      -> the voice tick offset the walker has to apply
//   a chord landing inside a word       -> the formatter inserting at a word boundary
//   a staff text among the chords       -> an annotation that is not a chord
//
//   node test/its/build-chord-spellings.js
//
// writes test/its/scores/test_le_Cifrados.mscz, the path the snapshot suite reads.

var fs = require("fs");
var path = require("path");
var os = require("os");
var child = require("child_process");

var OUT = process.argv[2] ||
    path.join(__dirname, "scores", "test_le_Cifrados.mscz");

// Root TPC, quality, and the bass TPC when the chord is a slash chord. TPC 12 is Bb, 13 F,
// 14 C, 16 D, 17 A, 19 B, and 11 Eb.
var CHORDS = {
    "Bb":      [12, "", null],
    "Bb/F":    [12, "", 13],
    "F/A":     [13, "", 17],
    "Bbt":     [12, "t", null],      // jazz font triangle: a major seventh
    "Ebt9":    [11, "t9", null],
    "Cm":      [14, "m", null],
    "F7":      [13, "7", null],
    "Gm":      [15, "m", null]
};

// One syllable per quarter note. A chord name in the third slot lands on that note, and a
// chord in the fourth lands an eighth after it, written as a location offset the way
// MuseScore does when a symbol sits off the beat.
var BARS = [
    { chord: "Bb",   syls: ["Su", "be", "la", "lu"] },
    { chord: "Bb/F", syls: ["na", "por", "el", "cie"], mid: "F/A" },
    { chord: "Bbt",  syls: ["lo", "de", "mi", "al"] },
    { chord: "Ebt9", syls: ["dea", "que", "duer", "me."], off: "Cm" },
    { chord: "F7",   syls: ["Y", "can", "ta", "la"] },
    { chord: "Gm",   syls: ["ron", "da", "sin", "fin."] }
];

var SYLLABIC = {
    // the words are Sube la luna por el cielo de mi aldea que duerme
    0: ["begin", "end", null, "begin"],   // "Su|be", "lu"
    1: ["end", null, null, "begin"],      // "na", "cie"
    2: ["end", null, null, "begin"],      // "lo", "al"
    3: ["end", null, "begin", "end"],     // "dea", "duer|me."
    4: [null, "begin", "end", null],
    5: ["begin", "end", null, null]
};

function harmony(name, offsetEighth) {
    var c = CHORDS[name];
    var out = "";
    if (offsetEighth) {
        out += "          <location>\n            <fractions>1/8</fractions>\n            </location>\n";
    }
    out += "          <Harmony>\n            <harmonyInfo>\n" +
           "              <root>" + c[0] + "</root>\n" +
           (c[1] ? "              <name>" + c[1] + "</name>\n" : "") +
           (c[2] !== null ? "              <bass>" + c[2] + "</bass>\n" : "") +
           "              </harmonyInfo>\n            </Harmony>\n";
    if (offsetEighth) {
        out += "          <location>\n            <fractions>-1/8</fractions>\n            </location>\n";
    }
    return out;
}

function systemText(text) {
    return "          <SystemText>\n            <text>" + text + "</text>\n            </SystemText>\n";
}

function staffText(text) {
    return "          <StaffText>\n            <text>" + text + "</text>\n            </StaffText>\n";
}

function note(syl, syllabic) {
    var out = "          <Chord>\n            <durationType>quarter</durationType>\n";
    out += "            <Lyrics>\n";
    if (syllabic) out += "              <syllabic>" + syllabic + "</syllabic>\n";
    out += "              <text>" + syl + "</text>\n              </Lyrics>\n";
    out += "            <Note>\n              <pitch>70</pitch>\n              <tpc>12</tpc>\n" +
           "              </Note>\n            </Chord>\n";
    return out;
}

var measures = "";
for (var m = 0; m < BARS.length; m++) {
    var bar = BARS[m];
    var body = "";

    if (m === 0) {
        // Two flats: the key is Bb, so concertKeyName has to walk the circle of fifths
        body += "          <KeySig>\n            <concertKey>-2</concertKey>\n            </KeySig>\n";
        body += "          <TimeSig>\n            <sigN>4</sigN>\n            <sigD>4</sigD>\n            </TimeSig>\n";
        body += systemText("Estrofa");
    }
    if (m === 4) body += systemText("Estribillo");
    if (m === 2) body += staffText("Muy lento");

    body += harmony(bar.chord);

    for (var i = 0; i < bar.syls.length; i++) {
        // A chord inside a word: it lands on the second note of the bar, which is the middle
        // of a word rather than its start
        if (i === 1 && bar.mid) body += harmony(bar.mid);
        if (i === 2 && bar.off) body += harmony(bar.off, true);
        body += note(bar.syls[i], SYLLABIC[m][i]);
    }

    if (m === BARS.length - 1) {
        body += "          <BarLine>\n            <subtype>end</subtype>\n            </BarLine>\n";
    }
    measures += "      <Measure>\n        <voice>\n" + body + "          </voice>\n        </Measure>\n";
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
'    <metaTag name="workTitle">Cifrados</metaTag>\n' +
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
'          <text>Cifrados</text>\n' +
'          </Text>\n' +
'        </VBox>\n' +
measures +
'      </Staff>\n' +
'    </Score>\n' +
'  </museScore>\n';

// Anglo spelling, unlike every other score in the suite
var style = '<?xml version="1.0" encoding="UTF-8"?>\n<museScore version="4.60">\n  <Style>\n' +
'    <chordSymbolSpelling>standard</chordSymbolSpelling>\n    </Style>\n  </museScore>\n';

var container = '<?xml version="1.0" encoding="UTF-8"?>\n<container>\n  <rootfiles>\n' +
'    <rootfile full-path="score_style.mss"/>\n' +
'    <rootfile full-path="Cifrados.mscx"/>\n    </rootfiles>\n  </container>\n';

var dir = fs.mkdtempSync(path.join(os.tmpdir(), "cf-"));
fs.mkdirSync(path.join(dir, "META-INF"));
fs.writeFileSync(path.join(dir, "META-INF/container.xml"), container);
fs.writeFileSync(path.join(dir, "Cifrados.mscx"), mscx);
fs.writeFileSync(path.join(dir, "score_style.mss"), style);

var out = path.resolve(OUT);
fs.rmSync(out, { force: true });
child.execSync("cd " + JSON.stringify(dir) + " && zip -r -q " + JSON.stringify(out) +
    " META-INF Cifrados.mscx score_style.mss");
fs.rmSync(dir, { recursive: true, force: true });
console.log("written " + out + " (" + fs.statSync(out).size + " bytes)");
