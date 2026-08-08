#!/usr/bin/env node
// Build a score whose lyrics are all about line layout, which is what lib/line-builder.js
// and lib/text-utils.js do and what no committed score exercised.
//
// One verse, no repeats and no jumps: the structure is deliberately trivial so the only
// thing under test is where the lines break and how the syllables are cleaned.
//
// The cases, one phrase each:
//
//   1  a phrase past 70 characters with a comma near the middle   -> split at the comma
//   2  a phrase past 70 characters with no comma but a long rest   -> split at the rest
//   3  a phrase past 70 characters with neither                    -> split at a space
//   4  three words, no punctuation, then a lowercase phrase        -> merged forward
//   5  two words alone                                             -> merged backwards
//   6  syllables carrying font tags, stray hyphens and a synalepha -> stripHtml,
//                                                                     stripHyphens,
//                                                                     replaceSynalepha
//   7  a melisma and a fullwidth comma                             -> the punctuation table
//
//   node test/its/build-long-lines.js
//
// writes test/its/scores/test_le_LineasLargas.mscz, the path the snapshot suite reads.

var fs = require("fs");
var path = require("path");
var os = require("os");
var child = require("child_process");

var OUT = process.argv[2] ||
    path.join(__dirname, "scores", "test_le_LineasLargas.mscz");

var CHORDS = { "Lam": [17, "m"], "Re": [16, ""], "Sol": [15, ""], "Do": [14, ""], "Mi7": [18, "7"] };

// Phrases are written as text, with syllables inside a word joined by a hyphen, a slash for
// a quarter rest and a double slash for a half rest. So "ma-dru-ga-da cla-ra // los" is four
// syllables of one word, two of the next, a half rest, then a word of its own. Writing them
// this way is what makes the line lengths easy to aim at, and they are what the cases need.
function phrase(text) {
    var events = [];
    text.trim().split(/\s+/).forEach(function(token) {
        if (token === "/") { events.push({ rest: "quarter" }); return; }
        if (token === "//") { events.push({ rest: "half" }); return; }
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

// 1: 88 characters with its only comma at 51, so the split lands on the comma
var PHRASE1 = phrase(
    "Cuan-do la ma-dru-ga-da cla-ra des-pier-ta los cam-pa-na-rios, " +
    "las mo-zas de la al-de-a van can-tan-do. /");

// 2: past 70 characters, no comma anywhere, and a half rest in the middle to split at
var PHRASE2 = phrase(
    "Las go-lon-dri-nas vuel-ven al bal-con // " +
    "de la ven-ta-na don-de duer-me mi mo-re-na. /");

// 3: past 90 characters with neither a comma nor a rest, which is the only way into the last
// resort of findBestSplit, the space nearest the midpoint
var PHRASE3 = phrase(
    "Ca-mi-na-ba por la sen-da mien-tras el sol se po-ni-a " +
    "de-tras de la mon-ta-na le-ja-na y las cam-pa-nas de la er-mi-ta " +
    "so-na-ban des-pa-cio. /");

// 4: three words and no punctuation, so the line merges into the one after it
var PHRASE4 = phrase("Y en-ton-ces / lle-go la no-che.");

// 5: two words on their own, which merge back into the line before them
var PHRASE5 = phrase("Muy tar-de. //");

// 6: what the reader never sees. MuseScore writes rich text, a hand written score carries
// stray hyphens, and a dot between letters is a synalepha
var PHRASE6 = [
    { syl: '<font size="11"/>Ba', syllabic: "begin" },
    { syl: "ja", syllabic: "end" },
    { syl: "-la-", syllabic: null },
    { syl: "voz.el", syllabic: null },
    { rest: "quarter" }
];

// 7: a melisma written as an ellipsis and the fullwidth comma the Fix button leaves behind
var PHRASE7 = phrase("A…-mor mi， o.");

// Four events per bar, each phrase starting on a bar of its own and padded with rests
var BARS = [];
[PHRASE1, PHRASE2, PHRASE3, PHRASE4, PHRASE5, PHRASE6, PHRASE7].forEach(function(ph) {
    for (var i = 0; i < ph.length; i += 4) {
        var bar = ph.slice(i, i + 4);
        while (bar.length < 4) bar.push({ rest: "quarter" });
        BARS.push(bar);
    }
});

var BAR_CHORDS = ["Lam", "Re", "Sol", "Do", "Mi7", "Lam", "Re", "Sol", "Do", "Lam", "Re", "Sol", "Do", "Mi7", "Lam"];
var LABELS = { 1: "Estrofa" };

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

function rest(dur) {
    return "          <Rest>\n            <durationType>" + dur + "</durationType>\n            </Rest>\n";
}

var measures = "";
for (var m = 1; m <= BARS.length; m++) {
    var body = "";
    if (m === 1) {
        body += "          <KeySig>\n            <concertKey>0</concertKey>\n            </KeySig>\n";
        body += "          <TimeSig>\n            <sigN>4</sigN>\n            <sigD>4</sigD>\n            </TimeSig>\n";
    }
    if (LABELS[m]) body += systemText(LABELS[m]);
    body += harmony(BAR_CHORDS[(m - 1) % BAR_CHORDS.length]);

    BARS[m - 1].forEach(function(ev) {
        body += ev.rest ? rest(ev.rest) : note(ev);
    });

    if (m === BARS.length) {
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
'    <metaTag name="workTitle">Lineas Largas</metaTag>\n' +
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
'          <text>Lineas Largas</text>\n' +
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
'    <rootfile full-path="LineasLargas.mscx"/>\n    </rootfiles>\n  </container>\n';

var dir = fs.mkdtempSync(path.join(os.tmpdir(), "ll-"));
fs.mkdirSync(path.join(dir, "META-INF"));
fs.writeFileSync(path.join(dir, "META-INF/container.xml"), container);
fs.writeFileSync(path.join(dir, "LineasLargas.mscx"), mscx);
fs.writeFileSync(path.join(dir, "score_style.mss"), style);

var out = path.resolve(OUT);
fs.rmSync(out, { force: true });
child.execSync("cd " + JSON.stringify(dir) + " && zip -r -q " + JSON.stringify(out) +
    " META-INF LineasLargas.mscx score_style.mss");
fs.rmSync(dir, { recursive: true, force: true });
console.log("written " + out + " (" + fs.statSync(out).size + " bytes)");
