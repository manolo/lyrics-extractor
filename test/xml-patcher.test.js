var test = require("node:test");
var assert = require("node:assert/strict");
var path = require("path");
var fs = require("fs");
var msczReader = require("../cli/mscz-reader");
var xmlExtractor = require("../extractors/xml-extractor");
var xmlPatcher = require("../cli/xml-patcher");
var lyricsFixer = require("../lib/lyrics-fixer");

// ============================================================
// extractForFixer
// ============================================================

test("extractForFixer returns lyricGroups from inline XML", function() {
    var xml = [
        '<?xml version="1.0"?>',
        '<museScore version="4.60">',
        '<Score>',
        '<Division>480</Division>',
        '<Part><Staff><StaffType group="pitched"><name>stdNormal</name></StaffType></Staff></Part>',
        '<Staff id="1">',
        '<Measure><voice>',
        '<Chord><durationType>quarter</durationType>',
        '<Lyrics><text>hel</text><syllabic>begin</syllabic></Lyrics>',
        '<Note><pitch>60</pitch><tpc>14</tpc></Note></Chord>',
        '<Chord><durationType>quarter</durationType>',
        '<Lyrics><text>lo</text><syllabic>end</syllabic></Lyrics>',
        '<Note><pitch>62</pitch><tpc>16</tpc></Note></Chord>',
        '</voice></Measure>',
        '</Staff>',
        '</Score>',
        '</museScore>'
    ].join("\n");

    var data = xmlExtractor.extractForFixer(xml);
    var keys = Object.keys(data.lyricGroups);
    assert.equal(keys.length, 1);
    assert.equal(keys[0], "0_0_0");
    assert.equal(data.lyricGroups[keys[0]].length, 2);
    assert.equal(data.lyricGroups[keys[0]][0].text, "hel");
    assert.equal(data.lyricGroups[keys[0]][0].syllabic, 1); // begin
    assert.equal(data.lyricGroups[keys[0]][1].text, "lo");
    assert.equal(data.lyricGroups[keys[0]][1].syllabic, 2); // end
});

test("extractForFixer detects tab staves", function() {
    var xml = [
        '<?xml version="1.0"?>',
        '<museScore version="4.60">',
        '<Score>',
        '<Division>480</Division>',
        '<Part>',
        '<Staff><StaffType group="pitched"><name>stdNormal</name></StaffType></Staff>',
        '<Staff><linkedTo>0</linkedTo><StaffType group="tablature"><name>tab6</name></StaffType></Staff>',
        '</Part>',
        '<Staff id="1"><Measure><voice>',
        '<Chord><durationType>quarter</durationType><Note><pitch>60</pitch><tpc>14</tpc></Note></Chord>',
        '</voice></Measure></Staff>',
        '<Staff id="2"><Measure><voice>',
        '<Chord><durationType>quarter</durationType><Note><pitch>60</pitch><tpc>14</tpc></Note></Chord>',
        '</voice></Measure></Staff>',
        '</Score>',
        '</museScore>'
    ].join("\n");

    var data = xmlExtractor.extractForFixer(xml);
    assert.equal(data.tabStaves[0], undefined);
    assert.equal(data.tabStaves[1], true);
});

test("extractForFixer groups by verse", function() {
    var xml = [
        '<?xml version="1.0"?>',
        '<museScore version="4.60">',
        '<Score>',
        '<Division>480</Division>',
        '<Part><Staff><StaffType group="pitched"><name>stdNormal</name></StaffType></Staff></Part>',
        '<Staff id="1">',
        '<Measure><voice>',
        '<Chord><durationType>quarter</durationType>',
        '<Lyrics><text>one</text></Lyrics>',
        '<Lyrics><no>1</no><text>dos</text></Lyrics>',
        '<Note><pitch>60</pitch><tpc>14</tpc></Note></Chord>',
        '</voice></Measure>',
        '</Staff>',
        '</Score>',
        '</museScore>'
    ].join("\n");

    var data = xmlExtractor.extractForFixer(xml);
    var keys = Object.keys(data.lyricGroups);
    assert.equal(keys.length, 2);
    assert.ok(data.lyricGroups["0_0_0"]);
    assert.ok(data.lyricGroups["0_0_1"]);
});

