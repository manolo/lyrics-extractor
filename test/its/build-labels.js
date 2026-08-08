#!/usr/bin/env node
// Build a score about section labels: how they are named, which ones are not labels at all,
// and what the formatter does with the chords around them.
//
//   Intro and Musica, one after the other, before any lyric  -> the intro split by label
//   Estrofa #                                                -> the auto numbered label
//   Solista uno:dos                                          -> the sequence template
//   a rehearsal mark reading 9, in bar 9                       -> skipped, it names a bar
//   a rehearsal mark reading A                                -> kept, it names a section
//   a system text reading 3x                                  -> skipped, a repeat count
//   an Expression and a PlayTechAnnotation                    -> annotations, not chords
//   chords between a label and the line that follows it        -> the pickup zone
//   chords after a line with a label before the next one       -> the labelled interlude
//   a stanza repeating only the first line of an earlier one   -> the prefix abbreviation
//
//   node test/its/build-labels.js
//
// writes test/its/scores/test_le_Etiquetas.mscz, the path the snapshot suite reads.

var fs = require("fs");
var path = require("path");
var os = require("os");
var child = require("child_process");

var OUT = process.argv[2] ||
    path.join(__dirname, "scores", "test_le_Etiquetas.mscz");

var CHORDS = {
    "Lam": [17, "m"], "Re": [16, ""], "Sol": [15, ""], "Do": [14, ""],
    "Mi7": [18, "7"], "Rem": [16, "m"], "Fa": [13, ""]
};

// Syllables of a word joined by hyphens, "/" for a quarter rest. A trailing "+" means the
// word carries on into the next bar and a leading "+" that it comes from the one before, so
// a word can straddle a barline, which is where the interesting cases live. Each bar has to
// come out at exactly four events, since a bar is four quarter notes.
function phrase(text) {
    var events = [];
    text.trim().split(/\s+/).forEach(function(token) {
        if (token === "/") { events.push({ rest: true }); return; }
        var carriesOn = token.slice(-1) === "+";
        var comesFrom = token.charAt(0) === "+";
        if (carriesOn) token = token.slice(0, -1);
        if (comesFrom) token = token.slice(1);
        var parts = token.split("-");
        parts.forEach(function(part, k) {
            var syllabic = null;
            if (parts.length > 1) {
                syllabic = k === 0 ? "begin" : (k === parts.length - 1 ? "end" : "middle");
            }
            if (k === parts.length - 1 && carriesOn) syllabic = parts.length > 1 ? "middle" : "begin";
            if (k === 0 && comesFrom) syllabic = parts.length > 1 ? "middle" : "end";
            events.push({ syl: part, syllabic: syllabic });
        });
    });
    return events;
}

// One entry per bar. label is a system text, mark a rehearsal mark, expr an Expression and
// tech a PlayTechAnnotation. A bar with no syllables is instrumental.
var BARS = [
    { chord: "Lam", label: "Intro" },
    { chord: "Re",  label: "Musica" },
    { chord: "Sol", label: "Estrofa #", lyr: "Can-ta la ron+" },
    { chord: "Do",  lyr: "+da, que va por" },
    { chord: "Mi7", label: "Interludio" },
    { chord: "Lam" },
    { chord: "Re",  label: "Solista uno:dos", lyr: "Y la lu-na" },
    { chord: "Sol", lyr: "mi-ra co-mo" },
    { chord: "Do",  mark: "9" },
    { chord: "Rem", mark: "A", lyr: "Vuel-ve la ron+" },
    { chord: "Fa",  expr: "dolce", tech: "pizz.", lyr: "+da, que va /" },
    { chord: "Do" },   // a bar of rest, so the stanza that follows starts its own line
    { chord: "Lam", label: "3x", lyr: "Can-ta la ron+" },
    { chord: "Re",  lyr: "+da y se va." }
];

function harmony(name) {
    var c = CHORDS[name];
    return "          <Harmony>\n            <harmonyInfo>\n" +
           "              <root>" + c[0] + "</root>\n" +
           (c[1] ? "              <name>" + c[1] + "</name>\n" : "") +
           "              </harmonyInfo>\n            </Harmony>\n";
}

function tagged(tag, text) {
    return "          <" + tag + ">\n            <text>" + text + "</text>\n            </" + tag + ">\n";
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

var measures = "";
for (var m = 0; m < BARS.length; m++) {
    var bar = BARS[m];
    var body = "";

    if (m === 0) {
        body += "          <KeySig>\n            <concertKey>0</concertKey>\n            </KeySig>\n";
        body += "          <TimeSig>\n            <sigN>4</sigN>\n            <sigD>4</sigD>\n            </TimeSig>\n";
    }
    if (bar.mark) body += tagged("RehearsalMark", bar.mark);
    if (bar.label) body += tagged("SystemText", bar.label);
    if (bar.expr) body += tagged("Expression", bar.expr);
    if (bar.tech) body += tagged("PlayTechAnnotation", bar.tech);

    body += harmony(bar.chord);

    if (bar.lyr) {
        var events = phrase(bar.lyr);
        while (events.length < 4) events.push({ rest: true });
        if (events.length !== 4) {
            throw new Error("bar " + (m + 1) + " has " + events.length + " events, not four: " + bar.lyr);
        }
        events.forEach(function(ev) {
            body += ev.rest
                ? "          <Rest>\n            <durationType>quarter</durationType>\n            </Rest>\n"
                : note(ev);
        });
    } else {
        body += "          <Rest>\n            <durationType>measure</durationType>\n" +
                "            <duration>4/4</duration>\n            </Rest>\n";
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
'    <metaTag name="workTitle">Etiquetas</metaTag>\n' +
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
'          <text>Etiquetas</text>\n' +
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
'    <rootfile full-path="Etiquetas.mscx"/>\n    </rootfiles>\n  </container>\n';

var dir = fs.mkdtempSync(path.join(os.tmpdir(), "et-"));
fs.mkdirSync(path.join(dir, "META-INF"));
fs.writeFileSync(path.join(dir, "META-INF/container.xml"), container);
fs.writeFileSync(path.join(dir, "Etiquetas.mscx"), mscx);
fs.writeFileSync(path.join(dir, "score_style.mss"), style);

var out = path.resolve(OUT);
fs.rmSync(out, { force: true });
child.execSync("cd " + JSON.stringify(dir) + " && zip -r -q " + JSON.stringify(out) +
    " META-INF Etiquetas.mscx score_style.mss");
fs.rmSync(dir, { recursive: true, force: true });
console.log("written " + out + " (" + fs.statSync(out).size + " bytes)");
