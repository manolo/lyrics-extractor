var test = require("node:test");
var assert = require("node:assert/strict");
var xmlExt = require("../extractors/xml-extractor");

var SIMPLE_SCORE = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<museScore version="4.40">',
    '<Score>',
    '<Division>480</Division>',
    '<metaTag name="workTitle">Test Title</metaTag>',
    '<Part><Staff id="1"><StaffType group="pitched"/></Staff></Part>',
    '<Staff id="1">',
    '<Measure>',
    '<voice>',
    '<Harmony><harmonyInfo><root>18</root><name>m</name></harmonyInfo></Harmony>',
    '<Chord><durationType>quarter</durationType>',
    '<Lyrics><text>hel</text><syllabic>begin</syllabic></Lyrics>',
    '<Note><pitch>60</pitch></Note></Chord>',
    '<Chord><durationType>quarter</durationType>',
    '<Lyrics><text>lo</text><syllabic>end</syllabic></Lyrics>',
    '<Note><pitch>62</pitch></Note></Chord>',
    '<Harmony><harmonyInfo><root>17</root></harmonyInfo></Harmony>',
    '<Chord><durationType>half</durationType>',
    '<Lyrics><text>world</text><syllabic>single</syllabic></Lyrics>',
    '<Note><pitch>64</pitch></Note></Chord>',
    '</voice>',
    '</Measure>',
    '</Staff>',
    '</Score>',
    '</museScore>'
].join("\n");

test("parseXml parses basic XML structure", function() {
    var root = xmlExt.parseXml("<a><b>text</b></a>");
    assert.equal(root.tag, "a");
    assert.equal(root.children.length, 1);
    assert.equal(root.children[0].tag, "b");
    assert.equal(root.children[0].text, "text");
});

test("parseXml handles self-closing tags", function() {
    var root = xmlExt.parseXml("<a><b/></a>");
    assert.equal(root.children.length, 1);
    assert.equal(root.children[0].tag, "b");
    assert.equal(root.children[0].children.length, 0);
});

test("parseXml handles attributes", function() {
    var root = xmlExt.parseXml('<a id="1" name="test">text</a>');
    assert.equal(root.attrs.id, "1");
    assert.equal(root.attrs.name, "test");
    assert.equal(root.text, "text");
});

test("extractAll parses simple score", function() {
    var data = xmlExt.extractAll(SIMPLE_SCORE);

    assert.equal(data.title, "Test Title");
    assert.equal(data.division, 480);
    assert.equal(data.syllables.length, 3);
    assert.equal(data.chords.length, 2);
});

test("extractAll extracts correct syllable data", function() {
    var data = xmlExt.extractAll(SIMPLE_SCORE);

    assert.equal(data.syllables[0].text, "hel");
    assert.equal(data.syllables[0].syllabic, "begin");
    assert.equal(data.syllables[0].tick, 0);
    assert.equal(data.syllables[0].verse, 0);

    assert.equal(data.syllables[1].text, "lo");
    assert.equal(data.syllables[1].syllabic, "end");
    assert.equal(data.syllables[1].tick, 480);

    assert.equal(data.syllables[2].text, "world");
    assert.equal(data.syllables[2].syllabic, "single");
    assert.equal(data.syllables[2].tick, 960);
});

test("extractAll extracts harmonies with harmonyInfo wrapper", function() {
    var data = xmlExt.extractAll(SIMPLE_SCORE);

    assert.equal(data.chords[0].chord, "Em");  // root=18 (E) + name=m, default spelling=standard
    assert.equal(data.chords[0].tick, 0);

    assert.equal(data.chords[1].chord, "A");   // root=17 (A) no name, default spelling=standard
    assert.equal(data.chords[1].tick, 960);
});

test("extractAll computes durations correctly", function() {
    var data = xmlExt.extractAll(SIMPLE_SCORE);

    assert.equal(data.syllables[0].durationQ, 1);  // quarter = 1
    assert.equal(data.syllables[2].durationQ, 2);  // half = 2
});

test("extractAll with repeat markers", function() {
    var xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<museScore version="4.40">',
        '<Score>',
        '<Division>480</Division>',
        '<Part><Staff id="1"><StaffType group="pitched"/></Staff></Part>',
        '<Staff id="1">',
        '<Measure>',
        '<startRepeat/>',
        '<voice>',
        '<Chord><durationType>whole</durationType>',
        '<Lyrics><text>repeated</text></Lyrics>',
        '<Note><pitch>60</pitch></Note></Chord>',
        '</voice>',
        '<endRepeat/>',
        '</Measure>',
        '</Staff>',
        '</Score>',
        '</museScore>'
    ].join("\n");

    var data = xmlExt.extractAll(xml);
    assert.equal(data.repeats.length, 1);
    assert.equal(data.repeats[0].startTick, 0);
    assert.equal(data.repeats[0].endTick, 1920); // whole note = 4 quarters * 480
});

test("extractAll reads repeatCount from endRepeat value", function() {
    var xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<museScore version="4.40"><Score>',
        '<Division>480</Division>',
        '<Part><Staff id="1"><StaffType group="pitched"/></Staff></Part>',
        '<Staff id="1">',
        '<Measure><startRepeat/><voice>',
        '<Chord><durationType>whole</durationType><Lyrics><text>hello</text></Lyrics><Note><pitch>60</pitch><tpc>14</tpc></Note></Chord>',
        '</voice><endRepeat>3</endRepeat></Measure>',
        '</Staff></Score></museScore>'
    ].join("\n");
    var data = xmlExt.extractAll(xml);
    assert.equal(data.repeats.length, 1);
    assert.equal(data.repeats[0].repeatCount, 3, "should read 3x repeat count");
});

test("extractAll reads volta endings from endings element", function() {
    var xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<museScore version="4.40"><Score>',
        '<Division>480</Division>',
        '<Part><Staff id="1"><StaffType group="pitched"/></Staff></Part>',
        '<Staff id="1">',
        '<Measure><startRepeat/><voice>',
        '<Chord><durationType>half</durationType><Lyrics><text>main</text></Lyrics><Note><pitch>60</pitch><tpc>14</tpc></Note></Chord>',
        '<Spanner type="Volta"><Volta><endings>1,2</endings></Volta><next><location><measures>1</measures></location></next></Spanner>',
        '<Chord><durationType>half</durationType><Lyrics><text>volta.</text></Lyrics><Note><pitch>62</pitch><tpc>16</tpc></Note></Chord>',
        '</voice><endRepeat>3</endRepeat></Measure>',
        '<Measure><voice>',
        '<Spanner type="Volta"><prev><location><measures>-1</measures></location></prev></Spanner>',
        '<Chord><durationType>whole</durationType><Lyrics><text>after</text></Lyrics><Note><pitch>64</pitch><tpc>18</tpc></Note></Chord>',
        '</voice></Measure>',
        '</Staff></Score></museScore>'
    ].join("\n");
    var data = xmlExt.extractAll(xml);
    assert.equal(data.voltas.length, 1, "should have 1 volta");
    assert.deepEqual(data.voltas[0].endingList, [1, 2], "should parse endings 1,2");
});