test("extractForFixer extracts chords with harmonyInfo format", function() {
    var xml = [
        '<?xml version="1.0"?>',
        '<museScore version="4.60">',
        '<Score>',
        '<Division>480</Division>',
        '<Part><Staff><StaffType group="pitched"><name>stdNormal</name></StaffType></Staff></Part>',
        '<Staff id="1">',
        '<Measure><voice>',
        '<Harmony><harmonyInfo><root>14</root><name></name></harmonyInfo></Harmony>',
        '<Chord><durationType>quarter</durationType>',
        '<Note><pitch>60</pitch><tpc>14</tpc></Note></Chord>',
        '</voice></Measure>',
        '</Staff>',
        '</Score>',
        '</museScore>'
    ].join("\n");

    var data = xmlExtractor.extractForFixer(xml);
    assert.equal(data.chords.length, 1);
    assert.equal(data.chords[0].text, "C");
    assert.equal(data.chords[0].isTabStaff, false);
});

// ============================================================
// writeMscz round-trip
// ============================================================

var FIXTURE_PATH = path.join(__dirname, "fixture.mscz");

test("writeMscz preserves content in round-trip", function() {
    var original = msczReader.readScore(FIXTURE_PATH);
    var tmpPath = path.join(__dirname, "_roundtrip_test.mscz");

    try {
        msczReader.writeMscz(FIXTURE_PATH, tmpPath, original);
        var roundtrip = msczReader.readScore(tmpPath);
        assert.equal(roundtrip, original, "Round-trip should preserve XML content");
    } finally {
        try { fs.unlinkSync(tmpPath); } catch (e) {}
    }
});

test("writeMscz replaces mscx content", function() {
    var original = msczReader.readScore(FIXTURE_PATH);
    var marker = "PATCHER_TEST_MARKER";
    var modified = original.replace("</Score>", "<!-- " + marker + " --></Score>");
    var tmpPath = path.join(__dirname, "_replace_test.mscz");

    try {
        msczReader.writeMscz(FIXTURE_PATH, tmpPath, modified);
        var result = msczReader.readScore(tmpPath);
        assert.ok(result.indexOf(marker) >= 0, "Should contain injected marker");
    } finally {
        try { fs.unlinkSync(tmpPath); } catch (e) {}
    }
});

// ============================================================
// xmlPatcher.patchLyrics
// ============================================================

test("patchLyrics fixes synalepha in XML", function() {
    var xml = [
        '<?xml version="1.0"?>',
        '<museScore version="4.60">',
        '<Score>',
        '<Division>480</Division>',
        '<Part><Staff><StaffType group="pitched"><name>stdNormal</name></StaffType></Staff></Part>',
        '<Staff id="1">',
        '<Measure><voice>',
        '<Chord><durationType>quarter</durationType>',
        '<Lyrics><text>da.es</text><syllabic>single</syllabic></Lyrics>',
        '<Note><pitch>60</pitch><tpc>14</tpc></Note></Chord>',
        '</voice></Measure>',
        '</Staff>',
        '</Score>',
        '</museScore>'
    ].join("\n");

    var result = xmlPatcher.patchLyrics(xml);
    assert.equal(result.fixCount, 1);
    assert.ok(result.xml.indexOf("da\u203Fes") >= 0, "Should contain undertie synalepha");
    assert.ok(result.xml.indexOf("da.es") < 0, "Should not contain original dot synalepha");
});

test("patchLyrics fixes hyphens and syllabic", function() {
    var xml = [
        '<?xml version="1.0"?>',
        '<museScore version="4.60">',
        '<Score>',
        '<Division>480</Division>',
        '<Part><Staff><StaffType group="pitched"><name>stdNormal</name></StaffType></Staff></Part>',
        '<Staff id="1">',
        '<Measure><voice>',
        '<Chord><durationType>quarter</durationType>',
        '<Lyrics><text>can-</text><syllabic>single</syllabic></Lyrics>',
        '<Note><pitch>60</pitch><tpc>14</tpc></Note></Chord>',
        '<Chord><durationType>quarter</durationType>',
        '<Lyrics><text>tar</text><syllabic>single</syllabic></Lyrics>',
        '<Note><pitch>62</pitch><tpc>16</tpc></Note></Chord>',
        '</voice></Measure>',
        '</Staff>',
        '</Score>',
        '</museScore>'
    ].join("\n");

    var result = xmlPatcher.patchLyrics(xml);
    assert.ok(result.fixCount >= 2);
    assert.ok(result.xml.indexOf("<text>can</text>") >= 0, "Hyphen should be stripped");
    assert.ok(result.xml.indexOf("<syllabic>begin</syllabic>") >= 0, "Should set syllabic to begin");
    assert.ok(result.xml.indexOf("<syllabic>end</syllabic>") >= 0, "Should set syllabic to end");
});

