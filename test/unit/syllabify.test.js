// Lyrics Extractor for MuseScore
// Copyright (C) 2026 Manolo Carrasco (do2tis)
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Licensed under the GNU General Public License version 3 or later, with an
// additional attribution requirement under section 7(b): see LICENSE and ATTRIBUTION.md.

var test = require("node:test");
var assert = require("node:assert/strict");
var syllabify = require("../../lib/syllabify");
var es = require("../../lib/syllabify-es");

test("syllabifyWord splits Spanish words", function() {
    var cases = [["sopistas","so-pis-tas"],["antiguos","an-ti-guos"],["días,","dí-as,"],["bohemios","bo-he-mios"],
        ["viajero,","via-je-ro,"],["pícaro","pí-ca-ro"],["canciones","can-cio-nes"],["bandurria,","ban-du-rria,"],
        ["pandereta","pan-de-re-ta"],["juglares,","ju-gla-res,"],["leyenda","le-yen-da"],["resuenen","re-sue-nen"],
        ["¡Tuna","¡Tu-na"],["Alcalá!","Al-ca-lá!"],["calles","ca-lles"],["picardía","pi-car-dí-a"],
        ["tradición,","tra-di-ción,"],["leer","le-er"],["baúl","ba-úl"],["guitarra","gui-ta-rra"],
        ["queso","que-so"],["pingüino","pin-güi-no"],["hoy","hoy"],["construir","cons-truir"],
        ["ahora","a-ho-ra"],["estirpe","es-tir-pe"],["emoción.","e-mo-ción."],["y","y"],["de","de"]];
    cases.forEach(function(c) {
        assert.equal(es.syllabifyWord(c[0]).join("-"), c[1], c[0]);
    });
});

test("registry exposes es and delegates", function() {
    assert.deepEqual(syllabify.languages(), [{ code: "es", name: "Español" }]);
    assert.deepEqual(syllabify.syllabifyWord("es", "capa"), ["ca", "pa"]);
});

test("unknown language returns the word whole", function() {
    assert.deepEqual(syllabify.syllabifyWord("xx", "capa"), ["capa"]);
});