test("extractAll handles multi-verse lyrics", function() {
    var xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<museScore version="4.40">',
        '<Score>',
        '<Division>480</Division>',
        '<Part><Staff id="1"><StaffType group="pitched"/></Staff></Part>',
        '<Staff id="1">',
        '<Measure>',
        '<voice>',
        '<Chord><durationType>quarter</durationType>',
        '<Lyrics><text>verse0</text></Lyrics>',
        '<Lyrics><no>1</no><text>verse1</text></Lyrics>',
        '<Note><pitch>60</pitch></Note></Chord>',
        '</voice>',
        '</Measure>',
        '</Staff>',
        '</Score>',
        '</museScore>'
    ].join("\n");

    var data = xmlExt.extractAll(xml);
    assert.equal(data.syllables.length, 2);
    assert.equal(data.syllables[0].verse, 0);
    assert.equal(data.syllables[0].text, "verse0");
    assert.equal(data.syllables[1].verse, 1);
    assert.equal(data.syllables[1].text, "verse1");
});

test("extractAll extracts Jump and Marker elements", function() {
    var xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<museScore version="4.40">',
        '<Score>',
        '<Division>480</Division>',
        '<Part><Staff id="1"><StaffType group="pitched"/></Staff></Part>',
        '<Staff id="1">',
        '<Measure>',
        '<voice>',
        '<Marker><label>segno</label></Marker>',
        '<Chord><durationType>quarter</durationType>',
        '<Lyrics><text>hello</text></Lyrics>',
        '<Note><pitch>60</pitch></Note></Chord>',
        '<Marker><label>fine</label></Marker>',
        '<Chord><durationType>quarter</durationType>',
        '<Note><pitch>62</pitch></Note></Chord>',
        '<Chord><durationType>quarter</durationType>',
        '<Note><pitch>64</pitch></Note></Chord>',
        '<Jump><jumpTo>segno</jumpTo><playUntil>fine</playUntil><continueAt></continueAt></Jump>',
        '<Chord><durationType>quarter</durationType>',
        '<Note><pitch>65</pitch></Note></Chord>',
        '</voice>',
        '</Measure>',
        '</Staff>',
        '</Score>',
        '</museScore>'
    ].join("\n");

    var data = xmlExt.extractAll(xml);
    assert.equal(data.markers.length, 2, "should have 2 markers");
    assert.equal(data.markers[0].label, "segno");
    assert.equal(data.markers[0].type, "segno");
    assert.equal(data.markers[0].tick, 0);
    assert.equal(data.markers[1].label, "fine");
    assert.equal(data.markers[1].type, "fine");
    assert.equal(data.markers[1].tick, 480);

    assert.equal(data.jumps.length, 1, "should have 1 jump");
    assert.equal(data.jumps[0].jumpTo, "segno");
    assert.equal(data.jumps[0].playUntil, "fine");
    assert.equal(data.jumps[0].tick, 1440);
});

test("extractAll extracts SystemText and StaffText elements", function() {
    var xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<museScore version="4.40">',
        '<Score>',
        '<Division>480</Division>',
        '<Part><Staff id="1"><StaffType group="pitched"/></Staff></Part>',
        '<Staff id="1">',
        '<Measure>',
        '<voice>',
        '<SystemText><text>ALBORADA</text></SystemText>',
        '<Chord><durationType>quarter</durationType>',
        '<Lyrics><text>hello</text></Lyrics>',
        '<Note><pitch>60</pitch></Note></Chord>',
        '<Chord><durationType>quarter</durationType>',
        '<Note><pitch>62</pitch></Note></Chord>',
        '<StaffText><text>Solo</text></StaffText>',
        '<Chord><durationType>half</durationType>',
        '<Note><pitch>64</pitch></Note></Chord>',
        '</voice>',
        '</Measure>',
        '</Staff>',
        '</Score>',
        '</museScore>'
    ].join("\n");

    var data = xmlExt.extractAll(xml);
    // SystemText goes to systemTexts, StaffText goes to chords (inline text)
    assert.equal(data.systemTexts.length, 1, "should have 1 system text (SystemText only)");
    assert.equal(data.systemTexts[0].text, "ALBORADA");
    assert.equal(data.systemTexts[0].tick, 0);
    // StaffText "Solo" is now an inline chord-like text
    assert.equal(data.chords.length, 1, "should have 1 chord (StaffText as inline)");
    assert.equal(data.chords[0].chord, "Solo");
    assert.equal(data.chords[0].tick, 960);
});

test("extractAll computes ticks correctly with irregular measure len attribute", function() {
    var xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<museScore version="4.40">',
        '<Score>',
        '<Division>480</Division>',
        '<Part><Staff id="1"><StaffType group="pitched"/></Staff></Part>',
        '<Staff id="1">',
        '<Measure len="3/4">',
        '<voice>',
        '<Chord><durationType>quarter</durationType>',
        '<Lyrics><text>pick</text></Lyrics>',
        '<Note><pitch>60</pitch></Note></Chord>',
        '<Chord><durationType>quarter</durationType>',
        '<Lyrics><text>up</text></Lyrics>',
        '<Note><pitch>62</pitch></Note></Chord>',
        '<Chord><durationType>quarter</durationType>',
        '<Lyrics><text>bar</text></Lyrics>',
        '<Note><pitch>64</pitch></Note></Chord>',
        '</voice>',
        '</Measure>',
        '<Measure>',
        '<voice>',
        '<Chord><durationType>whole</durationType>',
        '<Lyrics><text>full</text></Lyrics>',
        '<Note><pitch>65</pitch></Note></Chord>',
        '</voice>',
        '</Measure>',
        '</Staff>',
        '</Score>',
        '</museScore>'
    ].join("\n");

    var data = xmlExt.extractAll(xml);
    // First measure is 3/4: 3 * 480 = 1440 ticks
    // The "full" syllable in the second measure should start at tick 1440
    assert.equal(data.syllables.length, 4);
    assert.equal(data.syllables[0].tick, 0);
    assert.equal(data.syllables[1].tick, 480);
    assert.equal(data.syllables[2].tick, 960);
    assert.equal(data.syllables[3].tick, 1440, "second measure starts at 1440 after 3/4 pickup");
});

test("extractAll excludes linked staves from harmony selection", function() {
    var xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<museScore version="4.40">',
        '<Score>',
        '<Division>480</Division>',
        '<Part>',
        '<Staff id="1"><StaffType group="pitched"/></Staff>',
        '<Staff id="2"><linkedTo>1</linkedTo><StaffType group="tablature"/></Staff>',
        '</Part>',
        '<Staff id="1">',
        '<Measure>',
        '<voice>',
        '<Harmony><harmonyInfo><root>14</root></harmonyInfo></Harmony>',
        '<Chord><durationType>whole</durationType>',
        '<Note><pitch>60</pitch></Note></Chord>',
        '</voice>',
        '</Measure>',
        '</Staff>',
        '<Staff id="2">',
        '<Measure>',
        '<voice>',
        '<Harmony><harmonyInfo><root>14</root></harmonyInfo></Harmony>',
        '<Harmony><harmonyInfo><root>18</root><name>m</name></harmonyInfo></Harmony>',
        '<Chord><durationType>whole</durationType>',
        '<Note><pitch>60</pitch></Note></Chord>',
        '</voice>',
        '</Measure>',
        '</Staff>',
        '</Score>',
        '</museScore>'
    ].join("\n");

    var data = xmlExt.extractAll(xml);
    // Staff 2 (id="2") is linked, so its harmonies should be excluded
    // Staff 1 has 1 harmony, Staff 2 has 2 harmonies
    // Without linked exclusion, staff 2 would win. With exclusion, staff 1 wins.
    assert.equal(data.chords.length, 1, "should only have chords from non-linked staff");
    assert.equal(data.chords[0].chord, "C");  // root=14 = C (default spelling=standard)
});