test("patchLyrics returns 0 fixCount for clean XML", function() {
    var xml = [
        '<?xml version="1.0"?>',
        '<museScore version="4.60">',
        '<Score>',
        '<Division>480</Division>',
        '<Part><Staff><StaffType group="pitched"><name>stdNormal</name></StaffType></Staff></Part>',
        '<Staff id="1">',
        '<Measure><voice>',
        '<Chord><durationType>quarter</durationType>',
        '<Lyrics><text>hello</text><syllabic>single</syllabic></Lyrics>',
        '<Note><pitch>60</pitch><tpc>14</tpc></Note></Chord>',
        '</voice></Measure>',
        '</Staff>',
        '</Score>',
        '</museScore>'
    ].join("\n");

    var result = xmlPatcher.patchLyrics(xml);
    assert.equal(result.fixCount, 0);
    assert.equal(result.xml, xml);
});

test("patchLyrics fixes punctuation sequences", function() {
    var xml = [
        '<?xml version="1.0"?>',
        '<museScore version="4.60">',
        '<Score>',
        '<Division>480</Division>',
        '<Part><Staff><StaffType group="pitched"><name>stdNormal</name></StaffType></Staff></Part>',
        '<Staff id="1">',
        '<Measure><voice>',
        '<Chord><durationType>quarter</durationType>',
        '<Lyrics><text>fin...</text><syllabic>single</syllabic></Lyrics>',
        '<Note><pitch>60</pitch><tpc>14</tpc></Note></Chord>',
        '</voice></Measure>',
        '</Staff>',
        '</Score>',
        '</museScore>'
    ].join("\n");

    var result = xmlPatcher.patchLyrics(xml);
    assert.equal(result.fixCount, 1);
    assert.ok(result.xml.indexOf("\u2026") >= 0, "Should contain ellipsis character");
});

// ============================================================
// xmlPatcher.patchChordSync
// ============================================================

test("patchChordSync adds missing chord to tab staff", function() {
    // Principal staff has a Harmony, tab staff does not
    var xml = [
        '<?xml version="1.0"?>',
        '<museScore version="4.60">',
        '<Score>',
        '<Division>480</Division>',
        '<Part>',
        '<Staff><StaffType group="pitched"><name>stdNormal</name></StaffType></Staff>',
        '<Staff><linkedTo>0</linkedTo><StaffType group="tablature"><name>tab6</name></StaffType></Staff>',
        '</Part>',
        '<Staff id="1">',
        '<Measure><voice>',
        '<Harmony><harmonyInfo><root>14</root><name></name></harmonyInfo><eid>abc123</eid></Harmony>',
        '<Chord><durationType>quarter</durationType><Note><pitch>60</pitch><tpc>14</tpc></Note></Chord>',
        '</voice></Measure>',
        '</Staff>',
        '<Staff id="2">',
        '<Measure><voice>',
        '<Chord><durationType>quarter</durationType><Note><pitch>60</pitch><tpc>14</tpc></Note></Chord>',
        '</voice></Measure>',
        '</Staff>',
        '</Score>',
        '</museScore>'
    ].join("\n");

    var result = xmlPatcher.patchChordSync(xml);
    assert.equal(result.syncCount, 1, "Should sync 1 chord");
    // The tab staff's measure should now contain a Harmony
    assert.ok(result.xml.indexOf('<Staff id="2">') >= 0);
    var staff2Start = result.xml.indexOf('<Staff id="2">');
    var staff2Harmony = result.xml.indexOf("<Harmony>", staff2Start);
    assert.ok(staff2Harmony > staff2Start, "Tab staff should now have Harmony: " + result.xml.substring(staff2Start, staff2Start + 300));
});

