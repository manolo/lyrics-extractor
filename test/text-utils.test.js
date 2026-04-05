var test = require("node:test");
var assert = require("node:assert/strict");
var tu = require("../lib/text-utils");

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

test("replaceSynalepha replaces dots between non-space characters", function() {
    assert.equal(tu.replaceSynalepha("da.es"), "da\u203Fes");
    assert.equal(tu.replaceSynalepha("y.o"), "y\u203Fo");
    assert.equal(tu.replaceSynalepha("so.has"), "so\u203Fhas");
    // Dots with spaces should NOT be replaced
    assert.equal(tu.replaceSynalepha("word. next"), "word. next");
    assert.equal(tu.replaceSynalepha("a .b"), "a .b");
    // Dot at start/end should NOT be replaced
    assert.equal(tu.replaceSynalepha(".start"), ".start");
    assert.equal(tu.replaceSynalepha("end."), "end.");
});

test("isVowel detects vowels including accented", function() {
    assert.equal(tu.isVowel("a"), true);
    assert.equal(tu.isVowel("é"), true);
    assert.equal(tu.isVowel("Ü"), true);
    assert.equal(tu.isVowel("b"), false);
    assert.equal(tu.isVowel(" "), false);
});

test("cleanWordText replaces synalepha markers with spaces", function() {
    assert.equal(tu.cleanWordText("da\u203Fes"), "da es");
    assert.equal(tu.cleanWordText("vi.da"), "vi da");
    assert.equal(tu.cleanWordText("normal"), "normal");
});