test("extractAll: TimeSig 3/4 updates current measure ticks for measure rest", function() {
    // When TimeSig 3/4 appears at start of first measure, a "measure" rest
    // should use 1440 ticks (3*480), not the default 1920 (4*480).
    var xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<museScore version="4.40">',
        '<Score>',
        '<Division>480</Division>',
        '<Part><Staff id="1"><StaffType group="pitched"/></Staff></Part>',
        '<Staff id="1">',
        '<Measure>',
        '<voice>',
        '<TimeSig><sigN>3</sigN><sigD>4</sigD></TimeSig>',
        '<Rest><durationType>measure</durationType></Rest>',
        '</voice>',
        '</Measure>',
        '<Measure>',
        '<voice>',
        '<Chord><durationType>quarter</durationType>',
        '<Lyrics><text>hello</text></Lyrics>',
        '<Note><pitch>60</pitch></Note></Chord>',
        '<Rest><durationType>half</durationType></Rest>',
        '</voice>',
        '</Measure>',
        '</Staff>',
        '</Score>',
        '</museScore>'
    ].join("\n");

    var data = xmlExt.extractAll(xml);
    // First measure: 3/4 with measure rest = 1440 ticks
    // Second measure starts at tick 1440, "hello" should be at tick 1440
    assert.equal(data.syllables.length, 1);
    assert.equal(data.syllables[0].tick, 1440,
        "syllable should start at 1440 (after 3/4 measure rest), got " + data.syllables[0].tick);
});

test("extractAll: TPC Anglo name reconstruction for 'Do' chord (root=16, name='o')", function() {
    // When harmonyInfo has root TPC=16 (D in Anglo) and name="o",
    // the chord should be reconstructed as "Do" (D + "o"), not "Reo"
    var xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<museScore version="4.40">',
        '<Score>',
        '<Division>480</Division>',
        '<Part><Staff id="1"><StaffType group="pitched"/></Staff></Part>',
        '<Staff id="1">',
        '<Measure>',
        '<voice>',
        '<Harmony><harmonyInfo><root>16</root><name>o</name></harmonyInfo></Harmony>',
        '<Chord><durationType>whole</durationType>',
        '<Note><pitch>60</pitch></Note></Chord>',
        '</voice>',
        '</Measure>',
        '</Staff>',
        '</Score>',
        '</museScore>'
    ].join("\n");

    var data = xmlExt.extractAll(xml);
    assert.equal(data.chords.length, 1);
    assert.equal(data.chords[0].chord, "Do",
        "TPC 16 (D) + name 'o' should produce 'Do', got: " + data.chords[0].chord);
});

test("extractAll: TPC Anglo name reconstruction for 'Fa#7' chord (root=13, name='a#7')", function() {
    // When harmonyInfo has root TPC=13 (F in Anglo... wait, let me check)
    // TPC_ANGLO: index = tpc + 1, so tpc=13 -> index 14 -> "F"
    // name="a#7" -> F + "a#7" = "Fa#7"
    var xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<museScore version="4.40">',
        '<Score>',
        '<Division>480</Division>',
        '<Part><Staff id="1"><StaffType group="pitched"/></Staff></Part>',
        '<Staff id="1">',
        '<Measure>',
        '<voice>',
        '<Harmony><harmonyInfo><root>13</root><name>a#7</name></harmonyInfo></Harmony>',
        '<Chord><durationType>whole</durationType>',
        '<Note><pitch>60</pitch></Note></Chord>',
        '</voice>',
        '</Measure>',
        '</Staff>',
        '</Score>',
        '</museScore>'
    ].join("\n");

    var data = xmlExt.extractAll(xml);
    assert.equal(data.chords.length, 1);
    assert.equal(data.chords[0].chord, "Fa#7",
        "TPC 13 (F via Bb Anglo) + name 'a#7' should produce 'Fa#7', got: " + data.chords[0].chord);
});

test("extractAll extracts D.S. al Coda markers and jump", function() {
    var xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<museScore version="4.40">',
        '<Score>',
        '<Division>480</Division>',
        '<Part><Staff id="1"><StaffType group="pitched"/></Staff></Part>',
        '<Staff id="1">',
        '<Measure>',
        '<voice>',
        '<Marker><label>segno</label></Marker>',
        '<Chord><durationType>half</durationType>',
        '<Lyrics><text>A</text></Lyrics>',
        '<Note><pitch>60</pitch></Note></Chord>',
        '<Marker><label>coda</label></Marker>',
        '<Chord><durationType>half</durationType>',
        '<Lyrics><text>B</text></Lyrics>',
        '<Note><pitch>62</pitch></Note></Chord>',
        '</voice>',
        '</Measure>',
        '<Measure>',
        '<voice>',
        '<Chord><durationType>half</durationType>',
        '<Lyrics><text>C</text></Lyrics>',
        '<Note><pitch>64</pitch></Note></Chord>',
        '<Jump><jumpTo>segno</jumpTo><playUntil>coda</playUntil><continueAt>codab</continueAt></Jump>',
        '<Rest><durationType>half</durationType></Rest>',
        '</voice>',
        '</Measure>',
        '<Measure>',
        '<voice>',
        '<Marker><label>codab</label></Marker>',
        '<Chord><durationType>whole</durationType>',
        '<Lyrics><text>Coda</text></Lyrics>',
        '<Note><pitch>67</pitch></Note></Chord>',
        '</voice>',
        '</Measure>',
        '</Staff>',
        '</Score>',
        '</museScore>'
    ].join("\n");

    var data = xmlExt.extractAll(xml);
    assert.equal(data.markers.length, 3, "should have 3 markers: segno, tocoda, coda");

    var segno = data.markers.find(function(m) { return m.label === "segno"; });
    assert.ok(segno, "should have segno marker");
    assert.equal(segno.type, "segno");

    var tocoda = data.markers.find(function(m) { return m.label === "coda"; });
    assert.ok(tocoda, "should have tocoda marker");
    assert.equal(tocoda.type, "tocoda");

    var codab = data.markers.find(function(m) { return m.label === "codab"; });
    assert.ok(codab, "should have coda marker");
    assert.equal(codab.type, "coda");

    assert.equal(data.jumps.length, 1);
    assert.equal(data.jumps[0].jumpTo, "segno");
    assert.equal(data.jumps[0].playUntil, "coda");
    assert.equal(data.jumps[0].continueAt, "codab");
});

