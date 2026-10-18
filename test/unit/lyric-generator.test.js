// Lyrics Extractor for MuseScore
// Copyright (C) 2026 Manolo Carrasco (do2tis)
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Licensed under the GNU General Public License version 3 or later, with an
// additional attribution requirement under section 7(b): see LICENSE and ATTRIBUTION.md.

var test = require("node:test");
var assert = require("node:assert/strict");
var gen = require("../../lib/lyric-generator");

test("parse counts word-final and mid-word holds", function() {
    assert.equal(gen.countSlots("la-ca-sa __ de pe-dro"), 8);
    assert.equal(gen.countSlots("can--ta-ban"), 4);
    assert.equal(gen.countSlots("a-mor _ por"), 4);
    assert.equal(gen.countSlots("a-mor_ por"), 4);          // attached form accepted
    assert.equal(gen.countSlots("de.an-ti-guos"), 3);       // synalepha is one slot
});
test("parse gives syllabic and holds", function() {
    var t = gen.parse("can--ta a-mor _").tokens;
    assert.deepEqual(t.map(function(x) { return [x.text, x.syllabic, x.holds, x.holdKind]; }),
        [["can","begin",1,"-"],["ta","end",0,null],["a","begin",0,null],["mor","end",1,"_"]]);
});
test("parse keeps typed markers in token text", function() {
    var t = gen.parse("ro,, pa;; fin...;").tokens;
    assert.deepEqual(t.map(function(x) { return x.text; }), ["ro,,", "pa;;", "fin...;"]);
});
test("a leading lone hold counts one slot and makes no token", function() {
    var p = gen.parse("_ a-mor");
    assert.equal(p.slotCount, 3);
    assert.equal(p.tokens.length, 2);
});
test("a lone dash between spaces is not a hold", function() {
    assert.equal(gen.countSlots("a - mor"), 2);
});
test("generate keeps line breaks with ; and stanzas with ;;", function() {
    var out = gen.generate("Vuelan cintas de mi capa,\nque la noche brillará\n\n¡Tuna de Alcalá!\nfin...",
        { split: true, language: "es", ties: null });
    assert.equal(out, "Vue-lan cin-tas de mi ca-pa;\nque la no-che bri-lla-rá;;\n\n¡Tu-na de Al-ca-lá!\nfin...;");
});
test("generate turns inner commas into ,,", function() {
    assert.equal(gen.generate("viajero, pícaro y libre,", { split: true, language: "es", ties: null }),
        "via-je-ro,, pí-ca-ro y li-bre;");
});
test("generate without split leaves words whole", function() {
    assert.equal(gen.generate("de mi capa", { split: false, language: "es", ties: null }), "de mi capa;");
});
test("generate fills tie continuations", function() {
    // slots: can, (tie), ta, ban, a, mor, (tie), (tie), por
    var ties = [false,true,false,false,false,false,true,true,false];
    assert.equal(gen.generate("cantaban amor por", { split: true, language: "es", ties: ties }),
        "can--ta-ban a-mor __ por;");
});
test("a leading tie continuation is an ordinary slot", function() {
    assert.equal(gen.generate("a-mor", { split: false, language: "es", ties: [true,false] }), "a-mor;");
});
test("messy whitespace parses like clean text", function() {
    var clean = gen.generate("uno dos\n\ntres", { split: false, language: "es", ties: null });
    assert.equal(gen.generate("uno   dos \r\n \t \r\ntres  ", { split: false, language: "es", ties: null }), clean);
});
test("loose punctuation attaches to the neighbor word", function() {
    assert.equal(gen.countSlots("¡ que vi-va ! la tu-na ,"), 6);
    assert.equal(gen.generate("¡ Que viva !", { split: true, language: "es", ties: null }), "¡Que vi-va!");
});
test("a hold at the end of a line goes after the line marker", function() {
    var out = gen.generate("amor", { split: true, language: "es", ties: [false,false,true] });
    assert.equal(out, "a-mor; _");
    assert.equal(gen.countSlots(out), 3);
});
test("generate keeps a typed synalepha as one syllable", function() {
    var o = { split: true, language: "es", ties: null };
    var a = gen.generate("de.antiguos", o);
    assert.equal(a, "de.an-ti-guos;");
    assert.equal(gen.countSlots(a), 3);
    var b = gen.generate("esta.estirpe", o);
    assert.equal(b, "es-ta.es-tir-pe;");
    assert.equal(gen.countSlots(b), 4);
});

