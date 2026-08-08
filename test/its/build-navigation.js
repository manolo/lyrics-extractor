#!/usr/bin/env node
// Build a short MuseScore 4 score with the hardest combination of navigation marks in the
// suite: every kind of repeat and jump at once, in nine measures rather than sixty.
//
//   m1  Musica label, segno, start repeat, instrumental
//   m2  volta [1], end repeat (play count 2), instrumental
//   m3  Estrofa 1::2::3:: label, start repeat, lyrics (six verses)
//   m4  volta [1], end repeat (play count 2), lyrics
//   m5  Estribillo label, lyrics on the first verse only, with a melisma and a synalepha
//   m6  coda marker, instrumental
//   m7  D.S. (segno to end)
//   m8  D.S. al Coda (segno to the coda marker)
//   m9  codab, the coda section, final barline
//
// Two repeats with a volta, two jumps and three markers give three outer passes, and the
// inner repeat doubles them: six verse slots, one per sub pass, while the estribillo keeps
// singing the only line it has.
//
// The estrofa carries a seventh lyric line, which those six slots cannot reach: that is the
// orphan verse, left out of the output unless it is asked for (spec 7.1.2).
//
//   node test/its/build-navigation.js
//
// writes test/its/scores/test_le_Navegacion.mscz, the path the snapshot suite reads.

var fs = require("fs");
var path = require("path");
var child = require("child_process");

var OUT = process.argv[2] ||
    path.join(__dirname, "scores", "test_le_Navegacion.mscz");

var NOTES = {
    "E4": [64, 18], "G4": [67, 15], "A4": [69, 17], "B4": [71, 19],
    "C5": [72, 14], "D5": [74, 16], "E5": [76, 18]
};

var CHORDS = {
    "Em": [18, "m"], "Am": [17, "m"], "B7": [19, "7"], "D": [16, ""], "G": [15, ""], "C": [14, ""]
};

// Estrofa: four notes per measure, one syllable per lyric line. Six lines, consumed one
// per sub pass, so each of the three passes sings two of them.
var ESTROFA = [
    // measure 3: the four notes before the volta
    [["E4", ["Esta",    "Otra",    "Cada",    "La",      "Ya",     "Esta",   "Esta"]],
     ["G4", ["primera", "vuelta",  "pasada",  "cuarta",  "queda",  "sexta",  "letra"]],
     ["A4", ["linea",   "canta",   "trae",    "vez",     "una",    "es",     "no"]],
     ["B4", ["abre",    "la",      "una",     "dice",    "sola",   "la",     "la"]]],
    // measure 4: the volta, closing each phrase
    [["C5", ["el",       "segunda",  "linea",   "algo",    "linea",   "ultima", "canta"]],
     ["B4", ["camino",   "sin",      "que no",  "que ya",  "por",     "que se", "ninguna"]],
     ["A4", ["marcado.", "cambiar.", "estaba.", "sonaba.", "cantar.", "puede.", "pasada."]]]
];

// Estribillo: only the first lyric line, so every pass sings the same words. Carries a
// melisma (the ellipsis inside a word) and a synalepha (the tie character).
var ESTRIBILLO = [
    ["E5", ["Es…", null, null, null, null, null, null]],
    ["D5", ["te", null, null, null, null, null, null]],
    ["C5", ["estribillo", null, null, null, null, null, null]],
    ["B4", ["suena‿otra vez.", null, null, null, null, null, null]]
];

// The coda section closes the song
var CODA = [
    ["E5", ["Fi…", null, null, null, null, null, null]],
    ["D5", ["nal de", null, null, null, null, null, null]],
    ["E4", ["la‿cancion.", null, null, null, null, null, null]]
];

var VERSES = 7;   // one line more than the six the structure sings: the seventh is orphan

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
    return "          <SystemText>\n            <text>" + text + "</text>\n            </SystemText>\n";
}

function marker(label, text) {
    return "        <Marker>\n" +
           "          <text>" + text + "</text>\n" +
           "          <label>" + label + "</label>\n" +
           "          <markerType>" + label + "</markerType>\n" +
           "          </Marker>\n";
}

function jump(playUntil, text) {
    return "        <Jump>\n" +
           "          <text>" + text + "</text>\n" +
           "          <jumpTo>segno</jumpTo>\n" +
           "          <playUntil>" + playUntil + "</playUntil>\n" +
           "          <continueAt>" + (playUntil === "coda" ? "codab" : "") + "</continueAt>\n" +
           "          <playRepeats>1</playRepeats>\n" +
           "          </Jump>\n";
}

function lyrics(text, verse) {
    if (!text) return "";
    var out = "            <Lyrics>\n";
    if (verse > 0) out += "              <no>" + verse + "</no>\n";
    out += "              <syllabic>single</syllabic>\n";
    out += "              <text>" + text + "</text>\n";
    out += "              </Lyrics>\n";
    return out;
}