test("extractAll extracts Jump and Marker at measure level (not inside voice)", function() {
    // In MuseScore, Jump and Marker can be children of Measure, not voice.
    var xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<museScore version="4.40">',
        '<Score>',
        '<Division>480</Division>',
        '<Part><Staff id="1"><StaffType group="pitched"/></Staff></Part>',
        '<Staff id="1">',
        '<Measure>',
        '<Marker><label>coda</label></Marker>',
        '<voice>',
        '<Chord><durationType>whole</durationType>',
        '<Lyrics><text>hello</text></Lyrics>',
        '<Note><pitch>60</pitch></Note></Chord>',
        '</voice>',
        '</Measure>',
        '<Measure>',
        '<Jump><jumpTo>start</jumpTo><playUntil>coda</playUntil><continueAt>codab</continueAt></Jump>',
        '<voice>',
        '<Chord><durationType>whole</durationType>',
        '<Lyrics><text>world</text></Lyrics>',
        '<Note><pitch>62</pitch></Note></Chord>',
        '</voice>',
        '</Measure>',
        '<Measure>',
        '<Marker><label>codab</label></Marker>',
        '<voice>',
        '<Chord><durationType>whole</durationType>',
        '<Lyrics><text>coda</text></Lyrics>',
        '<Note><pitch>64</pitch></Note></Chord>',
        '</voice>',
        '</Measure>',
        '</Staff>',
        '</Score>',
        '</museScore>'
    ].join("\n");

    var data = xmlExt.extractAll(xml);
    assert.equal(data.markers.length, 2, "should find 2 markers at measure level: " + JSON.stringify(data.markers));
    assert.equal(data.jumps.length, 1, "should find 1 jump at measure level: " + JSON.stringify(data.jumps));
    assert.equal(data.jumps[0].jumpTo, "start");
    assert.equal(data.jumps[0].playUntil, "coda");
    assert.equal(data.jumps[0].continueAt, "codab");
});

test("extractAll marks syllables at endRepeat barline with sectionBar", function() {
    var xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<museScore version="4.40"><Score>',
        '<Division>480</Division>',
        '<Part><Staff id="1"><StaffType group="pitched"/></Staff></Part>',
        '<Staff id="1">',
        '<Measure><startRepeat/><voice>',
        '<Chord><durationType>quarter</durationType><Lyrics><syllabic>single</syllabic><text>hello</text></Lyrics><Note><pitch>60</pitch><tpc>14</tpc></Note></Chord>',
        '<Chord><durationType>quarter</durationType><Lyrics><syllabic>single</syllabic><text>world</text></Lyrics><Note><pitch>62</pitch><tpc>16</tpc></Note></Chord>',
        '</voice><endRepeat/></Measure>',
        '<Measure><voice>',
        '<Chord><durationType>quarter</durationType><Lyrics><syllabic>single</syllabic><text>next</text></Lyrics><Note><pitch>64</pitch><tpc>18</tpc></Note></Chord>',
        '</voice></Measure>',
        '</Staff></Score></museScore>'
    ].join("\n");

    var data = xmlExt.extractAll(xml);
    // "world" is the last syllable in the repeat measure, should have sectionBar
    var worldSyl = data.syllables.filter(function(s) { return s.text === "world"; })[0];
    assert.ok(worldSyl, "should have world syllable");
    assert.equal(worldSyl.sectionBar, true, "world should have sectionBar (endRepeat): " + JSON.stringify(worldSyl));
    // "hello" should NOT have sectionBar
    var helloSyl = data.syllables.filter(function(s) { return s.text === "hello"; })[0];
    assert.ok(!helloSyl.sectionBar, "hello should not have sectionBar");
});

test("extractAll detects end barline inside voice element (VirgenAlmudena regression)", function() {
    var xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<museScore version="4.40"><Score>',
        '<Division>480</Division>',
        '<Part><Staff id="1"><StaffType group="pitched"/></Staff></Part>',
        '<Staff id="1">',
        '<Measure><voice>',
        '<Chord><durationType>half</durationType><Lyrics><syllabic>single</syllabic><text>amor.</text></Lyrics><Note><pitch>60</pitch><tpc>14</tpc></Note></Chord>',
        '<BarLine><subtype>end</subtype></BarLine>',
        '</voice></Measure>',
        '<Measure><voice>',
        '<Chord><durationType>quarter</durationType><Lyrics><syllabic>single</syllabic><text>T\u00fa</text></Lyrics><Note><pitch>62</pitch><tpc>16</tpc></Note></Chord>',
        '</voice></Measure>',
        '</Staff></Score></museScore>'
    ].join("\n");
    var data = xmlExt.extractAll(xml);
    // "amor." should have sectionBar from the end barline
    var amorSyl = data.syllables.filter(function(s) { return s.text === "amor."; })[0];
    assert.ok(amorSyl, "should have amor. syllable");
    assert.equal(amorSyl.sectionBar, true, "amor. should have sectionBar from end barline");
    // barlines array should contain the end barline
    assert.ok(data.barlines.some(function(b) { return b.type === "end"; }),
        "barlines should include end type: " + JSON.stringify(data.barlines));
});

test("extractAll skips grace notes (acciaccatura) in tick calculation", function() {
    var xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<museScore version="4.40"><Score>',
        '<Division>480</Division>',
        '<Part><Staff id="1"><StaffType group="pitched"/></Staff></Part>',
        '<Staff id="1">',
        '<Measure><voice>',
        '<Chord><durationType>eighth</durationType><Lyrics><syllabic>single</syllabic><text>jos</text></Lyrics><Note><pitch>60</pitch><tpc>14</tpc></Note></Chord>',
        '<Chord><durationType>eighth</durationType><acciaccatura/><Note><pitch>62</pitch><tpc>16</tpc></Note></Chord>',
        '<Chord><durationType>eighth</durationType><Lyrics><syllabic>single</syllabic><text>tie</text></Lyrics><Note><pitch>64</pitch><tpc>18</tpc></Note></Chord>',
        '</voice></Measure>',
        '</Staff></Score></museScore>'
    ].join("\n");

    var data = xmlExt.extractAll(xml);
    var syls = data.syllables;
    assert.equal(syls.length, 2, "should have 2 syllables (grace note has no lyrics)");
    assert.equal(syls[0].text, "jos");
    assert.equal(syls[0].tick, 0);
    assert.equal(syls[1].text, "tie");
    // tie should be at tick 240 (1 eighth), not 480 (grace note skipped)
    assert.equal(syls[1].tick, 240, "grace note duration should not shift tick: got " + syls[1].tick);
});

test("extractAll excludes hidden staves from selection", function() {
    // Staff 1 is visible with 1 lyric, Staff 2 is hidden (show=0) with 2 lyrics.
    // Should select Staff 1 (visible) even though Staff 2 has more lyrics.
    var xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<museScore version="4.40"><Score>',
        '<Division>480</Division>',
        '<Part><Staff id="1"><StaffType group="pitched"/></Staff></Part>',
        '<Part><Staff id="2"><StaffType group="pitched"/><isStaffVisible>0</isStaffVisible></Staff><show>0</show></Part>',
        '<Staff id="1">',
        '<Measure><voice>',
        '<Chord><durationType>quarter</durationType><Lyrics><syllabic>single</syllabic><text>visible</text></Lyrics><Note><pitch>60</pitch><tpc>14</tpc></Note></Chord>',
        '</voice></Measure>',
        '</Staff>',
        '<Staff id="2">',
        '<Measure><voice>',
        '<Chord><durationType>quarter</durationType><Lyrics><syllabic>single</syllabic><text>hidden1</text></Lyrics><Note><pitch>60</pitch><tpc>14</tpc></Note></Chord>',
        '<Chord><durationType>quarter</durationType><Lyrics><syllabic>single</syllabic><text>hidden2</text></Lyrics><Note><pitch>62</pitch><tpc>16</tpc></Note></Chord>',
        '</voice></Measure>',
        '</Staff>',
        '</Score></museScore>'
    ].join("\n");

    var data = xmlExt.extractAll(xml);
    assert.equal(data.syllables.length, 1, "should only have syllables from visible staff");
    assert.equal(data.syllables[0].text, "visible");
});

