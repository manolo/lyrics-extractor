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

    assert.equal(data.chords[0].chord, "Em");  // root=18 (E) + name=m -> Anglo, solfeo conversion later
    assert.equal(data.chords[0].tick, 0);

    assert.equal(data.chords[1].chord, "La");    // root=17 (La) no name -> solfeo from TPC
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
    assert.equal(data.systemTexts.length, 2, "should have 2 system texts");
    assert.equal(data.systemTexts[0].text, "ALBORADA");
    assert.equal(data.systemTexts[0].tick, 0);
    assert.equal(data.systemTexts[1].text, "Solo");
    assert.equal(data.systemTexts[1].tick, 960);
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
    assert.equal(data.chords[0].chord, "Do");  // root=14 = Do
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
