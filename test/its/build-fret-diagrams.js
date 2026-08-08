#!/usr/bin/env node
// Build a score whose chord diagrams live where MuseScore really puts them: in an FBox inside
// the guitar tablature part, not in the main score. Reading them is score/mscz-reader.js
// readGuitarExcerpts plus score/xml-extractor.js extractFretDiagrams, a hundred lines that no
// synthetic score reached, because diagrams never show up in the text output: they are drawn in
// the PDF. test/fret-diagrams.test.js reads this score back and checks what was parsed.
//
// The diagrams, and what each one is here for:
//
//   Lam        root note and modifier, crosses, open strings and dots
//   Solm       a name with no root note, taken as the chord name as written
//   Fa         a barre across every string
//   Sib7       eight frets starting at the sixth, the fret offset label
//   Lam again  the same diagram twice, dropped by the fingerprint
//   Do         hidden, so not drawn
//   Re         a dot on fret 0, which is not a dot, and a marker that is neither a
//              cross nor a circle
//
// and four that cannot be drawn at all: no chord attached, a chord with no information, a
// chord that is neither a root nor a name, and a root outside the range of note names.
//
//   node test/its/build-fret-diagrams.js
//
// writes test/its/scores/test_le_Diagramas.mscz, the path the snapshot suite reads.

var fs = require("fs");
var path = require("path");
var os = require("os");
var child = require("child_process");

var OUT = process.argv[2] ||
    path.join(__dirname, "scores", "test_le_Diagramas.mscz");

var CHORDS = {
    "Lam": [17, "m"], "Re": [16, ""], "Sol": [15, ""], "Do": [14, ""], "Fa": [13, ""]
};

var BARS = [
    { chord: "Lam", label: "Estrofa", lyr: [["To", "begin"], ["ca", "end"], ["la", null], ["gui", "begin"]] },
    { chord: "Re", lyr: [["ta", "middle"], ["rra", "end"], ["y", null], ["can", "begin"]] },
    { chord: "Sol", lyr: [["ta", "end"], ["con", null], ["no", "begin"], ["so", "middle"]] },
    { chord: "Do", lyr: [["tros.", "end"], null, null, null] }
];

// --- the main score -----------------------------------------------------------

function harmony(name, indent) {
    var c = CHORDS[name];
    var i = indent || "          ";
    return i + "<Harmony>\n" + i + "  <harmonyInfo>\n" +
           i + "    <root>" + c[0] + "</root>\n" +
           (c[1] ? i + "    <name>" + c[1] + "</name>\n" : "") +
           i + "    </harmonyInfo>\n" + i + "  </Harmony>\n";
}

function note(syl, syllabic) {
    var out = "          <Chord>\n            <durationType>quarter</durationType>\n";
    out += "            <Lyrics>\n";
    if (syllabic) out += "              <syllabic>" + syllabic + "</syllabic>\n";
    out += "              <text>" + syl + "</text>\n              </Lyrics>\n";
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
        body += "          <SystemText>\n            <text>" + bar.label + "</text>\n            </SystemText>\n";
    }
    body += harmony(bar.chord);
    bar.lyr.forEach(function(ev) {
        body += ev ? note(ev[0], ev[1])
            : "          <Rest>\n            <durationType>quarter</durationType>\n            </Rest>\n";
    });
    if (m === BARS.length - 1) {
        body += "          <BarLine>\n            <subtype>end</subtype>\n            </BarLine>\n";
    }
    measures += "      <Measure>\n        <voice>\n" + body + "          </voice>\n        </Measure>\n";
}

// --- the diagrams, as they are written inside the tablature part --------------

// strings: one entry per string, "x" a cross, "o" an open string, a number a dot on that
// fret, "0" a dot on no fret at all, and "?" a marker that means nothing
function fretDiagram(spec) {
    var out = "        <FretDiagram>\n";
    if (spec.visible === false) out += "          <visible>0</visible>\n";
    if (spec.frets) out += "          <frets>" + spec.frets + "</frets>\n";
    if (spec.fretOffset) out += "          <fretOffset>" + spec.fretOffset + "</fretOffset>\n";

    if (spec.harmony !== null) {
        out += "          <Harmony>\n";
        if (spec.harmony !== "empty") {
            out += "            <harmonyInfo>\n";
            if (spec.root !== undefined) out += "              <root>" + spec.root + "</root>\n";
            if (spec.name !== undefined) out += "              <name>" + spec.name + "</name>\n";
            out += "              </harmonyInfo>\n";
        }
        out += "            <align>center,baseline</align>\n";
        out += "            </Harmony>\n";
    }

    if (spec.strings) {
        out += "          <fretDiagram>\n";
        if (spec.barre) {
            out += '            <barre start="' + spec.barre[0] + '" end="' + spec.barre[1] +
                   '">' + spec.barre[2] + "</barre>\n";
        }
        spec.strings.forEach(function(s, no) {
            out += '            <string no="' + no + '">\n';
            if (s === "x") out += "              <marker>cross</marker>\n";
            else if (s === "o") out += "              <marker>circle</marker>\n";
            else if (s === "?") out += "              <marker>none</marker>\n";
            else out += '              <dot fret="' + s + '">normal</dot>\n';
            out += "              </string>\n";
        });
        out += "            </fretDiagram>\n";
    }
    out += "          </FretDiagram>\n";
    return out;
}