// ============================================================
// Expression and FretDiagram (nested Harmony) as chord
// ============================================================

test("extractAll extracts <PlayTechAnnotation> as inline chord text", function() {
    var xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<museScore version="4.40"><Score><Division>480</Division>',
        '<Part><Staff id="1"><StaffType group="pitched"/></Staff></Part>',
        '<Staff id="1"><Measure><voice>',
        '<PlayTechAnnotation><playTechType>harmonics</playTechType><text>harmonics</text></PlayTechAnnotation>',
        '<Chord><durationType>quarter</durationType>',
        '<Lyrics><text>hello</text></Lyrics>',
        '<Note><pitch>60</pitch></Note></Chord>',
        '</voice></Measure></Staff>',
        '</Score></museScore>'
    ].join("\n");

    var data = xmlExt.extractAll(xml);
    assert.equal(data.chords.length, 1);
    assert.equal(data.chords[0].chord, "harmonics");
    assert.equal(data.chords[0].tick, 0);
});

test("extractAll extracts <Expression> as inline chord text", function() {
    var xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<museScore version="4.40"><Score><Division>480</Division>',
        '<Part><Staff id="1"><StaffType group="pitched"/></Staff></Part>',
        '<Staff id="1"><Measure><voice>',
        '<Expression><text>rit.</text></Expression>',
        '<Chord><durationType>quarter</durationType>',
        '<Lyrics><text>hello</text></Lyrics>',
        '<Note><pitch>60</pitch></Note></Chord>',
        '</voice></Measure></Staff>',
        '</Score></museScore>'
    ].join("\n");

    var data = xmlExt.extractAll(xml);
    assert.equal(data.chords.length, 1);
    assert.equal(data.chords[0].chord, "rit.");
    assert.equal(data.chords[0].tick, 0);
});

test("extractAll extracts chord from <FretDiagram> with nested <Harmony>", function() {
    var xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<museScore version="4.40"><Score><Division>480</Division>',
        '<Part><Staff id="1"><StaffType group="pitched"/></Staff></Part>',
        '<Staff id="1"><Measure><voice>',
        '<FretDiagram>',
        '<Harmony><harmonyInfo><root>17</root><name>m</name></harmonyInfo></Harmony>',
        '<fretDiagram><fret>0</fret></fretDiagram>',
        '</FretDiagram>',
        '<Chord><durationType>whole</durationType>',
        '<Lyrics><text>hi</text></Lyrics>',
        '<Note><pitch>60</pitch></Note></Chord>',
        '</voice></Measure></Staff>',
        '</Score></museScore>'
    ].join("\n");

    var data = xmlExt.extractAll(xml, [], "solfeggio");
    assert.equal(data.chords.length, 1);
    assert.equal(data.chords[0].chord, "Lam");
});

// ============================================================
// RehearsalMark and staff filtering for section labels
// ============================================================

test("extractAll extracts <RehearsalMark> on staff 0 as section label", function() {
    var xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<museScore version="4.40"><Score><Division>480</Division>',
        '<Part><Staff id="1"><StaffType group="pitched"/></Staff></Part>',
        '<Staff id="1"><Measure><voice>',
        '<RehearsalMark><text>A</text></RehearsalMark>',
        '<Chord><durationType>whole</durationType>',
        '<Lyrics><text>hi</text></Lyrics>',
        '<Note><pitch>60</pitch></Note></Chord>',
        '</voice></Measure></Staff>',
        '</Score></museScore>'
    ].join("\n");

    var data = xmlExt.extractAll(xml);
    assert.equal(data.systemTexts.length, 1);
    assert.equal(data.systemTexts[0].text, "A");
    assert.equal(data.systemTexts[0].tick, 0);
});

test("extractAll ignores <RehearsalMark> on non-zero staff", function() {
    var xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<museScore version="4.40"><Score><Division>480</Division>',
        '<Part><Staff id="1"><StaffType group="pitched"/></Staff></Part>',
        '<Part><Staff id="2"><StaffType group="pitched"/></Staff></Part>',
        '<Staff id="1"><Measure><voice>',
        '<Chord><durationType>whole</durationType>',
        '<Lyrics><text>hi</text></Lyrics>',
        '<Note><pitch>60</pitch></Note></Chord>',
        '</voice></Measure></Staff>',
        '<Staff id="2"><Measure><voice>',
        '<RehearsalMark><text>B</text></RehearsalMark>',
        '<Chord><durationType>whole</durationType>',
        '<Note><pitch>62</pitch></Note></Chord>',
        '</voice></Measure></Staff>',
        '</Score></museScore>'
    ].join("\n");

    var data = xmlExt.extractAll(xml);
    assert.equal(data.systemTexts.length, 0, "RehearsalMark on staff 2 should be ignored");
});

test("extractAll ignores <SystemText> on non-zero staff", function() {
    var xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<museScore version="4.40"><Score><Division>480</Division>',
        '<Part><Staff id="1"><StaffType group="pitched"/></Staff></Part>',
        '<Part><Staff id="2"><StaffType group="pitched"/></Staff></Part>',
        '<Staff id="1"><Measure><voice>',
        '<Chord><durationType>whole</durationType>',
        '<Lyrics><text>hi</text></Lyrics>',
        '<Note><pitch>60</pitch></Note></Chord>',
        '</voice></Measure></Staff>',
        '<Staff id="2"><Measure><voice>',
        '<SystemText><text>SHOULD-NOT-APPEAR</text></SystemText>',
        '<Chord><durationType>whole</durationType>',
        '<Note><pitch>62</pitch></Note></Chord>',
        '</voice></Measure></Staff>',
        '</Score></museScore>'
    ].join("\n");

    var data = xmlExt.extractAll(xml);
    assert.equal(data.systemTexts.length, 0, "SystemText on staff 2 should be ignored");
});

// ========================================
// Tied notes: duration accumulation for gap calculation
// ========================================

test("extractAll accounts for tied notes in gap calculation", function() {
    // Two eighth notes tied together (if + tied continuation), then next syllable "you"
    // Without tie fix: gap = (960-0)/480 - 0.25 = 1.75 (false rest)
    // With tie fix: gap = (960-0)/480 - 0.5 = 1.5... but actually the tied note
    // occupies ticks 0-480, so gap from 480 to 960 = 1.0 quarter
    var xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<museScore version="4.40">',
        '<Score>',
        '<Division>480</Division>',
        '<Part><Staff id="1"><StaffType group="pitched"/></Staff></Part>',
        '<Staff id="1">',
        '<Measure>',
        '<voice>',
        '<Chord><durationType>eighth</durationType>',
        '<Lyrics><text>if</text><syllabic>single</syllabic></Lyrics>',
        '<Note><pitch>67</pitch><tpc>15</tpc>',
        '<Spanner type="Tie"><Tie/><next><location><fractions>1/8</fractions></location></next></Spanner>',
        '</Note></Chord>',
        '<Chord><durationType>eighth</durationType>',
        '<Note><pitch>67</pitch><tpc>15</tpc>',
        '<Spanner type="Tie"><Tie/><prev><location><fractions>-1/8</fractions></location></prev></Spanner>',
        '</Note></Chord>',
        '<Chord><durationType>quarter</durationType>',
        '<Lyrics><text>you</text><syllabic>single</syllabic></Lyrics>',
        '<Note><pitch>65</pitch><tpc>13</tpc></Note></Chord>',
        '</voice></Measure>',
        '</Staff>',
        '</Score></museScore>'
    ].join("\n");

    var data = xmlExt.extractAll(xml);
    var ifSyl = data.syllables.filter(function(s) { return s.text === "if"; })[0];
    assert.ok(ifSyl, "should have 'if' syllable");
    assert.equal(ifSyl.durationQ, 0.5, "durationQ should be original eighth note duration");
    assert.equal(ifSyl.restAfter, false, "tied note should not create false rest: restAfter=" + ifSyl.restAfter + " gapQ=" + ifSyl.gapDurationQ);
    assert.equal(ifSyl.restDurationQ, 0, "no rest duration for tied note");
});

