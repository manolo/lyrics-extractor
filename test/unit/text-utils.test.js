var test = require("node:test");
var assert = require("node:assert/strict");
var tu = require("../../lib/text-utils");

test("stripHtml removes HTML tags", function() {
    assert.equal(tu.stripHtml('<font size="11"/><font face="Arial"/>los'), "los");
    assert.equal(tu.stripHtml("<b>hello</b>"), "hello");
    assert.equal(tu.stripHtml("no tags"), "no tags");
    assert.equal(tu.stripHtml(""), "");
    assert.equal(tu.stripHtml(null), "");
});

test("stripHyphens removes leading and trailing hyphens", function() {
    assert.equal(tu.stripHyphens("-syl-"), "syl");
    assert.equal(tu.stripHyphens("--double--"), "double");
    assert.equal(tu.stripHyphens("no-change"), "no-change");
    assert.equal(tu.stripHyphens("-"), "");
    assert.equal(tu.stripHyphens("clean"), "clean");
});

test("isLetter detects letters including accented", function() {
    // Basic Latin
    assert.equal(tu.isLetter("a"), true);
    assert.equal(tu.isLetter("Z"), true);
    assert.equal(tu.isLetter("m"), true);
    // Accented letters
    assert.equal(tu.isLetter("é"), true);
    assert.equal(tu.isLetter("ñ"), true);
    assert.equal(tu.isLetter("á"), true);
    assert.equal(tu.isLetter("Ü"), true);
    // Non-letters
    assert.equal(tu.isLetter("."), false);
    assert.equal(tu.isLetter(","), false);
    assert.equal(tu.isLetter(" "), false);
    assert.equal(tu.isLetter("1"), false);
    assert.equal(tu.isLetter("-"), false);
    assert.equal(tu.isLetter(""), false);
    assert.equal(tu.isLetter(null), false);
});

test("replaceSynalepha replaces markers BETWEEN LETTERS", function() {
    // Valid synalepha: dot between two letters
    assert.equal(tu.replaceSynalepha("da.es"), "da\u203Fes");
    assert.equal(tu.replaceSynalepha("y.o"), "y\u203Fo");
    assert.equal(tu.replaceSynalepha("so.has"), "so\u203Fhas");
    assert.equal(tu.replaceSynalepha("bre.el"), "bre\u203Fel");

    // With accented letters
    assert.equal(tu.replaceSynalepha("t\u00e9.amo"), "t\u00e9\u203Famo");
    assert.equal(tu.replaceSynalepha("mi.alma"), "mi\u203Falma");

    // Synalepha preserved when followed by punctuation
    assert.equal(tu.replaceSynalepha("bre.el,"), "bre\u203Fel,");
    assert.equal(tu.replaceSynalepha("da.es!"), "da\u203Fes!");

    // Synalepha followed by ellipsis (first dot is synalepha, rest preserved)
    assert.equal(tu.replaceSynalepha("bre.el..."), "bre\u203Fel...");

    // NOT synalepha: dot not between letters
    assert.equal(tu.replaceSynalepha("A..."), "A...");
    assert.equal(tu.replaceSynalepha("palabra..."), "palabra...");
    assert.equal(tu.replaceSynalepha("palabra."), "palabra.");
    assert.equal(tu.replaceSynalepha(".palabra"), ".palabra");
    assert.equal(tu.replaceSynalepha("end.,start"), "end.,start");

    // Dots with spaces should NOT be replaced
    assert.equal(tu.replaceSynalepha("word. next"), "word. next");
    assert.equal(tu.replaceSynalepha("a .b"), "a .b");

    // Alternative synalepha markers between letters
    assert.equal(tu.replaceSynalepha("da\u00aces"), "da\u203Fes", "not sign as synalepha");
    assert.equal(tu.replaceSynalepha("da~es"), "da\u203Fes", "tilde as synalepha");
    assert.equal(tu.replaceSynalepha("da|es"), "da\u203Fes", "pipe as synalepha");
    // Apostrophes: NOT synalepha (used in contractions: don't, l'amore)
    assert.equal(tu.replaceSynalepha("da'es"), "da'es", "apostrophe preserved");
    assert.equal(tu.replaceSynalepha("don't"), "don't", "contraction preserved");
    assert.equal(tu.replaceSynalepha("l\u2019amore"), "l\u2019amore", "unicode apostrophe preserved");

    // Hyphens, underscores, digits: NOT synalepha
    assert.equal(tu.replaceSynalepha("da-es"), "da-es", "hyphen preserved");
    assert.equal(tu.replaceSynalepha("da_es"), "da_es", "underscore preserved");
    assert.equal(tu.replaceSynalepha("a1b"), "a1b", "digit preserved");
});

test("isVowel detects vowels including accented", function() {
    assert.equal(tu.isVowel("a"), true);
    assert.equal(tu.isVowel("é"), true);
    assert.equal(tu.isVowel("Ü"), true);
    assert.equal(tu.isVowel("b"), false);
    assert.equal(tu.isVowel(" "), false);
});

test("cleanWordText replaces synalepha markers with spaces and converts punctuation", function() {
    assert.equal(tu.cleanWordText("da\u203Fes"), "da es");
    assert.equal(tu.cleanWordText("vi.da"), "vi da");
    assert.equal(tu.cleanWordText("normal"), "normal");
    // Dots not between letters are preserved
    assert.equal(tu.cleanWordText("palabra."), "palabra.");
    // 3+ dots → ellipsis, 2 dots → small full stop, ,, → small comma
    assert.equal(tu.cleanWordText("A..."), "A\u2026", "3 dots → ellipsis");
    assert.equal(tu.cleanWordText("A.."), "A\uFE52", "2 dots → small full stop");
    assert.equal(tu.cleanWordText("word,,"), "word\uFE50", "double comma → small comma");
    // Alternative markers
    assert.equal(tu.cleanWordText("da\u00aces"), "da es", "not sign cleaned");
    assert.equal(tu.cleanWordText("da~es"), "da es", "tilde cleaned");
});
