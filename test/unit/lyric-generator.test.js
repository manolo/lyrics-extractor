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