test("extractAll handles tie chain of 3 notes", function() {
    // Three eighth notes tied: lyrics on first, no lyrics on 2nd and 3rd
    var xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<museScore version="4.40">',
        '<Score>',
        '<Division>480</Division>',
        '<Part><Staff id="1"><StaffType group="pitched"/></Staff></Part>',
        '<Staff id="1">',
        '<Measure>',
        '<voice>',
        '<Chord><durationType>eighth</durationType>',
        '<Lyrics><text>long</text><syllabic>single</syllabic></Lyrics>',
        '<Note><pitch>60</pitch>',
        '<Spanner type="Tie"><Tie/><next><location><fractions>1/8</fractions></location></next></Spanner>',
        '</Note></Chord>',
        '<Chord><durationType>eighth</durationType>',
        '<Note><pitch>60</pitch>',
        '<Spanner type="Tie"><Tie/><prev><location><fractions>-1/8</fractions></location></prev></Spanner>',
        '<Spanner type="Tie"><Tie/><next><location><fractions>1/8</fractions></location></next></Spanner>',
        '</Note></Chord>',
        '<Chord><durationType>eighth</durationType>',
        '<Note><pitch>60</pitch>',
        '<Spanner type="Tie"><Tie/><prev><location><fractions>-1/8</fractions></location></prev></Spanner>',
        '</Note></Chord>',
        '<Chord><durationType>quarter</durationType>',
        '<Lyrics><text>next</text><syllabic>single</syllabic></Lyrics>',
        '<Note><pitch>62</pitch></Note></Chord>',
        '</voice></Measure>',
        '</Staff>',
        '</Score></museScore>'
    ].join("\n");

    var data = xmlExt.extractAll(xml);
    var longSyl = data.syllables.filter(function(s) { return s.text === "long"; })[0];
    assert.ok(longSyl, "should have 'long' syllable");
    assert.equal(longSyl.durationQ, 0.5, "durationQ should be original eighth note only");
    assert.equal(longSyl.restAfter, false, "3-note tie chain should not create false rest");
});

test("extractAll does not change durationQ for tied notes", function() {
    // Verify that durationQ stays as the original note duration (not accumulated)
    var xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<museScore version="4.40">',
        '<Score>',
        '<Division>480</Division>',
        '<Part><Staff id="1"><StaffType group="pitched"/></Staff></Part>',
        '<Staff id="1">',
        '<Measure>',
        '<voice>',
        '<Chord><durationType>quarter</durationType>',
        '<Lyrics><text>hold</text><syllabic>single</syllabic></Lyrics>',
        '<Note><pitch>60</pitch>',
        '<Spanner type="Tie"><Tie/><next><location><fractions>1/4</fractions></location></next></Spanner>',
        '</Note></Chord>',
        '<Chord><durationType>quarter</durationType>',
        '<Note><pitch>60</pitch>',
        '<Spanner type="Tie"><Tie/><prev><location><fractions>-1/4</fractions></location></prev></Spanner>',
        '</Note></Chord>',
        '<Chord><durationType>quarter</durationType>',
        '<Lyrics><text>go</text><syllabic>single</syllabic></Lyrics>',
        '<Note><pitch>62</pitch></Note></Chord>',
        '</voice></Measure>',
        '</Staff>',
        '</Score></museScore>'
    ].join("\n");

    var data = xmlExt.extractAll(xml);
    var holdSyl = data.syllables.filter(function(s) { return s.text === "hold"; })[0];
    assert.equal(holdSyl.durationQ, 1, "durationQ should be original quarter note (1), not accumulated (2)");
    assert.equal(holdSyl.restAfter, false, "no false rest after tied note");
});

// ========================================
// Staff selection: voiceStaves and lyricStaff option
// ========================================

var TWO_STAFF_SCORE = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<museScore version="4.40">',
    '<Score>',
    '<Division>480</Division>',
    '<metaTag name="workTitle">Two Voices</metaTag>',
    '<Part><trackName>Voice</trackName><Instrument><longName>Soprano</longName><shortName>S</shortName></Instrument>',
    '<Staff id="1"><StaffType group="pitched"/></Staff></Part>',
    '<Part><trackName>Voice 2</trackName><Instrument><longName>Alto</longName><shortName>A</shortName></Instrument>',
    '<Staff id="2"><StaffType group="pitched"/></Staff></Part>',
    '<Staff id="1">',
    '<Measure><voice>',
    '<Chord><durationType>quarter</durationType>',
    '<Lyrics><text>so</text><syllabic>begin</syllabic></Lyrics>',
    '<Note><pitch>67</pitch></Note></Chord>',
    '<Chord><durationType>quarter</durationType>',
    '<Lyrics><text>pra</text><syllabic>middle</syllabic></Lyrics>',
    '<Note><pitch>65</pitch></Note></Chord>',
    '<Chord><durationType>half</durationType>',
    '<Lyrics><text>no</text><syllabic>end</syllabic></Lyrics>',
    '<Note><pitch>64</pitch></Note></Chord>',
    '</voice></Measure>',
    '</Staff>',
    '<Staff id="2">',
    '<Measure><voice>',
    '<Chord><durationType>half</durationType>',
    '<Lyrics><text>al</text><syllabic>begin</syllabic></Lyrics>',
    '<Note><pitch>60</pitch></Note></Chord>',
    '<Chord><durationType>half</durationType>',
    '<Lyrics><text>to</text><syllabic>end</syllabic></Lyrics>',
    '<Note><pitch>62</pitch></Note></Chord>',
    '</voice></Measure>',
    '</Staff>',
    '</Score></museScore>'
].join("\n");

test("extractAll returns voiceStaves with names sorted by count", function() {
    var data = xmlExt.extractAll(TWO_STAFF_SCORE);
    assert.ok(data.voiceStaves, "should have voiceStaves");
    assert.equal(data.voiceStaves.length, 2);
    // Staff 0 (Soprano) has 3 syllables, Staff 1 (Alto) has 2
    assert.equal(data.voiceStaves[0].idx, 0, "first should be staff 0 (most lyrics)");
    assert.equal(data.voiceStaves[0].name, "Soprano");
    assert.equal(data.voiceStaves[0].shortName, "S");
    assert.equal(data.voiceStaves[1].idx, 1);
    assert.equal(data.voiceStaves[1].name, "Alto");
});

test("extractAll selects best staff by default", function() {
    var data = xmlExt.extractAll(TWO_STAFF_SCORE);
    assert.equal(data.selectedVoiceStaff, 0, "should auto-select staff 0 (most lyrics)");
    assert.equal(data.syllables[0].text, "so");
});