test("patchChordSync returns 0 when chords are in sync", function() {
    // Both staves have the same Harmony
    var xml = [
        '<?xml version="1.0"?>',
        '<museScore version="4.60">',
        '<Score>',
        '<Division>480</Division>',
        '<Part>',
        '<Staff><StaffType group="pitched"><name>stdNormal</name></StaffType></Staff>',
        '<Staff><linkedTo>0</linkedTo><StaffType group="tablature"><name>tab6</name></StaffType></Staff>',
        '</Part>',
        '<Staff id="1">',
        '<Measure><voice>',
        '<Harmony><harmonyInfo><root>14</root><name></name></harmonyInfo><eid>abc123</eid></Harmony>',
        '<Chord><durationType>quarter</durationType><Note><pitch>60</pitch><tpc>14</tpc></Note></Chord>',
        '</voice></Measure>',
        '</Staff>',
        '<Staff id="2">',
        '<Measure><voice>',
        '<Harmony><harmonyInfo><root>14</root><name></name></harmonyInfo><eid>def456</eid></Harmony>',
        '<Chord><durationType>quarter</durationType><Note><pitch>60</pitch><tpc>14</tpc></Note></Chord>',
        '</voice></Measure>',
        '</Staff>',
        '</Score>',
        '</museScore>'
    ].join("\n");

    var result = xmlPatcher.patchChordSync(xml);
    assert.equal(result.syncCount, 0);
    assert.equal(result.xml, xml, "XML should be unchanged");
});

test("patchChordSync returns 0 when no tab staves exist", function() {
    var xml = [
        '<?xml version="1.0"?>',
        '<museScore version="4.60">',
        '<Score>',
        '<Division>480</Division>',
        '<Part><Staff><StaffType group="pitched"><name>stdNormal</name></StaffType></Staff></Part>',
        '<Staff id="1">',
        '<Measure><voice>',
        '<Harmony><harmonyInfo><root>14</root><name></name></harmonyInfo><eid>abc</eid></Harmony>',
        '<Chord><durationType>quarter</durationType><Note><pitch>60</pitch><tpc>14</tpc></Note></Chord>',
        '</voice></Measure>',
        '</Staff>',
        '</Score>',
        '</museScore>'
    ].join("\n");

    var result = xmlPatcher.patchChordSync(xml);
    assert.equal(result.syncCount, 0);
});

test("patchChordSync strips eid from copied harmony", function() {
    var xml = [
        '<?xml version="1.0"?>',
        '<museScore version="4.60">',
        '<Score>',
        '<Division>480</Division>',
        '<Part>',
        '<Staff><StaffType group="pitched"><name>stdNormal</name></StaffType></Staff>',
        '<Staff><linkedTo>0</linkedTo><StaffType group="tablature"><name>tab6</name></StaffType></Staff>',
        '</Part>',
        '<Staff id="1">',
        '<Measure><voice>',
        '<Harmony><harmonyInfo><root>14</root><name></name></harmonyInfo><eid>originalEid123</eid></Harmony>',
        '<Chord><durationType>quarter</durationType><Note><pitch>60</pitch><tpc>14</tpc></Note></Chord>',
        '</voice></Measure>',
        '</Staff>',
        '<Staff id="2">',
        '<Measure><voice>',
        '<Chord><durationType>quarter</durationType><Note><pitch>60</pitch><tpc>14</tpc></Note></Chord>',
        '</voice></Measure>',
        '</Staff>',
        '</Score>',
        '</museScore>'
    ].join("\n");

    var result = xmlPatcher.patchChordSync(xml);
    // The copied Harmony in staff 2 should NOT contain the original eid
    var staff2Start = result.xml.indexOf('<Staff id="2">');
    var staff2End = result.xml.indexOf('</Staff>', staff2Start);
    var staff2Xml = result.xml.substring(staff2Start, staff2End);
    assert.ok(staff2Xml.indexOf("originalEid123") < 0, "Copied harmony should not have original eid");
    assert.ok(staff2Xml.indexOf("<Harmony>") >= 0, "Should have Harmony element");
});

// ============================================================
// xmlPatcher.patchMetaTags
// ============================================================

