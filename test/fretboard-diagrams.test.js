var test = require("node:test");
var assert = require("node:assert/strict");
var xmlExtractor = require("../extractors/xml-extractor");

test("extractFretDiagrams extracts from FBox", function() {
    var xml = `<?xml version="1.0"?>
<museScore version="4.40">
  <Score>
    <Division>480</Division>
    <Staff id="1">
      <FBox>
        <FretDiagram>
          <Harmony>
            <harmonyInfo>
              <root>14</root>
              <name>m</name>
            </harmonyInfo>
          </Harmony>
          <fretDiagram>
            <fret>0</fret>
            <string no="0">
              <marker>cross</marker>
            </string>
            <string no="2">
              <dot fret="2"/>
            </string>
            <string no="3">
              <dot fret="3"/>
            </string>
          </fretDiagram>
        </FretDiagram>
      </FBox>
      <Measure>
        <voice>
          <Chord>
            <durationType>whole</durationType>
          </Chord>
        </voice>
      </Measure>
    </Staff>
  </Score>
</museScore>`;

    var data = xmlExtractor.extractAll(xml);
    assert.ok(data.fretDiagrams, "fretDiagrams should exist");
    assert.equal(data.fretDiagrams.length, 1, "should have 1 diagram");
    
    var diagram = data.fretDiagrams[0];
    assert.equal(diagram.chordName, "Dom", "chord name should be Dom (solfeo)");
    assert.equal(diagram.fretOffset, 0, "fretOffset should be 0");
    assert.equal(diagram.strings.length, 3, "should have 3 strings");
    
    assert.equal(diagram.strings[0].number, 0);
    assert.equal(diagram.strings[0].marker, "cross");
    
    assert.equal(diagram.strings[1].number, 2);
    assert.equal(diagram.strings[1].dot.fret, 2);
    
    assert.equal(diagram.strings[2].number, 3);
    assert.equal(diagram.strings[2].dot.fret, 3);
});

test("extractFretDiagrams extracts nested Harmony from measures", function() {
    // This is the critical fix for Rondalla: harmonies inside FretDiagrams in measures
    var xml = `<?xml version="1.0"?>
<museScore version="4.40">
  <Score>
    <Division>480</Division>
    <Staff id="1">
      <Measure>
        <voice>
          <FretDiagram>
            <Harmony>
              <harmonyInfo>
                <root>16</root>
                <name>7</name>
              </harmonyInfo>
            </Harmony>
            <fretDiagram>
              <fret>0</fret>
              <string no="1">
                <marker>circle</marker>
              </string>
            </fretDiagram>
          </FretDiagram>
          <Chord>
            <durationType>whole</durationType>
          </Chord>
        </voice>
      </Measure>
    </Staff>
  </Score>
</museScore>`;

    var data = xmlExtractor.extractAll(xml);
    
    // Check that chord was extracted from nested Harmony
    assert.equal(data.chords.length, 1, "should extract chord from FretDiagram");
    assert.equal(data.chords[0].chord, "D7", "chord should be D7 (anglo)");
    assert.equal(data.chords[0].tick, 0);
});

test("extractFretDiagrams deduplicates by chord name and fingering", function() {
    var xml = `<?xml version="1.0"?>
<museScore version="4.40">
  <Score>
    <Division>480</Division>
    <Staff id="1">
      <FBox>
        <FretDiagram>
          <Harmony>
            <harmonyInfo>
              <root>14</root>
            </harmonyInfo>
          </Harmony>
          <fretDiagram>
            <fret>0</fret>
            <string no="0">
              <marker>cross</marker>
            </string>
          </fretDiagram>
        </FretDiagram>
        <FretDiagram>
          <Harmony>
            <harmonyInfo>
              <root>14</root>
            </harmonyInfo>
          </Harmony>
          <fretDiagram>
            <fret>0</fret>
            <string no="0">
              <marker>cross</marker>
            </string>
          </fretDiagram>
        </FretDiagram>
        <FretDiagram>
          <Harmony>
            <harmonyInfo>
              <root>14</root>
            </harmonyInfo>
          </Harmony>
          <fretDiagram>
            <fret>0</fret>
            <string no="1">
              <marker>circle</marker>
            </string>
          </fretDiagram>
        </FretDiagram>
      </FBox>
      <Measure>
        <voice>
          <Chord>
            <durationType>whole</durationType>
          </Chord>
        </voice>
      </Measure>
    </Staff>
  </Score>
</museScore>`;

    var data = xmlExtractor.extractAll(xml);
    assert.equal(data.fretDiagrams.length, 2, "should deduplicate identical diagrams");
    
    // First unique: Do with cross on string 0
    assert.equal(data.fretDiagrams[0].chordName, "Do");
    assert.equal(data.fretDiagrams[0].strings[0].marker, "cross");
    
    // Second unique: Do with circle on string 1
    assert.equal(data.fretDiagrams[1].chordName, "Do");
    assert.equal(data.fretDiagrams[1].strings[0].marker, "circle");
});

