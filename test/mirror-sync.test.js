// Sync-check tests: verify that QML mirror functions produce identical
// results to their canonical versions. These catch divergence when someone
// updates one copy but not the other.
var test = require("node:test");
var assert = require("node:assert/strict");

var textUtils = require("../lib/text-utils");
var lineBuilder = require("../lib/line-builder");

// --- isLetter mirror: text-utils vs line-builder ---

test("mirror sync: isLetter (text-utils vs line-builder)", function() {
    var chars = "aAbBzZñÑéÉüÜ.-_ 0123456789¬~|'()!?;,".split("");
    for (var i = 0; i < chars.length; i++) {
        assert.equal(
            textUtils.isLetter(chars[i]),
            lineBuilder.isLetter(chars[i]),
            "isLetter diverges for '" + chars[i] + "'"
        );
    }
});

// --- isSynalephaMarker mirror: text-utils vs line-builder ---

test("mirror sync: isSynalephaMarker (text-utils vs line-builder)", function() {
    var chars = "aA.-_¬~|' 09\u203F".split("");
    for (var i = 0; i < chars.length; i++) {
        assert.equal(
            textUtils.isSynalephaMarker(chars[i]),
            lineBuilder.isSynalephaMarker(chars[i]),
            "isSynalephaMarker diverges for '" + chars[i] + "'"
        );
    }
});

// --- cleanWordText mirror: text-utils vs line-builder ---

test("mirror sync: cleanWordText (text-utils vs line-builder)", function() {
    var inputs = [
        "da.es", "da\u00aces", "da~es", "da-es", "da_es",
        "normal", "palabra...", "te...", "A..", "word,,",
        "da\u203Fes", "bre.el...", "A\u2026",
        "normal,", "a1b"
    ];
    for (var i = 0; i < inputs.length; i++) {
        assert.equal(
            textUtils.cleanWordText(inputs[i]),
            lineBuilder.cleanWordText(inputs[i]),
            "cleanWordText diverges for '" + inputs[i] + "'"
        );
    }
});

// --- stripHtml/stripHyphens: musescore-extractor delegates to text-utils ---
// (no longer mirrored, injected via setTextUtils at require time)