test("patchMetaTags copies VBox title to empty workTitle metaTag", function() {
    var xml = [
        '<?xml version="1.0"?>',
        '<museScore version="4.60">',
        '<Score>',
        '<metaTag name="workTitle"></metaTag>',
        '<metaTag name="composer"></metaTag>',
        '<Staff id="1">',
        '<VBox><Text><style>title</style><text>My Song</text></Text></VBox>',
        '<Measure><voice><Chord><durationType>quarter</durationType>',
        '<Note><pitch>60</pitch><tpc>14</tpc></Note></Chord></voice></Measure>',
        '</Staff>',
        '</Score>',
        '</museScore>'
    ].join("\n");

    var result = xmlPatcher.patchMetaTags(xml);
    assert.equal(result.metaCount, 1);
    assert.ok(result.xml.indexOf('<metaTag name="workTitle">My Song</metaTag>') >= 0,
        "workTitle should be updated: " + result.xml);
});

test("patchMetaTags copies all four VBox fields", function() {
    var xml = [
        '<?xml version="1.0"?>',
        '<museScore version="4.60">',
        '<Score>',
        '<metaTag name="workTitle"></metaTag>',
        '<metaTag name="subtitle"></metaTag>',
        '<metaTag name="composer"></metaTag>',
        '<metaTag name="lyricist"></metaTag>',
        '<Staff id="1">',
        '<VBox>',
        '<Text><style>title</style><text>The Title</text></Text>',
        '<Text><style>subtitle</style><text>The Subtitle</text></Text>',
        '<Text><style>composer</style><text>Bach</text></Text>',
        '<Text><style>lyricist</style><text>Goethe</text></Text>',
        '</VBox>',
        '<Measure><voice><Chord><durationType>quarter</durationType>',
        '<Note><pitch>60</pitch><tpc>14</tpc></Note></Chord></voice></Measure>',
        '</Staff>',
        '</Score>',
        '</museScore>'
    ].join("\n");

    var result = xmlPatcher.patchMetaTags(xml);
    assert.equal(result.metaCount, 4);
    assert.ok(result.xml.indexOf('<metaTag name="workTitle">The Title</metaTag>') >= 0);
    assert.ok(result.xml.indexOf('<metaTag name="subtitle">The Subtitle</metaTag>') >= 0);
    assert.ok(result.xml.indexOf('<metaTag name="composer">Bach</metaTag>') >= 0);
    assert.ok(result.xml.indexOf('<metaTag name="lyricist">Goethe</metaTag>') >= 0);
});

test("patchMetaTags returns 0 when metaTags already match VBox", function() {
    var xml = [
        '<?xml version="1.0"?>',
        '<museScore version="4.60">',
        '<Score>',
        '<metaTag name="workTitle">Same Title</metaTag>',
        '<Staff id="1">',
        '<VBox><Text><style>title</style><text>Same Title</text></Text></VBox>',
        '<Measure><voice><Chord><durationType>quarter</durationType>',
        '<Note><pitch>60</pitch><tpc>14</tpc></Note></Chord></voice></Measure>',
        '</Staff>',
        '</Score>',
        '</museScore>'
    ].join("\n");

    var result = xmlPatcher.patchMetaTags(xml);
    assert.equal(result.metaCount, 0);
    assert.equal(result.xml, xml);
});

test("patchMetaTags returns 0 when no VBox exists", function() {
    var xml = [
        '<?xml version="1.0"?>',
        '<museScore version="4.60">',
        '<Score>',
        '<metaTag name="workTitle"></metaTag>',
        '<Staff id="1">',
        '<Measure><voice><Chord><durationType>quarter</durationType>',
        '<Note><pitch>60</pitch><tpc>14</tpc></Note></Chord></voice></Measure>',
        '</Staff>',
        '</Score>',
        '</museScore>'
    ].join("\n");

    var result = xmlPatcher.patchMetaTags(xml);
    assert.equal(result.metaCount, 0);
});

// ============================================================
// Integration: check + fix + recheck on fixture
// ============================================================

test("integration: fixture.mscz extractForFixer returns valid data", function() {
    var xml = msczReader.readScore(FIXTURE_PATH);
    var data = xmlExtractor.extractForFixer(xml);

    assert.ok(Object.keys(data.lyricGroups).length > 0, "Should have lyric groups");
    var keys = Object.keys(data.lyricGroups);
    for (var k = 0; k < keys.length; k++) {
        var group = data.lyricGroups[keys[k]];
        for (var i = 0; i < group.length; i++) {
            assert.ok(typeof group[i].text === "string", "entry should have text");
            assert.ok(typeof group[i].syllabic === "number", "entry should have numeric syllabic");
        }
    }
});