test("a hold typed before trailing punctuation is a hold", function() {
    var a = gen.parse("a-mor_;");
    var b = gen.parse("a-mor _;");
    assert.equal(a.slotCount, 3);
    assert.equal(b.slotCount, 3);
    [a, b].forEach(function(p) {
        var mor = p.tokens[1];
        assert.equal(mor.text, "mor;");
        assert.equal(mor.holds, 1);
        assert.equal(mor.holdKind, "_");
    });
    assert.equal(gen.parse("a-mor__!").slotCount, 4);
    assert.equal(gen.parse("a-mor_,,").tokens[1].text, "mor,,");
});

test("generate keeps a lone hold chunk readable", function() {
    var out = gen.generate("a-mor _", { split: false });
    assert.equal(out, "a-mor _;");
    assert.equal(gen.countSlots(out), 3);
});

test("generate turns an inner period into .. but not the last one", function() {
    assert.equal(gen.generate("fin. del mundo.", { split: false }), "fin.. del mundo.");
    assert.equal(gen.generate("hola... mundo", { split: false }), "hola... mundo;");
});

test("generate keeps inner exclamation, question and semicolon marks", function() {
    assert.equal(gen.generate("hola! que tal? bien", { split: false }), "hola! que tal? bien;");
});

test("trailing blank line ends the last stanza", function() {
    assert.equal(gen.generate("uno\ndos\n\n", { split: false }), "uno;\ndos;;\n");
    assert.equal(gen.generate("uno\ndos\n", { split: false }), "uno;\ndos;");
});

test("a punctuation-only line is kept, not treated as blank", function() {
    var out = gen.generate("uno\n...\ndos", { split: false });
    assert.equal(out, "uno;\n...;\ndos;");
});

test("generate marks every possible synalepha when asked", function() {
    var opts = { split: true, language: "es", ties: null, synalepha: true };
    assert.equal(gen.generate("Sopistas de antiguos días,", opts), "So-pis-tas de.an-ti-guos dí-as;");
    assert.equal(gen.generate("con picardía y fervor,", opts), "con pi-car-dí-a.y fer-vor;");
    assert.equal(gen.generate("forjadores de esta estirpe,", opts), "for-ja-do-res de.es-ta.es-tir-pe;");
    assert.equal(gen.generate("de aventura y de emoción.", opts), "de.a-ven-tu-ra.y de.e-mo-ción.");
    assert.equal(gen.generate("en la historia", opts), "en la.his-to-ria;");
});

test("synalepha is not marked before a consonant y, across punctuation or across lines", function() {
    var opts = { split: true, language: "es", ties: null, synalepha: true };
    assert.equal(gen.generate("la luna ya", opts), "la lu-na ya;");
    assert.equal(gen.generate("capa, amor", opts), "ca-pa,, a-mor;");
    assert.equal(gen.generate("la hierba", opts), "la hier-ba;");
    assert.equal(gen.generate("canta\nalegre", opts), "can-ta;\na-le-gre;");
});

test("synalepha marking is off by default and needs splitting", function() {
    assert.equal(gen.generate("de antiguos", { split: true, language: "es", ties: null }), "de an-ti-guos;");
    assert.equal(gen.generate("de antiguos", { split: false, synalepha: true }), "de antiguos;");
});

test("a marked synalepha counts one slot and takes tie holds", function() {
    var opts = { split: true, language: "es", synalepha: true, ties: [false, true, false] };
    // de.an (held one note) ti... : slots de.an, tie, ti
    assert.equal(gen.countSlots(gen.generate("de antiguo", { split: true, language: "es", ties: null, synalepha: true })), 3);
    assert.equal(gen.generate("de anti", opts), "de.an--ti;");
});

test("generate can write the forms Fix leaves in the score", function() {
    var opts = { split: true, language: "es", ties: null, synalepha: true, finalForms: true };
    assert.equal(gen.generate("Sopistas de antiguos días,\nya cantaban al amor\n\nfin", opts),
        "So-pis-tas de‿an-ti-guos dí-as，\nya can-ta-ban al a-mor；\n\nfin，");
    assert.equal(gen.generate("viajero, pícaro. y libre...", opts), "via-je-ro﹐ pí-ca-ro﹒ y li-bre…，");
});

test("final forms parse like the typed ones", function() {
    assert.equal(gen.countSlots("de‿an-ti-guos dí-as，"), 5);
    assert.equal(gen.countSlots("a-mor _；"), 3);
    assert.equal(gen.countSlots("a-mor_，"), 3);
    assert.equal(gen.countSlots("via-je-ro﹐ li-bre…，"), 5);
    var t = gen.parse("a-mor_，").tokens;
    assert.equal(t[1].text, "mor，");
    assert.equal(t[1].holds, 1);
});