test("extractAll accepts lyricStaff option to override selection", function() {
    var data = xmlExt.extractAll(TWO_STAFF_SCORE, [], undefined, { lyricStaff: 1 });
    assert.equal(data.selectedVoiceStaff, 1, "should select staff 1");
    assert.equal(data.syllables[0].text, "al", "should have Alto lyrics");
    assert.equal(data.syllables.length, 2);
});

test("extractAll lyricStaff same as default does not change result", function() {
    var data = xmlExt.extractAll(TWO_STAFF_SCORE, [], undefined, { lyricStaff: 0 });
    assert.equal(data.selectedVoiceStaff, 0);
    assert.equal(data.syllables[0].text, "so");
    assert.equal(data.syllables.length, 3);
});

// ============================================================
// harmonyInfo TPC spelling: respects spelling parameter
// ============================================================

test("harmonyInfo TPC chords use spelling parameter (solfeggio)", function() {
    // Harmony stored as TPC root (not text) must use the spelling parameter.
    // Bug: readHarmonyText() had "standard" hardcoded — TPC chords always
    // came out in English regardless of the score's chordSymbolSpelling.
    var xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<museScore version="4.60"><Score><Division>480</Division>',
        '<Part><Staff id="1"><StaffType group="pitched"/></Staff></Part>',
        '<Staff id="1"><Measure><voice>',
        '<Harmony><harmonyInfo><root>21</root></harmonyInfo></Harmony>',
        '<Chord><durationType>whole</durationType>',
        '<Lyrics><text>la</text></Lyrics>',
        '<Note><pitch>60</pitch></Note></Chord>',
        '<Harmony><harmonyInfo><root>15</root><name>7</name></harmonyInfo></Harmony>',
        '<Chord><durationType>whole</durationType>',
        '<Note><pitch>60</pitch></Note></Chord>',
        '<Harmony><harmonyInfo><root>13</root><name>m</name></harmonyInfo></Harmony>',
        '<Chord><durationType>whole</durationType>',
        '<Note><pitch>60</pitch></Note></Chord>',
        '</voice></Measure></Staff>',
        '</Score></museScore>'
    ].join("\n");

    var dataSolfeo = xmlExt.extractAll(xml, [], "solfeggio");
    assert.equal(dataSolfeo.chords[0].chord, "Do#",  "TPC 21 + solfeggio = Do#");
    assert.equal(dataSolfeo.chords[1].chord, "Sol7", "TPC 15 + quality 7 + solfeggio = Sol7");
    assert.equal(dataSolfeo.chords[2].chord, "Fam",  "TPC 13 + quality m + solfeggio = Fam");

    var dataStd = xmlExt.extractAll(xml, [], "standard");
    assert.equal(dataStd.chords[0].chord, "C#",  "TPC 21 + standard = C#");
    assert.equal(dataStd.chords[1].chord, "G7",  "TPC 15 + quality 7 + standard = G7");
    assert.equal(dataStd.chords[2].chord, "Fm",  "TPC 13 + quality m + standard = Fm");
});

// ============================================================
// Slash chords: <bass> element (MuseScore 4) and <base> (MuseScore 3)
// ============================================================

test("extractAll reads bass note of slash chords", function() {
    var xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<museScore version="4.40"><Score>',
        '<Division>480</Division>',
        '<Part><Staff id="1"><StaffType group="pitched"/></Staff></Part>',
        '<Staff id="1"><Measure><voice>',
        '<Harmony><harmonyInfo><root>12</root><bass>13</bass></harmonyInfo></Harmony>',
        '<Chord><durationType>whole</durationType>',
        '<Note><pitch>60</pitch></Note></Chord>',
        '<Harmony><harmonyInfo><root>17</root><name>m</name><bass>18</bass></harmonyInfo></Harmony>',
        '<Chord><durationType>whole</durationType>',
        '<Note><pitch>60</pitch></Note></Chord>',
        '</voice></Measure></Staff>',
        '</Score></museScore>'
    ].join("\n");

    var std = xmlExt.extractAll(xml, [], "standard");
    assert.equal(std.chords[0].chord, "Bb/F", "TPC 12 root + TPC 13 bass = Bb/F");
    assert.equal(std.chords[1].chord, "Am/E", "TPC 17 root + quality m + TPC 18 bass = Am/E");

    var solfeo = xmlExt.extractAll(xml, [], "solfeggio");
    assert.equal(solfeo.chords[0].chord, "Sib/Fa");
    assert.equal(solfeo.chords[1].chord, "Lam/Mi");
});

test("extractAll reads bass note nested in FretDiagram", function() {
    var xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<museScore version="4.40"><Score>',
        '<Division>480</Division>',
        '<Part><Staff id="1"><StaffType group="pitched"/></Staff></Part>',
        '<Staff id="1"><Measure><voice>',
        '<FretDiagram>',
        '<Harmony><harmonyInfo><root>12</root><bass>13</bass></harmonyInfo></Harmony>',
        '<fretDiagram></fretDiagram>',
        '</FretDiagram>',
        '<Chord><durationType>whole</durationType>',
        '<Note><pitch>60</pitch></Note></Chord>',
        '</voice></Measure></Staff>',
        '</Score></museScore>'
    ].join("\n");

    var data = xmlExt.extractAll(xml, [], "standard");
    assert.equal(data.chords[0].chord, "Bb/F");
});

test("extractAll accepts MuseScore 3 base tag for slash chords", function() {
    var xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<museScore version="3.02"><Score>',
        '<Division>480</Division>',
        '<Part><Staff id="1"><StaffType group="pitched"/></Staff></Part>',
        '<Staff id="1"><Measure><voice>',
        '<Harmony><root>12</root><base>13</base></Harmony>',
        '<Chord><durationType>whole</durationType>',
        '<Note><pitch>60</pitch></Note></Chord>',
        '</voice></Measure></Staff>',
        '</Score></museScore>'
    ].join("\n");

    var data = xmlExt.extractAll(xml, [], "standard");
    assert.equal(data.chords[0].chord, "Bb/F");
});

// ============================================================
// Voice-level <location> tick offsets
// ============================================================

test("extractAll applies voice-level location offsets to following elements", function() {
    // Division 480: whole chord ends at 1920, location -1/4 rewinds 480 ticks,
    // so the Harmony that follows belongs at 1440, not at the measure end.
    var xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<museScore version="4.40"><Score>',
        '<Division>480</Division>',
        '<Part><Staff id="1"><StaffType group="pitched"/></Staff></Part>',
        '<Staff id="1"><Measure><voice>',
        '<Chord><durationType>whole</durationType>',
        '<Note><pitch>60</pitch></Note></Chord>',
        '<location><fractions>-1/4</fractions></location>',
        '<Harmony><harmonyInfo><root>14</root></harmonyInfo></Harmony>',
        '</voice></Measure></Staff>',
        '</Score></museScore>'
    ].join("\n");

    var data = xmlExt.extractAll(xml, [], "standard");
    assert.equal(data.chords.length, 1);
    assert.equal(data.chords[0].chord, "C");
    assert.equal(data.chords[0].tick, 1440, "location -1/4 should rewind one quarter from 1920");
});

