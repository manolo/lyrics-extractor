// Lyrics Extractor for MuseScore
// Copyright (C) 2026 Manolo Carrasco (do2tis)
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Licensed under the GNU General Public License version 3 or later, with an
// additional attribution requirement under section 7(b): see LICENSE and ATTRIBUTION.md.

var test = require("node:test");
var assert = require("node:assert/strict");
var xmlExtractor = require("../../score/xml-extractor");

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
          <fretOffset>4</fretOffset>
          <frets>4</frets>
          <fretDiagram>
            <string no="0">
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
    assert.equal(data.fretDiagrams.length, 1);
    
    var diagram = data.fretDiagrams[0];
    assert.equal(diagram.chordName, "Fa#", "should be Fa# in solfeo");
    assert.equal(diagram.fretOffset, 4, "fretOffset should be 4");
    assert.equal(diagram.numFrets, 4, "numFrets should be 4");
    assert.equal(diagram.strings[0].dot.fret, 3, "dot should be at fret 3");
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

test("extractFretDiagrams extracts barre from FretDiagram", function() {
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
            </harmonyInfo>
          </Harmony>
          <fretDiagram>
            <fret>0</fret>
            <string no="0">
              <dot fret="1"/>
            </string>
            <string no="1">
              <dot fret="1"/>
            </string>
            <string no="2">
              <dot fret="2"/>
            </string>
            <string no="3">
              <dot fret="3"/>
            </string>
            <string no="4">
              <dot fret="3"/>
            </string>
            <string no="5">
              <dot fret="1"/>
            </string>
            <barre start="0" end="5">1</barre>
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
    assert.equal(diagram.chordName, "Fa", "should be Fa chord");
    assert.ok(diagram.barre, "should have barre");
    assert.equal(diagram.barre.fret, 1, "barre at fret 1");
    assert.equal(diagram.barre.start, 0, "barre starts at string 0");
    assert.equal(diagram.barre.end, 5, "barre ends at string 5");
});

test("extractFretDiagrams deduplicates diagrams with same barre", function() {
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
            </harmonyInfo>
          </Harmony>
          <fretDiagram>
            <fret>0</fret>
            <string no="0">
              <dot fret="1"/>
            </string>
            <barre start="0" end="5">1</barre>
          </fretDiagram>
        </FretDiagram>
        <FretDiagram>
          <Harmony>
            <harmonyInfo>
              <root>13</root>
            </harmonyInfo>
          </Harmony>
          <fretDiagram>
            <fret>0</fret>
            <string no="0">
              <dot fret="1"/>
            </string>
            <barre start="0" end="5">1</barre>
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
    assert.equal(data.fretDiagrams.length, 1, "should deduplicate identical diagrams with barre");
});

test("extractFretDiagrams distinguishes diagrams with different barres", function() {
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
            </harmonyInfo>
          </Harmony>
          <fretDiagram>
            <fret>0</fret>
            <string no="0">
              <dot fret="1"/>
            </string>
            <barre start="0" end="5">1</barre>
          </fretDiagram>
        </FretDiagram>
        <FretDiagram>
          <Harmony>
            <harmonyInfo>
              <root>13</root>
            </harmonyInfo>
          </Harmony>
          <fretDiagram>
            <fret>0</fret>
            <string no="0">
              <dot fret="1"/>
            </string>
            <barre start="0" end="3">1</barre>
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
    assert.equal(data.fretDiagrams.length, 2, "should keep diagrams with different barres");
    assert.equal(data.fretDiagrams[0].barre.end, 5);
    assert.equal(data.fretDiagrams[1].barre.end, 3);
});

test("extractFretDiagrams falls back to guitar excerpts when no FBox in main score", function() {
    var mainXml = `<?xml version="1.0"?>
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

    var excerptXml = `<?xml version="1.0"?>
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
            <string no="2">
              <dot fret="2"/>
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

    var data = xmlExtractor.extractAll(mainXml, [excerptXml]);
    assert.equal(data.fretDiagrams.length, 1, "should extract from excerpt");
    assert.equal(data.fretDiagrams[0].chordName, "Dom", "should extract Dom from excerpt");
});

test("extractFretDiagrams prefers main score FBox over excerpts", function() {
    var mainXml = `<?xml version="1.0"?>
<museScore version="4.40">
  <Score>
    <Division>480</Division>
    <Staff id="1">
      <FBox>
        <FretDiagram>
          <Harmony>
            <harmonyInfo>
              <root>15</root>
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

    var excerptXml = `<?xml version="1.0"?>
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

    var data = xmlExtractor.extractAll(mainXml, [excerptXml]);
    assert.equal(data.fretDiagrams.length, 1, "should only extract from main score");
    assert.equal(data.fretDiagrams[0].chordName, "Sol", "should extract Sol from main score, not Do from excerpt");
});

test("extractFretDiagrams skips hidden diagrams (visible=0)", function() {
    var xml = `<?xml version="1.0"?>
<museScore version="4.40">
  <Score>
    <Division>480</Division>
    <Staff id="1">
      <FBox>
        <FretDiagram>
          <Harmony><harmonyInfo><root>16</root></harmonyInfo></Harmony>
          <fretDiagram><string no="0"><marker>cross</marker></string></fretDiagram>
        </FretDiagram>
        <FretDiagram>
          <visible>0</visible>
          <Harmony><harmonyInfo><root>15</root></harmonyInfo></Harmony>
          <fretDiagram><string no="0"><marker>circle</marker></string></fretDiagram>
        </FretDiagram>
        <FretDiagram>
          <Harmony><harmonyInfo><root>17</root><name>m</name></harmonyInfo></Harmony>
          <fretDiagram><string no="2"><dot fret="2"/></string></fretDiagram>
        </FretDiagram>
      </FBox>
    </Staff>
  </Score>
</museScore>`;

    var data = xmlExtractor.extractAll(xml);
    assert.equal(data.fretDiagrams.length, 2, "should skip hidden diagram (Sol)");
    assert.equal(data.fretDiagrams[0].chordName, "Re");
    assert.equal(data.fretDiagrams[1].chordName, "Lam");
});

test("extractFretDiagrams extracts chords without root TPC (literal names)", function() {
    var xml = `<?xml version="1.0"?>
<museScore version="4.40">
  <Score>
    <Division>480</Division>
    <Staff id="1">
      <FBox>
        <FretDiagram>
          <Harmony><harmonyInfo><root>16</root></harmonyInfo></Harmony>
          <fretDiagram><string no="0"><marker>cross</marker></string></fretDiagram>
        </FretDiagram>
        <FretDiagram>
          <Harmony><harmonyInfo><name>Rem</name></harmonyInfo></Harmony>
          <fretDiagram><string no="1"><dot fret="1"/></string></fretDiagram>
        </FretDiagram>
        <FretDiagram>
          <Harmony><harmonyInfo><name>Si7</name></harmonyInfo></Harmony>
          <fretDiagram><string no="0"><marker>circle</marker></string></fretDiagram>
        </FretDiagram>
      </FBox>
    </Staff>
  </Score>
</museScore>`;

    var data = xmlExtractor.extractAll(xml);
    assert.equal(data.fretDiagrams.length, 3, "should extract all including literal names");
    assert.equal(data.fretDiagrams[0].chordName, "Re");
    assert.equal(data.fretDiagrams[1].chordName, "Rem");
    assert.equal(data.fretDiagrams[2].chordName, "Si7");
});