var DIAGRAMS = [
    // A root note and a modifier, which is how MuseScore writes a chord it understands
    { root: 17, name: "m", strings: ["x", "o", 2, 2, 1, "o"] },
    // A name with no root note: whatever the player typed is the chord name
    { name: "Solm", strings: ["x", "x", 5, 5, 3, 3] },
    // A barre across all six strings
    { root: 13, strings: ["o", 3, 3, 2, 1, 1], barre: [0, 5, 1] },
    // Eight frets starting at the sixth, so the diagram carries its fret number
    { root: 6, name: "7", frets: 8, fretOffset: 5, strings: ["x", 1, 3, 1, 2, 1] },
    // The same diagram as the first one: dropped, the player only needs it once
    { root: 17, name: "m", strings: ["x", "o", 2, 2, 1, "o"] },
    // Hidden in the score, so not drawn
    { root: 14, visible: false, strings: ["x", 3, 2, "o", 1, "o"] },
    // A dot on fret 0 is not a dot, and a marker that is neither a cross nor a circle is
    // nothing at all: the string is still there, just empty
    { root: 16, strings: ["x", "x", "0", 2, 3, "?"] },
    // Four that cannot be drawn: no chord attached, a chord with nothing in it, a chord that
    // is neither a root nor a name, and a root that is not a note
    { harmony: null, strings: ["o", "o", "o", "o", "o", "o"] },
    { harmony: "empty", strings: ["o", "o", "o", "o", "o", "o"] },
    { strings: ["o", "o", "o", "o", "o", "o"] },
    { root: 99, strings: ["o", "o", "o", "o", "o", "o"] },
    // A chord with no diagram under it
    { root: 15 }
];

var fbox = "      <FBox>\n        <fretFrameChordsPerRow>10</fretFrameChordsPerRow>\n" +
           "        <height>10</height>\n" +
           DIAGRAMS.map(fretDiagram).join("") +
           "        </FBox>\n";

// --- the files ----------------------------------------------------------------

function guitarPart() {
    return '    <Part id="2">\n' +
'      <Staff>\n' +
'        <StaffType group="tablature">\n' +
'          <name>tab6StrSimple</name>\n' +
'          </StaffType>\n' +
'        </Staff>\n' +
'      <trackName>Guitarra</trackName>\n' +
'      <Instrument id="guitar-steel">\n' +
'        <longName>Guitarra</longName>\n' +
'        <shortName>Guit.</shortName>\n' +
'        <trackName>Guitarra</trackName>\n' +
'        <instrumentId>pluck.guitar.acoustic</instrumentId>\n' +
'        <Channel>\n' +
'          <program value="25"/>\n' +
'          <synti>Fluid</synti>\n' +
'          <midiPort>0</midiPort>\n' +
'          <midiChannel>1</midiChannel>\n' +
'          </Channel>\n' +
'        </Instrument>\n' +
'      </Part>\n';
}

function scoreFile(title, staves, extraPart) {
    return '<?xml version="1.0" encoding="UTF-8"?>\n' +
'<museScore version="4.60">\n' +
'  <programVersion>4.6.5</programVersion>\n' +
'  <programRevision></programRevision>\n' +
'  <Score>\n' +
'    <Division>480</Division>\n' +
'    <showInvisible>1</showInvisible>\n' +
'    <showUnprintable>1</showUnprintable>\n' +
'    <showFrames>1</showFrames>\n' +
'    <showMargins>0</showMargins>\n' +
'    <metaTag name="workTitle">' + title + '</metaTag>\n' +
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
(extraPart || "") +
staves +
'    </Score>\n' +
'  </museScore>\n';
}

var vbox =
'      <VBox>\n' +
'        <height>10</height>\n' +
'        <Text>\n' +
'          <style>title</style>\n' +
'          <text>Diagramas</text>\n' +
'          </Text>\n' +
'        </VBox>\n';

// The main score has no FBox at all, which is what sends the reader to the parts
var mscx = scoreFile("Diagramas", '    <Staff id="1">\n' + vbox + measures + '      </Staff>\n');

// The tablature part: the diagrams are in its second staff, the tab one, since that is where
// a player writing them puts them and the reader has to look at every staff of the part
var excerpt = scoreFile("Diagramas",
    '    <Staff id="1">\n' + vbox + measures + '      </Staff>\n' +
    '    <Staff id="2">\n' + fbox + measures + '      </Staff>\n',
    guitarPart());

var style = '<?xml version="1.0" encoding="UTF-8"?>\n<museScore version="4.60">\n  <Style>\n' +
'    <chordSymbolSpelling>solfeggio</chordSymbolSpelling>\n    </Style>\n  </museScore>\n';

var container = '<?xml version="1.0" encoding="UTF-8"?>\n<container>\n  <rootfiles>\n' +
'    <rootfile full-path="score_style.mss"/>\n' +
'    <rootfile full-path="Diagramas.mscx"/>\n    </rootfiles>\n  </container>\n';

var dir = fs.mkdtempSync(path.join(os.tmpdir(), "fd-"));
fs.mkdirSync(path.join(dir, "META-INF"));
fs.mkdirSync(path.join(dir, "Excerpts"), { recursive: true });
fs.mkdirSync(path.join(dir, "Excerpts/1_Guitarra-tab"));
fs.writeFileSync(path.join(dir, "META-INF/container.xml"), container);
fs.writeFileSync(path.join(dir, "Diagramas.mscx"), mscx);
fs.writeFileSync(path.join(dir, "Excerpts/1_Guitarra-tab/1_Guitarra-tab.mscx"), excerpt);
fs.writeFileSync(path.join(dir, "score_style.mss"), style);

var out = path.resolve(OUT);
fs.rmSync(out, { force: true });
child.execSync("cd " + JSON.stringify(dir) + " && zip -r -q " + JSON.stringify(out) +
    " META-INF Diagramas.mscx Excerpts score_style.mss");
fs.rmSync(dir, { recursive: true, force: true });
console.log("written " + out + " (" + fs.statSync(out).size + " bytes)");
