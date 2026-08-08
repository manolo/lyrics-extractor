#!/usr/bin/env node
// Build a score that is mostly instrumental: a long intro, an interlude between every pair of
// stanzas and an outro. What happens to chords that belong to no lyric is a third of
// lib/formatter.js and all of lib/intro-chords.js, and no other synthetic score has more than
// one spare bar.
//
// The cases, and what each one is the only way into:
//
//   m1   Intro label, two chords                  -> the leading label of the intro block
//   m3   Musica label with more chords after it   -> the intro split at a label (formatter:310)
//   m5   a repeat, no lyrics                      -> the instrumental section walk
//   m6   one ending only, then a repeat that
//        starts where this one ends                -> the single volta whose next section
//                                                    follows immediately (intro-chords:90)
//   m11  two chords between two stanzas           -> a short interlude, kept after the lyric
//   m14  four chords after a line ending in a
//        full stop, and a label after them         -> the labelled interlude: the chords before
//                                                    the label are emitted on their own,
//                                                    the ones after it belong to the label
//   m15  Estribillo label, then chords, then the
//        line                                      -> the pickup chords, written at column 0
//   m18  four chords after the last syllable       -> the outro
//
//   node test/its/build-intro-outro.js
//
// writes test/its/scores/test_le_IntroSalida.mscz, the path the snapshot suite reads.

var fs = require("fs");
var path = require("path");
var os = require("os");
var child = require("child_process");

var OUT = process.argv[2] ||
    path.join(__dirname, "scores", "test_le_IntroSalida.mscz");

var CHORDS = {
    "Lam": [17, "m"], "Re": [16, ""], "Sol": [15, ""], "Do": [14, ""],
    "Mi7": [18, "7"], "Rem": [16, "m"], "Fa": [13, ""]
};

// Syllables of a word joined by hyphens, "/" for a quarter rest. Every sung bar has to come
// out at exactly four events, since a bar is four quarter notes.
function phrase(text) {
    var events = [];
    text.trim().split(/\s+/).forEach(function(token) {
        if (token === "/") { events.push({ rest: true }); return; }
        var parts = token.split("-");
        parts.forEach(function(part, k) {
            var syllabic = null;
            if (parts.length > 1) {
                syllabic = k === 0 ? "begin" : (k === parts.length - 1 ? "end" : "middle");
            }
            events.push({ syl: part, syllabic: syllabic });
        });
    });
    return events;
}

// One entry per bar. chords are spread over the beats of an instrumental bar and land on the
// first beat of a sung one. A bar with no lyr is instrumental.
var BARS = [
    { chords: ["Lam", "Re"], label: "Intro" },
    { chords: ["Sol", "Do"] },
    { chords: ["Mi7", "Lam"], label: "Musica" },
    { chords: ["Re", "Sol"] },
    { chords: ["Do"], startRepeat: true },
    { chords: ["Fa"], volta: "open", endRepeat: 2 },
    { chords: ["Sol"], volta: "close", startRepeat: true },
    { chords: ["Do"], endRepeat: 2 },
    { chords: ["Lam"], label: "Estrofa", lyr: "Ya vie-ne la" },
    { chords: ["Sol"], lyr: "ron-da a-qui," },
    { chords: ["Do", "Mi7"] },
    { chords: ["Lam"], lyr: "can-tan-do con" },
    { chords: ["Re"], lyr: "mu-cho a-mor." },
    { chords: ["Sol", "Do", "Fa", "Mi7"] },
    { chords: ["Lam", "Rem"], label: "Estribillo" },
    { chords: ["Do"], lyr: "Vuel-ve, vuel-ve" },
    { chords: ["Sol"], lyr: "mi bien a mi." },
    { chords: ["Fa", "Do", "Sol", "Lam"] }
];

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

function note(ev) {
    var out = "          <Chord>\n            <durationType>quarter</durationType>\n";
    out += "            <Lyrics>\n";
    if (ev.syllabic) out += "              <syllabic>" + ev.syllabic + "</syllabic>\n";
    out += "              <text>" + ev.syl + "</text>\n              </Lyrics>\n";
    out += "            <Note>\n              <pitch>67</pitch>\n              <tpc>15</tpc>\n" +
           "              </Note>\n            </Chord>\n";
    return out;
}