test("extractAll applies positive location offsets", function() {
    var xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<museScore version="4.40"><Score>',
        '<Division>480</Division>',
        '<Part><Staff id="1"><StaffType group="pitched"/></Staff></Part>',
        '<Staff id="1"><Measure><voice>',
        '<location><fractions>1/2</fractions></location>',
        '<Harmony><harmonyInfo><root>14</root></harmonyInfo></Harmony>',
        '<Rest><durationType>measure</durationType></Rest>',
        '</voice></Measure></Staff>',
        '</Score></museScore>'
    ].join("\n");

    var data = xmlExt.extractAll(xml, [], "standard");
    assert.equal(data.chords[0].tick, 960, "location 1/2 should advance two quarters");
});

test("extractAll ignores location elements nested inside spanners", function() {
    // Tie offsets live in Spanner/next/prev and must not move the voice cursor
    var xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<museScore version="4.40"><Score>',
        '<Division>480</Division>',
        '<Part><Staff id="1"><StaffType group="pitched"/></Staff></Part>',
        '<Staff id="1"><Measure><voice>',
        '<Chord><durationType>half</durationType>',
        '<Note><pitch>60</pitch>',
        '<Spanner type="Tie"><next><location><fractions>1/8</fractions></location></next></Spanner>',
        '</Note></Chord>',
        '<Harmony><harmonyInfo><root>14</root></harmonyInfo></Harmony>',
        '</voice></Measure></Staff>',
        '</Score></museScore>'
    ].join("\n");

    var data = xmlExt.extractAll(xml, [], "standard");
    assert.equal(data.chords[0].tick, 960, "nested spanner location must not shift the cursor");
});

// ============================================================
// Auto-numbered rehearsal marks are not section labels
// ============================================================

test("extractAll skips purely numeric rehearsal marks", function() {
    // MuseScore numbers rehearsal marks automatically, so a score using them for
    // navigation would otherwise produce section headings like "- 9 -".
    var xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<museScore version="4.40"><Score>',
        '<Division>480</Division>',
        '<Part><Staff id="1"><StaffType group="pitched"/></Staff></Part>',
        '<Staff id="1"><Measure><voice>',
        '<RehearsalMark><text>9</text></RehearsalMark>',
        '<Chord><durationType>half</durationType>',
        '<Lyrics><text>uno</text><syllabic>single</syllabic></Lyrics>',
        '<Note><pitch>60</pitch></Note></Chord>',
        '<RehearsalMark><text>Estribillo</text></RehearsalMark>',
        '<Chord><durationType>half</durationType>',
        '<Lyrics><text>dos</text><syllabic>single</syllabic></Lyrics>',
        '<Note><pitch>62</pitch></Note></Chord>',
        '</voice></Measure>',
        '<Measure><voice>',
        '<RehearsalMark><text>A</text></RehearsalMark>',
        '<Chord><durationType>whole</durationType>',
        '<Lyrics><text>tres</text><syllabic>single</syllabic></Lyrics>',
        '<Note><pitch>64</pitch></Note></Chord>',
        '</voice></Measure></Staff>',
        '</Score></museScore>'
    ].join("\n");

    var data = xmlExt.extractAll(xml, [], "standard");
    var labels = data.systemTexts.map(function(st) { return st.text; });
    assert.ok(labels.indexOf("9") < 0, "numeric mark should be skipped: " + labels);
    assert.ok(labels.indexOf("Estribillo") >= 0, "named mark should be kept: " + labels);
    assert.ok(labels.indexOf("A") >= 0, "letter mark should be kept: " + labels);
});

test("extractAll keeps system texts that merely contain digits", function() {
    var xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<museScore version="4.40"><Score>',
        '<Division>480</Division>',
        '<Part><Staff id="1"><StaffType group="pitched"/></Staff></Part>',
        '<Staff id="1"><Measure><voice>',
        '<SystemText><text>Estrofa 2</text></SystemText>',
        '<Chord><durationType>whole</durationType>',
        '<Lyrics><text>uno</text><syllabic>single</syllabic></Lyrics>',
        '<Note><pitch>60</pitch></Note></Chord>',
        '</voice></Measure></Staff>',
        '</Score></museScore>'
    ].join("\n");

    var data = xmlExt.extractAll(xml, [], "standard");
    var labels = data.systemTexts.map(function(st) { return st.text; });
    assert.ok(labels.indexOf("Estrofa 2") >= 0, "labels with digits are kept: " + labels);
});

// ============================================================
// Key signature
// ============================================================

test("extractAll reports the key from the first key signature", function() {
    function score(concertKey) {
        return [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<museScore version="4.40"><Score>',
            '<Division>480</Division>',
            '<Part><Staff id="1"><StaffType group="pitched"/></Staff></Part>',
            '<Staff id="1"><Measure><voice>',
            '<KeySig><concertKey>' + concertKey + '</concertKey></KeySig>',
            '<Chord><durationType>whole</durationType>',
            '<Lyrics><text>uno</text><syllabic>single</syllabic></Lyrics>',
            '<Note><pitch>60</pitch></Note></Chord>',
            '</voice></Measure></Staff>',
            '</Score></museScore>'
        ].join("\n");
    }

    assert.equal(xmlExt.extractAll(score(-2), [], "standard").key, "Bb", "two flats is Bb major");
    assert.equal(xmlExt.extractAll(score(4), [], "standard").key, "E", "four sharps is E major");
    assert.equal(xmlExt.extractAll(score(0), [], "standard").key, "C", "no accidentals is C major");
    assert.equal(xmlExt.extractAll(score(-2), [], "solfeggio").key, "Sib", "key follows the score spelling");
});

test("extractAll leaves the key empty when the score has no key signature", function() {
    var xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<museScore version="4.40"><Score>',
        '<Division>480</Division>',
        '<Part><Staff id="1"><StaffType group="pitched"/></Staff></Part>',
        '<Staff id="1"><Measure><voice>',
        '<Chord><durationType>whole</durationType>',
        '<Lyrics><text>uno</text><syllabic>single</syllabic></Lyrics>',
        '<Note><pitch>60</pitch></Note></Chord>',
        '</voice></Measure></Staff>',
        '</Score></museScore>'
    ].join("\n");
    assert.equal(xmlExt.extractAll(xml, [], "standard").key, "");
});

// ============================================================
// includeAnnotations option
// ============================================================

test("extractAll can leave text annotations out of the chord line", function() {
    var xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<museScore version="4.40"><Score>',
        '<Division>480</Division>',
        '<Part><Staff id="1"><StaffType group="pitched"/></Staff></Part>',
        '<Staff id="1"><Measure><voice>',
        '<Harmony><harmonyInfo><root>14</root></harmonyInfo></Harmony>',
        '<StaffText><text>Muy lento</text></StaffText>',
        '<Chord><durationType>whole</durationType>',
        '<Lyrics><text>uno</text><syllabic>single</syllabic></Lyrics>',
        '<Note><pitch>60</pitch></Note></Chord>',
        '</voice></Measure></Staff>',
        '</Score></museScore>'
    ].join("\n");

    var withText = xmlExt.extractAll(xml, [], "standard");
    var names = withText.chords.map(function(c) { return c.chord; });
    assert.ok(names.indexOf("Muy-lento") >= 0, "annotations are included by default: " + names);
    assert.ok(names.indexOf("C") >= 0, "chord present: " + names);

    var without = xmlExt.extractAll(xml, [], "standard", { includeAnnotations: false });
    var names2 = without.chords.map(function(c) { return c.chord; });
    assert.ok(names2.indexOf("Muy-lento") < 0, "annotations should be dropped: " + names2);
    assert.ok(names2.indexOf("C") >= 0, "chords must stay: " + names2);
});