test("extractFretDiagrams handles fretOffset > 0", function() {
    var xml = `<?xml version="1.0"?>
<museScore version="4.40">
  <Score>
    <Division>480</Division>
    <Staff id="1">
      <FBox>
        <FretDiagram>
          <Harmony>
            <harmonyInfo>
              <root>13</root>
              <name>#</name>
            </harmonyInfo>
          </Harmony>
          <fretDiagram>
            <fret>5</fret>
            <string no="0">
              <dot fret="7"/>
            </string>
          </fretDiagram>
        </FretDiagram>
      </FBox>
      <Measure>
        <voice>
          <Chord>
            <durationType>whole</durationType>
          </Chord>
        </voice>
      </Measure>
    </Staff>
  </Score>
</museScore>`;

    var data = xmlExtractor.extractAll(xml);
    assert.equal(data.fretDiagrams.length, 1);
    
    var diagram = data.fretDiagrams[0];
    assert.equal(diagram.chordName, "Fa#", "should be Fa# in solfeo");
    assert.equal(diagram.fretOffset, 5, "fretOffset should be 5");
    assert.equal(diagram.strings[0].dot.fret, 7);
});

test("extractFretDiagrams returns empty array when no FBox", function() {
    var xml = `<?xml version="1.0"?>
<museScore version="4.40">
  <Score>
    <Division>480</Division>
    <Staff id="1">
      <Measure>
        <voice>
          <Chord>
            <durationType>whole</durationType>
          </Chord>
        </voice>
      </Measure>
    </Staff>
  </Score>
</museScore>`;

    var data = xmlExtractor.extractAll(xml);
    assert.ok(Array.isArray(data.fretDiagrams), "fretDiagrams should be an array");
    assert.equal(data.fretDiagrams.length, 0, "should be empty");
});

test("extractFretDiagrams TPC conversion to solfeo", function() {
    // Test various TPC values convert correctly
    var tpcMap = [
        { tpc: 13, expected: "Fa" },
        { tpc: 14, expected: "Do" },
        { tpc: 15, expected: "Sol" },
        { tpc: 16, expected: "Re" },
        { tpc: 17, expected: "La" },
        { tpc: 18, expected: "Mi" },
        { tpc: 19, expected: "Si" },
        { tpc: 20, expected: "Fa#" },
        { tpc: 21, expected: "Do#" },
        { tpc: 6, expected: "Sib" },
        { tpc: 12, expected: "Mib" }
    ];
    
    for (var i = 0; i < tpcMap.length; i++) {
        var mapping = tpcMap[i];
        var xml = `<?xml version="1.0"?>
<museScore version="4.40">
  <Score>
    <Division>480</Division>
    <Staff id="1">
      <FBox>
        <FretDiagram>
          <Harmony>
            <harmonyInfo>
              <root>` + mapping.tpc + `</root>
            </harmonyInfo>
          </Harmony>
          <fretDiagram>
            <fret>0</fret>
            <string no="0">
              <marker>circle</marker>
            </string>
          </fretDiagram>
        </FretDiagram>
      </FBox>
      <Measure>
        <voice>
          <Chord>
            <durationType>whole</durationType>
          </Chord>
        </voice>
      </Measure>
    </Staff>
  </Score>
</museScore>`;

        var data = xmlExtractor.extractAll(xml);
        assert.equal(data.fretDiagrams.length, 1, "TPC " + mapping.tpc + " should extract");
        assert.equal(data.fretDiagrams[0].chordName, mapping.expected, 
            "TPC " + mapping.tpc + " should convert to " + mapping.expected);
    }
});