function quarterRest() {
    return "          <Rest>\n            <durationType>quarter</durationType>\n            </Rest>\n";
}

// A single first ending, with no second one: the repeat plays twice and the bracket covers the
// last bar of it, so the second pass carries on into whatever follows the repeat
function voltaOpen() {
    return "          <Spanner type=\"Volta\">\n            <Volta>\n" +
           "              <endHookType>1</endHookType>\n" +
           "              <beginText>1.</beginText>\n" +
           "              <endings>1</endings>\n" +
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
for (var m = 0; m < BARS.length; m++) {
    var bar = BARS[m];
    var body = "";

    if (m === 0) {
        body += "          <KeySig>\n            <concertKey>0</concertKey>\n            </KeySig>\n";
        body += "          <TimeSig>\n            <sigN>4</sigN>\n            <sigD>4</sigD>\n            </TimeSig>\n";
    }
    if (bar.volta === "open") body += voltaOpen();
    if (bar.volta === "close") body += voltaClose();
    if (bar.label) body += systemText(bar.label);

    if (bar.lyr) {
        // A sung bar: the chord is on the first beat and the four syllables follow
        body += harmony(bar.chords[0]);
        var events = phrase(bar.lyr);
        while (events.length < 4) events.push({ rest: true });
        if (events.length !== 4) {
            throw new Error("bar " + (m + 1) + " has " + events.length + " events, not four: " + bar.lyr);
        }
        events.forEach(function(ev) {
            body += ev.rest ? quarterRest() : note(ev);
        });
    } else {
        // An instrumental bar: the chords are spread over its beats, each one written before
        // the rest it lands on, which is where the walker reads its tick from
        var every = 4 / bar.chords.length;
        for (var beat = 0; beat < 4; beat++) {
            if (beat % every === 0) body += harmony(bar.chords[beat / every]);
            body += quarterRest();
        }
    }

    if (m === BARS.length - 1) {
        body += "          <BarLine>\n            <subtype>end</subtype>\n            </BarLine>\n";
    }

    // The repeat barlines are children of the measure, as MuseScore writes them: inside the
    // voice they are read as nothing at all
    measures += "      <Measure>\n";
    if (bar.startRepeat) measures += "        <startRepeat/>\n";
    if (bar.endRepeat) measures += "        <endRepeat>" + bar.endRepeat + "</endRepeat>\n";
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
'    <metaTag name="workTitle">Intro Salida</metaTag>\n' +
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
'          <text>Intro Salida</text>\n' +
'          </Text>\n' +
'        </VBox>\n' +
measures +
'      </Staff>\n' +
'    </Score>\n' +
'  </museScore>\n';

var style = '<?xml version="1.0" encoding="UTF-8"?>\n<museScore version="4.60">\n  <Style>\n' +
'    <chordSymbolSpelling>solfeggio</chordSymbolSpelling>\n    </Style>\n  </museScore>\n';

var container = '<?xml version="1.0" encoding="UTF-8"?>\n<container>\n  <rootfiles>\n' +
'    <rootfile full-path="score_style.mss"/>\n' +
'    <rootfile full-path="IntroSalida.mscx"/>\n    </rootfiles>\n  </container>\n';

var dir = fs.mkdtempSync(path.join(os.tmpdir(), "is-"));
fs.mkdirSync(path.join(dir, "META-INF"));
fs.writeFileSync(path.join(dir, "META-INF/container.xml"), container);
fs.writeFileSync(path.join(dir, "IntroSalida.mscx"), mscx);
fs.writeFileSync(path.join(dir, "score_style.mss"), style);

var out = path.resolve(OUT);
fs.rmSync(out, { force: true });
child.execSync("cd " + JSON.stringify(dir) + " && zip -r -q " + JSON.stringify(out) +
    " META-INF IntroSalida.mscx score_style.mss");
fs.rmSync(dir, { recursive: true, force: true });
console.log("written " + out + " (" + fs.statSync(out).size + " bytes)");