function chordNote(noteName, texts, duration) {
    var n = NOTES[noteName];
    var ly = "";
    for (var v = 0; v < VERSES; v++) ly += lyrics(texts && texts[v], v);
    return "          <Chord>\n" +
           "            <durationType>" + (duration || "quarter") + "</durationType>\n" +
           ly +
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

// A volta is a spanner inside the voice: it opens on its own measure and is closed by a
// matching spanner with <prev> on the measure after it
function voltaOpen() {
    return "          <Spanner type=\"Volta\">\n" +
           "            <Volta>\n" +
           "              <endHookType>1</endHookType>\n" +
           "              <beginText>1.</beginText>\n" +
           "              <endings>1</endings>\n" +
           "              </Volta>\n" +
           "            <next>\n" +
           "              <location>\n" +
           "                <measures>1</measures>\n" +
           "                </location>\n" +
           "              </next>\n" +
           "            </Spanner>\n";
}

function voltaClose() {
    return "          <Spanner type=\"Volta\">\n" +
           "            <prev>\n" +
           "              <location>\n" +
           "                <measures>-1</measures>\n" +
           "                </location>\n" +
           "              </prev>\n" +
           "            </Spanner>\n";
}

var measures = "";
for (var m = 1; m <= 9; m++) {
    var body = "";

    if (m === 1) {
        body += "          <KeySig>\n            <concertKey>1</concertKey>\n            </KeySig>\n";
        body += "          <TimeSig>\n            <sigN>4</sigN>\n            <sigD>4</sigD>\n            </TimeSig>\n";
        body += systemText("Música");
        body += harmony("Em");
        body += measureRest();
    } else if (m === 2) {
        body += harmony("B7");
        body += measureRest();
    } else if (m === 3) {
        body += systemText("Estrofa 1::2::3::");
        body += harmony("Am");
        for (var i3 = 0; i3 < ESTROFA[0].length; i3++) {
            body += chordNote(ESTROFA[0][i3][0], ESTROFA[0][i3][1]);
        }
    } else if (m === 4) {
        body += harmony("D");
        for (var i4 = 0; i4 < ESTROFA[1].length; i4++) {
            body += chordNote(ESTROFA[1][i4][0], ESTROFA[1][i4][1]);
        }
        body += "          <Rest>\n            <durationType>quarter</durationType>\n            </Rest>\n";
    } else if (m === 5) {
        body += systemText("Estribillo");
        body += harmony("G");
        for (var i5 = 0; i5 < ESTRIBILLO.length; i5++) {
            body += chordNote(ESTRIBILLO[i5][0], ESTRIBILLO[i5][1]);
        }
    } else if (m === 6) {
        body += harmony("C");
        body += measureRest();
    } else if (m === 7 || m === 8) {
        body += harmony("B7");
        body += measureRest();
    } else if (m === 9) {
        body += harmony("Em");
        for (var i9 = 0; i9 < CODA.length; i9++) {
            body += chordNote(CODA[i9][0], CODA[i9][1]);
        }
        body += "          <Rest>\n            <durationType>quarter</durationType>\n            </Rest>\n";
        body += "          <BarLine>\n            <subtype>end</subtype>\n            </BarLine>\n";
    }

    measures += "      <Measure>\n";
    // Repeat barlines: measures 1 to 2 and 3 to 4, each played twice. The end repeat and
    // the markers and jumps are children of the measure, as MuseScore writes them.
    if (m === 1 || m === 3) measures += "        <startRepeat/>\n";
    if (m === 2 || m === 4) measures += "        <endRepeat>2</endRepeat>\n";
    if (m === 1) measures += marker("segno", "Segno");
    if (m === 6) measures += marker("coda", "To Coda");
    if (m === 9) measures += marker("codab", "Coda");
    if (m === 7) measures += jump("end", "D.S.");
    if (m === 8) measures += jump("coda", "D.S. al Coda");
    measures += "        <voice>\n";
    // The volta covers the measure that closes each repeat
    // The volta covers the instrumental measure that closes the first repeat. Lyrics that
    // every pass sings must stay out of a volta: a first ending is only played once.
    if (m === 2) measures += voltaOpen();
    if (m === 3) measures += voltaClose();
    measures += body + "          </voice>\n";
    measures += "        </Measure>\n";
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
'    <metaTag name="workTitle">Navegacion</metaTag>\n' +
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
'          <text>Navegacion</text>\n' +
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
'    <rootfile full-path="Navegacion.mscx"/>\n' +
'    </rootfiles>\n' +
'  </container>\n';

var dir = fs.mkdtempSync(path.join(require("os").tmpdir(), "mm-"));
fs.mkdirSync(path.join(dir, "META-INF"));
fs.writeFileSync(path.join(dir, "META-INF/container.xml"), container);
fs.writeFileSync(path.join(dir, "Navegacion.mscx"), mscx);
fs.writeFileSync(path.join(dir, "score_style.mss"), style);

var out = path.resolve(OUT);
fs.rmSync(out, { force: true });
child.execSync("cd " + JSON.stringify(dir) + " && zip -r -q " + JSON.stringify(out) + " META-INF Navegacion.mscx score_style.mss");
fs.rmSync(dir, { recursive: true, force: true });
console.log("written " + out + " (" + fs.statSync(out).size + " bytes)");
