// Dependency injection verification: confirm that modules using injected
// dependencies produce identical results to the canonical implementations.
// All mirrors have been replaced with delegation via setTextUtils/setLineBuilder,
// so these tests verify the auto-wiring works correctly at require() time.
var test = require("node:test");
var assert = require("node:assert/strict");

var textUtils = require("../lib/text-utils");
var lineBuilder = require("../lib/line-builder");
var formatter = require("../lib/formatter");

// --- isLetter: line-builder delegates to text-utils ---

test("injection: isLetter (line-builder delegates to text-utils)", function() {
    var chars = "aAbBzZñÑéÉüÜ.-_ 0123456789¬~|'()!?;,".split("");
    for (var i = 0; i < chars.length; i++) {
        assert.equal(
            textUtils.isLetter(chars[i]),
            lineBuilder.isLetter(chars[i]),
            "isLetter diverges for '" + chars[i] + "'"
        );
    }
});

// --- isSynalephaMarker: line-builder delegates to text-utils ---

test("injection: isSynalephaMarker (line-builder delegates to text-utils)", function() {
    var chars = "aA.-_¬~|' 09\u203F".split("");
    for (var i = 0; i < chars.length; i++) {
        assert.equal(
            textUtils.isSynalephaMarker(chars[i]),
            lineBuilder.isSynalephaMarker(chars[i]),
            "isSynalephaMarker diverges for '" + chars[i] + "'"
        );
    }
});

// --- cleanWordText: line-builder delegates to text-utils ---

test("injection: cleanWordText (line-builder delegates to text-utils)", function() {
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

// --- findPosForTick: formatter delegates to line-builder ---

test("injection: findPosForTick (formatter delegates to line-builder)", function() {
    var sylMap = [
        { tick: 0, pos: 0 },
        { tick: 480, pos: 5 },
        { tick: 960, pos: 12 }
    ];
    var ticks = [0, 240, 480, 700, 960, 2000];
    for (var i = 0; i < ticks.length; i++) {
        var fmtResult = formatter.findPosForTick(sylMap, ticks[i]);
        var lbResult = lineBuilder.findPosForTick(sylMap, ticks[i]);
        assert.deepEqual(fmtResult, lbResult,
            "findPosForTick diverges for tick " + ticks[i]);
    }
});
